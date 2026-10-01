/**
 * Relance des contestations en retard (7 jours ouvrés) : une seule relance par
 * bon tous les 7 jours ouvrés, même si la tâche tourne deux fois, sans sauter
 * son tour quand le passage de 9 h démarre quelques secondes plus tôt.
 */
import { Logger } from '@nestjs/common';
import { runContestationOverdueAlerts, OverdueAlertDeps } from '../overdue/run-overdue-alerts';
import { renderTemplateHtml } from '../../templates/render';
import { defaultContestationOverdueAlert } from '../../templates/defaults/notice-defaults';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-09-28T07:00:00.000Z'); // lundi, 9 h à Paris

interface LogRow {
  bonId: string;
  type: string;
  status: 'sent' | 'failed';
  sentAt: Date;
}

/** Base simulée : une contestation en retard de 10 jours, et le journal des
 *  notifications, que la relance lit et écrit. */
function fakeDeps(logs: LogRow[], clock: { now: Date }) {
  const contestation = {
    message: 'Écran <b>fissuré</b>',
    createdAt: new Date(NOW.getTime() - 10 * DAY_MS),
    bon: { id: 'bon-1', reference: 'BON-2026-0001' },
    user: { displayName: 'Léa Martin' },
    reviewedBy: null,
  };
  const prisma = {
    contestation: { findMany: vi.fn().mockResolvedValue([contestation]) },
    user: {
      findMany: vi.fn().mockResolvedValue([{ email: 'tech@livio.test' }]),
    },
    notificationLog: {
      findMany: vi.fn(({ where }: { where: { bonId: { in: string[] }; sentAt: { gte: Date } } }) =>
        Promise.resolve(
          logs.filter(
            (l) => where.bonId.in.includes(l.bonId) && l.status === 'sent' && l.sentAt >= where.sentAt.gte,
          ),
        ),
      ),
      create: vi.fn(({ data }: { data: { bonId: string; type: string; status: 'sent' | 'failed' } }) => {
        logs.push({ ...data, sentAt: clock.now });
        return Promise.resolve({});
      }),
    },
  };
  const notificationService = { sendEmail: vi.fn().mockResolvedValue({ ok: true }) };
  const settings = { getString: vi.fn().mockResolvedValue('https://bons.example.test') };
  // Aucun modèle personnalisé : TemplatesService rend le modèle par défaut.
  const templatesService = {
    renderTemplate: vi.fn((_id: string, vars: Record<string, string>) =>
      Promise.resolve(renderTemplateHtml(defaultContestationOverdueAlert(), vars)),
    ),
  };
  const deps = {
    prisma,
    notificationService,
    settings,
    templatesService,
    logger: new Logger('test'),
  } as unknown as OverdueAlertDeps;
  return { deps, notificationService, templatesService };
}

describe('runContestationOverdueAlerts', () => {
  it('deux passages le même jour : un seul email', async () => {
    const logs: LogRow[] = [];
    const clock = { now: NOW };
    const { deps, notificationService } = fakeDeps(logs, clock);

    const first = await runContestationOverdueAlerts(deps, NOW);
    const second = await runContestationOverdueAlerts(deps, new Date(NOW.getTime() + 60_000));

    expect(first).toEqual({ overdue: 1, alerted: 1 });
    expect(second).toEqual({ overdue: 1, alerted: 0 });
    expect(notificationService.sendEmail).toHaveBeenCalledTimes(1);
  });

  it('un email à la mise en page commune : lien direct vers le bon, motif échappé', async () => {
    const { deps, notificationService } = fakeDeps([], { now: NOW });

    await runContestationOverdueAlerts(deps, NOW);

    const [to, subject, html] = notificationService.sendEmail.mock.calls[0] as [string, string, string];
    expect(to).toBe('tech@livio.test');
    expect(subject).toBe('[CONTESTATION] BON-2026-0001 attend une décision depuis plus de 7 jours ouvrés');
    expect(html).toContain('https://bons.example.test/bons/bon-1');
    expect(html).toContain('Écran &lt;b&gt;fissuré&lt;/b&gt;');
    expect(html).not.toContain('<b>fissuré</b>');
    expect(html).toContain('(10 j)');
  });

  it('modèle personnalisé par l’administration : c’est lui qui part, avec les variables de la relance', async () => {
    const { deps, notificationService, templatesService } = fakeDeps([], { now: NOW });
    templatesService.renderTemplate.mockImplementation((_id: string, vars: Record<string, string>) =>
      Promise.resolve(renderTemplateHtml('<p>Relance maison : {{OVERDUE_LEAD}} depuis {{AFTER_DAYS}} jours</p>', vars)),
    );

    await runContestationOverdueAlerts(deps, NOW);

    expect(templatesService.renderTemplate).toHaveBeenCalledWith('contestation_overdue_alert', expect.any(Object));
    const [, , html] = notificationService.sendEmail.mock.calls[0] as [string, string, string];
    expect(html).toBe('<p>Relance maison : Une contestation attend depuis 7 jours</p>');
  });

  it('en retard = reçue avant le même instant 7 jours ouvrés plus tôt, week-ends exclus', async () => {
    const { deps } = fakeDeps([], { now: NOW });
    await runContestationOverdueAlerts(deps, NOW);
    const prisma = deps.prisma as unknown as { contestation: { findMany: ReturnType<typeof vi.fn> } };
    const where = prisma.contestation.findMany.mock.calls[0][0].where as { createdAt: { lt: Date } };
    // Lundi 28/09 9 h → jeudi 17/09 9 h (deux week-ends sautés), pas lundi 21/09.
    expect(where.createdAt.lt.toISOString()).toBe('2026-09-17T07:00:00.000Z');
  });

  it('une semaine de calendrier plus tard (5 jours ouvrés) : pas encore de nouvelle relance', async () => {
    const logs: LogRow[] = [{ bonId: 'bon-1', type: 'contestation_overdue_alert', status: 'sent', sentAt: NOW }];
    const nextMonday = new Date(NOW.getTime() + 7 * DAY_MS);
    const { deps, notificationService } = fakeDeps(logs, { now: nextMonday });

    const outcome = await runContestationOverdueAlerts(deps, nextMonday);

    expect(outcome.alerted).toBe(0);
    expect(notificationService.sendEmail).not.toHaveBeenCalled();
  });

  it('7 jours ouvrés plus tard, un passage parti quelques secondes plus tôt relance quand même', async () => {
    const logs: LogRow[] = [{ bonId: 'bon-1', type: 'contestation_overdue_alert', status: 'sent', sentAt: new Date(NOW.getTime() + 5_000) }];
    // Lundi 28/09 + 7 jours ouvrés = mercredi 07/10, 9 h.
    const sevenBusinessDaysLater = new Date(NOW.getTime() + 9 * DAY_MS);
    const { deps, notificationService } = fakeDeps(logs, { now: sevenBusinessDaysLater });

    const outcome = await runContestationOverdueAlerts(deps, sevenBusinessDaysLater);

    expect(outcome.alerted).toBe(1);
    expect(notificationService.sendEmail).toHaveBeenCalledTimes(1);
  });

  it('une relance en échec est retentée au passage suivant', async () => {
    const logs: LogRow[] = [{ bonId: 'bon-1', type: 'contestation_overdue_alert', status: 'failed', sentAt: NOW }];
    const { deps, notificationService } = fakeDeps(logs, { now: NOW });

    await runContestationOverdueAlerts(deps, new Date(NOW.getTime() + DAY_MS));

    expect(notificationService.sendEmail).toHaveBeenCalledTimes(1);
  });
});
