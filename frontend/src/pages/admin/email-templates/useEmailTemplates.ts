import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import type { TemplateDefinition } from './types';

interface UseEmailTemplatesResult {
  templates: TemplateDefinition[];
  loading: boolean;
  importing: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  fetchTemplates: () => Promise<void>;
  handleExport: () => Promise<void>;
  handleImport: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  previewTarget: TemplateDefinition | null;
  setPreviewTarget: (t: TemplateDefinition | null) => void;
  editTarget: TemplateDefinition | null;
  setEditTarget: (t: TemplateDefinition | null) => void;
  resetTarget: TemplateDefinition | null;
  setResetTarget: (t: TemplateDefinition | null) => void;
}

/** Chargement de la liste des templates email, export/import JSON et
 *  selection du template cible pour l'apercu / l'edition / la reinitialisation. */
export function useEmailTemplates(): UseEmailTemplatesResult {
  const [templates, setTemplates] = useState<TemplateDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [previewTarget, setPreviewTarget] = useState<TemplateDefinition | null>(null);
  const [editTarget, setEditTarget] = useState<TemplateDefinition | null>(null);
  const [resetTarget, setResetTarget] = useState<TemplateDefinition | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      const data = await api.get<TemplateDefinition[]>('/admin/email-templates');
      setTemplates(data);
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de charger les templates.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const handleExport = async () => {
    try {
      const data = await api.get<object>('/admin/email-templates/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `email-templates-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Export reussi' });
    } catch {
      toast({ title: 'Erreur', description: "Impossible d'exporter.", variant: 'destructive' });
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text) as { templates?: { id: string; html: string }[] };
      if (!Array.isArray(data?.templates)) {
        toast({ title: 'Erreur', description: 'Format JSON invalide', variant: 'destructive' });
        return;
      }
      const result = await api.post<{ imported: number; skipped: number }>('/admin/email-templates/import', data);
      toast({ title: `Import : ${result.imported} template(s) importe(s), ${result.skipped} ignore(s)` });
      await fetchTemplates();
    } catch {
      toast({ title: 'Erreur', description: "Echec de l'import", variant: 'destructive' });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return {
    templates, loading, importing, fileInputRef,
    fetchTemplates, handleExport, handleImport,
    previewTarget, setPreviewTarget,
    editTarget, setEditTarget,
    resetTarget, setResetTarget,
  };
}
