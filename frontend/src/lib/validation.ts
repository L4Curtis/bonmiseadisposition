import { z } from 'zod';

// ─── Login ───────────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "L'email est requis")
    .regex(/^[^\s@]+@[^\s@]+$/, 'Format email invalide'),
  password: z
    .string()
    .min(1, 'Le mot de passe est requis'),
});

// ─── Change Password ─────────────────────────────────────────────────────────

export const changePasswordSchema = z.object({
  currentPassword: z
    .string()
    .min(1, 'Le mot de passe actuel est requis'),
  newPassword: z
    .string()
    .min(12, 'Minimum 12 caractères')
    .max(128, 'Maximum 128 caractères')
    .regex(/[A-Z]/, 'Au moins une majuscule')
    .regex(/[a-z]/, 'Au moins une minuscule')
    .regex(/[0-9]/, 'Au moins un chiffre')
    .regex(/[@$!%*?&_#^+=\-.]/, 'Au moins un caractère spécial'),
  confirmPassword: z
    .string()
    .min(1, 'Confirmez le mot de passe'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Les mots de passe ne correspondent pas',
  path: ['confirmPassword'],
});

// ─── Bon Creation ────────────────────────────────────────────────────────────

export const bonCreateSchema = z.object({
  collaborateurId: z
    .string()
    .min(1, 'Sélectionnez un collaborateur'),
  filialeId: z
    .string()
    .min(1, 'Sélectionnez une filiale'),
  dateMiseDisposition: z
    .string()
    .min(1, 'Indiquez la date de mise à disposition'),
  dateRestitution: z.string().optional(),
  civilite: z.enum(['mr', 'mme']),
  equipments: z
    .array(z.object({
      catalogItemId: z.string().optional(),
      customLabel: z.string().optional(),
      serialNumber: z.string().optional(),
      inventoryNumber: z.string().optional(),
      notes: z.string().optional(),
    }))
    .refine(
      (items) => items.some((e) => e.catalogItemId || e.customLabel?.trim()),
      'Ajoutez au moins un équipement',
    ),
}).refine(
  // Comparaison lexicographique valide sur le format YYYY-MM-DD
  (d) => !d.dateRestitution || d.dateRestitution >= d.dateMiseDisposition,
  {
    message: 'La date de restitution ne peut pas précéder la date de mise à disposition',
    path: ['dateRestitution'],
  },
);

/** Limite partagée UI ↔ schéma pour le message de contestation. */
export const CONTESTATION_MAX_LENGTH = 2000;

// ─── Contestation ────────────────────────────────────────────────────────────

export const contestationSchema = z.object({
  message: z
    .string()
    .min(1, 'Veuillez détailler le motif')
    .max(CONTESTATION_MAX_LENGTH, `Maximum ${CONTESTATION_MAX_LENGTH} caractères`),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Validate data against a Zod schema, return first error per field or null */
export function validate<T>(
  schema: z.ZodType<T>,
  data: unknown,
): { success: true; data: T } | { success: false; errors: Record<string, string> } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_root';
    if (!errors[key]) {
      errors[key] = issue.message;
    }
  }
  return { success: false, errors };
}
