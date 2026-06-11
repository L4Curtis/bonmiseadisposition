import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

export function Layout() {
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
          <Outlet />
        </main>
      </div>
    </div>
  );
}
