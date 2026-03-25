import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import { mkdir, writeFile, unlink } from 'fs/promises';
import * as path from 'path';
import { AppConfigService } from '../config/config.service';
import { SmbBon } from '../common/types';

@Injectable()
export class SmbService {
  private readonly logger = new Logger(SmbService.name);

  constructor(private readonly configService: AppConfigService) {}

  /**
   * Export a PDF buffer to the configured path (UNC or local).
   * Directory structure: {path}/{year}/{bonRef_CollabName}/{filename}
   *
   * On Windows, UNC paths (\\server\share) are handled natively by fs.
   * On Linux/Docker, the SMB share should be mounted as a volume.
   */
  async exportPdf(
    bon: SmbBon,
    filename: string,
    pdfBuffer: Buffer,
  ): Promise<void> {
    try {
      const enabled = await this.configService.get('smb', 'enabled');
      if (enabled !== 'true') return;

      const smbPath = await this.configService.get('smb', 'path');
      if (!smbPath) {
        this.logger.warn('SMB active mais aucun chemin configuré');
        return;
      }

      if (!this.isSafeExportPath(smbPath)) {
        this.logger.error(`SMB: chemin rejeté (répertoire système ou invalide): ${smbPath}`);
        return;
      }

      const filialeName = this.sanitizeName(bon.filiale?.displayName || bon.filiale?.name || 'Sans-filiale');
      const year = new Date(bon.createdAt ?? new Date()).getFullYear().toString();
      const collabName = this.sanitizeName(bon.collaborateur?.displayName || 'INCONNU');
      const dirName = `${bon.reference}_${collabName}`;

      // Sanitize filename to prevent path traversal (e.g. "../../../etc/passwd")
      const safeFilename = path.basename(filename);
      if (!safeFilename || safeFilename !== filename) {
        this.logger.error(`SMB: nom de fichier rejeté (path traversal détecté): ${filename}`);
        return;
      }

      // Structure: {smbPath}/{filiale}/{year}/{bonRef_collabName}/{filename}
      const targetDir = path.join(smbPath, filialeName, year, dirName);
      await mkdir(targetDir, { recursive: true });
      await writeFile(path.join(targetDir, safeFilename), pdfBuffer);

      this.logger.log(`PDF exporté vers: ${filialeName}/${year}/${dirName}/${filename}`);
    } catch (err) {
      this.logger.error(`Échec export SMB: ${(err as Error).message}`);
    }
  }

  /**
   * Test connection by writing and deleting a test file.
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const smbPath = await this.configService.get('smb', 'path');
      if (!smbPath) {
        return { success: false, message: 'Aucun chemin configuré' };
      }

      if (!this.isSafeExportPath(smbPath)) {
        return { success: false, message: `Chemin rejeté (répertoire système ou invalide): ${smbPath}` };
      }

      // Verify path exists (or try to create it)
      if (!fs.existsSync(smbPath)) {
        try {
          fs.mkdirSync(smbPath, { recursive: true });
        } catch {
          return { success: false, message: `Le chemin ${smbPath} n'existe pas et ne peut pas être créé` };
        }
      }

      // Try writing a test file
      const testFile = path.join(smbPath, `.smb-test-${Date.now()}`);
      await writeFile(testFile, 'test');
      await unlink(testFile);

      return { success: true, message: `Accès en écriture vérifié sur ${smbPath}` };
    } catch (err) {
      return { success: false, message: `Pas d'accès en écriture: ${(err as Error).message}` };
    }
  }

  /**
   * Validate that an SMB/export path is not a system-critical directory.
   * Prevents misconfigured admin from writing to /etc, /proc, /bin, etc.
   */
  private isSafeExportPath(exportPath: string): boolean {
    if (!exportPath || typeof exportPath !== 'string') return false;
    const resolved = path.resolve(exportPath);
    // Must be an absolute path
    if (!path.isAbsolute(resolved)) return false;
    // Block system-critical directories
    const blocked = ['/etc', '/proc', '/sys', '/dev', '/root', '/bin', '/sbin', '/usr/bin', '/usr/sbin', '/lib', '/lib64', '/boot'];
    return !blocked.some((b) => resolved === b || resolved.startsWith(b + path.sep));
  }

  /** Remove accents and special characters from a name for filesystem use */
  sanitizeName(name: string): string {
    return name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
      .replace(/[^a-zA-Z0-9\s-]/g, '') // Keep only alphanumeric, spaces, hyphens
      .replace(/\s+/g, '-')            // Spaces to hyphens
      .replace(/-+/g, '-')             // Collapse multiple hyphens
      .trim();
  }
}
