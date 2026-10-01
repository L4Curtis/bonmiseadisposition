import { useAuth } from '@/contexts/AuthContext';
import { isItRole } from '@/lib/roles';
import { todayInParis } from '@/lib/dates';
import { Boxes } from 'lucide-react';
import { ExportButton } from '@/components/export';
import { Pagination } from '@/components/list';
import { useInventory } from './inventaire/useInventory';
import { useCollaborateurInventory } from './inventaire/useCollaborateurInventory';
import { inventoryExportFilters } from './inventaire/inventoryExportFilters';
import { InventorySummaryCards } from './inventaire/InventorySummaryCards';
import { InventoryFilters } from './inventaire/InventoryFilters';
import { InventoryTable } from './inventaire/InventoryTable';
import { CollaborateurTable } from './inventaire/CollaborateurTable';
import { InventoryViewToggle } from './inventaire/InventoryViewToggle';
import { NOT_RETURNED_SITUATION } from './inventaire/types';

export function InventairePage() {
  const { user } = useAuth();
  // Direction : lecture seule, aucun accès aux bons individuels (/bons/:id → 403).
  const canLinkToBon = isItRole(user?.role);

  const {
    view,
    setView,
    items,
    total,
    page,
    setPage,
    pageSize,
    setPageSize,
    loading,
    loadError,
    retry,
    summary,
    summaryError,
    loadSummary,
    filiales,
    filialeFilter,
    setFilialeFilter,
    categoryFilter,
    setCategoryFilter,
    situationFilter,
    setSituationFilter,
    overdueFilter,
    setOverdueFilter,
    missingSerialFilter,
    setMissingSerialFilter,
    offCatalogFilter,
    setOffCatalogFilter,
    compteFilter,
    setCompteFilter,
    sort,
    changeSort,
    searchInput,
    setSearchInput,
    resetFilters,
    exportPath,
    exportLimit,
    loadExportCount,
    hasActiveFilters,
    baseFilters,
  } = useInventory();

  const collaborateurs = useCollaborateurInventory({
    enabled: view === 'collaborateurs',
    filters: baseFilters,
    page,
    setPage,
    pageSize,
    compteFilter,
  });

  const byEquipment = view === 'equipements';
  const activeTotal = byEquipment ? total : collaborateurs.total;
  // Nombre annoncé avant l'export. Vue par équipement : le total affiché
  // (inconnu pendant le chargement, et après un échec plutôt qu'un faux
  // « 0 » qui bloquerait l'export) ; vue par collaborateur : le nombre
  // d'équipements, lu à l'ouverture (l'export est par équipement).
  const equipmentCount = loading ? null : loadError ? undefined : total;
  const exportFilters = inventoryExportFilters(baseFilters, {
    filiales,
    categories: summary?.byCategory ?? [],
    situations: summary?.bySituation ?? [],
  });

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Boxes className="h-5 w-5" /> Inventaire du parc prêté
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {situationFilter === NOT_RETURNED_SITUATION
              ? 'Équipements déclarés non restitués et pas retrouvés, y compris sur des bons clôturés.'
              : 'Équipements actuellement entre les mains des collaborateurs.'}
          </p>
        </div>
        <ExportButton
          className="w-full sm:w-auto"
          path={exportPath}
          fallbackFilename={`inventaire-${todayInParis()}.csv`}
          filters={exportFilters}
          count={byEquipment ? equipmentCount : undefined}
          loadCount={byEquipment ? undefined : loadExportCount}
          limit={exportLimit}
          itemLabel={{ singular: 'équipement', plural: 'équipements' }}
          title="Exporter l’inventaire"
          note={byEquipment ? undefined : 'Une ligne par équipement, même dans la vue par collaborateur.'}
        />
      </div>

      <InventorySummaryCards
        summary={summary}
        summaryError={summaryError}
        onRetry={loadSummary}
        onOverdueClick={() => setOverdueFilter(true)}
        overdueActive={overdueFilter}
        onSignatureWaitingClick={() => setSituationFilter('en_attente_signature')}
        signatureWaitingActive={situationFilter === 'en_attente_signature'}
      />

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <InventoryViewToggle view={view} onChange={setView} />
      </div>

      <InventoryFilters
        searchInput={searchInput}
        onSearchInputChange={setSearchInput}
        filialeFilter={filialeFilter}
        onFilialeFilterChange={setFilialeFilter}
        categoryFilter={categoryFilter}
        onCategoryFilterChange={setCategoryFilter}
        situationFilter={situationFilter}
        onSituationFilterChange={setSituationFilter}
        situations={summary?.bySituation ?? []}
        notReturnedCount={summary?.notReturned ?? null}
        filiales={filiales}
        categories={summary?.byCategory ?? []}
        overdueFilter={overdueFilter}
        onClearOverdue={() => setOverdueFilter(false)}
        missingSerialFilter={missingSerialFilter}
        onMissingSerialFilterChange={setMissingSerialFilter}
        offCatalogFilter={offCatalogFilter}
        onOffCatalogFilterChange={setOffCatalogFilter}
        compteFilter={compteFilter}
        onCompteFilterChange={setCompteFilter}
        showCompteFilter={view === 'collaborateurs'}
        hasActiveFilters={hasActiveFilters}
        onReset={resetFilters}
      />

      {byEquipment ? (
        <InventoryTable
          items={items}
          loading={loading}
          loadError={loadError}
          onRetry={retry}
          hasActiveFilters={hasActiveFilters}
          onResetFilters={resetFilters}
          canLinkToBon={canLinkToBon}
          sort={sort}
          onSortChange={changeSort}
        />
      ) : (
        <CollaborateurTable
          items={collaborateurs.items}
          loading={collaborateurs.loading}
          loadError={collaborateurs.error}
          onRetry={collaborateurs.retry}
          hasActiveFilters={hasActiveFilters}
          onResetFilters={resetFilters}
          canLinkToBon={canLinkToBon}
          sort={collaborateurs.sort}
          onSortChange={collaborateurs.setSort}
          filters={baseFilters}
          truncated={collaborateurs.truncated}
        />
      )}

      <Pagination
        page={page}
        pageSize={pageSize}
        total={activeTotal}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        itemLabel={byEquipment
          ? { singular: 'équipement', plural: 'équipements' }
          : { singular: 'collaborateur', plural: 'collaborateurs' }}
      />
    </div>
  );
}
