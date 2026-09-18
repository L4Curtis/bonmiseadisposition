import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { showActionError } from '@/lib/errors';
import { toast } from '@/hooks/use-toast';
import type { PdfTemplateConfig, PdfTemplateVariable } from './types';

interface UseTemplateConfigResult {
  config: PdfTemplateConfig | null;
  variables: PdfTemplateVariable[];
  loading: boolean;
  saving: boolean;
  openSections: Set<string>;
  toggleSection: (key: string) => void;
  updateField: (section: string, key: string, value: unknown) => void;
  handleSave: () => Promise<void>;
  copyVariable: (name: string) => Promise<void>;
}

/** Chargement + édition de la configuration d'un modèle PDF (utilisé par la
 *  boîte de dialogue d'édition, seulement quand elle est ouverte). */
export function useTemplateConfig(
  templateId: string | null,
  open: boolean,
  onSaved: () => void,
  onClose: () => void,
): UseTemplateConfigResult {
  const [config, setConfig] = useState<PdfTemplateConfig | null>(null);
  const [variables, setVariables] = useState<PdfTemplateVariable[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['colors']));

  useEffect(() => {
    if (!open || !templateId) { setConfig(null); setVariables([]); return; }
    let cancelled = false;
    setLoading(true);
    api.get<{ config: PdfTemplateConfig; variables: PdfTemplateVariable[] }>(
      `/admin/pdf-templates/${templateId}/config`,
    )
      .then((data) => {
        if (cancelled) return;
        setConfig(data.config);
        setVariables(data.variables);
      })
      .catch(() => {
        if (cancelled) return;
        toast({ title: 'Erreur', description: 'Impossible de charger la configuration', variant: 'destructive' });
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, templateId]);

  const toggleSection = useCallback((key: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const updateField = useCallback((section: string, key: string, value: unknown) => {
    setConfig((prev) => {
      if (!prev) return prev;
      const sectionData = { ...(prev[section as keyof PdfTemplateConfig] as Record<string, unknown>) };
      sectionData[key] = value;
      return { ...prev, [section]: sectionData };
    });
  }, []);

  const handleSave = async () => {
    if (!templateId || !config) return;
    setSaving(true);
    try {
      await api.patch(`/admin/pdf-templates/${templateId}`, config);
      toast({ title: 'Modèle mis à jour' });
      onSaved();
      onClose();
    } catch {
      toast({ title: 'Erreur', description: 'Échec de la sauvegarde', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const copyVariable = async (name: string) => {
    try {
      await navigator.clipboard.writeText(`{{${name}}}`);
      toast({ title: `{{${name}}} copié` });
    } catch (e: unknown) {
      showActionError(e, 'Impossible de copier dans le presse-papier');
    }
  };

  return {
    config, variables, loading, saving, openSections,
    toggleSection, updateField, handleSave, copyVariable,
  };
}
