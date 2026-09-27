import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronLeft, X } from 'lucide-react';
import { useBonCreateForm } from './create/useBonCreateForm';
import { CollaborateurSection } from './create/CollaborateurSection';
import { DatesSection } from './create/DatesSection';
import { EquipmentSection } from './create/EquipmentSection';

// Exportés uniquement pour permettre leur test unitaire isolé — la page reste
// par ailleurs le seul export utilisé par le routeur.
export { UserAutocomplete } from './create/UserAutocomplete';
export { CatalogSearch } from './create/CatalogSearch';

export function BonCreatePage() {
  const errorRef = useRef<HTMLDivElement>(null);
  const {
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
    civiliteFromAccount,
    internalNote,
    setInternalNote,
    editStatus,
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
    liveSerialConflicts,
    checkSerialConflict,
    importDuplicatedEquipments,
    restoredFromDraft,
    discardRestoredDraft,
    dismissRestoredNotice,
  } = useBonCreateForm();

  // Le bouton « Créer » est en bas du formulaire, le message d'erreur en haut :
  // on l'amène sous les yeux, sinon le refus passe inaperçu.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, [error]);

  const goBack = () => { if (confirmLeave()) navigate(isEditing ? `/bons/${editBonId}` : '/bons'); };

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center gap-3">
        <button onClick={goBack} className="text-muted-foreground/70 hover:text-muted-foreground" aria-label="Retour">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold text-foreground">
          {isEditing
            ? `${editStatus === 'sent_mise_dispo' ? 'Modifier le bon' : 'Modifier le brouillon'} ${editReference || ''}`
            : 'Nouveau bon de mise à disposition'}
        </h1>
      </div>
      {editStatus === 'sent_mise_dispo' && (
        <div role="status" className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          Ce bon a déjà été envoyé au collaborateur. En enregistrant, le lien envoyé ne fonctionnera plus : votre
          signature IT sera redemandée, puis un nouveau lien partira. La modification est tracée. Modifier seulement
          la note interne IT ne change rien pour le collaborateur : son lien reste valable.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {restoredFromDraft && (
          <div
            role="status"
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm text-muted-foreground"
          >
            <span>Brouillon restauré depuis votre dernière visite sur cette page.</span>
            <div className="flex shrink-0 items-center gap-3">
              <button type="button" className="font-medium text-primary hover:underline" onClick={discardRestoredDraft}>
                Repartir de zéro
              </button>
              <button
                type="button"
                onClick={dismissRestoredNotice}
                aria-label="Masquer cet avis"
                className="text-muted-foreground/60 hover:text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
        {initError && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive flex items-center justify-between gap-3" role="alert">
            <span>Impossible de charger les filiales et le catalogue — le formulaire est incomplet.</span>
            <button
              type="button"
              className="shrink-0 font-medium underline hover:no-underline"
              onClick={retryInit}
            >
              Réessayer
            </button>
          </div>
        )}
        {error && (
          <div ref={errorRef} className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive" role="alert">
            {error}
          </div>
        )}
        {serialConflicts && serialConflicts.length > 0 && (
          <div ref={conflictsRef} className="rounded-lg bg-warning/10 border border-warning/40 px-4 py-3 text-sm space-y-2" role="alert">
            <p className="font-medium text-warning">
              ⚠ Numéro(s) de série déjà en circulation sur un autre bon :
            </p>
            <ul className="list-disc pl-5 text-warning space-y-0.5">
              {serialConflicts.map((c, i) => (
                <li key={`${c.serialNumber}-${i}`}>
                  <span className="font-mono">{c.serialNumber}</span> — {c.bonReference} ({c.collaborateur})
                </li>
              ))}
            </ul>
            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                className="bg-warning hover:bg-warning/90 text-warning-foreground"
                disabled={submitting}
                onClick={confirmDespiteConflicts}
              >
                {isEditing ? 'Enregistrer quand même' : 'Créer quand même'}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setSerialConflicts(null)}>
                Corriger
              </Button>
            </div>
          </div>
        )}

        <CollaborateurSection
          civilite={civilite}
          civiliteFromAccount={civiliteFromAccount}
          onCiviliteChange={setCivilite}
          filialeId={filialeId}
          onFilialeIdChange={setFilialeId}
          filiales={filiales}
          collaborateur={collaborateur}
          onCollaborateurChange={setCollaborateur}
        />

        <DatesSection
          dateMiseDisposition={dateMiseDisposition}
          onDateMiseDispositionChange={setDateMiseDisposition}
          dateRestitution={dateRestitution}
          onDateRestitutionChange={setDateRestitution}
        />

        <EquipmentSection
          equipments={equipments}
          allCatalogItems={allCatalogItems}
          packs={packs}
          duplicateSerialIds={duplicateSerialIds}
          liveSerialConflicts={liveSerialConflicts}
          onAddFromCatalog={addFromCatalog}
          onAddFromPack={addFromPack}
          onAddEmptyLine={addEmptyLine}
          onRemoveEquipment={removeEquipment}
          onUpdateEquipment={updateEquipment}
          onDuplicateEquipment={duplicateEquipment}
          onPasteSerial={pasteSerial}
          onSerialBlur={checkSerialConflict}
          onImportDuplicatedEquipments={importDuplicatedEquipments}
        />

        {/* Deux textes distincts (R-170) : ce que voit le collaborateur, et ce qui reste à l'IT. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                <label htmlFor="bon-notes">Remarques sur le bon</label>{' '}
                <span className="text-muted-foreground/70 text-xs font-normal">(facultatif)</span>
              </CardTitle>
              <p className="text-xs text-muted-foreground">Visibles par le collaborateur et imprimées sur le PDF.</p>
            </CardHeader>
            <CardContent>
              <textarea
                id="bon-notes"
                className="w-full rounded-md border bg-transparent text-foreground px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                rows={3}
                maxLength={2000}
                placeholder="Ex. : chargeur fourni, sacoche prêtée jusqu’à la fin du chantier."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </CardContent>
          </Card>
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-base">
                <label htmlFor="bon-internal-note">Note interne IT</label>{' '}
                <span className="text-muted-foreground/70 text-xs font-normal">(facultatif)</span>
              </CardTitle>
              <p className="text-xs text-muted-foreground">Jamais montrée au collaborateur, ni sur le PDF, ni dans un email.</p>
            </CardHeader>
            <CardContent>
              <textarea
                id="bon-internal-note"
                className="w-full rounded-md border bg-transparent text-foreground px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                rows={3}
                maxLength={2000}
                placeholder="Ex. : ticket GLPI 4521, écran à récupérer au siège."
                value={internalNote}
                onChange={(e) => setInternalNote(e.target.value)}
              />
            </CardContent>
          </Card>
        </div>

        <div className="flex gap-2 justify-end">
          <Button type="button" variant="outline" onClick={goBack}>
            Annuler
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting
              ? (isEditing ? 'Enregistrement...' : 'Création...')
              : (isEditing ? 'Enregistrer les modifications' : 'Créer le bon')}
          </Button>
        </div>
      </form>
    </div>
  );
}
