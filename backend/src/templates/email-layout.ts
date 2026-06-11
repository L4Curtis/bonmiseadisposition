/**
 * Mise en page partagée des emails — DA « Bons IT » (alignée sur l'interface).
 * HTML email-safe : styles inline uniquement, pas de webfonts, divs simples.
 * Utilisée par les templates par défaut (templates.service) ET par les emails
 * système codés côté notification.service (annulation, retrouvé, clôture
 * unilatérale) pour une identité visuelle unique.
 */

// Dégradé de marque (identique à --gradient-primary côté frontend)
export const BRAND_FROM = '#4f46e5';
export const BRAND_TO = '#2563eb';

export interface HeaderChip {
  text: string;
  /** Couleur de fond du chip (semi-transparent recommandé) */
  bg?: string;
}

export function emailWrapper(content: string): string {
  return `<div style="margin:0;padding:0;background-color:#f0f2f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased">
  <div style="padding:40px 16px 48px">
    ${content}
  </div>
</div>`;
}

export function card(...sections: string[]): string {
  return `<div style="max-width:600px;margin:0 auto">
  <div style="background-color:#ffffff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;box-shadow:0 2px 8px rgba(15,23,42,0.06)">
    ${sections.filter(Boolean).join('\n    ')}
  </div>
  <p style="text-align:center;font-size:11px;color:#cbd5e1;margin:16px 0 0;letter-spacing:0.03em">© 2026 Groupe Livio &middot; Confidentiel</p>
</div>`;
}

/** En-tête de marque : dégradé indigo + pastille GL + chip de statut optionnel. */
export function brandHeader(title: string, subtitle: string, chip?: HeaderChip): string {
  const chipHtml = chip
    ? `<span style="display:inline-block;font-size:11px;font-weight:700;color:#ffffff;background-color:${chip.bg ?? 'rgba(255,255,255,0.16)'};padding:4px 12px;border-radius:999px;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:14px">${chip.text}</span><br>`
    : '';
  return `<div style="background-color:${BRAND_FROM};background-image:linear-gradient(135deg,${BRAND_FROM} 0%,${BRAND_TO} 100%);padding:30px 40px 32px">
      <div style="margin-bottom:20px">
        <span style="display:inline-block;width:38px;height:38px;background-color:rgba(255,255,255,0.14);border:1px solid rgba(255,255,255,0.28);border-radius:11px;color:#ffffff;font-weight:800;font-size:14px;line-height:38px;text-align:center;letter-spacing:-0.5px;vertical-align:middle">GL</span><span style="display:inline-block;vertical-align:middle;margin-left:11px">
          <span style="display:block;font-size:13px;font-weight:700;color:#ffffff;line-height:1.2">Bons IT</span>
          <span style="display:block;font-size:11px;color:rgba(255,255,255,0.62);line-height:1.3">Groupe Livio</span>
        </span>
      </div>
      ${chipHtml}<h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#ffffff;line-height:1.25;letter-spacing:-0.01em">${title}</h1>
      <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.72)">${subtitle}</p>
    </div>`;
}

/** Bandeau méta pleine largeur (référence, dates…) — à placer ENTRE header et body. */
export function metaStrip(items: string[]): string {
  return `<div style="background-color:#f8fafc;border-bottom:1px solid #e2e8f0;padding:12px 40px">
      <span style="font-size:12px;color:#64748b">${items.join('&nbsp;&nbsp;<span style="color:#cbd5e1">&middot;</span>&nbsp;&nbsp;')}</span>
    </div>`;
}

export function body(content: string): string {
  return `<div style="padding:32px 40px 36px">${content}</div>`;
}

export function footer(): string {
  return `<div style="border-top:1px solid #f1f5f9;padding:20px 40px 28px">
      <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.6">Service informatique — Groupe Livio<br>Cet email est envoyé automatiquement, merci de ne pas y répondre.</p>
    </div>`;
}

/** Bouton d'action principal — toujours au dégradé de marque (cohérence DA). */
export function ctaButton(url: string, label: string): string {
  return `<div style="text-align:center;margin:28px 0">
      <a href="${url}" target="_blank" style="display:inline-block;background-color:${BRAND_FROM};background-image:linear-gradient(135deg,${BRAND_FROM} 0%,${BRAND_TO} 100%);color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 36px;border-radius:10px;letter-spacing:0.01em;box-shadow:0 2px 10px rgba(79,70,229,0.35)">${label} &rarr;</a>
    </div>`;
}

export function infoBox(bgColor: string, borderColor: string, textColor: string, content: string): string {
  return `<div style="background-color:${bgColor};border:1px solid ${borderColor};border-radius:10px;padding:12px 16px">
      <p style="margin:0;font-size:13px;color:${textColor};line-height:1.6">${content}</p>
    </div>`;
}

export function equipList(items: string, bgColor = '#f8fafc', borderColor = '#e2e8f0'): string {
  return `<div style="background-color:${bgColor};border:1px solid ${borderColor};border-radius:12px;padding:0 20px;margin-bottom:28px">
      <ul style="margin:0;padding:4px 0;list-style:none">
        ${items}
      </ul>
    </div>`;
}

export function sectionLabel(text: string): string {
  return `<p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em">${text}</p>`;
}

export function refBadge(reference: string): string {
  return `<code style="display:inline-block;font-size:12px;font-weight:700;color:${BRAND_FROM};background:#eef2ff;border:1px solid #c7d2fe;padding:2px 8px;border-radius:6px;font-family:'Courier New',monospace;letter-spacing:0.02em">${reference}</code>`;
}

/** Encadré citation (motif de contestation, message IT, motif de clôture…). */
export function quoteBox(accentColor: string, bgColor: string, borderColor: string, content: string): string {
  return `<div style="background-color:${bgColor};border:1px solid ${borderColor};border-left:4px solid ${accentColor};border-radius:0 10px 10px 0;padding:16px 20px;margin-bottom:24px">
      <p style="margin:0;font-size:14px;color:#374151;line-height:1.7">${content}</p>
    </div>`;
}

/** Pastille ✓ / icône centrée (confirmations). */
export function statusIcon(symbol: string, bgColor: string): string {
  return `<div style="text-align:center;margin-bottom:24px">
      <div style="display:inline-block;width:56px;height:56px;background-color:${bgColor};border-radius:50%;line-height:56px;font-size:28px">${symbol}</div>
    </div>`;
}
