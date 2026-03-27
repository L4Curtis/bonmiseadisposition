import { Outlet, useLocation } from 'react-router-dom';
import { AdminSubNav, getSubNavForPath } from '@/components/layout/AdminSubNav';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';

export function AdminLayout() {
  const location = useLocation();
  const activeSubNav = getSubNavForPath(location.pathname);

  return (
    <div className="flex h-full -m-6">
      {activeSubNav && <AdminSubNav section={activeSubNav} />}
      <div className="flex-1 overflow-auto p-6">
        <Breadcrumbs />
        <Outlet />
      </div>
    </div>
  );
}
