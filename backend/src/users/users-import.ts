import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeEmail } from '../auth/utils/normalize-email.util';
import {
  ImportManualUserItemDto, ImportManualUserLineResult, ImportManualUsersResult,
} from './dto/import-users.dto';
import {
  buildManualDisplayName, buildManualSamAccountBase, generateUniqueManualSamAccountName,
} from './manual-account.util';

const logger = new Logger('UsersImport');

/** Concatène les messages de contrainte d'une ligne invalide — même logique
 *  que filiales-import.ts#formatValidationErrors. */
function formatValidationErrors(errors: ValidationError[]): string {
  return [...new Set(errors.flatMap((error) => Object.values(error.constraints ?? {})))].join(' ');
}

/** Compte existant tel qu'il est rechargé pour le rapprochement. */
interface ExistingUser {
  id: string;
  samAccountName: string;
  displayName: string;
  email: string | null;
  department: string | null;
  filialeId: string | null;
  active: boolean;
  isManualAccount: boolean;
}

const EXISTING_USER_SELECT = {
  id: true, samAccountName: true, displayName: true, email: true,
  department: true, filialeId: true, active: true, isManualAccount: true,
} as const;

interface ValidLine {
  index: number;
  item: ImportManualUserItemDto;
  email?: string;
  displayName: string;
}

/** Index en mémoire de l'existant, tenus à jour au fil de l'import. */
interface ImportContext {
  bySam: Map<string, ExistingUser>;
  byEmail: Map<string, ExistingUser>;
  manualByName: Map<string, ExistingUser>;
  filialesByName: Map<string, { id: string; active: boolean }>;
}

type LineOutcome = Omit<ImportManualUserLineResult, 'index'>;

function isCommentLine(raw: Record<string, unknown>): boolean {
  return ['samAccountName', 'firstName'].some((key) => {
    const value = raw[key];
    return typeof value === 'string' && value.trim().startsWith('#');
  });
}

function nameKey(displayName: string): string {
  return displayName.toLowerCase();
}

/** Étape 1 : forme et validation de chaque ligne, lignes `#` ignorées. */
async function validateLines(
  rawItems: unknown[],
  lines: ImportManualUserLineResult[],
): Promise<ValidLine[]> {
  const valid: ValidLine[] = [];
  for (let index = 0; index < rawItems.length; index++) {
    const raw = rawItems[index];
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      lines.push({ index, status: 'error', message: 'Ligne invalide : un objet est attendu.' });
      continue;
    }
    const record = raw as Record<string, unknown>;
    // Ligne de commentaire du modèle CSV : ignorée en silence plutôt que
    // créée, au cas où le navigateur ne l'aurait pas filtrée.
    if (isCommentLine(record)) {
      lines.push({ index, status: 'skipped', message: 'Ligne de commentaire.' });
      continue;
    }
    const item = plainToInstance(ImportManualUserItemDto, record);
    // eslint-disable-next-line no-await-in-loop -- validation ligne à ligne, volume borné (500)
    const violations = await validate(item);
    if (violations.length > 0) {
      lines.push({ index, status: 'error', message: formatValidationErrors(violations) });
      continue;
    }
    valid.push({
      index,
      item,
      email: item.email ? normalizeEmail(item.email) : undefined,
      displayName: buildManualDisplayName(item.firstName, item.lastName),
    });
  }
  return valid;
}

/** Étape 2 : doublons à l'intérieur du fichier — la première occurrence est
 *  traitée, les suivantes sont rejetées. Trois clés : l'identifiant, l'email
 *  et, pour une création (sans identifiant), le couple prénom/nom normalisé
 *  (accents et casse ignorés) : deux lignes « Jean Dupont » sans identifiant
 *  créeraient deux fiches indiscernables. */
function rejectInFileDuplicates(
  valid: ValidLine[],
  lines: ImportManualUserLineResult[],
): ValidLine[] {
  const seenSam = new Set<string>();
  const seenEmail = new Set<string>();
  const seenName = new Set<string>();
  return valid.filter((line) => {
    const sam = line.item.samAccountName?.toLowerCase();
    const name = sam ? undefined : buildManualSamAccountBase(line.item.firstName, line.item.lastName);
    const duplicate =
      (sam && seenSam.has(sam) && 'le même identifiant') ||
      (line.email && seenEmail.has(line.email) && 'le même email') ||
      (name && seenName.has(name) && 'les mêmes prénom et nom, sans identifiant');
    if (duplicate) {
      lines.push({
        index: line.index,
        status: 'error',
        displayName: line.displayName,
        message: `Doublon dans le fichier : une ligne précédente porte ${duplicate}.`,
      });
      return false;
    }
    if (sam) seenSam.add(sam);
    if (line.email) seenEmail.add(line.email);
    if (name) seenName.add(name);
    return true;
  });
}

/** Étape 3 : chargement ciblé de l'existant (seulement les comptes que le
 *  fichier peut concerner) et de toutes les filiales. */
async function loadContext(prisma: PrismaService, valid: ValidLine[]): Promise<ImportContext> {
  const sams = valid.flatMap((l) => (l.item.samAccountName ? [l.item.samAccountName] : []));
  const emails = valid.flatMap((l) => (l.email ? [l.email] : []));
  const names = valid.filter((l) => !l.item.samAccountName).map((l) => l.displayName);

  const or: Prisma.UserWhereInput[] = [];
  if (sams.length > 0) or.push({ samAccountName: { in: sams, mode: 'insensitive' } });
  if (emails.length > 0) or.push({ email: { in: emails, mode: 'insensitive' } });
  if (names.length > 0) {
    or.push({ isManualAccount: true, displayName: { in: names, mode: 'insensitive' } });
  }

  const [users, filiales] = await Promise.all([
    or.length > 0
      ? prisma.user.findMany({ where: { OR: or }, select: EXISTING_USER_SELECT })
      : Promise.resolve([] as ExistingUser[]),
    prisma.filiale.findMany({ select: { id: true, name: true, active: true } }),
  ]);

  const context: ImportContext = {
    bySam: new Map(),
    byEmail: new Map(),
    manualByName: new Map(),
    filialesByName: new Map(filiales.map((f) => [f.name.toLowerCase(), { id: f.id, active: f.active }])),
  };
  users.forEach((u) => indexUser(context, u));
  return context;
}

function indexUser(context: ImportContext, user: ExistingUser, previous?: ExistingUser): void {
  if (previous?.email) context.byEmail.delete(previous.email.toLowerCase());
  if (previous?.isManualAccount) context.manualByName.delete(nameKey(previous.displayName));
  context.bySam.set(user.samAccountName.toLowerCase(), user);
  if (user.email) context.byEmail.set(user.email.toLowerCase(), user);
  if (user.isManualAccount) context.manualByName.set(nameKey(user.displayName), user);
}

/** Filiale désignée par son nom : `undefined` si la cellule est vide,
 *  sinon son id, ou une erreur si elle n'existe pas ou est inactive. */
function resolveFiliale(
  context: ImportContext,
  name: string | undefined,
): { filialeId?: string; error?: string } {
  if (name === undefined) return {};
  const filiale = context.filialesByName.get(name.toLowerCase());
  if (!filiale || !filiale.active) {
    return { error: `Filiale « ${name} » introuvable ou inactive.` };
  }
  return { filialeId: filiale.id };
}

/** Collision d'email : l'adresse d'un compte de l'annuaire n'est jamais
 *  reprise, celle d'un autre collaborateur manuel non plus. */
function emailConflict(context: ImportContext, email: string | undefined, selfId?: string): string | undefined {
  if (!email) return undefined;
  const owner = context.byEmail.get(email);
  if (!owner || owner.id === selfId) return undefined;
  return owner.isManualAccount
    ? `L'email ${email} est déjà celui du collaborateur ${owner.displayName} (${owner.samAccountName}).`
    : `L'email ${email} appartient à un compte de l'annuaire : il ne peut pas être repris par un compte manuel.`;
}

function toLineError(err: unknown): string {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    return 'Un utilisateur avec cet email existe déjà.';
  }
  logger.error(`Ligne d'import non enregistrée : ${err instanceof Error ? err.message : String(err)}`);
  return "Erreur lors de l'enregistrement de cette ligne.";
}

/** Mise à jour d'un compte manuel existant : seuls les champs fournis et
 *  différents de l'existant sont écrits. */
async function applyUpdate(
  prisma: PrismaService,
  context: ImportContext,
  line: ValidLine,
): Promise<LineOutcome> {
  const { item } = line;
  const target = context.bySam.get((item.samAccountName as string).toLowerCase());
  if (!target) {
    return {
      status: 'error',
      message: `Identifiant « ${item.samAccountName} » inconnu : laissez la colonne vide pour créer un collaborateur.`,
    };
  }
  if (!target.isManualAccount) {
    return {
      status: 'error',
      samAccountName: target.samAccountName,
      message: "Ce compte provient de l'annuaire (Active Directory / SSO) : un import ne le modifie jamais.",
    };
  }
  const filiale = resolveFiliale(context, item.filiale);
  const conflict = filiale.error ?? emailConflict(context, line.email, target.id);
  if (conflict) return { status: 'error', samAccountName: target.samAccountName, message: conflict };

  const changes: Prisma.UserUpdateInput = {
    ...(line.displayName !== target.displayName ? { displayName: line.displayName } : {}),
    ...(line.email !== undefined && line.email !== target.email ? { email: line.email } : {}),
    ...(item.department !== undefined && item.department !== target.department ? { department: item.department } : {}),
    ...(filiale.filialeId !== undefined && filiale.filialeId !== target.filialeId
      ? { filiale: { connect: { id: filiale.filialeId } } } : {}),
    ...(item.active !== undefined && item.active !== target.active ? { active: item.active } : {}),
  };
  if (Object.keys(changes).length === 0) {
    return { status: 'skipped', samAccountName: target.samAccountName, displayName: target.displayName, message: 'Aucune modification.' };
  }

  const updated = await prisma.user.update({ where: { id: target.id }, data: changes, select: EXISTING_USER_SELECT });
  indexUser(context, updated, target);
  return { status: 'updated', samAccountName: updated.samAccountName, displayName: updated.displayName };
}

/** Création d'un compte manuel — mêmes valeurs imposées que
 *  UsersService#createManual (collaborateur non IT, jamais authentifiable). */
async function applyCreate(
  prisma: PrismaService,
  context: ImportContext,
  line: ValidLine,
): Promise<LineOutcome> {
  const { item } = line;
  const homonym = context.manualByName.get(nameKey(line.displayName));
  if (homonym) {
    return {
      status: 'error',
      displayName: line.displayName,
      message: `Le collaborateur ${homonym.displayName} existe déjà (identifiant ${homonym.samAccountName}) : `
        + "renseignez son identifiant pour le mettre à jour, ou créez l'homonyme à la main.",
    };
  }
  const filiale = resolveFiliale(context, item.filiale);
  const conflict = filiale.error ?? emailConflict(context, line.email);
  if (conflict) return { status: 'error', displayName: line.displayName, message: conflict };

  const samAccountName = await generateUniqueManualSamAccountName(
    buildManualSamAccountBase(item.firstName, item.lastName),
    async (candidate) => (await prisma.user.findUnique({ where: { samAccountName: candidate } })) !== null,
  );
  const created = await prisma.user.create({
    data: {
      samAccountName,
      displayName: line.displayName,
      email: line.email ?? null,
      department: item.department ?? null,
      filialeId: filiale.filialeId ?? null,
      role: 'collaborator',
      isItStaff: false,
      active: item.active ?? true,
      isManualAccount: true,
      isLocalAccount: false,
      passwordHash: null,
      lastLdapSync: null,
    },
    select: EXISTING_USER_SELECT,
  });
  indexUser(context, created);
  return { status: 'created', samAccountName: created.samAccountName, displayName: created.displayName };
}

function summarize(lines: ImportManualUserLineResult[]): ImportManualUsersResult {
  const sorted = [...lines].sort((a, b) => a.index - b.index);
  const count = (status: ImportManualUserLineResult['status']): number =>
    sorted.filter((l) => l.status === status).length;
  return {
    created: count('created'),
    updated: count('updated'),
    skipped: count('skipped'),
    errors: sorted
      .filter((l) => l.status === 'error')
      .map((l) => ({ index: l.index, message: l.message ?? 'Erreur.' })),
    lines: sorted,
  };
}

/**
 * Import en masse des collaborateurs créés à la main (POST /users/manual/import).
 *
 * Clé de rapprochement : l'identifiant (`samAccountName`). C'est la seule
 * donnée à la fois unique en base (`@unique`), stable (générée une fois à la
 * création, jamais recalculée quand le nom change) et toujours présente —
 * l'email est facultatif pour ces comptes et le nom n'est pas unique
 * (homonymes). L'export le fournit : un fichier exporté, modifié puis
 * réimporté met à jour les mêmes fiches.
 * - identifiant vide → création (identifiant généré « manuel.prenom.nom ») ;
 *   refusée si un collaborateur manuel du même nom existe déjà, pour qu'un
 *   même fichier importé deux fois ne crée pas de doublons ;
 * - identifiant renseigné → mise à jour des seuls champs fournis et différents
 *   (`skipped` si rien ne change), identifiant inconnu = erreur (jamais de
 *   création sous un identifiant choisi par le fichier) ;
 * - un compte synchronisé depuis l'annuaire n'est JAMAIS touché : son
 *   identifiant est rejeté, et son email ne peut pas être repris ;
 * - une ligne en erreur n'interrompt pas l'import. Traitement séquentiel sans
 *   transaction globale, par cohérence avec importFilialeItems.
 */
export async function importManualUsers(
  prisma: PrismaService,
  rawItems: unknown[],
  actorId: string,
): Promise<ImportManualUsersResult> {
  const lines: ImportManualUserLineResult[] = [];
  const validated = await validateLines(rawItems, lines);
  const unique = rejectInFileDuplicates(validated, lines);
  const context = await loadContext(prisma, unique);

  for (const line of unique) {
    try {
      // eslint-disable-next-line no-await-in-loop -- séquentiel : chaque ligne voit les écritures des précédentes
      const outcome = line.item.samAccountName
        ? await applyUpdate(prisma, context, line)
        : await applyCreate(prisma, context, line);
      lines.push({ index: line.index, ...outcome });
    } catch (err: unknown) {
      lines.push({ index: line.index, status: 'error', displayName: line.displayName, message: toLineError(err) });
    }
  }

  const result = summarize(lines);
  await prisma.auditLog
    .create({
      data: {
        userId: actorId,
        action: 'users_imported',
        details: {
          created: result.created,
          updated: result.updated,
          skipped: result.skipped,
          errorCount: result.errors.length,
        },
      },
    })
    .catch((err: unknown) => {
      logger.error(`Audit users_imported non journalisé : ${err instanceof Error ? err.message : String(err)}`);
    });
  return result;
}
