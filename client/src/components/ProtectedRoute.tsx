import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

/**
 * Waits for the boot-time silent refresh before deciding. Without that wait a
 * reload on a protected page would bounce to /login for a frame even though the
 * refresh cookie is perfectly valid.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const isBootstrapping = useAuthStore((s) => s.isBootstrapping);
  const location = useLocation();

  if (isBootstrapping) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="size-6 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
        <span className="sr-only">Restoring your session</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
