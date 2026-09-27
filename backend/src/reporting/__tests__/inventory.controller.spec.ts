import { Response } from 'express';
import { InventoryController } from '../inventory.controller';
import { InventoryService } from '../inventory.service';
import { InventoryByCollaborateurQueryDto } from '../dto/inventory-by-collaborateur-query.dto';
import type { AuthUser } from '../../auth/auth-user.interface';

/**
 * Contrat de `GET /reporting/inventory/by-collaborateur` sur la troncature.
 *
 * Le client HTTP du front ne renvoie que le JSON parsé et n'expose pas les
 * en-têtes : si `truncated` disparaissait du corps, l'interface afficherait un
 * classement incomplet comme s'il était complet, sans aucun signal. D'où les
 * deux assertions (en-tête ET champ).
 */
describe('InventoryController — by-collaborateur', () => {
  const buildResponse = () => {
    const headers: Record<string, string> = {};
    const res = { setHeader: (k: string, v: string) => { headers[k] = v; } } as unknown as Response;
    return { res, headers };
  };

  const buildController = (result: Record<string, unknown>) => {
    const service = { getInventoryByCollaborateur: vi.fn().mockResolvedValue(result) };
    return { controller: new InventoryController(service as unknown as InventoryService), service };
  };

  const query = new InventoryByCollaborateurQueryDto();

  it('signale une troncature dans le corps ET dans l’en-tête X-Truncated', async () => {
    const { controller } = buildController({ items: [], total: 0, page: 1, limit: 25, truncated: true });
    const { res, headers } = buildResponse();

    const body = await controller.getByCollaborateur(query, res);

    expect(headers['X-Truncated']).toBe('true');
    expect(body).toEqual({ items: [], total: 0, page: 1, limit: 25, truncated: true });
  });

  it('ne pose pas l’en-tête et renvoie truncated:false sur un regroupement complet', async () => {
    const { controller } = buildController({ items: [], total: 0, page: 1, limit: 25, truncated: false });
    const { res, headers } = buildResponse();

    const body = await controller.getByCollaborateur(query, res);

    expect(headers['X-Truncated']).toBeUndefined();
    expect(body).toMatchObject({ truncated: false });
  });
});

/**
 * La direction n'ouvre pas les bons : dans l'inventaire (situation « Non
 * restitué »), elle voit l'équipement et son collaborateur, pas le motif
 * saisi par l'IT dans la déclaration du bon.
 */
describe('InventoryController — liste, selon le rôle', () => {
  const item = { equipmentId: 'e1', situation: 'non_restitue', notReturnedReason: 'Perdu en déplacement' };
  const page = { items: [item], total: 1, page: 1, limit: 25 };
  const buildController = () => {
    const service = { getInventory: vi.fn().mockResolvedValue(page) };
    return new InventoryController(service as unknown as InventoryService);
  };

  it('garde le motif de non-restitution pour l’IT', async () => {
    for (const role of ['admin', 'technician'] as const) {
      const body = await buildController().getInventory({}, { role } as AuthUser);
      expect(body.items[0].notReturnedReason).toBe('Perdu en déplacement');
    }
  });

  it('retire le motif de non-restitution pour la direction, sans toucher au reste', async () => {
    const body = await buildController().getInventory({}, { role: 'direction' } as AuthUser);
    expect(body.items[0]).toEqual({ ...item, notReturnedReason: null });
    expect(body.total).toBe(1);
    expect(item.notReturnedReason).toBe('Perdu en déplacement');
  });
});
