import type { ElementType } from 'react';
import {
  LayoutDashboard,
  FileText,
  Settings,
  Users,
  Package,
  Boxes,
  Building2,
  ScrollText,
  MessageSquareWarning,
  Server,
  Mail,
} from 'lucide-react';
import type { UiView } from '@/contexts/UiViewContext';
import { SCREEN_LABELS } from '@/domain/labels';

/** Identifiant du tiroir du téléphone, cité par le bouton ☰ (`aria-controls`). */
export const MOBILE_NAV_DRAWER_ID = 'menu-principal-mobile';

/** Entrées du menu principal, par vue. Partagées par le menu latéral (tablette,
 *  ordinateur) et le tiroir du téléphone : les deux affichent toujours la même liste. */
export interface NavItem {
  readonly to: string;
  readonly icon: ElementType;
  readonly label: string;
  readonly badge?: number;
}

export interface NavGroup {
  readonly title: string;
  readonly items: readonly NavItem[];
}

const operationsGroup: NavGroup = {
  title: 'Opérations',
  items: [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Vue d\'ensemble' },
    { to: '/bons', icon: FileText, label: SCREEN_LABELS.bons },
    { to: '/admin/contestations', icon: MessageSquareWarning, label: SCREEN_LABELS.contestations },
  ],
};

const catalogueItem: NavItem = { to: '/admin/catalogue', icon: Package, label: SCREEN_LABELS.catalogue };
const inventaireItem: NavItem = { to: '/inventaire', icon: Boxes, label: SCREEN_LABELS.inventaire };

// Le technicien voit et modifie le Catalogue, mais ne gère ni les comptes
// (Utilisateurs) ni les Filiales : réservés à l'administrateur (décision du 24/09).
const technicienNavGroups: readonly NavGroup[] = [
  operationsGroup,
  { title: 'Référentiel', items: [catalogueItem, inventaireItem] },
];

const adminNavGroups: readonly NavGroup[] = [
  operationsGroup,
  {
    title: 'Référentiel',
    items: [
      { to: '/admin/utilisateurs', icon: Users, label: SCREEN_LABELS.utilisateurs },
      { to: '/admin/filiales', icon: Building2, label: SCREEN_LABELS.filiales },
      catalogueItem,
      inventaireItem,
    ],
  },
  {
    title: 'Administration',
    items: [
      { to: '/admin/configuration', icon: Settings, label: 'Configuration' },
      { to: '/admin/templates', icon: Mail, label: 'Modèles' },
      { to: '/admin/ldap-sync', icon: Server, label: 'Active Directory' },
      { to: '/admin/audit', icon: ScrollText, label: 'Journal d\'audit' },
    ],
  },
];

const collaboratorNavGroups: readonly NavGroup[] = [
  {
    title: 'Opérations',
    items: [
      { to: '/mes-bons', icon: FileText, label: 'Mes bons' },
    ],
  },
];

const directionNavGroups: readonly NavGroup[] = [
  {
    title: 'Pilotage',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Tableau de bord' },
      { to: '/inventaire', icon: Boxes, label: 'Inventaire' },
    ],
  },
];

const NAV_GROUPS_BY_VIEW: Readonly<Record<UiView, readonly NavGroup[]>> = {
  administrateur: adminNavGroups,
  technicien: technicienNavGroups,
  direction: directionNavGroups,
  collaborateur: collaboratorNavGroups,
};

/** Injecte le badge de contestations ouvertes sur l'entrée correspondante,
 *  sans muter les groupes de base (immutabilité). */
function withContestationsBadge(groups: readonly NavGroup[], openCount: number | null): readonly NavGroup[] {
  if (openCount === null) return groups;
  return groups.map((group) => ({
    ...group,
    items: group.items.map((item) =>
      item.to === '/admin/contestations' ? { ...item, badge: openCount } : item,
    ),
  }));
}

/** Menu d'une vue. Le badge des contestations ouvertes ne concerne que les vues IT. */
export function navGroupsFor(view: UiView, openContestationsCount: number | null): readonly NavGroup[] {
  const groups = NAV_GROUPS_BY_VIEW[view];
  return view === 'administrateur' || view === 'technicien'
    ? withContestationsBadge(groups, openContestationsCount)
    : groups;
}

/** Vrai quand l'entrée correspond à l'adresse (la page elle-même ou une sous-page). */
export function isNavItemActive(to: string, pathname: string): boolean {
  return pathname === to || pathname.startsWith(`${to}/`);
}
