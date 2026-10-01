/**
 * Contrat des modèles d'email (`/api/email-templates`) et des modèles
 * PDF (`/api/pdf-templates`) : catalogue, export et import, édition,
 * aperçus (données d'exemple ou bon réel) et envois de test. Toutes ces
 * routes sont réservées à l'administrateur. Les anciens chemins sous
 * `/api/admin/…` restent servis en alias dépréciés.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, AccessRule, describeRule, expectAccessRule, rule } from './support/access';
import { apiError } from './support/common-shapes';
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
  rule('GET /email-templates', ADMIN),
  rule('GET /email-templates/export', ADMIN),
  rule('POST /email-templates/import', ADMIN),
  rule('GET /email-templates/:id/html', ADMIN, () => `/email-templates/${EMAIL}/html`),
  rule('GET /email-templates/:id/preview', ADMIN, () => `/email-templates/${EMAIL}/preview`),
  rule('PATCH /email-templates/:id', ADMIN, () => `/email-templates/${EMAIL}`),
  rule('DELETE /email-templates/:id', ADMIN, () => `/email-templates/${EMAIL}`),
  rule('POST /email-templates/:id/test', ADMIN, () => `/email-templates/${EMAIL}/test`),
  rule('GET /email-templates/preview-bons', ADMIN, () => '/email-templates/preview-bons?q=BON'),
  rule('GET /email-templates/:id/preview-bon/:bonId', ADMIN, (d) => `/email-templates/${EMAIL}/preview-bon/${d.bons.active.id}`),
  rule('POST /email-templates/:id/test-bon', ADMIN, () => `/email-templates/${EMAIL}/test-bon`),
  rule('GET /pdf-templates', ADMIN),
  rule('GET /pdf-templates/export', ADMIN),
  rule('POST /pdf-templates/import', ADMIN),
  rule('GET /pdf-templates/:id/config', ADMIN, () => `/pdf-templates/${PDF}/config`),
  rule('GET /pdf-templates/:id/preview', ADMIN, () => `/pdf-templates/${PDF}/preview`),
  rule('PATCH /pdf-templates/:id', ADMIN, () => `/pdf-templates/${PDF}`),
  rule('DELETE /pdf-templates/:id', ADMIN, () => `/pdf-templates/${PDF}`),
];

describe('Droits d’accès', () => {
  it.each(ACCESS.map((a) => [describeRule(a), a] as const))('%s', async (_label, access) => {
    await expectAccessRule(ctx.http, ctx.data, access);
  });
});

describe('Modèles d’email', () => {
  it('GET /email-templates : catalogue', async () => {
    const res = await ctx.http.get('/email-templates', 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, emailTemplates);
  });

  it('GET /email-templates/export : { exportedAt, templates }', async () => {
    const res = await ctx.http.get('/email-templates/export', 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, emailTemplatesExport);
  });

  it('GET /email-templates/:id/html', async () => {
    const res = await ctx.http.get(`/email-templates/${EMAIL}/html`, 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, emailTemplateHtml);
  });

  it('GET /email-templates/:id/html d’un modèle inconnu : 404', async () => {
    const res = await ctx.http.get('/email-templates/inconnu/html', 'admin');
    expect(res.status).toBe(404);
    expectShape(res.body, apiError);
  });

  it('GET /email-templates/:id/preview : { html }', async () => {
    const res = await ctx.http.get(`/email-templates/${EMAIL}/preview`, 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, emailTemplatePreview);
  });

  it('PATCH puis DELETE /email-templates/:id : { ok: true }', async () => {
    const current = await ctx.http.get(`/email-templates/${EMAIL}/html`, 'admin');
    const saved = await ctx.http.patch(`/email-templates/${EMAIL}`, 'admin', { html: `${current.body.html}<!-- contrat -->` });
    expect(saved.status).toBe(200);
    expectShape(saved.body, templateSuccess);
    const reset = await ctx.http.delete(`/email-templates/${EMAIL}`, 'admin');
    expect(reset.status).toBe(200);
    expectShape(reset.body, templateSuccess);
  });

  it('POST /email-templates/import : { imported, skipped }', async () => {
    const exported = await ctx.http.get('/email-templates/export', 'admin');
    const res = await ctx.http.post('/email-templates/import', 'admin', { templates: exported.body.templates });
    expect(res.status).toBe(200);
    expectShape(res.body, templatesImport);
  });

  it('POST /email-templates/:id/test sans SMTP : 200 { ok: false, message }', async () => {
    const res = await ctx.http.post(`/email-templates/${EMAIL}/test`, 'admin', { email: 'test@contrat.test' });
    expect(res.status).toBe(200);
    expectShape(res.body, emailTemplateTest);
    expect(res.body.ok).toBe(false);
  });

  it('POST /email-templates/import d’un fichier illisible : lignes ignorées, pas d’erreur 500', async () => {
    const res = await ctx.http.post('/email-templates/import', 'admin', { templates: [null, 42, { id: 'inconnu', html: 'x' }] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ imported: 0, skipped: 3 });
  });

  it('GET /email-templates/preview-bons?q= : bons proposés', async () => {
    const res = await ctx.http.get('/email-templates/preview-bons?q=BON', 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, previewBons);
  });

  it('GET /email-templates/:id/preview-bon/:bonId : rendu avec un bon réel', async () => {
    const res = await ctx.http.get(`/email-templates/${EMAIL}/preview-bon/${ctx.data.bons.active.id}`, 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, emailTemplateBonPreview);
  });

  it('POST /email-templates/:id/test-bon sans SMTP : 200 { ok: false, message }', async () => {
    const res = await ctx.http.post(`/email-templates/${EMAIL}/test-bon`, 'admin', {
      email: 'test@contrat.test',
      bonId: ctx.data.bons.active.id,
    });
    expect(res.status).toBe(200);
    expectShape(res.body, emailTemplateTest);
  });
});

describe('Modèles PDF', () => {
  it('GET /pdf-templates : catalogue', async () => {
    const res = await ctx.http.get('/pdf-templates', 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, pdfTemplates);
  });

  it('GET /pdf-templates/export', async () => {
    const res = await ctx.http.get('/pdf-templates/export', 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, pdfTemplatesExport);
  });

  it('GET /pdf-templates/:id/config : configuration courante et par défaut', async () => {
    const res = await ctx.http.get(`/pdf-templates/${PDF}/config`, 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, pdfTemplateConfigResponse);
  });

  it('GET /pdf-templates/:id/preview : document PDF', async () => {
    const res = await ctx.http.get(`/pdf-templates/${PDF}/preview`, 'admin');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
  });

  it('PATCH puis DELETE /pdf-templates/:id : { ok: true }', async () => {
    const current = await ctx.http.get(`/pdf-templates/${PDF}/config`, 'admin');
    // Le front envoie la configuration elle-même, sans enveloppe.
    const saved = await ctx.http.patch(`/pdf-templates/${PDF}`, 'admin', current.body.config);
    expect(saved.status).toBe(200);
    expectShape(saved.body, templateSuccess);
    const reset = await ctx.http.delete(`/pdf-templates/${PDF}`, 'admin');
    expect(reset.status).toBe(200);
    expectShape(reset.body, templateSuccess);
  });

  it('POST /pdf-templates/import : { imported, skipped }', async () => {
    const exported = await ctx.http.get('/pdf-templates/export', 'admin');
    const res = await ctx.http.post('/pdf-templates/import', 'admin', { templates: exported.body.templates });
    expect(res.status).toBe(200);
    expectShape(res.body, templatesImport);
  });
});

describe('Anciens chemins (alias dépréciés)', () => {
  it.each([
    ['/admin/email-templates', '/api/email-templates'],
    [`/admin/email-templates/${EMAIL}/html`, `/api/email-templates/${EMAIL}/html`],
    ['/admin/pdf-templates', '/api/pdf-templates'],
    [`/admin/pdf-templates/${PDF}/config`, `/api/pdf-templates/${PDF}/config`],
  ])('GET %s : même réponse, signalée dépréciée', async (oldPath, successor) => {
    const res = await ctx.http.get(oldPath, 'admin');
    expect(res.status).toBe(200);
    expect(res.headers.deprecation).toBe('true');
    expect(res.headers.link).toContain(successor);
  });
});
