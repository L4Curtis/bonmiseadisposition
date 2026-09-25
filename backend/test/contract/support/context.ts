/**
 * Point d'entrée des fichiers de contrat : monte l'application réelle, recrée
 * le jeu de données et ouvre une session par personne.
 *
 *   let ctx: ContractContext;
 *   beforeAll(async () => { ctx = await startContractContext(); });
 *   afterAll(() => ctx.close());
 */
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { createContractApp } from './app';
import { ContractHttp, Persona } from './http';
import { SeededData, seedContractDatabase } from './seed';

export interface ContractContext {
  app: INestApplication;
  prisma: PrismaService;
  http: ContractHttp;
  data: SeededData;
  close: () => Promise<void>;
}

const PERSONAS: readonly Persona[] = ['admin', 'technician', 'direction', 'collaborator', 'otherCollaborator'];

export async function startContractContext(): Promise<ContractContext> {
  const app = await createContractApp();
  const prisma = app.get(PrismaService);
  const data = await seedContractDatabase(prisma);
  const sessions = Object.fromEntries(PERSONAS.map((persona) => [persona, data.people[persona]])) as Record<
    Persona,
    SeededData['people'][Persona]
  >;
  const http = await ContractHttp.create(app, sessions);
  return { app, prisma, http, data, close: () => app.close() };
}
