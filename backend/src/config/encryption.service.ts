import { Injectable, OnModuleInit } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class EncryptionService implements OnModuleInit {
  private key!: Buffer;
  // Clé de scellement DÉRIVÉE séparément de la même ENCRYPTION_KEY (sel distinct)
  // → un domaine cryptographique distinct du chiffrement : compromettre l'un
  // ne donne pas l'autre, et aucune variable d'environnement supplémentaire.
  private sealKey!: Buffer;
  private readonly algorithm = 'aes-256-gcm';

  onModuleInit() {
    const rawKey = process.env.ENCRYPTION_KEY;
    if (!rawKey) {
      throw new Error('ENCRYPTION_KEY environment variable is required');
    }
    if (rawKey.length < 32) {
      throw new Error(
        'ENCRYPTION_KEY trop faible (min 32 caractères). ' +
        'Générez avec : openssl rand -hex 32',
      );
    }
    // Derive a 32-byte key using PBKDF2 (100k iterations) instead of raw SHA-256
    this.key = crypto.pbkdf2Sync(rawKey, 'bon-mise-disposition-salt-v1', 100_000, 32, 'sha256');
    this.sealKey = crypto.pbkdf2Sync(rawKey, 'bon-signature-seal-v1', 100_000, 32, 'sha256');
  }

  /** Scellement probant : HMAC-SHA256 hex d'une charge canonique (clé serveur
   *  dérivée). Détecte toute altération directe en base des champs scellés. */
  seal(data: string): string {
    return crypto.createHmac('sha256', this.sealKey).update(data, 'utf8').digest('hex');
  }

  /** Vérifie un sceau en temps constant (anti timing-attack). */
  verifySeal(data: string, expectedSeal: string): boolean {
    if (!expectedSeal || !/^[0-9a-f]{64}$/i.test(expectedSeal)) return false;
    const actual = Buffer.from(this.seal(data), 'hex');
    const expected = Buffer.from(expectedSeal, 'hex');
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
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
    if (!ciphertext || typeof ciphertext !== 'string') {
      throw new Error('Invalid ciphertext: empty or non-string');
    }
    const parts = ciphertext.split(':');
    if (parts.length !== 3) throw new Error('Invalid ciphertext format');
    const [ivHex, authTagHex, encryptedHex] = parts;
    if (!/^[0-9a-f]+$/i.test(ivHex) || !/^[0-9a-f]+$/i.test(authTagHex) || !/^[0-9a-f]+$/i.test(encryptedHex)) {
      throw new Error('Invalid ciphertext: non-hex component');
    }
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }
}
