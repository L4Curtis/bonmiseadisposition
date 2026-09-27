import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DomainEventsModule, DomainEventsPublisher, DOMAIN_EVENTS } from '../../common/events';
import { BonEventsNotificationListener } from '../listeners/bon-events.listener';
import { NotificationService } from '../notification.service';

/**
 * Les actions du cycle de vie annoncent un événement ; ce module envoie
 * l'email juste (R-013, R-014, R-036). Test sur le vrai bus d'événements.
 */
describe('BonEventsNotificationListener', () => {
  const notifications = {
    sendSignatureConfirmation: vi.fn().mockResolvedValue(undefined),
    sendCancellationNoticeFor: vi.fn().mockResolvedValue(undefined),
    sendHandoverWithoutSignatureNotice: vi.fn().mockResolvedValue(undefined),
    sendClosedWithoutSignatureNotice: vi.fn().mockResolvedValue(undefined),
    sendBonReplacedNotice: vi.fn().mockResolvedValue(undefined),
  };
  let publisher: DomainEventsPublisher;
  const base = { bonId: 'bon-1', bonReference: 'BON-2026-0001', actorId: 'tech-1', occurredAt: new Date() };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      imports: [DomainEventsModule],
      providers: [BonEventsNotificationListener, { provide: NotificationService, useValue: notifications }],
    }).compile();
    await module.init();
    publisher = module.get(DomainEventsPublisher);
    expect(module.get(EventEmitter2)).toBeDefined();
  });

  it('signature → confirmation du document signé', async () => {
    await publisher.publish(DOMAIN_EVENTS.signatureSigned, {
      ...base, actorId: null, signatureId: 's', documentType: 'pv_cloture', previousStatus: 'partially_returned',
      newStatus: 'archived', signerEmail: 'lea@livio.fr', inPerson: false, signedByProxy: false,
    });
    expect(notifications.sendSignatureConfirmation).toHaveBeenCalledWith('bon-1', 'pv_cloture');
  });

  it('annulation d’un bon envoyé → email avec le motif', async () => {
    await publisher.publish(DOMAIN_EVENTS.bonCancelled, { ...base, previousStatus: 'sent_mise_dispo', reason: 'Doublon' });
    expect(notifications.sendCancellationNoticeFor).toHaveBeenCalledWith('bon-1', 'Doublon');
  });

  it('annulation d’un brouillon → aucun email (le collaborateur n’a rien reçu)', async () => {
    await publisher.publish(DOMAIN_EVENTS.bonCancelled, { ...base, previousStatus: 'draft', reason: 'Erreur' });
    expect(notifications.sendCancellationNoticeFor).not.toHaveBeenCalled();
  });

  it('les deux gestes sans signature → deux emails distincts', async () => {
    await publisher.publish(DOMAIN_EVENTS.bonHandoverWithoutSignature, { ...base, reason: 'Sur chantier' });
    await publisher.publish(DOMAIN_EVENTS.bonClosedWithoutSignature, { ...base, previousStatus: 'sent_restitution', reason: 'Départ' });
    expect(notifications.sendHandoverWithoutSignatureNotice).toHaveBeenCalledWith('bon-1', 'Sur chantier');
    expect(notifications.sendClosedWithoutSignatureNotice).toHaveBeenCalledWith('bon-1', 'Départ', 'sent_restitution');
  });

  it('bon corrigé signé → email « bon remplacé » qui nomme le remplaçant', async () => {
    await publisher.publish(DOMAIN_EVENTS.bonReplaced, {
      ...base, actorId: null, replacementBonId: 'bon-2', replacementBonReference: 'BON-2026-0002', contestationId: 'c-1',
    });
    expect(notifications.sendBonReplacedNotice).toHaveBeenCalledWith('bon-1', 'BON-2026-0002');
  });

  it('une panne d’envoi n’est jamais renvoyée à l’action', async () => {
    notifications.sendHandoverWithoutSignatureNotice.mockRejectedValueOnce(new Error('SMTP en panne'));
    await expect(
      publisher.publish(DOMAIN_EVENTS.bonHandoverWithoutSignature, { ...base, reason: 'x' }),
    ).resolves.toBeUndefined();
  });
});
