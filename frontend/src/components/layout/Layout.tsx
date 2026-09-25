import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { usePageTitle } from '@/hooks/usePageTitle';
import { routeTitle } from '@/lib/route-titles';

/** Attente pendant le chargement d'une page, à l'intérieur de la mise en page
 *  (le menu et l'en-tête restent visibles). */
function PageLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div
        className="h-8 w-8 animate-spin motion-reduce:animate-none rounded-full border-4 border-primary border-t-transparent"
        role="status"
      >
        <span className="sr-only">Chargement de la page</span>
      </div>
    </div>
  );
}

export function Layout() {
  const { pathname } = useLocation();
  // Titre de l'onglet déduit de l'adresse ; un écran peut le préciser.
  usePageTitle(routeTitle(pathname), 'route');

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg"
      >
        Aller au contenu principal
      </a>
      <Sidebar />
      {/* La colonne entière défile : le contenu passe SOUS le header vitré */}
      <div className="app-canvas flex flex-1 flex-col overflow-y-auto">
        <Header />
        <main id="main-content" className="flex-1 p-6 lg:px-8">
          {/* Une zone d'attente PAR PAGE (clé = chemin), pas une seule pour
              toute l'application. React Router 7 enchaîne les navigations dans
              une transition : avec une zone unique déjà affichée, React garde
              l'ancienne page montée tant que la suivante (chargée à la
              demande) n'est pas prête. Ses minuteries continuaient donc de
              tourner — une recherche différée réécrivait l'adresse et annulait
              la navigation (cliquer un lien juste après avoir tapé une
              recherche ramenait à la liste). Une zone neuve affiche son attente
              immédiatement, et l'ancienne page est démontée tout de suite.
              Les changements de paramètres (filtres, onglets) ne modifient pas
              le chemin : ils ne remontent rien. */}
          <Suspense key={pathname} fallback={<PageLoading />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
