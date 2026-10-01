# Alias dépréciés

Généré par `backend/src/common/http/__tests__/deprecated-alias.app.spec.ts` : ne pas modifier à la main.
Chaque ancien chemin est servi par le nouveau handler, avec `Deprecation: true` et `Link`.

| Ancien chemin | Nouveau chemin | Méthode |
|---|---|---|
| DELETE /api/admin/email-templates/:id | DELETE /api/email-templates/:id | EmailTemplatesController.reset |
| DELETE /api/admin/ldap/users | POST /api/admin/ldap/deactivate-all | AdminLdapController.deactivateAll |
| DELETE /api/admin/pdf-templates/:id | DELETE /api/pdf-templates/:id | PdfTemplatesController.reset |
| DELETE /api/bons/:id | POST /api/bons/:id/cancel | BonsController.cancel |
| GET /api/admin/email-templates | GET /api/email-templates | EmailTemplatesController.findAll |
| GET /api/admin/email-templates/:id/html | GET /api/email-templates/:id/html | EmailTemplatesController.getHtml |
| GET /api/admin/email-templates/:id/preview | GET /api/email-templates/:id/preview | EmailTemplatesController.getPreview |
| GET /api/admin/email-templates/:id/preview-bon/:bonId | GET /api/email-templates/:id/preview-bon/:bonId | EmailTemplatesController.previewWithBon |
| GET /api/admin/email-templates/export | GET /api/email-templates/export | EmailTemplatesController.exportAll |
| GET /api/admin/email-templates/preview-bons | GET /api/email-templates/preview-bons | EmailTemplatesController.searchBons |
| GET /api/admin/pdf-templates | GET /api/pdf-templates | PdfTemplatesController.findAll |
| GET /api/admin/pdf-templates/:id/config | GET /api/pdf-templates/:id/config | PdfTemplatesController.getConfig |
| GET /api/admin/pdf-templates/:id/preview | GET /api/pdf-templates/:id/preview | PdfTemplatesController.getPreview |
| GET /api/admin/pdf-templates/export | GET /api/pdf-templates/export | PdfTemplatesController.exportAll |
| GET /api/bons/mes-bons | GET /api/me/bons | MeController.myBons |
| GET /api/bons/recent | GET /api/bons | BonsController.findAll |
| GET /api/contestations/mine | GET /api/me/contestations | ContestationController.findMine |
| GET /api/equipment/serial-history | GET /api/equipment/history | EquipmentController.equipmentHistory |
| PATCH /api/admin/email-templates/:id | PATCH /api/email-templates/:id | EmailTemplatesController.update |
| PATCH /api/admin/pdf-templates/:id | PATCH /api/pdf-templates/:id | PdfTemplatesController.update |
| PATCH /api/admin/users/:id/role | PATCH /api/users/:id/role | UsersController.changeRole |
| PATCH /api/contestations/:id/resolve | POST /api/contestations/:id/resolve | ContestationController.resolve |
| PATCH /api/contestations/:id/review | POST /api/contestations/:id/review | ContestationController.markInReview |
| POST /api/admin/email-templates/:id/test | POST /api/email-templates/:id/test | EmailTemplatesController.sendTest |
| POST /api/admin/email-templates/:id/test-bon | POST /api/email-templates/:id/test-bon | EmailTemplatesController.sendTestWithBon |
| POST /api/admin/email-templates/import | POST /api/email-templates/import | EmailTemplatesController.importAll |
| POST /api/admin/pdf-templates/import | POST /api/pdf-templates/import | PdfTemplatesController.importAll |
| POST /api/admin/users/:id/unlock | POST /api/users/:id/unlock | UsersController.unlock |
| PUT /api/bons/:id | PATCH /api/bons/:id | BonsController.update |
