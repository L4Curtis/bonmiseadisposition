import { Injectable, Logger } from '@nestjs/common';
import {
  DOMAIN_EVENTS,
  OnDomainEvent,
  BonCancelledEvent,
  BonClosedWithoutSignatureEvent,
  BonHandoverWithoutSignatureEvent,
  BonReplacedEvent,
  SignatureSignedEvent,
} from '../../common/events';
import { NotificationService } from '../notification.service';

/**
 * Emails qui suivent le cycle de vie d'un bon : chaque action annonce ce qui
 * vient de se passer (common/events), et ce module envoie l'email juste.
 * L'envoi est lancé sans être attendu (l'action a déjà répondu à son
 * auteur) ; une erreur est journalisée, jamais renvoyée.
 */
@Injectable()
export class BonEventsNotificationListener {
  private readonly logger = new Logger(BonEventsNotificationListener.name);

  constructor(private readonly notifications: NotificationService) {}

  private launch(what: string, bonReference: string, send: () => Promise<void>): void {
    send().catch((err: unknown) =>
      this.logger.error(`Email « ${what} » du bon ${bonReference} non envoyé : ${err instanceof Error ? err.message : String(err)}`),
    );
  }

  /** Confirmation de signature, avec le PDF signé et le lien vers le portail. */
  @OnDomainEvent(DOMAIN_EVENTS.signatureSigned)
  onSignatureSigned(event: SignatureSignedEvent): void {
    this.launch('confirmation de signature', event.bonReference, () =>
      this.notifications.sendSignatureConfirmation(event.bonId, event.documentType),
    );
  }

  /** Annulation avec motif — seulement si un lien avait été envoyé : un
   *  brouillon annulé n'a jamais été montré au collaborateur. */
  @OnDomainEvent(DOMAIN_EVENTS.bonCancelled)
  onBonCancelled(event: BonCancelledEvent): void {
    if (event.previousStatus === 'draft') return;
    this.launch('bon annulé', event.bonReference, () => this.notifications.sendCancellationNoticeFor(event.bonId, event.reason));
  }

  /** Le bon corrigé est signé : le collaborateur apprend que l'original est
   *  clôturé, remplacé par celui qu'il vient de signer. */
  @OnDomainEvent(DOMAIN_EVENTS.bonReplaced)
  onBonReplaced(event: BonReplacedEvent): void {
    this.launch('bon remplacé', event.bonReference, () =>
      this.notifications.sendBonReplacedNotice(event.bonId, event.replacementBonReference),
    );
  }

  @OnDomainEvent(DOMAIN_EVENTS.bonHandoverWithoutSignature)
  onHandoverWithoutSignature(event: BonHandoverWithoutSignatureEvent): void {
    this.launch('remise constatée sans signature', event.bonReference, () =>
      this.notifications.sendHandoverWithoutSignatureNotice(event.bonId, event.reason),
    );
  }

  @OnDomainEvent(DOMAIN_EVENTS.bonClosedWithoutSignature)
  onClosedWithoutSignature(event: BonClosedWithoutSignatureEvent): void {
    this.launch('bon clôturé sans signature', event.bonReference, () =>
      this.notifications.sendClosedWithoutSignatureNotice(event.bonId, event.reason, event.previousStatus),
    );
  }
}
