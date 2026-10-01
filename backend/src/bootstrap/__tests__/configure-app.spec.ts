/**
 * Configuration HTTP partagée par main.ts et les tests de contrat : vérifiée
 * sur une vraie application Nest (un contrôleur minimal), interrogée par
 * supertest. Aucune base : le filet complet, sur l'AppModule réel, est la
 * suite de contrat (test/contract/pipeline.contract.ts).
 */
import { Body, Controller, Get, INestApplication, Ip, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IsString } from 'class-validator';
import { existsSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';
import { configureApp, CSRF_ERROR_MESSAGE, resolveCorsOrigin } from '../configure-app';

class EchoDto {
  @IsString()
  text!: string;
}

@Controller('echo')
class EchoController {
  @Get('ip')
  ip(@Ip() ip: string) {
    return { ip };
  }

  @Post()
  echo(@Body() body: EchoDto) {
    return body;
  }
}

@Controller('auth')
class AuthCallbackController {
  @Post('callback')
  callback() {
    return { ok: true };
  }
}

const ORIGIN = 'https://bons.example.test';

describe('configureApp', () => {
  let app: INestApplication;
  const workDir = mkdtempSync(join(tmpdir(), 'bmad-configure-app-'));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [EchoController, AuthCallbackController] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    // Dossier des logos dans un répertoire jetable : jamais dans backend/data.
    configureApp(app, { corsOrigin: ORIGIN, uploadsDir: join(workDir, 'uploads') });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    rmSync(workDir, { recursive: true, force: true });
  });

  it('crée le dossier des logos et cachets', () => {
    expect(existsSync(join(workDir, 'uploads'))).toBe(true);
  });

  const server = () => app.getHttpServer();

  it('sert les routes sous le préfixe /api', async () => {
    await request(server()).get('/echo/ip').expect(404);
    await request(server()).get('/api/echo/ip').expect(200);
  });

  it('refuse une écriture sans X-Requested-With (403 csrf_rejected, forme d’erreur unique)', async () => {
    const res = await request(server()).post('/api/echo').send({ text: 'a' });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ statusCode: 403, code: 'csrf_rejected', message: CSRF_ERROR_MESSAGE });
  });

  it('exempte le seul retour OAuth de la protection CSRF', async () => {
    await request(server()).post('/api/auth/callback').expect(201);
  });

  it('valide le corps : clé inconnue refusée en 400 validation_failed, champ dans details', async () => {
    const res = await request(server())
      .post('/api/echo')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ text: 'a', inconnu: 1 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      statusCode: 400,
      code: 'validation_failed',
      message: 'property inconnu should not exist',
      details: { errors: [{ field: 'inconnu', messages: ['property inconnu should not exist'] }] },
    });
  });

  it('JSON illisible : 400 invalid_json, jamais une page HTML', async () => {
    const res = await request(server())
      .post('/api/echo')
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Content-Type', 'application/json')
      .send('{"text": ');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ statusCode: 400, code: 'invalid_json', message: 'Le contenu envoyé n’est pas un JSON valide.' });
  });

  it('corps de plus de 2 Mo : 413 payload_too_large', async () => {
    const res = await request(server())
      .post('/api/echo')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ text: 'x'.repeat(2_200_000) });
    expect(res.status).toBe(413);
    expect(res.body).toMatchObject({ statusCode: 413, code: 'payload_too_large' });
  });

  it('formulaire (retour OAuth) lu, et trop gros : même forme 413 que le JSON', async () => {
    const ok = await request(server())
      .post('/api/echo')
      .set('X-Requested-With', 'XMLHttpRequest')
      .type('form')
      .send('text=bonjour');
    expect(ok.status).toBe(201);
    expect(ok.body).toEqual({ text: 'bonjour' });

    const tooLarge = await request(server())
      .post('/api/echo')
      .set('X-Requested-With', 'XMLHttpRequest')
      .type('form')
      .send(`text=${'x'.repeat(2_200_000)}`);
    expect(tooLarge.status).toBe(413);
    expect(tooLarge.body).toMatchObject({ statusCode: 413, code: 'payload_too_large' });
  });

  it('route inconnue : 404 route_not_found', async () => {
    const res = await request(server()).get('/api/inconnue');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ statusCode: 404, code: 'route_not_found', message: 'Adresse d’API inconnue.' });
  });

  it('accepte un corps JSON de plus de 100 ko (signatures en base64)', async () => {
    const res = await request(server())
      .post('/api/echo')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ text: 'x'.repeat(500_000) });
    expect(res.status).toBe(201);
  });

  it('pose les en-têtes de sécurité et le CORS de l’origine du front', async () => {
    const res = await request(server()).get('/api/echo/ip').set('Origin', ORIGIN);
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('croit le premier proxy seulement pour l’adresse du client', async () => {
    const res = await request(server()).get('/api/echo/ip').set('X-Forwarded-For', '203.0.113.9, 10.0.0.2');
    expect(res.body.ip).toBe('10.0.0.2');
  });
});

describe('resolveCorsOrigin', () => {
  it('exige FRONTEND_URL en production', () => {
    expect(() => resolveCorsOrigin({ NODE_ENV: 'production' })).toThrow('FRONTEND_URL est requis');
  });

  it('prend FRONTEND_URL, sinon le serveur Vite de développement', () => {
    expect(resolveCorsOrigin({ FRONTEND_URL: ORIGIN })).toBe(ORIGIN);
    expect(resolveCorsOrigin({})).toBe('http://localhost:5173');
  });
});
