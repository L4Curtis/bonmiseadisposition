/**
 * Configuration HTTP partagée par main.ts et les tests de contrat : vérifiée
 * sur une vraie application Nest (un contrôleur minimal), interrogée par
 * supertest. Aucune base : le filet complet, sur l'AppModule réel, est la
 * suite de contrat (test/contract/pipeline.contract.ts).
 */
import { Body, Controller, Get, INestApplication, Ip, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IsString } from 'class-validator';
import { mkdtempSync, rmSync } from 'fs';
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
  const originalCwd = process.cwd();
  const workDir = mkdtempSync(join(tmpdir(), 'bmad-configure-app-'));

  beforeAll(async () => {
    // configureApp crée data/uploads sous le répertoire courant : jamais dans backend/data.
    process.chdir(workDir);
    const moduleRef = await Test.createTestingModule({ controllers: [EchoController, AuthCallbackController] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app, { corsOrigin: ORIGIN });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    process.chdir(originalCwd);
    rmSync(workDir, { recursive: true, force: true });
  });

  const server = () => app.getHttpServer();

  it('sert les routes sous le préfixe /api', async () => {
    await request(server()).get('/echo/ip').expect(404);
    await request(server()).get('/api/echo/ip').expect(200);
  });

  it('refuse une écriture sans X-Requested-With (403, corps { message })', async () => {
    const res = await request(server()).post('/api/echo').send({ text: 'a' });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: CSRF_ERROR_MESSAGE });
  });

  it('exempte le seul retour OAuth de la protection CSRF', async () => {
    await request(server()).post('/api/auth/callback').expect(201);
  });

  it('valide le corps : clé inconnue refusée en 400', async () => {
    const res = await request(server())
      .post('/api/echo')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ text: 'a', inconnu: 1 });
    expect(res.status).toBe(400);
    expect(res.body.statusCode).toBe(400);
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
