import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { Paperclip, Upload, Trash2, FileText, Loader2, Download } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';

interface Attachment {
  id: string;
  stage: string;
  filename: string;
  mimeType: string;
  size: number;
  label: string | null;
  uploadedByEmail: string | null;
  createdAt: string;
}

const STAGE_LABELS: Record<string, string> = {
  mise_disposition: 'Mise à disposition',
  restitution: 'Restitution',
  pv_cloture: 'PV de clôture',
  general: 'Général',
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

export interface BonAttachmentsProps {
  readonly bonId: string;
  /** Affiche le bouton de suppression (admin / technicien). */
  readonly canManage: boolean;
  /** Étape proposée par défaut à l'upload (selon le statut du bon). */
  readonly defaultStage?: string;
}

export function BonAttachments({ bonId, canManage, defaultStage = 'general' }: BonAttachmentsProps) {
  const [items, setItems] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [stage, setStage] = useState(defaultStage);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    api
      .get<Attachment[]>(`/bons/${bonId}/attachments`)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [bonId]);

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: 'Fichier trop volumineux (max 10 Mo)', variant: 'destructive' });
      return;
    }
    const form = new FormData();
    form.append('file', file);
    form.append('stage', stage);
    setUploading(true);
    try {
      await api.postForm(`/bons/${bonId}/attachments`, form);
      toast({ title: 'Pièce jointe ajoutée', variant: 'success' });
      load();
    } catch (e: unknown) {
      toast({ title: e instanceof Error ? e.message : 'Échec de l’envoi', variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const remove = async (id: string) => {
    try {
      await api.delete(`/bons/${bonId}/attachments/${id}`);
      setItems((prev) => prev.filter((a) => a.id !== id));
    } catch {
      toast({ title: 'Suppression impossible', variant: 'destructive' });
    }
  };

  const href = (id: string) => `/api/bons/${bonId}/attachments/${id}`;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm flex items-center gap-2">
          <Paperclip className="h-4 w-4" /> Pièces jointes ({items.length})
        </CardTitle>
        <div className="flex items-center gap-2">
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs"
            aria-label="Étape de la pièce jointe"
          >
            {Object.entries(STAGE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf"
            className="hidden"
            onChange={(e) => onPick(e.target.files?.[0])}
          />
          <Button size="sm" variant="outline" disabled={uploading} onClick={() => fileInput.current?.click()}>
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> : <Upload className="h-3.5 w-3.5" />}
            Ajouter
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground/70 py-2">Chargement…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground/70 py-2">
            Aucune pièce jointe. Ajoutez une photo de l’état du matériel ou un justificatif (JPEG, PNG, WebP, PDF — max 10 Mo).
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {items.map((a) => {
              const isImage = a.mimeType.startsWith('image/');
              return (
                <div key={a.id} className="group relative rounded-lg border border-border overflow-hidden bg-muted/30">
                  <a href={href(a.id)} target="_blank" rel="noopener noreferrer" className="block">
                    {isImage ? (
                      <img
                        src={href(a.id)}
                        alt={a.label || a.filename}
                        loading="lazy"
                        className="h-28 w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-28 w-full items-center justify-center bg-muted/50">
                        <FileText className="h-10 w-10 text-muted-foreground/60" />
                      </div>
                    )}
                  </a>
                  <div className="p-2">
                    <p className="truncate text-xs font-medium text-foreground" title={a.filename}>{a.filename}</p>
                    <p className="text-[10px] text-muted-foreground/70">
                      {STAGE_LABELS[a.stage] ?? a.stage} · {formatSize(a.size)}
                    </p>
                    {a.label && <p className="truncate text-[10px] text-muted-foreground" title={a.label}>{a.label}</p>}
                    <p className="text-[10px] text-muted-foreground/50">{formatDateTime(a.createdAt)}</p>
                  </div>
                  <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <a
                      href={href(a.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-md bg-background/90 p-1 text-muted-foreground hover:text-foreground shadow"
                      title="Ouvrir / télécharger"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </a>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => remove(a.id)}
                        className="rounded-md bg-background/90 p-1 text-red-500 hover:text-red-600 shadow"
                        title="Supprimer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
