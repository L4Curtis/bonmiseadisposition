import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { AppConfigService } from '../config/config.service';

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
    bon: any,
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

      const year = new Date(bon.createdAt).getFullYear().toString();
      const collabName = this.sanitizeName(bon.collaborateur?.displayName || 'INCONNU');
      const dirName = `${bon.reference}_${collabName}`;

      const targetDir = path.join(smbPath, year, dirName);
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(path.join(targetDir, filename), pdfBuffer);

      this.logger.log(`PDF exporté vers: ${year}/${dirName}/${filename}`);
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
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);

      return { success: true, message: `Accès en écriture vérifié sur ${smbPath}` };
    } catch (err) {
      return { success: false, message: `Pas d'accès en écriture: ${(err as Error).message}` };
    }
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
