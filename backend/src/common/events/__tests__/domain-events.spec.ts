import { Injectable, Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BonCancelledEvent,
  DOMAIN_EVENTS,
  DomainEventsModule,
  DomainEventsPublisher,
  OnDomainEvent,
  SignatureSignedEvent,
} from '..';

const SIGNED: SignatureSignedEvent = {
  bonId: 'bon-1',
  bonReference: 'BON-2026-0042',
  actorId: null,
  occurredAt: new Date('2026-09-25T08:00:00.000Z'),
  signatureId: 'sig-1',
  documentType: 'restitution',
  previousStatus: 'sent_restitution',
  newStatus: 'partially_returned',
  signerEmail: 'lea.martin@groupe-livio.com',
  inPerson: false,
  signedByProxy: false,
};

const CANCELLED: BonCancelledEvent = {
  bonId: 'bon-2',
  bonReference: 'BON-2026-0043',
  actorId: 'tech-1',
  occurredAt: new Date('2026-09-25T09:00:00.000Z'),
  previousStatus: 'sent_mise_dispo',
  reason: 'Doublon du BON-2026-0042',
};

@Injectable()
class RecordingListener {
  readonly received: SignatureSignedEvent[] = [];
  readonly cancelled: BonCancelledEvent[] = [];
  finishedAt: number | null = null;

  @OnDomainEvent(DOMAIN_EVENTS.signatureSigned)
  async onSigned(event: SignatureSignedEvent): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 20));
    this.received.push(event);
    this.finishedAt = Date.now();
  }

  @OnDomainEvent(DOMAIN_EVENTS.bonCancelled)
  onCancelled(event: BonCancelledEvent): void {
    this.cancelled.push(event);
  }
}

@Injectable()
class FailingListener {
  @OnDomainEvent(DOMAIN_EVENTS.signatureSigned)
  onSigned(): void {
    throw new Error('écouteur en panne');
  }

  @OnDomainEvent(DOMAIN_EVENTS.bonCancelled)
  onCancelled(event: BonCancelledEvent): void {
    // Tentative de modification : la charge utile est figée.
    (event as { reason: string }).reason = 'modifié';
  }
}

/** Écouteur asynchrone qui échoue APRÈS avoir rendu la main (panne d'envoi,
 *  de base…) : le cas réel le plus courant. */
@Injectable()
class AsyncFailingListener {
  @OnDomainEvent(DOMAIN_EVENTS.signatureSigned)
  async onSigned(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 5));
    throw new Error('écouteur asynchrone en panne');
  }
}

describe('Événements du domaine (common/events)', () => {
  let moduleRef: TestingModule;
  let publisher: DomainEventsPublisher;
  let listener: RecordingListener;

  beforeEach(async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    moduleRef = await Test.createTestingModule({
      imports: [DomainEventsModule],
      providers: [RecordingListener, FailingListener, AsyncFailingListener],
    }).compile();
    await moduleRef.init();
    publisher = moduleRef.get(DomainEventsPublisher);
    listener = moduleRef.get(RecordingListener);
  });

  afterEach(async () => {
    await moduleRef.close();
    vi.restoreAllMocks();
  });

  it('noms des événements : la liste fermée du contrat', () => {
    expect(DOMAIN_EVENTS).toEqual({
      signatureSigned: 'signature.signed',
      bonCancelled: 'bon.cancelled',
      bonHandoverWithoutSignature: 'bon.handover_without_signature',
      bonClosedWithoutSignature: 'bon.closed_without_signature',
      bonReplaced: 'bon.replaced',
    });
  });

  it('un écouteur reçoit la charge utile publiée, et publish attend qu’il ait fini', async () => {
    await publisher.publish(DOMAIN_EVENTS.signatureSigned, SIGNED);
    expect(listener.received).toEqual([SIGNED]);
    expect(listener.finishedAt).not.toBeNull();
  });

  it('un écouteur en panne ne fait pas échouer l’émetteur, et l’erreur est journalisée', async () => {
    await expect(publisher.publish(DOMAIN_EVENTS.signatureSigned, SIGNED)).resolves.toBeUndefined();
    expect(listener.received).toHaveLength(1);
    expect(Logger.prototype.error).toHaveBeenCalledWith('écouteur en panne', expect.any(String));
  });

  it('trois écouteurs du même événement : chacun reçoit la charge, deux pannes (synchrone et asynchrone) restent isolées', async () => {
    await expect(publisher.publish(DOMAIN_EVENTS.signatureSigned, SIGNED)).resolves.toBeUndefined();
    expect(listener.received).toEqual([SIGNED]);
    expect(Logger.prototype.error).toHaveBeenCalledWith('écouteur en panne', expect.any(String));
    expect(Logger.prototype.error).toHaveBeenCalledWith('écouteur asynchrone en panne', expect.any(String));
  });

  it('la charge utile est figée : un écouteur ne peut pas la modifier pour les autres', async () => {
    await publisher.publish(DOMAIN_EVENTS.bonCancelled, CANCELLED);
    expect(listener.cancelled).toHaveLength(1);
    expect(listener.cancelled[0].reason).toBe('Doublon du BON-2026-0042');
    expect(Object.isFrozen(listener.cancelled[0])).toBe(true);
  });

  it('publier sans écouteur ne fait rien', async () => {
    await expect(
      publisher.publish(DOMAIN_EVENTS.bonReplaced, {
        bonId: 'bon-1',
        bonReference: 'BON-2026-0042',
        actorId: null,
        occurredAt: new Date(),
        replacementBonId: 'bon-9',
        replacementBonReference: 'BON-2026-0050',
        contestationId: 'cont-1',
      }),
    ).resolves.toBeUndefined();
  });
});
