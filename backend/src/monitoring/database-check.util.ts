import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_TIMEOUT_MS = 2000;

/**
 * Ping léger de la base (SELECT 1) borné dans le temps : utilisé par
 * /api/health/ready (sonde Docker/Zabbix) et /api/admin/status. Le timeout
 * ne coupe pas la requête sous-jacente — il évite seulement de faire
 * attendre l'appelant indéfiniment si Postgres ne répond plus.
 */
export async function checkDatabase(
  prisma: PrismaService,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<'ok' | 'unreachable'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Délai de connexion à la base dépassé')), timeoutMs);
      }),
    ]);
    return 'ok';
  } catch {
    return 'unreachable';
  } finally {
    clearTimeout(timer);
  }
}
