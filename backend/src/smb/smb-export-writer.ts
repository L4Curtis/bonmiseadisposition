import { mkdir, writeFile } from 'fs/promises';
import * as path from 'path';
import { SmbBon } from '../common/types';

export interface SmbWriteTarget {
  targetDir: string;
  safeFilename: string;
  /** Composants du chemin, conservés pour reproduire tels quels les messages
   *  de log historiques (`filialeName/year/dirName/safeFilename`). */
  filialeName: string;
  year: string;
  dirName: string;
}

/** Calcule le chemin cible (filiale/année/bon) d'un export SMB. Fonction pure. */
export function computeSmbExportTarget(
  smbPath: string,
  bon: SmbBon,
  filename: string,
  sanitizeName: (name: string) => string,
): SmbWriteTarget {
  const filialeName = sanitizeName(bon.filiale?.displayName || bon.filiale?.name || 'Sans-filiale');
  const year = new Date(bon.createdAt ?? new Date()).getFullYear().toString();
  const collabName = sanitizeName(bon.collaborateur?.displayName || 'INCONNU');
  const dirName = `${bon.reference}_${collabName}`;
  const safeFilename = path.basename(filename);

  return { targetDir: path.join(smbPath, filialeName, year, dirName), safeFilename, filialeName, year, dirName };
}

/** Écrit le PDF sur le partage (crée les sous-dossiers filiale/année/bon si besoin). */
export async function writeSmbExportFile(target: SmbWriteTarget, pdfBuffer: Buffer): Promise<void> {
  await mkdir(target.targetDir, { recursive: true });
  await writeFile(path.join(target.targetDir, target.safeFilename), pdfBuffer);
}
