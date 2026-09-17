import { isRecipient } from '../recipient';

describe('isRecipient (pure)', () => {
  const bon = { id: 'bon-1', collaborateurId: 'user-1', collaborateurEmail: 'jean.dupont@groupelivio.fr' };

  it('should always accept for in-person signatures, regardless of email/id', () => {
    expect(isRecipient(bon, true, 'someone.else@groupelivio.fr', 'user-other')).toBe(true);
    expect(isRecipient(bon, true)).toBe(true);
  });

  it('should accept when requesterId matches collaborateurId, even with a different email', () => {
    expect(isRecipient(bon, false, 'nouvelle.adresse@groupelivio.fr', 'user-1')).toBe(true);
  });

  it('should accept when the email matches case-insensitively and trimmed', () => {
    expect(isRecipient(bon, false, '  JEAN.DUPONT@groupelivio.fr  ')).toBe(true);
  });

  it('should reject when neither id nor email match', () => {
    expect(isRecipient(bon, false, 'someone.else@groupelivio.fr', 'user-other')).toBe(false);
  });

  it('should reject when no email/id are provided at all', () => {
    expect(isRecipient(bon, false)).toBe(false);
  });
});
