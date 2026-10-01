# Accès par route

Généré par `backend/src/auth/__tests__/route-access.spec.ts` : ne pas modifier à la main.

| Verbe | Route | Accès | Méthode |
|---|---|---|---|
| GET | /api/admin/config/:category | admin | ConfigController.getSection |
| PUT | /api/admin/config/:category | admin | ConfigController.setSection |
| GET | /api/admin/config/health | admin | ConfigController.getHealth |
| GET | /api/admin/config/registry | admin | ConfigController.getRegistry |
| POST | /api/admin/config/test/entra | admin | ConfigController.testEntra |
| POST | /api/admin/config/test/ldap | admin | ConfigController.testLdap |
| POST | /api/admin/config/test/smb | admin | ConfigController.testSmb |
| POST | /api/admin/config/test/smtp | admin | ConfigController.testSmtp |
| POST | /api/admin/ldap/deactivate-all | admin | AdminLdapController.deactivateAll |
| GET | /api/admin/ldap/status | admin | AdminLdapController.getStatus |
| POST | /api/admin/ldap/sync | admin | AdminLdapController.triggerSync |
| GET | /api/admin/notifications/failed | admin | AdminController.getFailedNotifications |
| POST | /api/admin/pdf/regenerate-missing | admin | PdfAdminController.regenerateMissing |
| GET | /api/admin/retention/preview | admin | RetentionController.preview |
| POST | /api/admin/retention/purge | admin | RetentionController.purge |
| POST | /api/admin/retention/run | admin | RetentionController.run |
| GET | /api/admin/retention/stats | admin | RetentionController.getStats |
| GET | /api/admin/smb/failed | admin | AdminSmbController.getFailed |
| POST | /api/admin/smb/retry-all | admin | AdminSmbController.retryAll |
| POST | /api/admin/smb/retry/:id | admin | AdminSmbController.retryOne |
| GET | /api/admin/smb/status | admin | AdminSmbController.getStatus |
| GET | /api/admin/sso/diagnostic | admin | AdminController.getSsoDiagnostic |
| GET | /api/admin/status | admin | AdminController.getStatus |
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
| PATCH | /api/bons/:id | admin, technician | BonsController.update |
| POST | /api/bons/:id/cancel | admin, technician | BonsController.cancel |
| POST | /api/bons/:id/close-unilateral | admin, technician | BonsController.closeUnilateral |
| POST | /api/bons/:id/close-without-signature | admin, technician | BonsController.closeWithoutSignature |
| POST | /api/bons/:id/contestation | tous les rôles connectés | ContestationController.create |
| POST | /api/bons/:id/declare-not-returned | admin, technician | BonsController.declareNotReturned |
| POST | /api/bons/:id/handover-without-signature | admin, technician | BonsController.handoverWithoutSignature |
| GET | /api/bons/:id/history | admin, technician | BonsController.history |
| POST | /api/bons/:id/initiate-inperson | admin, technician | BonsController.initiateInPerson |
| POST | /api/bons/:id/initiate-restitution | admin, technician | BonsController.initiateRestitution |
| GET | /api/bons/:id/integrity | tous les rôles connectés | BonsController.getIntegrity |
| POST | /api/bons/:id/mark-found | admin, technician | BonsController.markFound |
| GET | /api/bons/:id/notifications | admin, technician | BonsController.getNotifications |
| GET | /api/bons/:id/pdf | tous les rôles connectés | BonsController.getPdf |
| GET | /api/bons/:id/pdf-snapshots | tous les rôles connectés | BonsController.getPdfSnapshots |
| GET | /api/bons/:id/pdf-snapshots/missing | admin, technician | BonsController.getMissingPdfSnapshots |
| GET | /api/bons/:id/pdf/pv-pret | admin, technician | BonsController.getReadyPv |
| POST | /api/bons/:id/resend | admin, technician | BonsController.resend |
| POST | /api/bons/:id/send | admin, technician | BonsController.send |
| GET | /api/bons/:id/send-check | admin, technician | BonsController.sendCheck |
| POST | /api/bons/:id/sign-it | admin, technician | BonsController.signIt |
| POST | /api/bons/:id/undo-return | admin, technician | BonsController.undoReturn |
| GET | /api/bons/export | admin, technician | BonsController.exportCsv |
| POST | /api/bons/resend-batch | admin, technician | BonsController.resendBatch |
| GET | /api/bons/stats | admin, technician | BonsController.getStats |
| GET | /api/contestations | admin, technician | ContestationController.findAll |
| POST | /api/contestations/:id/resolve | admin, technician | ContestationController.resolve |
| POST | /api/contestations/:id/review | admin, technician | ContestationController.markInReview |
| GET | /api/email-templates | admin | EmailTemplatesController.findAll |
| PATCH | /api/email-templates/:id | admin | EmailTemplatesController.update |
| DELETE | /api/email-templates/:id | admin | EmailTemplatesController.reset |
| GET | /api/email-templates/:id/html | admin | EmailTemplatesController.getHtml |
| GET | /api/email-templates/:id/preview | admin | EmailTemplatesController.getPreview |
| GET | /api/email-templates/:id/preview-bon/:bonId | admin | EmailTemplatesController.previewWithBon |
| POST | /api/email-templates/:id/test | admin | EmailTemplatesController.sendTest |
| POST | /api/email-templates/:id/test-bon | admin | EmailTemplatesController.sendTestWithBon |
| GET | /api/email-templates/export | admin | EmailTemplatesController.exportAll |
| POST | /api/email-templates/import | admin | EmailTemplatesController.importAll |
| GET | /api/email-templates/preview-bons | admin | EmailTemplatesController.searchBons |
| GET | /api/equipment/catalog | admin, technician | EquipmentController.findAllCatalog |
| POST | /api/equipment/catalog | admin, technician | EquipmentController.createCatalogItem |
| GET | /api/equipment/catalog/:id | admin, technician | EquipmentController.findOneCatalog |
| PUT | /api/equipment/catalog/:id | admin, technician | EquipmentController.updateCatalogItem |
| DELETE | /api/equipment/catalog/:id | admin, technician | EquipmentController.removeCatalogItem |
| POST | /api/equipment/catalog/import | admin, technician | EquipmentController.importCatalog |
| GET | /api/equipment/history | admin, technician, direction | EquipmentController.equipmentHistory |
| GET | /api/equipment/history/export | admin, technician, direction | EquipmentController.exportEquipmentHistory |
| GET | /api/equipment/packs | admin, technician | EquipmentController.findAllPacks |
| POST | /api/equipment/packs | admin, technician | EquipmentController.createPack |
| GET | /api/equipment/packs/:id | admin, technician | EquipmentController.findOnePack |
| PUT | /api/equipment/packs/:id | admin, technician | EquipmentController.updatePack |
| DELETE | /api/equipment/packs/:id | admin, technician | EquipmentController.removePack |
| GET | /api/equipment/serial-conflicts | admin, technician | EquipmentController.serialConflicts |
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
| GET | /api/kpi/aujourdhui | admin, technician | KpiController.getToday |
| GET | /api/kpi/delais | admin, technician, direction | KpiController.getDelais |
| GET | /api/kpi/delais/export | admin, technician, direction | KpiController.exportDelais |
| GET | /api/kpi/incidents | admin, technician, direction | KpiController.getIncidents |
| GET | /api/kpi/incidents/export | admin, technician, direction | KpiController.exportIncidents |
| GET | /api/kpi/liste | admin, technician | KpiController.getList |
| GET | /api/kpi/parc | admin, technician, direction | KpiController.getParc |
| GET | /api/kpi/parc/export | admin, technician, direction | KpiController.exportParc |
| GET | /api/me/bons | tous les rôles connectés | MeController.myBons |
| GET | /api/me/contestations | tous les rôles connectés | ContestationController.findMine |
| GET | /api/pdf-templates | admin | PdfTemplatesController.findAll |
| PATCH | /api/pdf-templates/:id | admin | PdfTemplatesController.update |
| DELETE | /api/pdf-templates/:id | admin | PdfTemplatesController.reset |
| GET | /api/pdf-templates/:id/config | admin | PdfTemplatesController.getConfig |
| GET | /api/pdf-templates/:id/preview | admin | PdfTemplatesController.getPreview |
| GET | /api/pdf-templates/export | admin | PdfTemplatesController.exportAll |
| POST | /api/pdf-templates/import | admin | PdfTemplatesController.importAll |
| GET | /api/reporting/inventory | admin, technician, direction | InventoryController.getInventory |
| GET | /api/reporting/inventory/by-collaborateur | admin, technician, direction | InventoryController.getByCollaborateur |
| GET | /api/reporting/inventory/export | admin, technician, direction | InventoryController.exportCsv |
| GET | /api/reporting/inventory/summary | admin, technician, direction | InventoryController.getSummary |
| GET | /api/signature/:token | tous les rôles connectés | SignatureController.getBonInfo |
| GET | /api/signature/:token/preview | tous les rôles connectés | SignatureController.preview |
| POST | /api/signature/:token/request-new-link | tous les rôles connectés | SignatureController.requestNewLink |
| POST | /api/signature/:token/sign | tous les rôles connectés | SignatureController.sign |
| GET | /api/users | admin | UsersController.findPage |
| GET | /api/users/:id | admin, technician | UsersController.findOne |
| POST | /api/users/:id/deactivate | admin | UsersController.deactivate |
| PATCH | /api/users/:id/manual | admin | UsersController.updateManual |
| POST | /api/users/:id/reactivate | admin | UsersController.reactivate |
| PATCH | /api/users/:id/role | admin | UsersController.changeRole |
| POST | /api/users/:id/unlock | admin | UsersController.unlock |
| GET | /api/users/it-staff | admin, technician | UsersController.findItStaff |
| POST | /api/users/manual | admin | UsersController.createManual |
| GET | /api/users/manual/export | admin | UsersController.exportManual |
| POST | /api/users/manual/import | admin | UsersController.importManual |
| GET | /api/users/manual/import/template | admin | UsersController.importManualTemplate |
| GET | /api/users/search | admin, technician | UsersController.search |

## Anciens chemins encore servis (alias dépréciés)

Chacun est réécrit vers sa route cible avant le routage : mêmes gardes, mêmes droits.

| Verbe | Ancien chemin | Route cible | Accès |
|---|---|---|---|
| GET | /api/admin/email-templates | GET /api/email-templates | admin |
| DELETE | /api/admin/email-templates/:id | DELETE /api/email-templates/:id | admin |
| PATCH | /api/admin/email-templates/:id | PATCH /api/email-templates/:id | admin |
| GET | /api/admin/email-templates/:id/html | GET /api/email-templates/:id/html | admin |
| GET | /api/admin/email-templates/:id/preview | GET /api/email-templates/:id/preview | admin |
| GET | /api/admin/email-templates/:id/preview-bon/:bonId | GET /api/email-templates/:id/preview-bon/:bonId | admin |
| POST | /api/admin/email-templates/:id/test | POST /api/email-templates/:id/test | admin |
| POST | /api/admin/email-templates/:id/test-bon | POST /api/email-templates/:id/test-bon | admin |
| GET | /api/admin/email-templates/export | GET /api/email-templates/export | admin |
| POST | /api/admin/email-templates/import | POST /api/email-templates/import | admin |
| GET | /api/admin/email-templates/preview-bons | GET /api/email-templates/preview-bons | admin |
| DELETE | /api/admin/ldap/users | POST /api/admin/ldap/deactivate-all | admin |
| GET | /api/admin/pdf-templates | GET /api/pdf-templates | admin |
| DELETE | /api/admin/pdf-templates/:id | DELETE /api/pdf-templates/:id | admin |
| PATCH | /api/admin/pdf-templates/:id | PATCH /api/pdf-templates/:id | admin |
| GET | /api/admin/pdf-templates/:id/config | GET /api/pdf-templates/:id/config | admin |
| GET | /api/admin/pdf-templates/:id/preview | GET /api/pdf-templates/:id/preview | admin |
| GET | /api/admin/pdf-templates/export | GET /api/pdf-templates/export | admin |
| POST | /api/admin/pdf-templates/import | POST /api/pdf-templates/import | admin |
| PATCH | /api/admin/users/:id/role | PATCH /api/users/:id/role | admin |
| POST | /api/admin/users/:id/unlock | POST /api/users/:id/unlock | admin |
| DELETE | /api/bons/:id | POST /api/bons/:id/cancel | admin, technician |
| PUT | /api/bons/:id | PATCH /api/bons/:id | admin, technician |
| GET | /api/bons/mes-bons | GET /api/me/bons | tous les rôles connectés |
| GET | /api/bons/recent | GET /api/bons | admin, technician |
| PATCH | /api/contestations/:id/resolve | POST /api/contestations/:id/resolve | admin, technician |
| PATCH | /api/contestations/:id/review | POST /api/contestations/:id/review | admin, technician |
| GET | /api/contestations/mine | GET /api/me/contestations | tous les rôles connectés |
| GET | /api/equipment/serial-history | GET /api/equipment/history | admin, technician, direction |
