/**
 * Contrat des modèles d'email (`/api/admin/email-templates`) et des modèles
 * PDF (`/api/admin/pdf-templates`) : catalogue, export et import, édition,
 * aperçus (données d'exemple ou bon réel) et envois de test. Toutes ces
 * routes sont réservées à l'administrateur.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, AccessRule, describeRule, expectAccessRule, rule } from './support/access';
import { nestError } from './support/common-shapes';
import { ContractContext, startContractContext } from './support/context';
import { expectShape } from './support/shape';
import {
  emailTemplateBonPreview,
  emailTemplateHtml,
  emailTemplatePreview,
  emailTemplates,
  emailTemplatesExport,
  emailTemplateTest,
  pdfTemplateConfigResponse,
  pdfTemplates,
  pdfTemplatesExport,
  previewBons,
  templatesImport,
  templateSuccess,
} from './shapes/templates';

let ctx: ContractContext;

beforeAll(async () => {
  ctx = await startContractContext();
});

afterAll(async () => {
  await ctx?.close();
});

const EMAIL = 'mise_disposition_request';
const PDF = 'mise_disposition';

const ACCESS: readonly AccessRule[] = [
  rule('GET /admin/email-templates', ADMIN),
  rule('GET /admin/email-templates/export', ADMIN),
  rule('POST /admin/email-templates/import', ADMIN),
  rule('GET /admin/email-templates/:id/html', ADMIN, () => `/admin/email-templates/${EMAIL}/html`),
  rule('GET /admin/email-templates/:id/preview', ADMIN, () => `/admin/email-templates/${EMAIL}/preview`),
  rule('PATCH /admin/email-templates/:id', ADMIN, () => `/admin/email-templates/${EMAIL}`),
  rule('DELETE /admin/email-templates/:id', ADMIN, () => `/admin/email-templates/${EMAIL}`),
  rule('POST /admin/email-templates/:id/test', ADMIN, () => `/admin/email-templates/${EMAIL}/test`),
  rule('GET /admin/email-templates/preview-bons', ADMIN, () => '/admin/email-templates/preview-bons?q=BON'),
  rule('GET /admin/email-templates/:id/preview-bon/:bonId', ADMIN, (d) => `/admin/email-templates/${EMAIL}/preview-bon/${d.bons.active.id}`),
  rule('POST /admin/email-templates/:id/test-bon', ADMIN, () => `/admin/email-templates/${EMAIL}/test-bon`),
  rule('GET /admin/pdf-templates', ADMIN),
  rule('GET /admin/pdf-templates/export', ADMIN),
  rule('POST /admin/pdf-templates/import', ADMIN),
  rule('GET /admin/pdf-templates/:id/config', ADMIN, () => `/admin/pdf-templates/${PDF}/config`),
  rule('GET /admin/pdf-templates/:id/preview', ADMIN, () => `/admin/pdf-templates/${PDF}/preview`),
  rule('PATCH /admin/pdf-templates/:id', ADMIN, () => `/admin/pdf-templates/${PDF}`),
  rule('DELETE /admin/pdf-templates/:id', ADMIN, () => `/admin/pdf-templates/${PDF}`),
];

describe('Droits d’accès', () => {
  it.each(ACCESS.map((a) => [describeRule(a), a] as const))('%s', async (_label, access) => {
    await expectAccessRule(ctx.http, ctx.data, access);
  });
});

describe('Modèles d’email', () => {
  it('GET /admin/email-templates : catalogue', async () => {
    const res = await ctx.http.get('/admin/email-templates', 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, emailTemplates);
  });

  it('GET /admin/email-templates/export : { exportedAt, templates }', async () => {
    const res = await ctx.http.get('/admin/email-templates/export', 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, emailTemplatesExport);
  });

  it('GET /admin/email-templates/:id/html', async () => {
    const res = await ctx.http.get(`/admin/email-templates/${EMAIL}/html`, 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, emailTemplateHtml);
  });

  it('GET /admin/email-templates/:id/html d’un modèle inconnu : 404', async () => {
    const res = await ctx.http.get('/admin/email-templates/inconnu/html', 'admin');
    expect(res.status).toBe(404);
    expectShape(res.body, nestError);
  });

  it('GET /admin/email-templates/:id/preview : { html }', async () => {
    const res = await ctx.http.get(`/admin/email-templates/${EMAIL}/preview`, 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, emailTemplatePreview);
  });

  it('PATCH puis DELETE /admin/email-templates/:id : { success: true }', async () => {
    const current = await ctx.http.get(`/admin/email-templates/${EMAIL}/html`, 'admin');
    const saved = await ctx.http.patch(`/admin/email-templates/${EMAIL}`, 'admin', { html: `${current.body.html}<!-- contrat -->` });
    expect(saved.status).toBe(200);
    expectShape(saved.body, templateSuccess);
    const reset = await ctx.http.delete(`/admin/email-templates/${EMAIL}`, 'admin');
    expect(reset.status).toBe(200);
    expectShape(reset.body, templateSuccess);
  });

  it('POST /admin/email-templates/import : { imported, skipped }', async () => {
    const exported = await ctx.http.get('/admin/email-templates/export', 'admin');
    const res = await ctx.http.post('/admin/email-templates/import', 'admin', { templates: exported.body.templates });
    expect(res.status).toBe(201);
    expectShape(res.body, templatesImport);
  });

  it('POST /admin/email-templates/:id/test sans SMTP : 200, échec porté par success: false', async () => {
    const res = await ctx.http.post(`/admin/email-templates/${EMAIL}/test`, 'admin', { email: 'test@contrat.test' });
    expect(res.status).toBe(201);
    expectShape(res.body, emailTemplateTest);
  });

  it('GET /admin/email-templates/preview-bons?q= : bons proposés', async () => {
    const res = await ctx.http.get('/admin/email-templates/preview-bons?q=BON', 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, previewBons);
  });

  it('GET /admin/email-templates/:id/preview-bon/:bonId : rendu avec un bon réel', async () => {
    const res = await ctx.http.get(`/admin/email-templates/${EMAIL}/preview-bon/${ctx.data.bons.active.id}`, 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, emailTemplateBonPreview);
  });

  it('POST /admin/email-templates/:id/test-bon sans SMTP : échec porté par success: false', async () => {
    const res = await ctx.http.post(`/admin/email-templates/${EMAIL}/test-bon`, 'admin', {
      email: 'test@contrat.test',
      bonId: ctx.data.bons.active.id,
    });
    expect(res.status).toBe(201);
    expectShape(res.body, emailTemplateTest);
  });
});

describe('Modèles PDF', () => {
  it('GET /admin/pdf-templates : catalogue', async () => {
    const res = await ctx.http.get('/admin/pdf-templates', 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, pdfTemplates);
  });

  it('GET /admin/pdf-templates/export', async () => {
    const res = await ctx.http.get('/admin/pdf-templates/export', 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, pdfTemplatesExport);
  });

  it('GET /admin/pdf-templates/:id/config : configuration courante et par défaut', async () => {
    const res = await ctx.http.get(`/admin/pdf-templates/${PDF}/config`, 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, pdfTemplateConfigResponse);
  });

  it('GET /admin/pdf-templates/:id/preview : document PDF', async () => {
    const res = await ctx.http.get(`/admin/pdf-templates/${PDF}/preview`, 'admin');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
  });

  it('PATCH puis DELETE /admin/pdf-templates/:id : { success: true }', async () => {
    const current = await ctx.http.get(`/admin/pdf-templates/${PDF}/config`, 'admin');
    // Le front envoie la configuration elle-même, sans enveloppe.
    const saved = await ctx.http.patch(`/admin/pdf-templates/${PDF}`, 'admin', current.body.config);
    expect(saved.status).toBe(200);
    expectShape(saved.body, templateSuccess);
    const reset = await ctx.http.delete(`/admin/pdf-templates/${PDF}`, 'admin');
    expect(reset.status).toBe(200);
    expectShape(reset.body, templateSuccess);
  });

  it('POST /admin/pdf-templates/import : { imported, skipped }', async () => {
    const exported = await ctx.http.get('/admin/pdf-templates/export', 'admin');
    const res = await ctx.http.post('/admin/pdf-templates/import', 'admin', { templates: exported.body.templates });
    expect(res.status).toBe(201);
    expectShape(res.body, templatesImport);
  });
});
