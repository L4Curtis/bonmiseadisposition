import { OnEvent } from '@nestjs/event-emitter';
import type { DomainEventName } from './domain-events';

/**
 * Déclare une méthode comme écouteur d'un événement du domaine.
 *
 * N'accepte que les noms de `DOMAIN_EVENTS`, et fixe `suppressErrors` : une
 * erreur de l'écouteur est journalisée sans faire échouer l'émetteur. Typer
 * le paramètre avec la charge utile correspondante :
 *
 *   @OnDomainEvent(DOMAIN_EVENTS.signatureSigned)
 *   async onSigned(event: SignatureSignedEvent) { … }
 */
export function OnDomainEvent(name: DomainEventName): MethodDecorator {
  return OnEvent(name, { suppressErrors: true });
}
