import { ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { generateBonReference, BON_REFERENCE_TX_OPTIONS } from '../bon-reference';

/**
 * Minimal fake Prisma.TransactionClient: generateBonReference only calls
 * $executeRaw (advisory lock) and $queryRaw (MAX lookup), so the rest of the
 * delegate surface is irrelevant here.
 */
function fakeTx(queryRawResult: Array<{ max: number | null }>) {
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn().mockResolvedValue(queryRawResult),
  } as unknown as Prisma.TransactionClient;
}

describe('generateBonReference', () => {
  // The function reads the real system clock (no injectable clock), so
  // assertions are built against the actual current year rather than a
  // frozen date — avoids fragile global Date mocking.
  const currentYear = new Date().getFullYear();

  it('generates the first reference of the year in BON-YYYY-NNNN format when no bon exists yet', async () => {
    const tx = fakeTx([{ max: null }]);

    const reference = await generateBonReference(tx);

    expect(reference).toBe(`BON-${currentYear}-0001`);
    expect(reference).toMatch(/^BON-\d{4}-\d{4,}$/);
  });

  it('increments from the current max reference number for the year', async () => {
    const tx = fakeTx([{ max: 42 }]);

    const reference = await generateBonReference(tx);

    expect(reference).toBe(`BON-${currentYear}-0043`);
  });

  it('pads the sequence number to 4 digits without truncating beyond 9999', async () => {
    const tx = fakeTx([{ max: 9999 }]);

    const reference = await generateBonReference(tx);

    expect(reference).toBe(`BON-${currentYear}-10000`);
  });

  it('acquires the advisory lock before reading the max reference', async () => {
    const tx = fakeTx([{ max: 3 }]);

    await generateBonReference(tx);

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('maps a P2028 transaction timeout to ServiceUnavailableException', async () => {
    const timeoutError = new Prisma.PrismaClientKnownRequestError('Transaction already closed: timeout', {
      code: 'P2028',
      clientVersion: '5.22.0',
    });
    const tx = {
      $executeRaw: jest.fn().mockRejectedValue(timeoutError),
      $queryRaw: jest.fn(),
    } as unknown as Prisma.TransactionClient;

    await expect(generateBonReference(tx)).rejects.toThrow(ServiceUnavailableException);
  });

  it('uses a French, user-facing message for the P2028 mapping', async () => {
    const timeoutError = new Prisma.PrismaClientKnownRequestError('Transaction already closed: timeout', {
      code: 'P2028',
      clientVersion: '5.22.0',
    });
    const tx = {
      $executeRaw: jest.fn().mockRejectedValue(timeoutError),
      $queryRaw: jest.fn(),
    } as unknown as Prisma.TransactionClient;

    await expect(generateBonReference(tx)).rejects.toThrow(
      'Génération de référence temporairement indisponible, réessayez',
    );
  });

  it('propagates non-P2028 Prisma errors unchanged', async () => {
    const otherError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '5.22.0',
    });
    const tx = {
      $executeRaw: jest.fn().mockRejectedValue(otherError),
      $queryRaw: jest.fn(),
    } as unknown as Prisma.TransactionClient;

    await expect(generateBonReference(tx)).rejects.toBe(otherError);
  });

  it('exposes the recommended transaction options for callers', () => {
    expect(BON_REFERENCE_TX_OPTIONS).toEqual({ timeout: 10000, maxWait: 5000 });
  });
});
