# Accès par route

Généré par `backend/src/auth/__tests__/route-access.spec.ts` : ne pas modifier à la main.

| Verbe | Route | Accès | Méthode |
|---|---|---|---|
| GET | /api/admin/config/:category | admin | AdminController.getConfig |
| PUT | /api/admin/config/:category | admin | AdminController.setConfig |
| GET | /api/admin/config/health | admin | AdminController.getConfigHealth |
| POST | /api/admin/config/test/entra | admin | AdminController.testEntra |
| POST | /api/admin/config/test/ldap | admin | AdminController.testLdap |
| POST | /api/admin/config/test/smb | admin | AdminController.testSmb |
| POST | /api/admin/config/test/smtp | admin | AdminController.testSmtp |
| GET | /api/admin/email-templates | admin | TemplatesController.findAll |
| PATCH | /api/admin/email-templates/:id | admin | TemplatesController.update |
| DELETE | /api/admin/email-templates/:id | admin | TemplatesController.reset |
| GET | /api/admin/email-templates/:id/html | admin | TemplatesController.getHtml |
| GET | /api/admin/email-templates/:id/preview | admin | TemplatesController.getPreview |
| GET | /api/admin/email-templates/:id/preview-bon/:bonId | admin | TemplateBonPreviewController.previewWithBon |
| POST | /api/admin/email-templates/:id/test | admin | TemplatesController.sendTest |
| POST | /api/admin/email-templates/:id/test-bon | admin | TemplateBonPreviewController.sendTestWithBon |
| GET | /api/admin/email-templates/export | admin | TemplatesController.exportAll |
| POST | /api/admin/email-templates/import | admin | TemplatesController.importAll |
| GET | /api/admin/email-templates/preview-bons | admin | TemplateBonPreviewController.searchBons |
| GET | /api/admin/ldap/status | admin | AdminController.ldapStatus |
| POST | /api/admin/ldap/sync | admin | AdminController.triggerLdapSync |
| DELETE | /api/admin/ldap/users | admin | AdminController.purgeLdapUsers |
| GET | /api/admin/notifications/failed | admin | AdminController.getFailedNotifications |
| GET | /api/admin/pdf-templates | admin | PdfTemplatesController.findAll |
| PATCH | /api/admin/pdf-templates/:id | admin | PdfTemplatesController.update |
| DELETE | /api/admin/pdf-templates/:id | admin | PdfTemplatesController.reset |
| GET | /api/admin/pdf-templates/:id/config | admin | PdfTemplatesController.getConfig |
| GET | /api/admin/pdf-templates/:id/preview | admin | PdfTemplatesController.getPreview |
| GET | /api/admin/pdf-templates/export | admin | PdfTemplatesController.exportAll |
| POST | /api/admin/pdf-templates/import | admin | PdfTemplatesController.importAll |
| POST | /api/admin/pdf/regenerate-missing | admin | PdfAdminController.regenerateMissing |
| GET | /api/admin/retention/preview | admin | RetentionController.preview |
| POST | /api/admin/retention/purge | admin | RetentionController.purge |
| POST | /api/admin/retention/run | admin | RetentionController.run |
| GET | /api/admin/retention/stats | admin | RetentionController.getStats |
| GET | /api/admin/smb/failed | admin | AdminController.smbFailed |
| POST | /api/admin/smb/retry-all | admin | AdminController.smbRetryAll |
| POST | /api/admin/smb/retry/:id | admin | AdminController.smbRetryOne |
| GET | /api/admin/smb/status | admin | AdminController.smbStatus |
| GET | /api/admin/sso/diagnostic | admin | AdminController.getSsoDiagnostic |
| GET | /api/admin/status | admin | AdminController.getStatus |
| PATCH | /api/admin/users/:id/role | admin | AdminController.changeUserRole |
| POST | /api/admin/users/:id/unlock | admin | AdminController.unlockUser |
| GET | /api/audit | admin | AuditController.findAll |
| GET | /api/audit/actions | admin | AuditController.getDistinctActions |
| GET | /api/audit/export | admin | AuditController.exportCsv |
| GET | /api/auth/callback | public (sans session) | AuthController.callback |
| POST | /api/auth/change-password | tous les rôles connectés | AuthController.changePassword |
| GET | /api/auth/local-auth-status | public (sans session) | AuthController.localAuthStatus |
| POST | /api/auth/local-login | public (sans session) | AuthController.localLogin |
| GET | /api/auth/login | public (sans session) | AuthController.login |
| POST | /api/auth/logout | tous les rôles connectés | AuthController.logout |
| GET | /api/auth/me | tous les rôles connectés | AuthController.me |
| POST | /api/auth/refresh | public (sans session) | AuthController.refresh |
| GET | /api/auth/setup-required | public (sans session) | AuthController.setupRequired |
| GET | /api/bons | admin, technician | BonsController.findAll |
| POST | /api/bons | admin, technician | BonsController.create |
| GET | /api/bons/:bonId/attachments | tous les rôles connectés | AttachmentsController.list |
| POST | /api/bons/:bonId/attachments | tous les rôles connectés | AttachmentsController.upload |
| GET | /api/bons/:bonId/attachments/:attachmentId | tous les rôles connectés | AttachmentsController.download |
| DELETE | /api/bons/:bonId/attachments/:attachmentId | tous les rôles connectés | AttachmentsController.remove |
| GET | /api/bons/:id | tous les rôles connectés | BonsController.findOne |
| PUT | /api/bons/:id | admin, technician | BonsController.update |
| DELETE | /api/bons/:id | admin, technician | BonsController.cancel |
| POST | /api/bons/:id/close-unilateral | admin, technician | BonsController.closeUnilateral |
| POST | /api/bons/:id/contestation | tous les rôles connectés | BonsController.createContestation |
| POST | /api/bons/:id/declare-not-returned | admin, technician | BonsController.declareNotReturned |
| POST | /api/bons/:id/initiate-inperson | admin, technician | BonsController.initiateInPerson |
| POST | /api/bons/:id/initiate-restitution | admin, technician | BonsController.initiateRestitution |
| GET | /api/bons/:id/integrity | tous les rôles connectés | BonsController.getIntegrity |
| POST | /api/bons/:id/mark-found | admin, technician | BonsController.markFound |
| GET | /api/bons/:id/notifications | admin, technician | BonsController.getNotifications |
| GET | /api/bons/:id/pdf | tous les rôles connectés | BonsController.getPdf |
| GET | /api/bons/:id/pdf-snapshots | tous les rôles connectés | BonsController.getPdfSnapshots |
| GET | /api/bons/:id/pdf-snapshots/missing | admin, technician | BonsController.getMissingPdfSnapshots |
| POST | /api/bons/:id/resend | admin, technician | BonsController.resend |
| POST | /api/bons/:id/send | admin, technician | BonsController.send |
| POST | /api/bons/:id/sign-it | admin, technician | BonsController.signIt |
| GET | /api/bons/export | admin, technician | BonsController.exportCsv |
| GET | /api/bons/mes-bons | tous les rôles connectés | BonsController.getMyBons |
| GET | /api/bons/recent | admin, technician | BonsController.getRecent |
| POST | /api/bons/resend-batch | admin, technician | BonsController.resendBatch |
| GET | /api/bons/stats | admin, technician | BonsController.getStats |
| GET | /api/contestations | admin, technician | ContestationController.findAll |
| PATCH | /api/contestations/:id/resolve | admin, technician | ContestationController.resolve |
| PATCH | /api/contestations/:id/review | admin, technician | ContestationController.markInReview |
| GET | /api/equipment/catalog | admin, technician | EquipmentController.findAllCatalog |
| POST | /api/equipment/catalog | admin, technician | EquipmentController.createCatalogItem |
| GET | /api/equipment/catalog/:id | admin, technician | EquipmentController.findOneCatalog |
| PUT | /api/equipment/catalog/:id | admin, technician | EquipmentController.updateCatalogItem |
| DELETE | /api/equipment/catalog/:id | admin, technician | EquipmentController.removeCatalogItem |
| GET | /api/equipment/catalog/active | admin, technician | EquipmentController.findActiveCatalog |
| POST | /api/equipment/catalog/import | admin, technician | EquipmentController.importCatalog |
| GET | /api/equipment/catalog/search | admin, technician | EquipmentController.searchCatalog |
| GET | /api/equipment/history | admin, technician, direction | EquipmentController.equipmentHistory |
| GET | /api/equipment/history/export | admin, technician, direction | EquipmentController.exportEquipmentHistory |
| GET | /api/equipment/packs | admin, technician | EquipmentController.findAllPacks |
| POST | /api/equipment/packs | admin, technician | EquipmentController.createPack |
| GET | /api/equipment/packs/:id | admin, technician | EquipmentController.findOnePack |
| PUT | /api/equipment/packs/:id | admin, technician | EquipmentController.updatePack |
| DELETE | /api/equipment/packs/:id | admin, technician | EquipmentController.removePack |
| GET | /api/equipment/packs/active | admin, technician | EquipmentController.findActivePacks |
| GET | /api/equipment/serial-conflicts | admin, technician | EquipmentController.serialConflicts |
| GET | /api/equipment/serial-history | admin, technician | EquipmentController.serialHistory |
| GET | /api/filiales | admin | FilialesController.findAll |
| POST | /api/filiales | admin | FilialesController.create |
| GET | /api/filiales/:id | admin | FilialesController.findOne |
| PUT | /api/filiales/:id | admin | FilialesController.update |
| DELETE | /api/filiales/:id | admin | FilialesController.remove |
| PATCH | /api/filiales/:id/logo | admin | FilialesController.uploadLogo |
| PATCH | /api/filiales/:id/stamp | admin | FilialesController.uploadStamp |
| GET | /api/filiales/active | admin, technician, direction | FilialesController.findActive |
| GET | /api/filiales/export | admin | FilialesController.exportCsv |
| POST | /api/filiales/import | admin | FilialesController.importFiliales |
| GET | /api/filiales/import/template | admin | FilialesController.importTemplate |
| GET | /api/health | public (sans session) | HealthController.check |
| GET | /api/health/ready | public (sans session) | HealthController.ready |
| GET | /api/kpi/delais | admin, technician, direction | KpiController.getDelais |
| GET | /api/kpi/incidents | admin, technician, direction | KpiController.getIncidents |
| GET | /api/kpi/parc | admin, technician, direction | KpiController.getParc |
| GET | /api/reporting/inventory | admin, technician, direction | InventoryController.getInventory |
| GET | /api/reporting/inventory/by-collaborateur | admin, technician, direction | InventoryController.getByCollaborateur |
| GET | /api/reporting/inventory/export | admin, technician, direction | InventoryController.exportCsv |
| GET | /api/reporting/inventory/summary | admin, technician, direction | InventoryController.getSummary |
| GET | /api/signature/:token | tous les rôles connectés | SignatureController.getBonInfo |
| GET | /api/signature/:token/preview | tous les rôles connectés | SignatureController.preview |
| POST | /api/signature/:token/sign | tous les rôles connectés | SignatureController.sign |
| GET | /api/users | admin | UsersController.findAll |
| GET | /api/users/:id | admin, technician | UsersController.findOne |
| PATCH | /api/users/:id/manual | admin | UsersController.updateManual |
| GET | /api/users/it-staff | admin, technician | UsersController.findItStaff |
| POST | /api/users/manual | admin | UsersController.createManual |
| GET | /api/users/manual/export | admin | UsersController.exportManual |
| POST | /api/users/manual/import | admin | UsersController.importManual |
| GET | /api/users/manual/import/template | admin | UsersController.importManualTemplate |
| GET | /api/users/search | admin, technician | UsersController.search |
