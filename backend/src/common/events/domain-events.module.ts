import { Global, Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { DomainEventsPublisher } from './domain-events.publisher';

/**
 * Bus d'événements du domaine, en mémoire du processus
 * (@nestjs/event-emitter). Global : tout module peut injecter
 * `DomainEventsPublisher` ou déclarer un écouteur `@OnDomainEvent` sans
 * importer ce module. Importé une seule fois, par AppModule.
 *
 * Noms exacts seulement (pas de jokers) : chaque écouteur dit précisément ce
 * qu'il écoute. Pas de limite d'écouteurs par événement à surveiller : ils se
 * comptent sur les doigts d'une main.
 */
@Global()
@Module({
  imports: [EventEmitterModule.forRoot({ wildcard: false, ignoreErrors: false })],
  providers: [DomainEventsPublisher],
  exports: [DomainEventsPublisher],
})
export class DomainEventsModule {}
