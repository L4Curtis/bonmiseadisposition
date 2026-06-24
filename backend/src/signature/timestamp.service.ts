import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { AppConfigService } from '../config/config.service';

export interface TimestampResult {
  token: string; // base64 du TimeStampResp (RFC 3161)
  authority: string; // URL de la TSA
  at: Date; // heure de réception (l'heure de confiance est dans le jeton)
}

/**
 * Horodatage RFC 3161 OPTIONNEL et best-effort. Activé via la config
 * 'timestamp' (enabled=true + tsa_url). Si non configuré ou en échec, retourne
 * null sans jamais faire échouer la signature : le scellement HMAC interne reste
 * la garantie de base, l'horodatage TSA est un renfort de preuve indépendant.
 *
 * On envoie un TimeStampReq DER (SHA-256) et on stocke le TimeStampResp brut
 * (base64). La vérification se fait hors-ligne (`openssl ts -reply`), on ne
 * parse donc pas l'ASN.1 ici — on conserve le jeton signé tel quel.
 */
@Injectable()
export class TimestampService {
  private readonly logger = new Logger(TimestampService.name);
  private readonly TIMEOUT_MS = 5000;

  constructor(private readonly config: AppConfigService) {}

  /** Demande un jeton d'horodatage sur un hash hex SHA-256. null si désactivé/échec. */
  async timestamp(sha256Hex: string): Promise<TimestampResult | null> {
    if (!/^[0-9a-f]{64}$/i.test(sha256Hex)) return null;

    const enabled = await this.config.get('timestamp', 'enabled');
    if (enabled !== 'true') return null;
    const tsaUrl = (await this.config.get('timestamp', 'tsa_url'))?.trim();
    if (!tsaUrl || !/^https?:\/\//i.test(tsaUrl)) {
      this.logger.warn('Horodatage activé mais tsa_url absente/invalide — ignoré');
      return null;
    }

    const req = this.buildTimeStampReq(Buffer.from(sha256Hex, 'hex'));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.TIMEOUT_MS);
    try {
      const res = await fetch(tsaUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/timestamp-query' },
        // Buffer n'est pas accepté tel quel par le type BodyInit → vue Uint8Array
        body: new Uint8Array(req),
        signal: controller.signal,
      });
      if (!res.ok) {
        this.logger.warn(`TSA ${tsaUrl} a répondu HTTP ${res.status} — horodatage ignoré`);
        return null;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0 || buf.length > 64 * 1024) {
        this.logger.warn(`Réponse TSA de taille inattendue (${buf.length}o) — horodatage ignoré`);
        return null;
      }
      return { token: buf.toString('base64'), authority: tsaUrl, at: new Date() };
    } catch (err) {
      this.logger.warn(`Horodatage TSA en échec (signature conservée): ${(err as Error).message}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Construit un TimeStampReq DER minimal pour un condensat SHA-256.
   *   SEQUENCE { version INTEGER 1, MessageImprint, certReq BOOLEAN TRUE }
   *   MessageImprint ::= SEQUENCE { AlgorithmIdentifier(sha256), OCTET STRING(hash) }
   */
  private buildTimeStampReq(hash: Buffer): Buffer {
    if (hash.length !== 32) throw new Error('SHA-256 attendu (32 octets)');
    // AlgorithmIdentifier sha256 (OID 2.16.840.1.101.3.4.2.1) + NULL
    const algId = Buffer.from([
      0x30, 0x0d, 0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01, 0x05, 0x00,
    ]);
    const hashedMessage = Buffer.concat([Buffer.from([0x04, 0x20]), hash]); // OCTET STRING(32)
    const miContent = Buffer.concat([algId, hashedMessage]);
    const messageImprint = Buffer.concat([Buffer.from([0x30, miContent.length]), miContent]);
    const version = Buffer.from([0x02, 0x01, 0x01]);
    const certReq = Buffer.from([0x01, 0x01, 0xff]);
    const content = Buffer.concat([version, messageImprint, certReq]);
    return Buffer.concat([Buffer.from([0x30, content.length]), content]);
  }
}
