import { buildBonPreviewVars, fakeSignerUrl, FAKE_SIGNATURE_TOKEN, PreviewBon } from '../bon-preview-vars';
import { PREVIEW_VARS, TEMPLATES, TemplateDefinition } from '../template-catalog';

const APP_URL = 'https://bons.livio.fr';

function template(id: string): TemplateDefinition {
  const tpl = TEMPLATES.find((t) => t.id === id);
  if (!tpl) throw new Error(`modèle ${id} absent du catalogue`);
  return tpl;
}

function bon(overrides: Partial<PreviewBon> = {}): PreviewBon {
  return {
    id: 'bon-1',
    reference: 'BMD-2026-0107',
    civilite: 'mme',
    collaborateurEmail: 'claire.martin@livio.fr',
    dateMiseDisposition: new Date('2026-09-01T00:00:00Z'),
    dateRestitution: new Date('2026-12-15T00:00:00Z'),
    collaborateur: { displayName: 'Claire <Martin>', email: 'claire.martin@livio.fr' },
    filiale: { displayName: 'Livio Nord', name: 'livio-nord' },
    equipments: [
      { id: 'e2', order: 2, catalogItem: null, customLabel: 'Casque', serialNumber: null },
      { id: 'e1', order: 1, catalogItem: { brand: 'Lenovo', model: 'T14' }, serialNumber: 'SN-REEL-1' },
    ],
    signatures: [{ type: 'mise_disposition', signed: false }],
    latestContestation: null,
    ...overrides,
  };
}

describe('buildBonPreviewVars', () => {
  it('rend une demande de signature avec les vraies données du bon', () => {
    const { vars, subject, sampleVariables } = buildBonPreviewVars(template('mise_disposition_request'), bon(), APP_URL);

    expect(vars.REFERENCE).toBe('BMD-2026-0107');
    expect(vars.COLLAB_CIVILITE).toBe('Madame');
    expect(vars.FILIALE_NOM).toBe('Livio Nord');
    expect(vars.DATE_MISE_DISPO).toContain('2026');
    expect(vars.EQUIP_LIST).toContain('Lenovo T14');
    expect(vars.EQUIP_LIST).toContain('SN-REEL-1');
    expect(vars.EQUIP_LIST).toContain('Casque');
    expect(subject).toContain('BMD-2026-0107');
    expect(sampleVariables).toEqual([]);
  });

  it('échappe les données du bon comme le fait l’envoi réel', () => {
    const { vars } = buildBonPreviewVars(template('mise_disposition_request'), bon(), APP_URL);
    expect(vars.COLLAB_NAME).toBe('Claire &lt;Martin&gt;');
  });

  it('met toujours un lien de signature factice, jamais un jeton', () => {
    for (const id of ['mise_disposition_request', 'restitution_request', 'pv_cloture_request', 'reminder']) {
      const { vars } = buildBonPreviewVars(template(id), bon(), APP_URL);
      expect(vars.SIGNER_URL).toBe(`${APP_URL}/signer/${FAKE_SIGNATURE_TOKEN}`);
    }
    expect(fakeSignerUrl('')).toBe(`/signer/${FAKE_SIGNATURE_TOKEN}`);
  });

  it('ne garde que les équipements restitués dans une restitution partielle', () => {
    const partial = bon({
      equipments: [
        { id: 'e1', order: 1, catalogItem: { brand: 'Lenovo', model: 'T14' }, returnedAt: new Date() },
        { id: 'e2', order: 2, customLabel: 'Casque' },
      ],
    });
    const { vars } = buildBonPreviewVars(template('restitution_request'), partial, APP_URL);
    expect(vars.EQUIP_LIST).toContain('Lenovo T14');
    expect(vars.EQUIP_LIST).not.toContain('Casque');
    expect(vars.REMAINING_SECTION).toContain('Casque');
  });

  it('garde les valeurs d’exemple du rang du rappel et les signale', () => {
    const { vars, sampleVariables } = buildBonPreviewVars(template('reminder'), bon(), APP_URL);
    expect(sampleVariables.sort()).toEqual(['MAX_REMINDERS', 'REMINDER_NUMBER']);
    expect(vars.REMINDER_NUMBER).toBe(PREVIEW_VARS.REMINDER_NUMBER);
    expect(vars.TYPE_LABEL).toBe('mise à disposition');
  });

  it('libelle le rappel selon le document en attente', () => {
    const pending = bon({ signatures: [{ type: 'mise_disposition', signed: true }, { type: 'restitution', signed: false }] });
    const { vars } = buildBonPreviewVars(template('reminder'), pending, APP_URL);
    expect(vars.TYPE_LABEL).toBe('restitution');
  });

  it('reprend la dernière contestation du bon quand elle existe', () => {
    const contested = bon({
      latestContestation: {
        message: 'Écran différent',
        resolutionMessage: 'Numéro de série corrigé',
        user: { displayName: 'Claire Martin', email: null },
      },
    });
    const alert = buildBonPreviewVars(template('contestation_alert'), contested, APP_URL);
    expect(alert.vars.CONTESTATION_MESSAGE).toBe('Écran différent');
    expect(alert.vars.USER_NAME).toBe('Claire Martin');
    expect(alert.sampleVariables).toEqual([]);

    const resolved = buildBonPreviewVars(template('contestation_resolved'), contested, APP_URL);
    expect(resolved.vars.RESOLUTION_MESSAGE).toBe('Numéro de série corrigé');
  });

  it('retombe sur les messages d’exemple pour un bon jamais contesté', () => {
    const alert = buildBonPreviewVars(template('contestation_alert'), bon(), APP_URL);
    expect(alert.sampleVariables).toEqual(['CONTESTATION_MESSAGE']);
    expect(alert.vars.CONTESTATION_MESSAGE).toBe(PREVIEW_VARS.CONTESTATION_MESSAGE);

    const rejected = buildBonPreviewVars(template('contestation_rejected'), bon(), APP_URL);
    expect(rejected.sampleVariables).toEqual(['RESOLUTION_MESSAGE']);
  });

  it('rend le rappel de restitution avec la date prévue et le lien du portail', () => {
    const { vars, sampleVariables } = buildBonPreviewVars(template('restitution_due_reminder'), bon(), APP_URL);
    expect(vars.DATE_RESTITUTION).toContain('2026');
    expect(vars.PORTAIL_URL).toBe(`${APP_URL}/mes-bons`);
    expect(sampleVariables).toEqual([]);
  });

  it('rend les confirmations de signature', () => {
    const { vars } = buildBonPreviewVars(template('confirmation_pv_cloture'), bon(), APP_URL);
    expect(vars.REFERENCE).toBe('BMD-2026-0107');
    expect(vars.TYPE_LABEL).toContain('procès-verbal');
  });
});
