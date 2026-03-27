import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { UiViewProvider, useUiView } from '@/contexts/UiViewContext';
import { Layout } from '@/components/layout/Layout';
import { Toaster } from '@/components/ui/toaster';
import { LoginPage } from '@/pages/Login';
import { ChangePasswordPage } from '@/pages/ChangePassword';
import { UnauthorizedPage } from '@/pages/Unauthorized';

// Lazy-loaded pages (code splitting)
const DashboardIT = lazy(() => import('@/pages/DashboardIT').then(m => ({ default: m.DashboardIT })));
const PortailCollaborateur = lazy(() => import('@/pages/PortailCollaborateur').then(m => ({ default: m.PortailCollaborateur })));
const AdminLayout = lazy(() => import('@/pages/admin/AdminLayout').then(m => ({ default: m.AdminLayout })));
const ConfigurationPage = lazy(() => import('@/pages/admin/Configuration').then(m => ({ default: m.ConfigurationPage })));
const LdapSyncPage = lazy(() => import('@/pages/admin/LdapSync').then(m => ({ default: m.LdapSyncPage })));
const FilialesPage = lazy(() => import('@/pages/admin/Filiales').then(m => ({ default: m.FilialesPage })));
const CataloguePage = lazy(() => import('@/pages/admin/Catalogue').then(m => ({ default: m.CataloguePage })));
const UtilisateursPage = lazy(() => import('@/pages/admin/Utilisateurs').then(m => ({ default: m.UtilisateursPage })));
const AuditLogsPage = lazy(() => import('@/pages/admin/AuditLogs').then(m => ({ default: m.AuditLogsPage })));
const ContestationsPage = lazy(() => import('@/pages/admin/Contestations').then(m => ({ default: m.ContestationsPage })));
const TemplatesPage = lazy(() => import('@/pages/admin/Templates').then(m => ({ default: m.TemplatesPage })));
const PdfTemplatesPage = lazy(() => import('@/pages/admin/PdfTemplates').then(m => ({ default: m.PdfTemplatesPage })));
const BonsListPage = lazy(() => import('@/pages/bons/BonsList').then(m => ({ default: m.BonsListPage })));
const BonCreatePage = lazy(() => import('@/pages/bons/BonCreate').then(m => ({ default: m.BonCreatePage })));
const BonDetailPage = lazy(() => import('@/pages/bons/BonDetail').then(m => ({ default: m.BonDetailPage })));
const SignaturePage = lazy(() => import('@/pages/signature/SignaturePage').then(m => ({ default: m.SignaturePage })));
const BonDetailCollaborateurPage = lazy(() => import('@/pages/bons/BonDetailCollaborateur').then(m => ({ default: m.BonDetailCollaborateurPage })));

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
    <Suspense fallback={<LoadingSpinner />}>
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
          <Route path="email-templates" element={
            <ProtectedRoute requiredRoles={['admin']}><TemplatesPage /></ProtectedRoute>
          } />
          <Route path="pdf-templates" element={
            <ProtectedRoute requiredRoles={['admin']}><PdfTemplatesPage /></ProtectedRoute>
          } />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Application error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen items-center justify-center bg-background">
          <div className="max-w-md space-y-4 text-center p-8">
            <h1 className="text-2xl font-bold text-foreground">Une erreur est survenue</h1>
            <p className="text-muted-foreground">
              L'application a rencontré un problème inattendu.
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.href = '/';
              }}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Retour à l'accueil
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <UiViewProvider>
            <AppRoutes />
            <Toaster />
          </UiViewProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
