import { PdfAdminController } from '../pdf-admin.controller';
import { PdfService } from '../pdf.service';

describe('PdfAdminController', () => {
  let controller: PdfAdminController;
  let pdfService: { regenerateMissingSnapshots: jest.Mock };

  beforeEach(() => {
    pdfService = {
      regenerateMissingSnapshots: jest.fn().mockResolvedValue({ regenerated: 2, failed: 1 }),
    };
    controller = new PdfAdminController(pdfService as unknown as PdfService);
  });

  it('delegates POST /admin/pdf/regenerate-missing to PdfService.regenerateMissingSnapshots', async () => {
    const result = await controller.regenerateMissing();

    expect(pdfService.regenerateMissingSnapshots).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ regenerated: 2, failed: 1 });
  });
});
