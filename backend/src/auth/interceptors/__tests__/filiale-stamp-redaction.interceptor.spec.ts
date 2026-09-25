import {
  CallHandler, CanActivate, Controller, ExecutionContext, Get, INestApplication, Injectable, Module, UseGuards,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'net';
import { lastValueFrom, of } from 'rxjs';
import {
  FilialeStampRedactionInterceptor,
  withoutFilialeStamp,
} from '../filiale-stamp-redaction.interceptor';
import { AuthUser } from '../../auth-user.interface';

/** Forme réelle d'un bon renvoyé au portail (BON_SELECT : filiale complète). */
function bonAvecFiliale() {
  return {
    id: 'bon-1',
    reference: 'BMD-2026-0001',
    createdAt: new Date('2026-09-24T08:00:00Z'),
    filiale: {
      id: 'f-1',
      name: 'livio-paris',
      displayName: 'Livio Paris',
      address: '1 rue de Paris',
      siret: '12345678900011',
      logoPath: 'uploads/logo.png',
      stampPath: 'uploads/cachet.png',
      active: true,
    },
    equipments: [{ id: 'eq-1', serialNumber: 'SN-1' }],
  };
}

function contexte(user?: Partial<AuthUser>): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => ({ user }) }) } as unknown as ExecutionContext;
}

async function intercepter(user: Partial<AuthUser> | undefined, body: unknown): Promise<unknown> {
  const next: CallHandler = { handle: () => of(body) };
  return lastValueFrom(new FilialeStampRedactionInterceptor().intercept(contexte(user), next));
}

describe('withoutFilialeStamp', () => {
  it('retire stampPath à toutes les profondeurs (objets et tableaux)', () => {
    const resultat = withoutFilialeStamp({ bons: [bonAvecFiliale(), bonAvecFiliale()] }) as {
      bons: Array<{ filiale: Record<string, unknown> }>;
    };
    for (const bon of resultat.bons) {
      expect(bon.filiale).not.toHaveProperty('stampPath');
      expect(bon.filiale.displayName).toBe('Livio Paris');
      expect(bon.filiale.logoPath).toBe('uploads/logo.png');
    }
  });

  it('ne modifie pas l’objet d’origine', () => {
    const origine = bonAvecFiliale();
    withoutFilialeStamp(origine);
    expect(origine.filiale.stampPath).toBe('uploads/cachet.png');
  });

  it('préserve les dates, les Buffer et les valeurs simples', () => {
    const buffer = Buffer.from('pdf');
    const resultat = withoutFilialeStamp({ date: new Date('2026-01-01T00:00:00Z'), buffer, n: 3, vide: null }) as {
      date: Date; buffer: Buffer; n: number; vide: null;
    };
    expect(resultat.date).toBeInstanceOf(Date);
    expect(resultat.date.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(resultat.buffer).toBe(buffer);
    expect(resultat.n).toBe(3);
    expect(resultat.vide).toBeNull();
  });

  it('renvoie la même référence quand il n’y a rien à retirer', () => {
    const corps = { items: [{ id: 'a', filiale: { id: 'f', displayName: 'X' } }] };
    expect(withoutFilialeStamp(corps)).toBe(corps);
  });
});

describe('FilialeStampRedactionInterceptor', () => {
  it('retire le cachet des réponses envoyées à un collaborateur', async () => {
    const corps = await intercepter({ role: 'collaborator' }, [bonAvecFiliale()]) as Array<{ filiale: object }>;
    expect(corps[0].filiale).not.toHaveProperty('stampPath');
  });

  it('retire aussi le cachet pour la direction et pour une requête sans session', async () => {
    for (const user of [{ role: 'direction' as const }, undefined]) {
      const corps = await intercepter(user, bonAvecFiliale()) as { filiale: object };
      expect(corps.filiale).not.toHaveProperty('stampPath');
    }
  });

  it('laisse la réponse intacte pour l’IT (écran Filiales, génération des PDF)', async () => {
    for (const role of ['admin', 'technician'] as const) {
      const origine = bonAvecFiliale();
      const corps = await intercepter({ role }, origine);
      expect(corps).toBe(origine);
    }
  });
});

// ─── Bout en bout : vraie application Nest, intercepteur global ──────────────

/** Remplace JwtAuthGuard : l'en-tête `x-test-role` simule la session. Les
 *  intercepteurs s'exécutent APRÈS les gardes : c'est ce qui leur donne
 *  `req.user`, et ce que ce bloc vérifie. */
@Injectable()
class FakeAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string>; user?: Partial<AuthUser> }>();
    const role = req.headers['x-test-role'];
    if (role) req.user = { id: 'u-1', role: role as AuthUser['role'] };
    return true;
  }
}

@Controller('sonde-cachet')
@UseGuards(FakeAuthGuard)
class SondeCachetController {
  @Get('bon')
  async bon() { return bonAvecFiliale(); }

  @Get('liste')
  liste() { return { items: [bonAvecFiliale()], total: 1 }; }
}

@Module({
  controllers: [SondeCachetController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: FilialeStampRedactionInterceptor }],
})
class SondeCachetModule {}

describe('FilialeStampRedactionInterceptor — réponse HTTP réelle', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [SondeCachetModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    const { port } = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  const corps = async (path: string, role?: string): Promise<string> =>
    (await fetch(`${baseUrl}${path}`, { headers: role ? { 'x-test-role': role } : {} })).text();

  it('le JSON reçu par un collaborateur ou la direction ne contient aucun stampPath (objet, enveloppe de liste)', async () => {
    for (const role of ['collaborator', 'direction', undefined]) {
      for (const path of ['/sonde-cachet/bon', '/sonde-cachet/liste']) {
        const json = await corps(path, role);
        expect(json).toContain('Livio Paris');
        expect(json).not.toContain('stampPath');
      }
    }
  });

  it('le JSON reçu par l’IT garde le cachet (écran Filiales)', async () => {
    for (const role of ['admin', 'technician']) {
      expect(await corps('/sonde-cachet/liste', role)).toContain('"stampPath":"uploads/cachet.png"');
    }
  });
});
