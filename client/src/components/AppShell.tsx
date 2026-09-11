import type { ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { WakingBanner } from '@/components/WakingBanner';
import { Button } from '@/components/ui';

const navItems = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/plan', label: 'Today' },
  { to: '/priorities', label: 'Next up' },
  { to: '/revisions', label: 'Revisions' },
  { to: '/timer', label: 'Timer' },
  { to: '/exams', label: 'Syllabus' },
  { to: '/notes', label: 'Notes' },
  { to: '/mocks', label: 'Mocks' },
  { to: '/analytics', label: 'Analytics' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <Link to="/dashboard" className="shrink-0">
            <span className="text-lg font-semibold tracking-tight">ExamPrep</span>
            <span className="ml-2 hidden text-sm text-slate-500 sm:inline">
              Preparation &amp; Revision Manager
            </span>
          </Link>

          <nav className="flex flex-wrap items-center gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    isActive
                      ? 'bg-brand-50 text-brand-700 dark:bg-brand-700/20 dark:text-brand-100'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-500 md:inline">{user?.name}</span>
            <Button variant="ghost" onClick={handleLogout}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 pt-4">
        <WakingBanner />
      </div>

      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>

      <footer className="mx-auto max-w-5xl px-6 pb-8">
        <ConnectionStatus />
      </footer>
    </div>
  );
}
