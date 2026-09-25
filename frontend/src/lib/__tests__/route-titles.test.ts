import { describe, it, expect } from 'vitest';
import { routeTitle } from '../route-titles';

describe('routeTitle — titre d’onglet déduit de l’adresse', () => {
  it.each([
    ['/dashboard', 'Tableau de bord'],
    ['/bons', 'Bons'],
    ['/bons/new', 'Nouveau bon'],
    ['/bons/abc/edit', 'Modifier le bon'],
    ['/bons/abc', 'Bon'],
    ['/inventaire', 'Inventaire'],
    ['/mes-bons', 'Mes équipements'],
    ['/mes-bons/abc', 'Mes équipements'],
    ['/admin/contestations', 'Contestations'],
    ['/admin/utilisateurs', 'Utilisateurs'],
    ['/admin/filiales', 'Filiales'],
    ['/admin/catalogue', 'Catalogue'],
    ['/admin/configuration/general', 'Configuration'],
    ['/admin/templates/email', "Modèles d'emails"],
    ['/admin/templates/pdf', 'Modèles PDF'],
    ['/admin/ldap-sync', 'Active Directory'],
    ['/admin/audit', "Journal d'audit"],
    ['/login', 'Connexion'],
  ])('%s → %s', (path, title) => {
    expect(routeTitle(path)).toBe(title);
  });

  it('historique d’un équipement : la référence décodée dans le titre', () => {
    expect(routeTitle('/materiel/SN%2F123')).toBe('Équipement SN/123');
  });

  it('référence mal encodée : titre générique plutôt qu’une erreur', () => {
    expect(routeTitle('/materiel/%E0%A4%A')).toBe('Équipement');
  });

  it('adresse inconnue : null (la page 404 donne son propre titre)', () => {
    expect(routeTitle('/nimporte')).toBeNull();
  });
});
