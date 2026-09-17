import { buildReminderMessage } from '../../messages/reminder-message';

describe('buildReminderMessage', () => {
  it('builds vars and subject for a mise_disposition reminder', () => {
    const { vars, subject } = buildReminderMessage({
      reference: 'BON-2026-0010',
      filialeNom: 'Filiale Demo',
      signerUrl: 'https://app.test/signer/tok',
      reminderNumber: 1,
      maxReminders: 3,
      docType: 'mise_disposition',
    });

    expect(vars.TYPE_LABEL).toBe('mise à disposition');
    expect(vars.REMINDER_NUMBER).toBe('1');
    expect(vars.MAX_REMINDERS).toBe('3');
    expect(subject).toBe('[RAPPEL] [BON-2026-0010] Bon de mise à disposition à signer — Filiale Demo');
  });

  it('uses "Procès-verbal" (not "Bon de ...") as the subject document label for pv_cloture', () => {
    const { subject, vars } = buildReminderMessage({
      reference: 'BON-2026-0040',
      filialeNom: 'Filiale Demo',
      signerUrl: '#',
      reminderNumber: 2,
      maxReminders: 3,
      docType: 'pv_cloture',
    });

    expect(vars.TYPE_LABEL).toBe("procès-verbal d'équipements non restitués");
    expect(subject).toBe('[RAPPEL] [BON-2026-0040] Procès-verbal à signer — Filiale Demo');
  });

  it('falls back to the mise_disposition label for an unknown docType', () => {
    const { vars } = buildReminderMessage({
      reference: 'BON-1',
      filialeNom: 'F',
      signerUrl: '#',
      reminderNumber: 1,
      maxReminders: 3,
      docType: 'unknown_type',
    });
    expect(vars.TYPE_LABEL).toBe('mise à disposition');
  });

  it('escapes the reference and filiale name in vars but not in the subject', () => {
    const { vars, subject } = buildReminderMessage({
      reference: '<b>BON</b>',
      filialeNom: '<i>Filiale</i>',
      signerUrl: '#',
      reminderNumber: 1,
      maxReminders: 3,
      docType: 'restitution',
    });
    expect(vars.REFERENCE).toBe('&lt;b&gt;BON&lt;/b&gt;');
    expect(vars.FILIALE_NOM).toBe('&lt;i&gt;Filiale&lt;/i&gt;');
    expect(subject).toContain('<b>BON</b>');
    expect(subject).toContain('<i>Filiale</i>');
  });
});
