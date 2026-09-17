/**
 * Interpolation des variables `{{VAR_NAME}}` dans un template HTML.
 *
 * Fonction pure : ne fait aucune échappement HTML elle-même — les valeurs
 * injectées sont déjà échappées par l'appelant (voir
 * notification/messages/escape-html.ts) avant d'être passées ici. Une clé
 * inconnue dans `vars` est remplacée par une chaîne vide (pas laissée telle
 * quelle) pour ne jamais renvoyer un `{{PLACEHOLDER}}` non résolu au
 * destinataire final.
 */
export function renderTemplateHtml(html: string, vars: Record<string, string>): string {
  return html.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '');
}
