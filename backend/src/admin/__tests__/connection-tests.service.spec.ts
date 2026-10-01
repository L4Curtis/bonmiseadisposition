import { BadRequestException } from '@nestjs/common';
import { ConnectionTestsService } from '../connection-tests.service';
import { ConfigRegistryService } from '../../config/config-registry.service';
import { createMockConfigService } from '../../common/__tests__/helpers/mock-services';

const mockSendMail = vi.fn().mockResolvedValue({ messageId: 'msg-001' });
const mockVerify = vi.fn().mockResolvedValue(true);
const mockCreateTransport = vi.fn((_options: unknown) => ({ verify: mockVerify, sendMail: mockSendMail }));

vi.mock('nodemailer', () => ({
  createTransport: (options: unknown) => mockCreateTransport(options),
}));

describe('ConnectionTestsService', () => {
  let config: ReturnType<typeof createMockConfigService>;
  let service: ConnectionTestsService;

  beforeEach(() => {
    vi.clearAllMocks();
    config = createMockConfigService();
    service = new ConnectionTestsService(new ConfigRegistryService(config as never, {}));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('testSmtp', () => {
    it('échoue clairement sans serveur SMTP', async () => {
      await expect(service.testSmtp()).resolves.toEqual({
        ok: false,
        message: 'Configuration SMTP incomplète : serveur SMTP non renseigné.',
      });
      expect(mockCreateTransport).not.toHaveBeenCalled();
    });

    it('n’invente jamais d’expéditeur : sans adresse d’expéditeur, pas d’email de test', async () => {
      await config.set('smtp', 'host', 'smtp.exemple.fr');

      await expect(service.testSmtp('dest@exemple.fr')).resolves.toEqual({
        ok: false,
        message: "Adresse d'expéditeur non renseignée.",
      });
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('vérifie la connexion sans expéditeur, avec le port par défaut (587) du registre', async () => {
      await config.set('smtp', 'host', 'smtp.exemple.fr');

      await expect(service.testSmtp()).resolves.toEqual({ ok: true, message: 'Connexion SMTP réussie (serveur joignable).' });
      expect(mockCreateTransport).toHaveBeenCalledWith(expect.objectContaining({ port: 587, secure: false, auth: undefined }));
    });

    it('envoie l’email de test depuis l’expéditeur configuré, avec authentification', async () => {
      await config.set('smtp', 'host', 'smtp.exemple.fr');
      await config.set('smtp', 'from', 'it@exemple.fr');
      await config.set('smtp', 'user', 'robot');
      await config.set('smtp', 'password', 'secret');
      await config.set('smtp', 'secure', 'true');

      await expect(service.testSmtp('dest@exemple.fr')).resolves.toEqual({
        ok: true,
        message: 'Email de test envoyé à dest@exemple.fr.',
      });
      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({ secure: true, auth: { user: 'robot', pass: 'secret' } }),
      );
      expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({ from: 'it@exemple.fr', to: 'dest@exemple.fr' }));
    });

    it('rapporte l’erreur du serveur en `ok: false`', async () => {
      await config.set('smtp', 'host', 'smtp.exemple.fr');
      mockVerify.mockRejectedValueOnce(new Error('Connection refused'));

      await expect(service.testSmtp()).resolves.toEqual({ ok: false, message: 'Échec de la connexion SMTP : Connection refused' });
    });

    it('ne révèle ni le mot de passe ni la pile d’appels dans le message d’échec', async () => {
      await config.set('smtp', 'host', 'smtp.exemple.fr');
      await config.set('smtp', 'user', 'robot');
      await config.set('smtp', 'password', 'Tr3s-S3cret');
      const err = new Error('Invalid login: 535 AUTH robot Tr3s-S3cret rejected\n    at SMTPConnection._formatError (smtp-connection/index.js:798:19)');
      mockVerify.mockRejectedValueOnce(err);

      const result = await service.testSmtp();

      expect(result).toEqual({ ok: false, message: 'Échec de la connexion SMTP : Invalid login: 535 AUTH robot •••• rejected' });
      expect(result.message).not.toMatch(/S3cret|index\.js|\n/);
    });

    it('refuse une adresse de test invalide (400)', async () => {
      await expect(service.testSmtp('pas-une-adresse')).rejects.toThrow(BadRequestException);
    });
  });

  describe('testEntra', () => {
    async function configureEntra(): Promise<void> {
      await config.set('entra', 'tenant_id', 'tenant');
      await config.set('entra', 'client_id', 'client');
      await config.set('entra', 'client_secret', 'Cl13nt-S3cret');
    }

    it('échoue clairement quand la configuration est incomplète', async () => {
      const result = await service.testEntra();

      expect(result.ok).toBe(false);
      expect(result.message).toContain('incomplète');
    });

    it('réussit quand Microsoft délivre un jeton', async () => {
      await configureEntra();
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetchMock);

      await expect(service.testEntra()).resolves.toEqual({ ok: true, message: 'Connexion Entra ID réussie.' });
      expect(fetchMock).toHaveBeenCalledWith(
        'https://login.microsoftonline.com/tenant/oauth2/v2.0/token',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('rapporte le refus de Microsoft', async () => {
      await configureEntra();
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error_description: 'AADSTS7000215: Invalid client secret' }),
      }));

      await expect(service.testEntra()).resolves.toEqual({
        ok: false,
        message: 'Microsoft a refusé la demande de jeton : AADSTS7000215: Invalid client secret',
      });
    });

    it('rapporte une panne réseau', async () => {
      await configureEntra();
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND')));

      await expect(service.testEntra()).resolves.toEqual({ ok: false, message: 'Échec de la connexion à Entra ID : getaddrinfo ENOTFOUND' });
    });

    it('ne recopie jamais le secret client, même si la réponse de Microsoft le contient', async () => {
      await configureEntra();
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error_description: 'AADSTS7000215: secret provided: Cl13nt-S3cret.\r\nTrace ID: 1234' }),
      }));

      const result = await service.testEntra();

      expect(result.message).toBe('Microsoft a refusé la demande de jeton : AADSTS7000215: secret provided: ••••.');
    });
  });
});
