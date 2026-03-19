import { Injectable, OnModuleInit } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class EncryptionService implements OnModuleInit {
  private key: Buffer;
  private readonly algorithm = 'aes-256-gcm';

  onModuleInit() {
    const rawKey = process.env.ENCRYPTION_KEY;
    if (!rawKey) {
      throw new Error('ENCRYPTION_KEY environment variable is required');
    }
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction && rawKey.length < 32) {
      throw new Error(
        'ENCRYPTION_KEY trop faible pour la production. ' +
        'Utilisez au moins 32 caractères (ex: openssl rand -hex 32)',
      );
    }
    // Derive a 32-byte key from the env var using SHA-256
    this.key = crypto.createHash('sha256').update(rawKey).digest();
  }

  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    // Format: iv:authTag:encrypted (all hex)
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  decrypt(ciphertext: string): string {
    const parts = ciphertext.split(':');
    if (parts.length !== 3) throw new Error('Invalid ciphertext format');
    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }
}
