import { useMemo, useState } from 'react';
import type { TemplateDefinition } from './types';

interface UseEmailTemplateFiltersResult {
  searchInput: string;
  setSearchInput: (value: string) => void;
  categoryFilter: string;
  setCategoryFilter: (value: string) => void;
  recipientFilter: string;
  setRecipientFilter: (value: string) => void;
  recipients: string[];
  filteredTemplates: TemplateDefinition[];
  hasActiveFilters: boolean;
  resetFilters: () => void;
}

/** Recherche (titre, description) et filtres par catégorie / destinataire pour
 *  la liste des templates email — onze modèles au total, tout se fait donc
 *  côté client, sans anti-rebond ni pagination (voir useCatalogueFilters pour
 *  le même besoin à plus grande échelle). */
export function useEmailTemplateFilters(templates: TemplateDefinition[]): UseEmailTemplateFiltersResult {
  const [searchInput, setSearchInput] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [recipientFilter, setRecipientFilter] = useState('');

  const recipients = useMemo(
    () => [...new Set(templates.map((tpl) => tpl.recipient))].sort((a, b) => a.localeCompare(b)),
    [templates],
  );

  const filteredTemplates = useMemo(() => {
    const search = searchInput.trim().toLowerCase();
    return templates.filter((tpl) => {
      if (categoryFilter && tpl.category !== categoryFilter) return false;
      if (recipientFilter && tpl.recipient !== recipientFilter) return false;
      if (search) {
        const haystack = `${tpl.name} ${tpl.description}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
  }, [templates, searchInput, categoryFilter, recipientFilter]);

  const hasActiveFilters = !!(searchInput || categoryFilter || recipientFilter);
  const resetFilters = (): void => {
    setSearchInput('');
    setCategoryFilter('');
    setRecipientFilter('');
  };

  return {
    searchInput, setSearchInput,
    categoryFilter, setCategoryFilter,
    recipientFilter, setRecipientFilter,
    recipients,
    filteredTemplates,
    hasActiveFilters,
    resetFilters,
  };
}
