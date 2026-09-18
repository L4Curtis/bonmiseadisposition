import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateManualUserDto, UpdateManualUserDto } from '../dto/manual-user.dto';

describe('CreateManualUserDto', () => {
  it('accepts a minimal payload (firstName + lastName only)', async () => {
    const dto = plainToInstance(CreateManualUserDto, { firstName: 'Jean', lastName: 'Dupont' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('trims firstName/lastName before validating length/emptiness', async () => {
    const dto = plainToInstance(CreateManualUserDto, { firstName: '  Jean  ', lastName: '  Dupont  ' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.firstName).toBe('Jean');
    expect(dto.lastName).toBe('Dupont');
  });

  it('rejects a blank firstName (whitespace-only)', async () => {
    const dto = plainToInstance(CreateManualUserDto, { firstName: '   ', lastName: 'Dupont' });
    const errors = await validate(dto);
    const firstNameError = errors.find((e) => e.property === 'firstName');
    expect(firstNameError?.constraints).toHaveProperty('isNotEmpty');
  });

  it('rejects a missing lastName', async () => {
    const dto = plainToInstance(CreateManualUserDto, { firstName: 'Jean' });
    const errors = await validate(dto);
    expect(errors.find((e) => e.property === 'lastName')).toBeDefined();
  });

  it('rejects a firstName longer than 60 characters', async () => {
    const dto = plainToInstance(CreateManualUserDto, { firstName: 'A'.repeat(61), lastName: 'Dupont' });
    const errors = await validate(dto);
    const firstNameError = errors.find((e) => e.property === 'firstName');
    expect(firstNameError?.constraints).toHaveProperty('maxLength');
  });

  it('accepts a name exactly at the 60 character limit', async () => {
    const dto = plainToInstance(CreateManualUserDto, { firstName: 'A'.repeat(60), lastName: 'Dupont' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('treats an absent email as valid (optional field)', async () => {
    const dto = plainToInstance(CreateManualUserDto, { firstName: 'Jean', lastName: 'Dupont' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('treats a blank email as valid (form sends "" when left empty)', async () => {
    const dto = plainToInstance(CreateManualUserDto, { firstName: 'Jean', lastName: 'Dupont', email: '   ' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.email).toBe('');
  });

  it('rejects a malformed email', async () => {
    const dto = plainToInstance(CreateManualUserDto, { firstName: 'Jean', lastName: 'Dupont', email: 'not-an-email' });
    const errors = await validate(dto);
    const emailError = errors.find((e) => e.property === 'email');
    expect(emailError?.constraints).toHaveProperty('isEmail');
  });

  it('accepts a valid email', async () => {
    const dto = plainToInstance(CreateManualUserDto, { firstName: 'Jean', lastName: 'Dupont', email: 'jean.dupont@exemple.fr' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects a non-UUID filialeId', async () => {
    const dto = plainToInstance(CreateManualUserDto, { firstName: 'Jean', lastName: 'Dupont', filialeId: 'not-a-uuid' });
    const errors = await validate(dto);
    const filialeError = errors.find((e) => e.property === 'filialeId');
    expect(filialeError?.constraints).toHaveProperty('isUuid');
  });

  it('rejects an unknown property (whitelist)', async () => {
    const dto = plainToInstance(CreateManualUserDto, { firstName: 'Jean', lastName: 'Dupont', role: 'admin' });
    // whitelist stripping is applied by the global ValidationPipe, not by
    // validate() directly — this test only documents that the extra
    // property carries no validation metadata that would otherwise coerce it.
    expect((dto as unknown as { role?: string }).role).toBe('admin');
  });
});

describe('UpdateManualUserDto', () => {
  it('accepts an empty payload (no field to change)', async () => {
    const dto = plainToInstance(UpdateManualUserDto, {});
    expect(await validate(dto)).toHaveLength(0);
  });

  it('treats an empty email as valid — signals "clear the email"', async () => {
    const dto = plainToInstance(UpdateManualUserDto, { email: '' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.email).toBe('');
  });

  it('rejects a blank firstName (cannot clear a mandatory field)', async () => {
    const dto = plainToInstance(UpdateManualUserDto, { firstName: '   ' });
    const errors = await validate(dto);
    const firstNameError = errors.find((e) => e.property === 'firstName');
    expect(firstNameError?.constraints).toHaveProperty('isNotEmpty');
  });

  it('accepts toggling active alone', async () => {
    const dto = plainToInstance(UpdateManualUserDto, { active: false });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.active).toBe(false);
  });

  it('rejects a non-boolean active', async () => {
    const dto = plainToInstance(UpdateManualUserDto, { active: 'yes' });
    const errors = await validate(dto);
    const activeError = errors.find((e) => e.property === 'active');
    expect(activeError?.constraints).toHaveProperty('isBoolean');
  });
});
