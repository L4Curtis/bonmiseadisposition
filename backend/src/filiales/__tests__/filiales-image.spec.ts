import { mkdtemp, rm, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { AppException } from '../../common/errors';
import { UNSUPPORTED_IMAGE_MESSAGE, assertFilialeImageFile } from '../filiales-image';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x24, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);
/** Le fichier de la recette : du texte renommé en `.png`. */
const TEXT_AS_PNG = Buffer.from('ceci n est pas une image');

describe('assertFilialeImageFile — type réel d’un logo ou d’un cachet déposé', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'filiale-image-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function fileWith(name: string, content: Buffer): Promise<string> {
    const path = join(dir, name);
    await writeFile(path, content);
    return path;
  }

  it.each([
    ['PNG', 'cachet.png', PNG],
    ['JPEG', 'logo.jpg', JPEG],
  ])('accepte un vrai %s', async (_label, name, content) => {
    await expect(assertFilialeImageFile(await fileWith(name, content))).resolves.toBeUndefined();
  });

  it.each([
    ['du texte renommé en .png', 'faux-cachet.png', TEXT_AS_PNG],
    ['une image WebP (PDFKit ne sait pas la dessiner)', 'logo.png', WEBP],
    ['un fichier vide', 'vide.png', Buffer.alloc(0)],
    ['un en-tête PNG tronqué', 'court.png', PNG.subarray(0, 4)],
  ])('refuse %s : 400 unsupported_image, même message que le mauvais format', async (_label, name, content) => {
    const error = await assertFilialeImageFile(await fileWith(name, content)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe('unsupported_image');
    expect((error as AppException).getStatus()).toBe(400);
    expect((error as AppException).message).toBe(UNSUPPORTED_IMAGE_MESSAGE);
    expect(UNSUPPORTED_IMAGE_MESSAGE).toBe('Format non supporté : JPEG ou PNG uniquement');
  });

  it('ne supprime pas le fichier lui-même (le contrôleur s’en charge)', async () => {
    const path = await fileWith('faux.png', TEXT_AS_PNG);
    await assertFilialeImageFile(path).catch(() => undefined);
    expect(existsSync(path)).toBe(true);
  });
});
