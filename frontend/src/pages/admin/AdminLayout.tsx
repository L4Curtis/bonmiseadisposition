import { Outlet, useLocation } from 'react-router-dom';
import { AdminSubNav, getSubNavForPath } from '@/components/layout/AdminSubNav';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';

export function AdminLayout() {
  const location = useLocation();
  const activeSubNav = getSubNavForPath(location.pathname);

  return (
    // Annule le padding du <main> (p-6, lg:px-8) pour coller la sous-nav au bord
    <div className="flex min-h-full -m-6 lg:-mx-8">
      {activeSubNav && <AdminSubNav section={activeSubNav} />}
      <div className="flex-1 min-w-0 p-6">
        <Breadcrumbs />
        <Outlet />
      </div>
    </div>
  );
}
