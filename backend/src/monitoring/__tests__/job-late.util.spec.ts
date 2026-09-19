import { isJobLate } from '../job-late.util';

const HOUR_MS = 60 * 60 * 1000;
const now = new Date('2026-09-19T12:00:00Z');
const longAgoStart = new Date('2026-01-01T00:00:00Z'); // process démarré il y a longtemps

describe('isJobLate', () => {
  it("n'est pas en retard quand la dernière exécution réussie est récente", () => {
    expect(
      isJobLate({
        lastFinishedAt: new Date(now.getTime() - HOUR_MS),
        lastStatus: 'success',
        thresholdMs: 12 * HOUR_MS,
        now,
        processStartedAt: longAgoStart,
      }),
    ).toBe(false);
  });

  it('est en retard quand la dernière exécution réussie date de plus que le seuil', () => {
    expect(
      isJobLate({
        lastFinishedAt: new Date(now.getTime() - 13 * HOUR_MS),
        lastStatus: 'success',
        thresholdMs: 12 * HOUR_MS,
        now,
        processStartedAt: longAgoStart,
      }),
    ).toBe(true);
  });

  it("n'est pas en retard pile au seuil (strictement supérieur requis)", () => {
    expect(
      isJobLate({
        lastFinishedAt: new Date(now.getTime() - 12 * HOUR_MS),
        lastStatus: 'success',
        thresholdMs: 12 * HOUR_MS,
        now,
        processStartedAt: longAgoStart,
      }),
    ).toBe(false);
  });

  it('traite "skipped" comme "success" pour la fraîcheur (une tâche désactivée qui tourne toujours n\'est pas en retard)', () => {
    expect(
      isJobLate({
        lastFinishedAt: new Date(now.getTime() - HOUR_MS),
        lastStatus: 'skipped',
        thresholdMs: 12 * HOUR_MS,
        now,
        processStartedAt: longAgoStart,
      }),
    ).toBe(false);
  });

  it('n\'est jamais "en retard" quand le dernier statut est "error" (le pastille erreur porte déjà l\'info)', () => {
    expect(
      isJobLate({
        lastFinishedAt: new Date(now.getTime() - 100 * HOUR_MS),
        lastStatus: 'error',
        thresholdMs: 12 * HOUR_MS,
        now,
        processStartedAt: longAgoStart,
      }),
    ).toBe(false);
  });

  it("n'alerte pas juste après le démarrage du process, même sans exécution jamais terminée", () => {
    expect(
      isJobLate({
        lastFinishedAt: null,
        lastStatus: null,
        thresholdMs: 12 * HOUR_MS,
        now,
        processStartedAt: new Date(now.getTime() - HOUR_MS), // process démarré il y a 1h
      }),
    ).toBe(false);
  });

  it('alerte si le process tourne depuis plus que le seuil sans aucune exécution terminée', () => {
    expect(
      isJobLate({
        lastFinishedAt: null,
        lastStatus: null,
        thresholdMs: 12 * HOUR_MS,
        now,
        processStartedAt: new Date(now.getTime() - 13 * HOUR_MS),
      }),
    ).toBe(true);
  });

  // ─── Rappels de signature (jours ouvrés) — seuil 74 h (72 h week-end + 2 h) ─

  describe('rappels de signature (seuil 74 h — vendredi 9 h à lundi 9 h + marge)', () => {
    const SIGNATURE_REMINDERS_THRESHOLD_MS = 74 * HOUR_MS;

    it("n'est pas en retard le lundi 8 h après un dernier succès le vendredi 9 h", () => {
      // Vendredi 18/09/2026 09:00 → lundi 21/09/2026 08:00 = 71 h, sous le seuil de 74 h
      const fridayNineAm = new Date('2026-09-18T09:00:00Z');
      const mondayEightAm = new Date('2026-09-21T08:00:00Z');

      expect(
        isJobLate({
          lastFinishedAt: fridayNineAm,
          lastStatus: 'success',
          thresholdMs: SIGNATURE_REMINDERS_THRESHOLD_MS,
          now: mondayEightAm,
          processStartedAt: longAgoStart,
        }),
      ).toBe(false);
    });

    it('est en retard le mardi 12 h sans aucun passage depuis le vendredi (le lundi 9h a été manqué)', () => {
      // Vendredi 18/09/2026 09:00 → mardi 22/09/2026 12:00 = 99 h, au-delà du seuil de 74 h
      const fridayNineAm = new Date('2026-09-18T09:00:00Z');
      const tuesdayNoon = new Date('2026-09-22T12:00:00Z');

      expect(
        isJobLate({
          lastFinishedAt: fridayNineAm,
          lastStatus: 'success',
          thresholdMs: SIGNATURE_REMINDERS_THRESHOLD_MS,
          now: tuesdayNoon,
          processStartedAt: longAgoStart,
        }),
      ).toBe(true);
    });
  });
});
