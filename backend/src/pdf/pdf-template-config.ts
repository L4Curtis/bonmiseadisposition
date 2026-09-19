/**
 * Façade fine : le contenu vivait ici en un seul fichier (interfaces,
 * définitions de variables, configurations par défaut, utilitaires de
 * fusion/substitution, données d'aperçu). Il est désormais réparti par
 * responsabilité entre plusieurs modules `pdf-template-*.ts`, ré-exportés
 * tels quels ici : ce chemin et ces exports ne changent pas, aucun import
 * ailleurs dans le dépôt n'a besoin d'être modifié.
 */
export * from './pdf-template-types';
export * from './pdf-template-definitions';
export * from './pdf-template-defaults';
export * from './pdf-template-utils';
export * from './pdf-template-preview';
