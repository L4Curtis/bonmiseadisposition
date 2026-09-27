import { Suspense, useCallback, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { routeTitle } from '@/lib/route-titles';
import { DESKTOP_SHELL_QUERY } from './shell-media';

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

/**
 * Tiroir du menu (téléphone) : fermé par défaut. Il ne reste ouvert que sur
 * la page où on l'a ouvert (un changement de page le referme) et tant que
 * la coque reste celle du téléphone : dès qu'elle passe en tablette ou
 * ordinateur (fenêtre agrandie), le menu latéral reprend sa place. Un
 * téléphone qu'on tourne garde le tiroir (voir shell-media.ts).
 */
function useMobileMenu(pathname: string) {
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const isWide = useMediaQuery(DESKTOP_SHELL_QUERY);
  const open = openedOn === pathname && !isWide;

  const setOpen = useCallback((next: boolean) => setOpenedOn(next ? pathname : null), [pathname]);
  const openMenu = useCallback(() => setOpen(true), [setOpen]);
  return { open, setOpen, openMenu };
}

/**
 * Coque de l'application : menu, en-tête, cadre de page.
 * Sur téléphone, le contenu occupe toute la largeur (marges de 16 px) et la
 * page ne défile jamais de côté : un tableau trop large défile dans son
 * propre cadre (règles `.app-main` d'index.css).
 */
export function Layout() {
  const { pathname } = useLocation();
  // Titre de l'onglet déduit de l'adresse ; un écran peut le préciser.
  usePageTitle(routeTitle(pathname), 'route');
  const menu = useMobileMenu(pathname);
  // Le focus revient au bouton ☰ quand le tiroir se ferme.
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="app-shell relative flex overflow-hidden bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg"
      >
        Aller au contenu principal
      </a>
      <Sidebar mobileOpen={menu.open} onMobileOpenChange={menu.setOpen} menuButtonRef={menuButtonRef} />
      {/* La colonne entière défile : le contenu passe SOUS l'en-tête. Sur
          téléphone, jamais de côté : min-w-0 empêche un contenu large
          d'élargir la colonne, et ce qui dépasse encore est coupé plutôt que
          de faire glisser toute la page (les tableaux défilent dans leur
          cadre). Sur tablette et ordinateur, comportement inchangé. */}
      <div className="app-canvas relative flex min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden shell:overflow-x-auto">
        <Header onOpenMenu={menu.openMenu} menuOpen={menu.open} menuButtonRef={menuButtonRef} />
        <main id="main-content" className="app-main min-w-0 flex-1 px-4 py-4 md:p-6 lg:px-8">
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
