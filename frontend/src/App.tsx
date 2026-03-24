import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { UiViewProvider, useUiView } from '@/contexts/UiViewContext';
import { Layout } from '@/components/layout/Layout';
import { Toaster } from '@/components/ui/toaster';
import { LoginPage } from '@/pages/Login';
import { ChangePasswordPage } from '@/pages/ChangePassword';
import { DashboardIT } from '@/pages/DashboardIT';
import { PortailCollaborateur } from '@/pages/PortailCollaborateur';
import { UnauthorizedPage } from '@/pages/Unauthorized';
import { AdminLayout } from '@/pages/admin/AdminLayout';
import { ConfigurationPage } from '@/pages/admin/Configuration';
import { LdapSyncPage } from '@/pages/admin/LdapSync';
import { FilialesPage } from '@/pages/admin/Filiales';
import { CataloguePage } from '@/pages/admin/Catalogue';
import { UtilisateursPage } from '@/pages/admin/Utilisateurs';
import { AuditLogsPage } from '@/pages/admin/AuditLogs';
import { ContestationsPage } from '@/pages/admin/Contestations';
import { TemplatesPage } from '@/pages/admin/Templates';
import { BonsListPage } from '@/pages/bons/BonsList';
import { BonCreatePage } from '@/pages/bons/BonCreate';
import { BonDetailPage } from '@/pages/bons/BonDetail';
import { SignaturePage } from '@/pages/signature/SignaturePage';
import { BonDetailCollaborateurPage } from '@/pages/bons/BonDetailCollaborateur';

function ProtectedRoute({
  children,
  requiredRoles,
}: {
  children: React.ReactNode;
  requiredRoles?: string[];
}) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (requiredRoles && !requiredRoles.includes(user.role)) return <Navigate to="/unauthorized" replace />;
  return <>{children}</>;
}

function LoadingSpinner() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin motion-reduce:animate-none rounded-full border-4 border-primary border-t-transparent" role="status">
        <span className="sr-only">Chargement en cours</span>
      </div>
    </div>
  );
}

function AppRoutes() {
  const { user, loading } = useAuth();
  const { activeView } = useUiView();
  if (loading) return <LoadingSpinner />;

  return (
    <Routes>
      {/* Route publique — pas de JWT requis */}
      <Route path="/signer/:token" element={<SignaturePage />} />

      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/change-password" element={<ChangePasswordPage />} />
      <Route path="/setup" element={<Navigate to="/login" replace />} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />

      <Route
        path="/"
        element={<ProtectedRoute><Layout /></ProtectedRoute>}
      >
        {/* Redirection index basée sur la vue UX active */}
        <Route index element={
          activeView !== 'collaborateur'
            ? <Navigate to="/dashboard" replace />
            : <Navigate to="/mes-bons" replace />
        } />

        <Route path="dashboard" element={
          <ProtectedRoute requiredRoles={['admin', 'technician']}>
            <DashboardIT />
          </ProtectedRoute>
        } />

        <Route path="mes-bons" element={
          <ProtectedRoute><PortailCollaborateur /></ProtectedRoute>
        } />
        <Route path="mes-bons/:id" element={
          <ProtectedRoute><BonDetailCollaborateurPage /></ProtectedRoute>
        } />

        {/* Bons */}
        <Route path="bons" element={
          <ProtectedRoute requiredRoles={['admin', 'technician']}>
            <BonsListPage />
          </ProtectedRoute>
        } />
        <Route path="bons/new" element={
          <ProtectedRoute requiredRoles={['admin', 'technician']}>
            <BonCreatePage />
          </ProtectedRoute>
        } />
        <Route path="bons/:id" element={
          <ProtectedRoute requiredRoles={['admin', 'technician']}>
            <BonDetailPage />
          </ProtectedRoute>
        } />

        {/* Section admin — garde parent : admin OU technicien */}
        <Route path="admin" element={
          <ProtectedRoute requiredRoles={['admin', 'technician']}>
            <AdminLayout />
          </ProtectedRoute>
        }>
          {/* Redirection par défaut vers contestations (accessible admin + technicien) */}
          <Route index element={<Navigate to="/admin/contestations" replace />} />

          {/* Accessible admin + technicien */}
          <Route path="contestations" element={<ContestationsPage />} />
          <Route path="filiales" element={<FilialesPage />} />
          <Route path="catalogue" element={<CataloguePage />} />
          <Route path="utilisateurs" element={<UtilisateursPage />} />

          {/* Réservé admin uniquement — configuration système sensible */}
          <Route path="configuration" element={
            <ProtectedRoute requiredRoles={['admin']}><ConfigurationPage /></ProtectedRoute>
          } />
          <Route path="ldap" element={
            <ProtectedRoute requiredRoles={['admin']}><LdapSyncPage /></ProtectedRoute>
          } />
          <Route path="audit" element={
            <ProtectedRoute requiredRoles={['admin']}><AuditLogsPage /></ProtectedRoute>
          } />
          <Route path="templates" element={
            <ProtectedRoute requiredRoles={['admin']}><TemplatesPage /></ProtectedRoute>
          } />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <UiViewProvider>
          <AppRoutes />
          <Toaster />
        </UiViewProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
