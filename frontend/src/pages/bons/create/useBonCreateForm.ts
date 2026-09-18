import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { useBonCreateReferenceData } from './useBonCreateReferenceData';
import { useBonFormSnapshot } from './useBonFormSnapshot';
import { runBonValidation } from './lib/validation';
import { buildBonPayload } from './lib/payload';
import { duplicateLine, distributeSerialsFromLine, findDuplicateSerialIds, splitPastedSerials } from './lib/equipmentLines';
import { newLine } from './types';
import type { CatalogItem, EditableBon, EquipmentLine, Pack, SerialConflict, UserResult } from './types';

/** État du formulaire de création/édition d'un bon, sa validation et sa
 *  soumission. Regroupe aussi le chargement des données de référence et,
 *  en mode édition, le pré-remplissage depuis le brouillon existant. */
export function useBonCreateForm() {
  const navigate = useNavigate();
  // Présence d'un :id dans l'URL = édition d'un brouillon existant
  const { id: editBonId } = useParams<{ id: string }>();
  const isEditing = !!editBonId;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [editReference, setEditReference] = useState('');
  const [serialConflicts, setSerialConflicts] = useState<SerialConflict[] | null>(null);

  // Form state
  const [collaborateur, setCollaborateur] = useState<UserResult | null>(null);
  const [filialeId, setFilialeId] = useState('');
  const [civilite, setCivilite] = useState<'mme' | 'mr'>('mr');
  const [dateMiseDisposition, setDateMiseDisposition] = useState('');
  const [dateRestitution, setDateRestitution] = useState('');
  const [notes, setNotes] = useState('');
  const [equipments, setEquipments] = useState<EquipmentLine[]>([newLine()]);

  const { filiales, allCatalogItems, packs, initError, retryInit } = useBonCreateReferenceData();

  // Garde « modifications non enregistrées » : voir useBonFormSnapshot.ts.
  const { snapshot, loaded, setLoaded, confirmLeave } = useBonFormSnapshot({
    collaborateur, filialeId, civilite, dateMiseDisposition, dateRestitution, notes, equipments,
    initiallyLoaded: !editBonId,
    submitting,
  });

  // Le panneau de conflits de numéro de série ne reflète que l'état du
  // formulaire au moment de la vérification : toute modification ultérieure
  // doit le fermer (sinon on pourrait soumettre en croyant l'avertissement
  // encore valable pour les valeurs actuelles).
  useEffect(() => {
    setSerialConflicts(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot]);

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
        setCollaborateur(bon.collaborateur);
        setFilialeId(bon.filialeId);
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
      const filtered = prev.filter(
        (e) => e.catalogItemId || e.customLabel?.trim() || e.serialNumber?.trim() || e.inventoryNumber?.trim() || e.notes?.trim(),
      );
      return [...filtered, ...lines];
    });
  };

  const removeEquipment = (id: string) => {
    setEquipments((prev) => prev.filter((e) => e._id !== id));
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
    collaborateurId: collaborateur?.id ?? '',
    filialeId,
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
    if (!collaborateur) {
      setError('Sélectionnez un collaborateur');
      return;
    }
    const { validEquipments } = validation;
    try {
      const payload = buildBonPayload({
        filialeId,
        collaborateurId: collaborateur.id,
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
          const conflicts = await api.get<SerialConflict[]>(`/equipment/serial-conflicts?${params}`);
          if (conflicts.length > 0) {
            setSerialConflicts(conflicts);
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
    collaborateur,
    setCollaborateur,
    filialeId,
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
  };
}
