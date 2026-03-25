import { Test, TestingModule } from '@nestjs/testing';
import { LdapService } from '../ldap.service';
import { AppConfigService } from '../../config/config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';
import { createMockConfigService } from '../../common/__tests__/helpers/mock-services';

// Mock ldapjs — we never want real LDAP connections in unit tests
const mockClient = {
  bind: jest.fn(),
  search: jest.fn(),
  destroy: jest.fn(),
  on: jest.fn(),
};

jest.mock('ldapjs', () => {
  // Return a factory so mockClient is captured at runtime, not hoist-time
  return {
    createClient: jest.fn().mockImplementation(() => mockClient),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ldapMock = require('ldapjs') as { createClient: jest.Mock };

describe('LdapService', () => {
  let service: LdapService;
  let configService: ReturnType<typeof createMockConfigService>;

  beforeEach(async () => {
    jest.clearAllMocks();

    const prisma = createMockPrismaService();
    configService = createMockConfigService();

    // Default LDAP config
    configService.set('ldap', 'enabled', 'true');
    configService.set('ldap', 'url', 'ldap://dc.test.local');
    configService.set('ldap', 'bind_dn', 'cn=admin,dc=test,dc=local');
    configService.set('ldap', 'bind_password', 'secret');
    configService.set('ldap', 'search_base', 'dc=test,dc=local');
    configService.set('ldap', 'user_filter', '(objectClass=person)');
    configService.set('ldap', 'use_ssl', 'false');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LdapService,
        { provide: PrismaService, useValue: prisma },
        { provide: AppConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<LdapService>(LdapService);
  });

  // ─── validateLdapFilter ────────────────────────────────────────────────────

  describe('validateLdapFilter', () => {
    it('should accept valid filter: (objectClass=person)', () => {
      expect(() => service.validateLdapFilter('(objectClass=person)')).not.toThrow();
    });

    it('should reject empty filter', () => {
      expect(() => service.validateLdapFilter('')).toThrow('Filtre LDAP manquant');
    });

    it('should reject filter too long (>512 chars)', () => {
      const longFilter = '(' + 'a'.repeat(512) + ')';
      expect(() => service.validateLdapFilter(longFilter)).toThrow('trop long');
    });

    it('should reject filter with null byte', () => {
      expect(() => service.validateLdapFilter('(cn=\0admin)')).toThrow('caractère nul');
    });

    it('should reject unbalanced parentheses', () => {
      expect(() => service.validateLdapFilter('(cn=test))')).toThrow('parenthèses non équilibrées');
      expect(() => service.validateLdapFilter('((cn=test)')).toThrow('parenthèses non équilibrées');
    });

    it('should reject filter not starting with (', () => {
      expect(() => service.validateLdapFilter('cn=test)')).toThrow('doit commencer par');
    });
  });

  // ─── testConnection ────────────────────────────────────────────────────────

  describe('testConnection', () => {
    it('should return success for valid connection', async () => {
      mockClient.bind.mockImplementation(
        (_dn: string, _pw: string, cb: (err: Error | null) => void) => cb(null),
      );

      const result = await service.testConnection();

      expect(result).toEqual({ success: true, message: 'Connexion LDAP réussie' });
      expect(ldapMock.createClient).toHaveBeenCalled();
      expect(mockClient.destroy).toHaveBeenCalled();
    });

    it('should return failure message on error', async () => {
      mockClient.bind.mockImplementation(
        (_dn: string, _pw: string, cb: (err: Error | null) => void) =>
          cb(new Error('Connection refused')),
      );

      const result = await service.testConnection();

      expect(result).toEqual({
        success: false,
        message: expect.stringContaining('Connection refused'),
      });
    });
  });

  // ─── syncUsers ─────────────────────────────────────────────────────────────

  describe('syncUsers', () => {
    it('should skip when LDAP disabled', async () => {
      configService.set('ldap', 'enabled', 'false');

      await service.syncUsers();

      expect(ldapMock.createClient).not.toHaveBeenCalled();
    });
  });
});
