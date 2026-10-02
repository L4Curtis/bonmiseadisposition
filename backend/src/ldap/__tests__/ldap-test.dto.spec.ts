import { ArgumentMetadata, BadRequestException, ValidationPipe } from '@nestjs/common';
import { LdapTestDto } from '../dto/ldap-test.dto';

// Même réglage que le ValidationPipe global (bootstrap/configure-app.ts).
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const metadata: ArgumentMetadata = { type: 'body', metatype: LdapTestDto, data: '' };

async function messagesFor(body: Record<string, unknown>): Promise<string[]> {
  try {
    await pipe.transform(body, metadata);
    return [];
  } catch (err) {
    if (!(err instanceof BadRequestException)) throw err;
    const response = err.getResponse() as { message: string[] };
    return response.message;
  }
}

describe('LdapTestDto — valeurs saisies envoyées au test de connexion LDAP', () => {
  it('accepte un corps vide (le test reprend alors la configuration enregistrée)', async () => {
    await expect(messagesFor({})).resolves.toEqual([]);
  });

  it('accepte les valeurs du formulaire, champs vides compris', async () => {
    await expect(
      messagesFor({
        url: 'ldaps://dc01.livio.local:636',
        use_ssl: 'true',
        bind_dn: 'CN=svc,DC=livio,DC=local',
        bind_password: 'secret',
        user_filter: '',
      }),
    ).resolves.toEqual([]);
  });

  it('refuse une URL qui n’est pas ldap:// ou ldaps://', async () => {
    const messages = await messagesFor({ url: 'http://dc01.livio.local' });
    expect(messages).toEqual(['URL LDAP : une adresse ldap:// ou ldaps:// est attendue.']);
  });

  it('refuse un interrupteur SSL qui ne vaut ni « true » ni « false »', async () => {
    expect(await messagesFor({ use_ssl: 'oui' })).toEqual(['SSL/TLS : « true » ou « false » attendu.']);
  });

  it('refuse un réglage inconnu et une valeur trop longue', async () => {
    expect(await messagesFor({ search_base: 'DC=x' })).toHaveLength(1);
    expect(await messagesFor({ bind_dn: 'x'.repeat(2001) })).toEqual(['Bind DN : 2000 caractères au plus.']);
  });
});
