import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { DomainEventName, DomainEventPayloads } from './domain-events';

/**
 * Seul point de publication des événements du domaine : le nom et la charge
 * utile sont vérifiés ensemble à la compilation (impossible de publier
 * `bon.cancelled` sans motif).
 *
 * `publish` attend que tous les écouteurs aient fini : l'action qui publie
 * (une signature, une annulation) ne répond qu'une fois ses suites faites,
 * comme le faisait l'appel direct qu'elle remplace. En contrepartie, un
 * écouteur lent (envoi d'email) lance son travail sans l'attendre et gère
 * lui-même ses erreurs. Une erreur d'écouteur est journalisée par
 * @nestjs/event-emitter (`suppressErrors`, voir OnDomainEvent) et ne remonte
 * jamais à l'émetteur : ce qui est validé en base le reste.
 *
 * Les écouteurs d'un même événement tournent en parallèle, sans ordre
 * garanti : aucun ne compte sur ce qu'un autre écrit. Ils sont branchés au
 * démarrage de l'application (onApplicationBootstrap) : un événement publié
 * avant n'est reçu par personne.
 */
@Injectable()
export class DomainEventsPublisher {
  constructor(private readonly emitter: EventEmitter2) {}

  async publish<K extends DomainEventName>(name: K, payload: DomainEventPayloads[K]): Promise<void> {
    await this.emitter.emitAsync(name, Object.freeze({ ...payload }));
  }
}
