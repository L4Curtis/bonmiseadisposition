import { Injectable } from '@nestjs/common';
import { BonHandoverWithoutSignatureEvent, DOMAIN_EVENTS, OnDomainEvent, SignatureSignedEvent } from '../common/events';
import { BonsService } from './bons.service';

/**
 * Écoute la fin d'une signature du collaborateur (`signature.signed`, publié
 * par le module Signature une fois le nouveau statut écrit) et en tire les
 * suites du cycle de vie : PV de non-restitution, fin de l'attente,
 * clôture d'un bon remplacé. Le module Signature n'a donc plus besoin de
 * connaître le module Bons (fin du jeton BONS_SERVICE et de ModuleRef).
 */
@Injectable()
export class BonSignatureListener {
  constructor(private readonly bonsService: BonsService) {}

  @OnDomainEvent(DOMAIN_EVENTS.signatureSigned)
  async onSignatureSigned(event: SignatureSignedEvent): Promise<void> {
    await this.bonsService.afterCollaboratorSignature(event);
  }

  /** Remise du bon remplaçant constatée sans signature : elle vaut remise,
   *  l'original est clôturé comme remplacé (sans effet pour un autre bon). */
  @OnDomainEvent(DOMAIN_EVENTS.bonHandoverWithoutSignature)
  async onHandoverWithoutSignature(event: BonHandoverWithoutSignatureEvent): Promise<void> {
    await this.bonsService.closeReplacedOriginal(event.bonId);
  }
}
