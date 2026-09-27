import { Outlet, useLocation } from 'react-router';
import { AdminSubNav, getSubNavForPath } from '@/components/layout/AdminSubNav';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';

export function AdminLayout() {
  const location = useLocation();
  const activeSubNav = getSubNavForPath(location.pathname);

  return (
    // Annule la marge du <main> (px-4 py-4, md:p-6, lg:px-8 : voir Layout.tsx)
    // pour coller la sous-nav au bord, et la rend au contenu.
    <div className="flex min-h-full -mx-4 -my-4 md:-m-6 lg:-mx-8">
      {activeSubNav && <AdminSubNav section={activeSubNav} />}
      <div className="flex-1 min-w-0 px-4 py-4 md:p-6">
        <Breadcrumbs />
        <Outlet />
      </div>
    </div>
  );
}
