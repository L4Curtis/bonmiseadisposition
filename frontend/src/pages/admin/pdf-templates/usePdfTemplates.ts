import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import type { PdfTemplateDefinition } from './types';

interface UsePdfTemplatesResult {
  templates: PdfTemplateDefinition[];
  loading: boolean;
  importing: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  fetchTemplates: () => Promise<void>;
  handleExport: () => Promise<void>;
  handleImport: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  previewTarget: string | null;
  setPreviewTarget: (id: string | null) => void;
  editTarget: string | null;
  setEditTarget: (id: string | null) => void;
  resetTarget: string | null;
  setResetTarget: (id: string | null) => void;
}

/** Chargement de la liste des modeles PDF, export/import JSON et selection du
 *  modele cible pour l'apercu / l'edition / la reinitialisation. */
export function usePdfTemplates(): UsePdfTemplatesResult {
  const [templates, setTemplates] = useState<PdfTemplateDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [previewTarget, setPreviewTarget] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      const data = await api.get<PdfTemplateDefinition[]>('/admin/pdf-templates');
      setTemplates(data);
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de charger les modeles PDF', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const handleExport = async () => {
    try {
      const data = await api.get<{ exportedAt: string; templates: unknown[] }>('/admin/pdf-templates/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pdf-templates-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Export reussi' });
    } catch {
      toast({ title: 'Erreur', description: 'Echec de l\'export', variant: 'destructive' });
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text) as { templates?: { id: string; config: Record<string, unknown> }[] };
      if (!Array.isArray(data?.templates)) {
        toast({ title: 'Erreur', description: 'Format JSON invalide', variant: 'destructive' });
        return;
      }
      const result = await api.post<{ imported: number; skipped: number }>('/admin/pdf-templates/import', data);
      toast({ title: `Import : ${result.imported} modele(s) importe(s), ${result.skipped} ignore(s)` });
      await fetchTemplates();
    } catch {
      toast({ title: 'Erreur', description: 'Echec de l\'import', variant: 'destructive' });
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
