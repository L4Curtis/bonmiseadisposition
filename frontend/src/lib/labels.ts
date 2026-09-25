/**
 * @deprecated Les libellés métier vivent dans le lexique `@/domain/labels`.
 * Ces réexportations restent le temps que `pages/bons/**` change ses imports.
 */
export {
  ROLE_LABELS,
  roleLabel,
  NOTIFICATION_TYPE_LABELS as NOTIF_TYPE_LABELS,
  notificationTypeLabel as notifTypeLabel,
} from '@/domain/labels';
