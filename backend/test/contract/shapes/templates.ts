/** Formes vérifiées des contrats de src/contracts/templates.ts. */
import type {
  EmailTemplateBonPreviewResponse,
  EmailTemplateExportItem,
  EmailTemplateHtmlResponse,
  EmailTemplatePreviewResponse,
  EmailTemplatesExportResponse,
  EmailTemplateSummary,
  EmailTemplateTestResponse,
  PdfTemplateConfig,
  PdfTemplateConfigResponse,
  PdfTemplateExportItem,
  PdfTemplatesExportResponse,
  PdfTemplateSummary,
  PreviewBonOption,
  TemplatesImportResponse,
  TemplateSuccessResponse,
  TemplateVariable,
} from '../../../src/contracts/templates';
import { bonStatus, listOf } from '../support/common-shapes';
import { arrayOf, bool, int, isoDate, literal, nullable, num, object, str, uuid } from '../support/shape';

const variable = object<TemplateVariable>({ name: str, description: str });

const emailTemplateId = literal(
  'mise_disposition_request',
  'restitution_request',
  'confirmation_mise_disposition',
  'confirmation_restitution',
  'pv_cloture_request',
  'contestation_alert',
  'contestation_resolved',
  'contestation_rejected',
  'reminder',
  'confirmation_pv_cloture',
  'departure_alert',
  'restitution_due_reminder',
  'bon_cancelled',
  'handover_without_signature',
  'closed_without_signature',
  'bon_replaced',
  'equipment_found',
  'link_request_alert',
  'contestation_overdue_alert',
);

const pdfTemplateId = literal('mise_disposition', 'restitution', 'cloture', 'avenant');

export const emailTemplates = listOf(
  object<EmailTemplateSummary>({
    id: emailTemplateId,
    name: str,
    description: str,
    category: literal('signature', 'contestation', 'rappel', 'depart'),
    recipient: str,
    headerColor: str,
    variables: arrayOf(variable),
    isCustomized: bool,
  }),
  { minLength: 1 },
);

export const emailTemplatesExport = object<EmailTemplatesExportResponse>({
  exportedAt: isoDate,
  templates: arrayOf(
    object<EmailTemplateExportItem>({ id: emailTemplateId, name: str, html: str, isCustomized: bool }),
    { minLength: 1 },
  ),
});

export const templatesImport = object<TemplatesImportResponse>({ imported: int, skipped: int });

export const templateSuccess = object<TemplateSuccessResponse>({ ok: literal(true) });

export const emailTemplateHtml = object<EmailTemplateHtmlResponse>({
  html: str,
  defaultHtml: str,
  isCustomized: bool,
  variables: arrayOf(variable),
});

export const emailTemplatePreview = object<EmailTemplatePreviewResponse>({ html: str });

export const emailTemplateTest = object<EmailTemplateTestResponse>({ ok: bool, message: str });

export const previewBons = listOf(
  object<PreviewBonOption>({
    id: uuid,
    reference: str,
    status: bonStatus,
    collaborateurName: nullable(str),
    filialeName: nullable(str),
  }),
  { minLength: 1 },
);

export const emailTemplateBonPreview = object<EmailTemplateBonPreviewResponse>({
  html: str,
  subject: str,
  reference: str,
  sampleVariables: arrayOf(str),
});

export const pdfTemplates = listOf(
  object<PdfTemplateSummary>({
    id: pdfTemplateId,
    name: str,
    description: str,
    documentType: pdfTemplateId,
    variables: arrayOf(variable),
    isCustomized: bool,
  }),
  { minLength: 1 },
);

const pdfTemplateConfig = object<PdfTemplateConfig>({
  colors: object<PdfTemplateConfig['colors']>({
    primary: str,
    dark: str,
    gray: str,
    lightGray: str,
    border: str,
    headerBg: str,
    rowAlt: str,
  }),
  fonts: object<PdfTemplateConfig['fonts']>({
    titleSize: num,
    subtitleSize: num,
    bodySize: num,
    labelSize: num,
    tableHeaderSize: num,
    tableBodySize: num,
  }),
  margins: object<PdfTemplateConfig['margins']>({ top: num, bottom: num, left: num, right: num }),
  header: object<PdfTemplateConfig['header']>({
    showLogo: bool,
    logoMaxHeight: num,
    logoMaxWidth: num,
    titleText: str,
    subtitleText: str,
    showReference: bool,
    showDates: bool,
  }),
  infoBoxes: object<PdfTemplateConfig['infoBoxes']>({
    showCollaborateur: bool,
    showEntite: bool,
    collaborateurTitle: str,
    entiteTitle: str,
  }),
  table: object<PdfTemplateConfig['table']>({ sectionTitle: str, showRowNumbers: bool, emptyMessage: str }),
  signatures: object<PdfTemplateConfig['signatures']>({
    showSignatures: bool,
    itTitle: str,
    itMention: str,
    collabTitle: str,
    collabMention: str,
  }),
  footer: object<PdfTemplateConfig['footer']>({ showFooter: bool, footerText: str }),
});

export const pdfTemplatesExport = object<PdfTemplatesExportResponse>({
  exportedAt: isoDate,
  templates: arrayOf(
    object<PdfTemplateExportItem>({ id: pdfTemplateId, name: str, config: pdfTemplateConfig, isCustomized: bool }),
    { minLength: 1 },
  ),
});

export const pdfTemplateConfigResponse = object<PdfTemplateConfigResponse>({
  config: pdfTemplateConfig,
  defaultConfig: pdfTemplateConfig,
  isCustomized: bool,
  variables: arrayOf(variable),
});
