import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Image as ImageIcon, Loader2, Paperclip, Upload } from 'lucide-react';
import type { BonStatus } from '@/contracts/common';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { formatDateLong } from '@/lib/dates';
import { toast } from '@/hooks/use-toast';
import { loadBlobIntoTab, POPUP_BLOCKED_MESSAGE } from '@/pages/signature/lib/documentBlob';

/** Pièce jointe telle que la renvoie GET /bons/:id/attachments. */
interface Attachment {
  id: string;
  stage: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

/** Même plafond et mêmes types que le serveur (attachments.service.ts) :
 *  refuser tout de suite plutôt qu'après un envoi long sur réseau mobile. */
const MAX_BYTES = 10 * 1024 * 1024;
/** Limiter les types pousse aussi l'iPhone à convertir ses photos HEIC en JPEG. */
const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp,application/pdf';

/** Étape d'une pièce jointe ajoutée par le collaborateur, déduite du bon.
 *  Le serveur n'accepte d'ajout que pendant une période de signature (remise
 *  ou restitution à signer, restitution en cours) : ailleurs, `null`, aucun
 *  bouton. On ne lui demande jamais de choisir l'étape (R-093). */
export function collaboratorAttachmentStage(status: BonStatus): 'mise_disposition' | 'restitution' | null {
  if (status === 'sent_mise_dispo') return 'mise_disposition';
  if (status === 'sent_restitution' || status === 'partially_returned') return 'restitution';
  return null;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

function useAttachments(bonId: string) {
  const [items, setItems] = useState<Attachment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const reload = useCallback(() => {
    api
      .getList<Attachment>(`/bons/${bonId}/attachments`)
      .then((list) => setItems(list.items))
      .catch(() => setItems([]))
      .finally(() => setLoaded(true));
  }, [bonId]);
  useEffect(reload, [reload]);
  return { items, loaded, reload };
}

async function openAttachment(bonId: string, attachment: Attachment): Promise<void> {
  const win = window.open('', '_blank');
  if (!win) {
    toast({ title: 'Pièce jointe non ouverte', description: POPUP_BLOCKED_MESSAGE, variant: 'destructive' });
    return;
  }
  win.opener = null;
  const error = await loadBlobIntoTab(win, () => api.getBlob(`/bons/${bonId}/attachments/${attachment.id}`));
  if (error) toast({ title: 'Pièce jointe non ouverte', description: error, variant: 'destructive' });
}

function AttachmentRow({ bonId, attachment }: { bonId: string; attachment: Attachment }) {
  const Icon = attachment.mimeType.startsWith('image/') ? ImageIcon : FileText;
  return (
    <li>
      <button
        type="button"
        onClick={() => void openAttachment(bonId, attachment)}
        className="w-full min-h-11 flex items-center gap-3 rounded-xl border bg-card px-4 py-2 text-left text-sm shadow-sm hover:bg-muted/40"
      >
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0">
          <span className="sr-only">Ouvrir </span>
          <span className="block font-medium [overflow-wrap:anywhere]">{attachment.filename}</span>
          <span className="block text-xs text-muted-foreground">
            {formatSize(attachment.size)} · ajoutée le {formatDateLong(attachment.createdAt)}
          </span>
        </span>
      </button>
    </li>
  );
}

interface AddButtonProps {
  bonId: string;
  stage: string;
  onAdded: () => void;
}

/** Bouton pleine largeur de 44 px qui ouvre le sélecteur du téléphone
 *  (appareil photo ou fichiers). */
function AddAttachmentButton({ bonId, stage, onAdded }: AddButtonProps) {
  const input = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState(false);

  const send = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast({ title: 'Fichier trop lourd', description: 'Une pièce jointe ne dépasse pas 10 Mo.', variant: 'destructive' });
      return;
    }
    const form = new FormData();
    form.append('file', file);
    form.append('stage', stage);
    setSending(true);
    try {
      await api.postForm(`/bons/${bonId}/attachments`, form);
      toast({ title: 'Pièce jointe ajoutée', variant: 'success' });
      onAdded();
    } catch (e: unknown) {
      toast({ title: 'Pièce jointe non ajoutée', description: errorMessage(e, "L'envoi a échoué."), variant: 'destructive' });
    } finally {
      setSending(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <>
      <input
        ref={input}
        type="file"
        accept={ACCEPTED_TYPES}
        aria-label="Fichier à joindre"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => void send(e.target.files?.[0])}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={sending}
        className="w-full min-h-11 inline-flex items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 text-sm font-medium hover:bg-muted/40 disabled:opacity-60"
      >
        {sending ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
        {sending ? 'Envoi en cours…' : 'Ajouter une photo ou un PDF'}
      </button>
    </>
  );
}

interface CollabAttachmentsProps {
  bonId: string;
  status: BonStatus;
}

/** Pièces jointes du bon vues par son titulaire : consultables toujours,
 *  ajoutables seulement pendant une signature, sans choix d'étape (R-093).
 *  Rien ne s'affiche s'il n'y a ni pièce jointe ni ajout possible. */
export function CollabAttachments({ bonId, status }: CollabAttachmentsProps) {
  const { items, loaded, reload } = useAttachments(bonId);
  const stage = collaboratorAttachmentStage(status);
  if (!loaded || (items.length === 0 && !stage)) return null;
  return (
    <section aria-labelledby="pieces-jointes" className="space-y-2">
      <h2 id="pieces-jointes" className="flex items-center gap-2 font-semibold">
        <Paperclip className="h-4 w-4 text-muted-foreground" /> Pièces jointes ({items.length})
      </h2>
      {stage && (
        <p className="text-sm text-muted-foreground">
          Une rayure, un accessoire manquant ? Ajoutez une photo : l'équipe informatique la verra avec le bon.
        </p>
      )}
      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((attachment) => (
            <AttachmentRow key={attachment.id} bonId={bonId} attachment={attachment} />
          ))}
        </ul>
      )}
      {stage && <AddAttachmentButton bonId={bonId} stage={stage} onAdded={reload} />}
    </section>
  );
}
