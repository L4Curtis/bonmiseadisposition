import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { FileText, Clock, CheckCircle2, Archive, ExternalLink, AlertOctagon, X } from 'lucide-react';
import { BON_STATUS_LABELS, BON_STATUS_COLORS, type BonStatus } from '@/types';

interface SignatureInfo {
  id: string;
  type: string;
  signed: boolean;
  token: string;
  tokenExpiresAt: string;
}

interface BonCollab {
  id: string;
  reference: string;
  status: BonStatus;
  civilite: string;
  dateMiseDisposition: string;
  dateRestitution?: string;
  filiale: { displayName: string };
  equipments: { id: string }[];
  signatures: SignatureInfo[];
}

function formatDate(d: string | null | undefined) {
  if (!d) return 'impossible';
  return new Date(d).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
}

// ─── Modal de contestation ──────────────────────────────────────────────────

function ContestationModal({
  bon,
  onClose,
  onSuccess,
}: {
  bon: BonCollab;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!message.trim()) { setError('Le motif est obligatoire'); return; }
    if (message.trim().length < 10) { setError('Veuillez détailler le motif (au moins 10 caractères)'); return; }
    setLoading(true);
    setError('');
    try {
      await api.post(`/bons/${bon.id}/contestation`, { message: message.trim() });
      onSuccess();
    } catch (e: any) {
      setError(e?.message ?? 'Erreur lors de la contestation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-2">
            <AlertOctagon className="h-5 w-5 text-red-500" />
            <h2 className="font-semibold text-slate-900">Contester le bon {bon.reference}</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-600">
            Décrivez le motif de votre contestation. Le service IT sera notifié et vous répondra dans les meilleurs délais.
          </p>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Motif de contestation</label>
            <textarea
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400 resize-none"
              rows={5}
              placeholder="Ex: Les équipements listés ne correspondent pas à ce que j'ai reçu..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={1000}
            />
            <p className="text-xs text-slate-400 text-right mt-1">{message.length}/1000</p>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex gap-2 justify-end border-t px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? 'Envoi...' : 'Envoyer la contestation'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page principale ────────────────────────────────────────────────────────

export function PortailCollaborateur() {
  const [bons, setBons] = useState<BonCollab[]>([]);
  const [loading, setLoading] = useState(true);
  const [contestingBon, setContestingBon] = useState<BonCollab | null>(null);
  const [successMsg, setSuccessMsg] = useState('');

  const reload = () => {
    setLoading(true);
    api.get<BonCollab[]>('/bons/mes-bons').then(setBons).catch(() => setBons([])).finally(() => setLoading(false));
  };

  useEffect(() => { reload(); }, []);

  const handleContestationSuccess = () => {
    setContestingBon(null);
    setSuccessMsg('Votre contestation a bien été envoyée. Le service IT va la traiter.');
    reload();
    setTimeout(() => setSuccessMsg(''), 6000);
  };

  if (loading) return <div className='flex justify-center py-16'><div className='h-7 w-7 animate-spin rounded-full border-4 border-blue-600 border-t-transparent' /></div>;

  const pending = bons.filter((b) => ['sent_mise_dispo', 'sent_restitution'].includes(b.status));
  const active = bons.filter((b) => b.status === 'active');
  const contested = bons.filter((b) => b.status === 'contested');
  const others = bons.filter((b) => !['sent_mise_dispo', 'sent_restitution', 'active', 'contested'].includes(b.status));

  return (
    <div className='space-y-6 max-w-3xl'>
      <h1 className='text-2xl font-bold text-slate-900'>Mes équipements</h1>

      {successMsg && (
        <div className='rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800 flex items-center gap-2'>
          <CheckCircle2 className='h-4 w-4 shrink-0' />
          {successMsg}
        </div>
      )}

      {bons.length === 0 ? (
        <div className='rounded-xl border bg-white shadow-sm'>
          <div className='flex flex-col items-center justify-center gap-3 p-12 text-center'>
            <FileText className='h-12 w-12 text-slate-300' />
            <p className='text-slate-500'>Vous n'avez aucun bon pour le moment.</p>
          </div>
        </div>
      ) : (
        <>
          {/* À signer */}
          {pending.length > 0 && (
            <section>
              <h2 className='text-sm font-semibold text-orange-600 uppercase tracking-wider mb-3 flex items-center gap-1.5'>
                <Clock className='h-3.5 w-3.5' /> À signer ({pending.length})
              </h2>
              <div className='space-y-3'>{pending.map((bon) => {
                const pendingSig = bon.signatures?.find((s) => !s.signed);
                const sigType = bon.status === 'sent_restitution' ? 'restitution' : 'mise à disposition';
                return (
                  <div key={bon.id} className='rounded-xl bg-orange-50 border border-orange-200 p-4 space-y-3'>
                    <div className='flex items-center gap-2'>
                      <span className='font-mono text-sm font-semibold text-slate-800'>{bon.reference}</span>
                      <span className={'inline-flex rounded-full px-2 py-0.5 text-xs font-medium ' + BON_STATUS_COLORS[bon.status]}>{BON_STATUS_LABELS[bon.status]}</span>
                    </div>
                    <p className='text-sm text-orange-700'>Bon de <strong>{sigType}</strong> en attente de signature.</p>
                    {pendingSig
                      ? <a href={'/signer/' + pendingSig.token} className='inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 transition-colors'><ExternalLink className='h-3.5 w-3.5' /> Signer maintenant</a>
                      : <span className='text-xs text-slate-400'>Lien non disponible — contactez le service IT</span>
                    }
                  </div>
                );
              })}</div>
            </section>
          )}

          {/* Actifs */}
          {active.length > 0 && (
            <section>
              <h2 className='text-sm font-semibold text-green-700 uppercase tracking-wider mb-3 flex items-center gap-1.5'>
                <CheckCircle2 className='h-3.5 w-3.5' /> En cours ({active.length})
              </h2>
              <div className='space-y-2'>{active.map((bon) => (
                <div key={bon.id} className='rounded-xl bg-white border border-slate-200 shadow-sm p-4'>
                  <div className='flex items-start justify-between gap-2'>
                    <div>
                      <span className='font-mono text-sm font-semibold text-slate-800'>{bon.reference}</span>
                      <p className='text-xs text-slate-500 mt-0.5'>{bon.filiale.displayName}</p>
                      <p className='text-xs text-slate-500'>Depuis le {formatDate(bon.dateMiseDisposition)}</p>
                    </div>
                    <div className='flex flex-col items-end gap-2'>
                      <span className={'inline-flex rounded-full px-2 py-0.5 text-xs font-medium ' + BON_STATUS_COLORS[bon.status]}>{BON_STATUS_LABELS[bon.status]}</span>
                      <button
                        onClick={() => setContestingBon(bon)}
                        className='inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors'
                      >
                        <AlertOctagon className='h-3.5 w-3.5' /> Contester
                      </button>
                    </div>
                  </div>
                </div>
              ))}</div>
            </section>
          )}

          {/* Contestés */}
          {contested.length > 0 && (
            <section>
              <h2 className='text-sm font-semibold text-red-700 uppercase tracking-wider mb-3 flex items-center gap-1.5'>
                <AlertOctagon className='h-3.5 w-3.5' /> En contestation ({contested.length})
              </h2>
              <div className='space-y-2'>{contested.map((bon) => (
                <div key={bon.id} className='rounded-xl bg-red-50 border border-red-200 p-4'>
                  <div className='flex items-start justify-between'>
                    <div>
                      <span className='font-mono text-sm font-semibold text-slate-800'>{bon.reference}</span>
                      <p className='text-xs text-slate-500 mt-0.5'>{bon.filiale.displayName}</p>
                    </div>
                    <span className={'inline-flex rounded-full px-2 py-0.5 text-xs font-medium ' + BON_STATUS_COLORS[bon.status]}>{BON_STATUS_LABELS[bon.status]}</span>
                  </div>
                  <p className='text-xs text-red-600 mt-2'>Contestation en cours d'examen par le service IT.</p>
                </div>
              ))}</div>
            </section>
          )}

          {/* Historique */}
          {others.length > 0 && (
            <section>
              <h2 className='text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5'>
                <Archive className='h-3.5 w-3.5' /> Historique ({others.length})
              </h2>
              <div className='rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden'>
                <table className='w-full text-sm'>
                  <thead className='bg-slate-50 border-b'>
                    <tr>
                      <th className='px-4 py-2.5 text-left font-medium text-slate-600'>Référence</th>
                      <th className='px-4 py-2.5 text-left font-medium text-slate-600'>Filiale</th>
                      <th className='px-4 py-2.5 text-left font-medium text-slate-600'>Statut</th>
                      <th className='px-4 py-2.5 text-left font-medium text-slate-600'>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {others.map((bon) => (
                      <tr key={bon.id} className='border-b last:border-0 hover:bg-slate-50'>
                        <td className='px-4 py-2.5 font-mono text-xs font-semibold'>{bon.reference}</td>
                        <td className='px-4 py-2.5 text-slate-500'>{bon.filiale.displayName}</td>
                        <td className='px-4 py-2.5'><span className={'inline-flex rounded-full px-2 py-0.5 text-xs font-medium ' + BON_STATUS_COLORS[bon.status]}>{BON_STATUS_LABELS[bon.status]}</span></td>
                        <td className='px-4 py-2.5 text-slate-500 text-xs'>{formatDate(bon.dateMiseDisposition)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      {contestingBon && (
        <ContestationModal
          bon={contestingBon}
          onClose={() => setContestingBon(null)}
          onSuccess={handleContestationSuccess}
        />
      )}
    </div>
  );
}
