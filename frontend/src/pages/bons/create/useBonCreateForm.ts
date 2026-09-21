import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { api } from '@/lib/api';
import { todayInParis } from '@/lib/kpi-period';
import { useBonCreateReferenceData } from './useBonCreateReferenceData';
import { useBonFormSnapshot } from './useBonFormSnapshot';
import { useLiveSerialConflicts } from './useLiveSerialConflicts';
import { runBonValidation } from './lib/validation';
import { buildBonPayload } from './lib/payload';
import {
  duplicateLine, distributeSerialsFromLine, findDuplicateSerialIds, isNonEmptyLine, splitPastedSerials,
} from './lib/equipmentLines';
import { mapDuplicableEquipments } from './lib/duplicateBon';
import { clearDraft, isMeaningfulDraft, readDraft, writeDraft } from './lib/draftStorage';
import { newLine } from './types';
import type { BonDraftData } from './lib/draftStorage';
import type { DuplicableBon } from './lib/duplicateBon';
import type { CatalogItem, EditableBon, EquipmentLine, Pack, SerialConflict, SerialConflictsResponse, UserResult } from './types';

/** État du formulaire de création/édition d'un bon, sa validation et sa
 *  soumission. Regroupe aussi le chargement des données de référence, le
 *  brouillon local de création (voir lib/draftStorage) et, en mode édition,
 *  le pré-remplissage depuis le brouillon existant côté serveur. */
export function useBonCreateForm() {
  const navigate = useNavigate();
  // Présence d'un :id dans l'URL = édition d'un brouillon existant
  const { id: editBonId } = useParams<{ id: string }>();
  const isEditing = !!editBonId;
  const [searchParams, setSearchParams] = useSearchParams();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [editReference, setEditReference] = useState('');
  const [serialConflicts, setSerialConflicts] = useState<SerialConflict[] | null>(null);

  // Brouillon local (localStorage) — jamais en édition, lu une seule fois au
  // montage (initialiseur paresseux de useState : pas de lecture
  // localStorage/JSON.parse à chaque rendu).
  const [initialDraft] = useState<BonDraftData | null>(() => (isEditing ? null : readDraft()));
  const [restoredFromDraft, setRestoredFromDraft] = useState(
    () => !isEditing && !!initialDraft && isMeaningfulDraft(initialDraft),
  );

  // Form state — pré-rempli depuis le brouillon local restauré s'il y en a
  // un ; sinon valeurs par défaut (date du jour côté Paris en création — voir
  // todayInParis, jamais toISOString() qui décale la date en soirée).
  const [collaborateurState, setCollaborateurState] = useState<UserResult | null>(
    () => (restoredFromDraft && initialDraft ? initialDraft.collaborateur : null),
  );
  const [filialeIdState, setFilialeIdState] = useState(
    () => (restoredFromDraft && initialDraft ? initialDraft.filialeId : ''),
  );
  const [civilite, setCivilite] = useState<'mme' | 'mr'>(
    () => (restoredFromDraft && initialDraft ? initialDraft.civilite : 'mr'),
  );
  const [dateMiseDisposition, setDateMiseDisposition] = useState(() => {
    if (restoredFromDraft && initialDraft?.dateMiseDisposition) return initialDraft.dateMiseDisposition;
    return isEditing ? '' : todayInParis();
  });
  const [dateRestitution, setDateRestitution] = useState(
    () => (restoredFromDraft && initialDraft ? initialDraft.dateRestitution : ''),
  );
  const [notes, setNotes] = useState(() => (restoredFromDraft && initialDraft ? initialDraft.notes : ''));
  const [equipments, setEquipments] = useState<EquipmentLine[]>(() => {
    if (restoredFromDraft && initialDraft && initialDraft.equipments.length > 0) return initialDraft.equipments;
    return [newLine()];
  });

  // Filiale déjà choisie (manuellement, ou déjà pré-remplie une première
  // fois) : ne plus l'écraser depuis un futur changement de collaborateur.
  const filialeTouchedRef = useRef(restoredFromDraft && !!filialeIdState);

  const setFilialeId = (value: string) => {
    filialeTouchedRef.current = true;
    setFilialeIdState(value);
  };

  /** Sélection d'un collaborateur (autocomplétion ou création manuelle) :
   *  pré-remplit sa filiale — connue de l'annuaire — si l'utilisateur n'a pas
   *  déjà fait son propre choix. Ne s'applique jamais au chargement d'un
   *  brouillon existant côté serveur (voir setCollaborateurState ci-dessous,
   *  utilisé directement par l'effet de pré-remplissage en édition). */
  const setCollaborateur = (user: UserResult | null) => {
    setCollaborateurState(user);
    if (user?.filialeId && !filialeTouchedRef.current) {
      setFilialeIdState(user.filialeId);
    }
  };

  const { filiales, allCatalogItems, packs, initError, retryInit } = useBonCreateReferenceData();

  // Garde « modifications non enregistrées » : voir useBonFormSnapshot.ts.
  const { snapshot, loaded, setLoaded, confirmLeave: confirmLeaveGuard, dirty } = useBonFormSnapshot({
    collaborateur: collaborateurState, filialeId: filialeIdState, civilite, dateMiseDisposition, dateRestitution, notes, equipments,
    initiallyLoaded: !editBonId,
    submitting,
  });

  /** Quitter la page volontairement (bouton Annuler / retour) : si l'abandon
   *  de modifications réelles vient d'être confirmé explicitement, le
   *  brouillon local n'a plus de raison d'être conservé pour la prochaine
   *  visite — comportement voulu, voir CHANGELOG. Un simple retour sans
   *  rien avoir changé (dirty=false) ne touche en revanche jamais au
   *  brouillon restauré : rien n'a prévenu l'utilisateur qu'il serait perdu. */
  const confirmLeave = () => {
    const wasDirty = dirty;
    const canLeave = confirmLeaveGuard();
    if (canLeave && wasDirty && !isEditing) clearDraft();
    return canLeave;
  };

  // Le panneau de conflits de numéro de série ne reflète que l'état du
  // formulaire au moment de la vérification : toute modification ultérieure
  // doit le fermer (sinon on pourrait soumettre en croyant l'avertissement
  // encore valable pour les valeurs actuelles).
  useEffect(() => {
    setSerialConflicts(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot]);

  // Conserve la saisie en cours (création uniquement) — restaurée à la
  // prochaine ouverture si elle survit encore (voir lib/draftStorage). Un
  // brouillon devenu vide (tout effacé) est retiré plutôt que persisté.
  useEffect(() => {
    if (isEditing) return;
    const data: BonDraftData = {
      collaborateur: collaborateurState, filialeId: filialeIdState, civilite, dateMiseDisposition, dateRestitution, notes, equipments,
    };
    if (isMeaningfulDraft(data)) writeDraft(data); else clearDraft();
  }, [isEditing, collaborateurState, filialeIdState, civilite, dateMiseDisposition, dateRestitution, notes, equipments]);

  /** « Repartir de zéro » depuis le bandeau de brouillon restauré : revient
   *  aux valeurs par défaut et efface le brouillon local. */
  const discardRestoredDraft = () => {
    clearDraft();
    filialeTouchedRef.current = false;
    setCollaborateurState(null);
    setFilialeIdState('');
    setCivilite('mr');
    setDateMiseDisposition(todayInParis());
    setDateRestitution('');
    setNotes('');
    setEquipments([newLine()]);
    setRestoredFromDraft(false);
  };

  // Mode édition : pré-remplir le formulaire depuis le brouillon existant
  useEffect(() => {
    if (!editBonId) return;
    api.get<EditableBon>(`/bons/${editBonId}`)
      .then((bon) => {
        if (bon.status !== 'draft') {
          navigate(`/bons/${editBonId}`, { replace: true });
          return;
        }
        setEditReference(bon.reference);
        setCollaborateurState(bon.collaborateur);
        setFilialeIdState(bon.filialeId);
        setCivilite(bon.civilite);
        setDateMiseDisposition(String(bon.dateMiseDisposition).slice(0, 10));
        setDateRestitution(bon.dateRestitution ? String(bon.dateRestitution).slice(0, 10) : '');
        setNotes(bon.notes ?? '');
        setEquipments(
          bon.equipments.length > 0
            ? bon.equipments.map((e) =>
                newLine({
                  catalogItemId: e.catalogItem?.id,
                  catalogItemLabel: e.catalogItem ? `${e.catalogItem.brand} ${e.catalogItem.model}` : undefined,
                  customLabel: e.customLabel ?? undefined,
                  serialNumber: e.serialNumber ?? undefined,
                  inventoryNumber: e.inventoryNumber ?? undefined,
                  notes: e.notes ?? undefined,
                }),
              )
            : [newLine()],
        );
        setLoaded(true);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error && e.message ? e.message : 'Impossible de charger le brouillon');
      });
  }, [editBonId, navigate]);

  const addFromCatalog = (item: CatalogItem) => {
    setEquipments((prev) => [
      ...prev,
      newLine({ catalogItemId: item.id, catalogItemLabel: `${item.brand} ${item.model}` }),
    ]);
  };

  const addEmptyLine = () => setEquipments((prev) => [...prev, newLine()]);

  const addFromPack = (pack: Pack) => {
    const lines = pack.items.flatMap((pi) =>
      Array.from({ length: pi.quantity }, () =>
        newLine({
          catalogItemId: pi.catalogItem.id,
          catalogItemLabel: `${pi.catalogItem.brand} ${pi.catalogItem.model}`,
        }),
      ),
    );
    setEquipments((prev) => {
      // Ne retirer que les lignes totalement vides : une ligne avec un numéro
      // de série ou des notes saisis ne doit pas être perdue par l'import
      const filtered = prev.filter(isNonEmptyLine);
      return [...filtered, ...lines];
    });
  };

  /** « Repartir d'un bon existant » (bouton dans la section Équipements, ou
   *  ?duplicateFrom=<id> en arrivant sur la page — voir l'effet plus bas) :
   *  reprend uniquement les équipements, jamais le collaborateur, les dates
   *  ou les numéros de série/inventaire (propres à un exemplaire). */
  const importDuplicatedEquipments = (lines: EquipmentLine[]) => {
    if (lines.length === 0) return;
    setEquipments((prev) => {
      const filtered = prev.filter(isNonEmptyLine);
      return [...filtered, ...lines];
    });
  };

  // Entrée directe depuis un lien externe (ex. futur bouton sur la fiche
  // d'un bon) : /bons/new?duplicateFrom=<id>. Une seule fois à l'ouverture ;
  // le paramètre est retiré de l'URL une fois traité.
  useEffect(() => {
    if (isEditing) return;
    const duplicateFromId = searchParams.get('duplicateFrom');
    if (!duplicateFromId) return;
    api.get<DuplicableBon>(`/bons/${duplicateFromId}`)
      .then((bon) => importDuplicatedEquipments(mapDuplicableEquipments(bon.equipments)))
      .catch(() => setError('Impossible de charger le bon à dupliquer.'))
      .finally(() => {
        const next = new URLSearchParams(searchParams);
        next.delete('duplicateFrom');
        setSearchParams(next, { replace: true });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { checkSerial: checkSerialConflict, forgetLine: forgetSerialConflictLine, conflictsByLineId: liveSerialConflicts } =
    useLiveSerialConflicts(equipments, editBonId);

  const removeEquipment = (id: string) => {
    setEquipments((prev) => prev.filter((e) => e._id !== id));
    forgetSerialConflictLine(id);
  };

  const updateEquipment = (id: string, field: keyof EquipmentLine, value: string) => {
    setEquipments((prev) => prev.map((e) => (e._id === id ? { ...e, [field]: value } : e)));
  };

  /** Copie une ligne (même article, numéro de série/inventaire vides) juste
   *  après elle — pour saisir vite plusieurs unités identiques. */
  const duplicateEquipment = (id: string) => {
    setEquipments((prev) => duplicateLine(prev, id));
  };

  /** Collage multi-lignes dans un champ de numéro de série (retours à la
   *  ligne ou tabulations, typiquement depuis Excel) : une valeur par ligne
   *  d'équipement à partir de la ligne courante, en créant les lignes
   *  manquantes pour le même article. */
  const pasteSerial = (id: string, text: string) => {
    const values = splitPastedSerials(text);
    if (values.length === 0) return;
    setEquipments((prev) => distributeSerialsFromLine(prev, id, values));
  };

  // Doublons de numéro de série DANS le formulaire courant, pour un signal
  // visuel immédiat pendant la saisie (la validation bloquante à l'envoi
  // reste par ailleurs inchangée — voir lib/validation.ts).
  const duplicateSerialIds = useMemo(() => findDuplicateSerialIds(equipments), [equipments]);

  const runValidation = () => runBonValidation({
    collaborateurId: collaborateurState?.id ?? '',
    filialeId: filialeIdState,
    civilite,
    dateMiseDisposition,
    dateRestitution,
    equipments,
  });

  /** Envoi effectif (création ou mise à jour du brouillon) — `submitting` est
   *  géré par l'appelant. Revalide systématiquement : cette fonction est aussi
   *  le point d'entrée du bouton « Créer/Enregistrer quand même ». */
  const performSubmit = async () => {
    const validation = runValidation();
    if (!validation.success) {
      setError(validation.error);
      return;
    }
    if (!collaborateurState) {
      setError('Sélectionnez un collaborateur');
      return;
    }
    const { validEquipments } = validation;
    try {
      const payload = buildBonPayload({
        filialeId: filialeIdState,
        collaborateurId: collaborateurState.id,
        civilite,
        dateMiseDisposition,
        dateRestitution,
        notes,
        validEquipments,
        isEditing,
      });
      if (isEditing) {
        await api.put(`/bons/${editBonId}`, payload);
        navigate(`/bons/${editBonId}`);
      } else {
        const bon = await api.post<{ id: string }>('/bons', payload);
        // Le bon est créé : le brouillon local n'a plus lieu d'être.
        clearDraft();
        navigate(`/bons/${bon.id}`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : isEditing ? 'Erreur lors de la modification' : 'Erreur lors de la création');
    }
  };

  /** Confirmation explicite malgré les doublons de numéros de série. */
  const confirmDespiteConflicts = async () => {
    if (submitting) return;
    setSubmitting(true);
    setSerialConflicts(null);
    setError('');
    try {
      await performSubmit();
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // `submitting` couvre AUSSI l'aller-retour serial-conflicts : sans ce garde,
    // un double-clic pendant la vérification créerait deux bons
    if (submitting) return;
    setSubmitting(true);
    setSerialConflicts(null);
    setError('');
    try {
      const validation = runValidation();
      if (!validation.success) {
        setError(validation.error);
        return;
      }
      const { validEquipments } = validation;

      // Alerte doublon (non bloquante) : numéros de série déjà en circulation
      // sur un autre bon — l'IT confirme en connaissance de cause
      const serials = validEquipments.map((e) => e.serialNumber?.trim()).filter(Boolean) as string[];
      if (serials.length > 0) {
        try {
          const params = new URLSearchParams({ serials: serials.join(',') });
          if (isEditing) params.set('excludeBonId', editBonId!);
          const { items } = await api.get<SerialConflictsResponse>(`/equipment/serial-conflicts?${params}`);
          if (items.length > 0) {
            setSerialConflicts(items);
            return;
          }
        } catch { /* la vérification de doublons ne doit pas bloquer la création */ }
      }

      await performSubmit();
    } finally {
      setSubmitting(false);
    }
  };

  // Le panneau de conflits est en haut d'un long formulaire alors que le bouton
  // de soumission est en bas : le faire défiler dans le viewport
  const conflictsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (serialConflicts && serialConflicts.length > 0) {
      conflictsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [serialConflicts]);

  return {
    navigate,
    editBonId,
    isEditing,
    submitting,
    error,
    editReference,
    serialConflicts,
    setSerialConflicts,
    collaborateur: collaborateurState,
    setCollaborateur,
    filialeId: filialeIdState,
    setFilialeId,
    civilite,
    setCivilite,
    dateMiseDisposition,
    setDateMiseDisposition,
    dateRestitution,
    setDateRestitution,
    notes,
    setNotes,
    equipments,
    filiales,
    allCatalogItems,
    packs,
    initError,
    retryInit,
    confirmLeave,
    addFromCatalog,
    addFromPack,
    addEmptyLine,
    removeEquipment,
    updateEquipment,
    duplicateEquipment,
    pasteSerial,
    duplicateSerialIds,
    confirmDespiteConflicts,
    handleSubmit,
    conflictsRef,
    // C6 — avertissement de doublon de numéro de série au fil de la saisie
    liveSerialConflicts,
    checkSerialConflict,
    // C3 — repartir d'un bon existant
    importDuplicatedEquipments,
    // C5 — brouillon local restauré
    restoredFromDraft,
    discardRestoredDraft,
    dismissRestoredNotice: () => setRestoredFromDraft(false),
  };
}
