import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/** Données propres aux exports du tableau de bord, hors indicateurs : le nom
 *  de la filiale filtrée, écrit en clair dans le fichier (jamais son
 *  identifiant). */
@Injectable()
export class KpiExportService {
  constructor(private readonly prisma: PrismaService) {}

  /** Nom affiché de la filiale, `null` sans filtre. Une filiale supprimée
   *  depuis l'ouverture de l'écran est nommée comme telle. */
  async filialeName(filialeId: string | undefined): Promise<string | null> {
    if (!filialeId) return null;
    const filiale = await this.prisma.filiale.findUnique({ where: { id: filialeId }, select: { displayName: true } });
    return filiale?.displayName ?? 'Filiale introuvable';
  }
}
