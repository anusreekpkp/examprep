import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { WakingBanner } from '@/components/WakingBanner';
import { Button } from '@/components/ui';

/**
 * Six destinations stay in the bar; the three that are entered with context -
 * the timer (started from a topic), notes (written about a topic), mocks (logged
 * after a test) - sit behind "More". Nine equal-weight links read as a list of
 * features rather than a place to work.
 */
const primaryNav = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/plan', label: 'Today' },
  { to: '/priorities', label: 'Next up' },
  { to: '/revisions', label: 'Revisions' },
  { to: '/exams', label: 'Syllabus' },
  { to: '/analytics', label: 'Analytics' },
];

const secondaryNav = [
  { to: '/timer', label: 'Study timer' },
  { to: '/notes', label: 'Notes' },
  { to: '/mocks', label: 'Mock tests' },
];

const linkClasses = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-1.5 text-sm font-medium transition ${
    isActive
      ? 'bg-brand-50 text-brand-700 dark:bg-brand-700/20 dark:text-brand-100'
      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
  }`;

export function AppShell({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const location = useLocation();

  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Navigating anywhere closes both menus, including via the back button.
  useEffect(() => {
    setMoreOpen(false);
    setMobileOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const inSecondary = secondaryNav.some((item) => location.pathname.startsWith(item.to));

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link to="/dashboard" className="shrink-0">
            <span className="text-lg font-semibold tracking-tight">ExamPrep</span>
          </Link>

          {/* ------------------------------------------------ desktop nav --- */}
          <nav className="hidden flex-1 items-center gap-1 lg:flex">
            {primaryNav.map((item) => (
              <NavLink key={item.to} to={item.to} className={linkClasses}>
                {item.label}
              </NavLink>
            ))}

            <div className="relative">
              <button
                type="button"
                onClick={() => setMoreOpen((open) => !open)}
                aria-expanded={moreOpen}
                className={linkClasses({ isActive: inSecondary })}
              >
                More <span aria-hidden="true">▾</span>
              </button>
              {moreOpen && (
                <>
                  {/* Catches the next click anywhere so the menu closes. */}
                  <div
                    className="fixed inset-0 z-10 cursor-default"
                    onClick={() => setMoreOpen(false)}
                    aria-hidden="true"
                  />
                  <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                    {secondaryNav.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) =>
                          `block px-3 py-2 text-sm ${
                            isActive
                              ? 'bg-brand-50 font-medium text-brand-700 dark:bg-brand-700/20 dark:text-brand-100'
                              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                          }`
                        }
                      >
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                </>
              )}
            </div>
          </nav>

          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            <span className="hidden text-sm text-slate-500 xl:inline">{user?.name}</span>
            {/* Wrapped rather than given a `hidden lg:…` class: Button sets its
                own `inline-flex`, and two display utilities of equal specificity
                are decided by stylesheet order, not by which one is passed in. */}
            <span className="hidden lg:block">
              <Button variant="ghost" onClick={handleLogout}>
                Sign out
              </Button>
            </span>

            {/* ------------------------------------------ mobile trigger --- */}
            <button
              type="button"
              onClick={() => setMobileOpen((open) => !open)}
              aria-expanded={mobileOpen}
              aria-label="Menu"
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <span aria-hidden="true" className="block text-lg leading-none">
                {mobileOpen ? '✕' : '☰'}
              </span>
            </button>
          </div>
        </div>

        {/* -------------------------------------------------- mobile nav --- */}
        {mobileOpen && (
          <nav className="border-t border-slate-200 px-4 pb-3 pt-2 lg:hidden dark:border-slate-800">
            <div className="grid grid-cols-2 gap-1">
              {[...primaryNav, ...secondaryNav].map((item) => (
                <NavLink key={item.to} to={item.to} className={linkClasses}>
                  {item.label}
                </NavLink>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="mt-2 w-full rounded-lg px-3 py-1.5 text-left text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Sign out
            </button>
          </nav>
        )}
      </header>

      <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6">
        <WakingBanner />
      </div>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>

      <footer className="mx-auto max-w-7xl px-4 pb-8 sm:px-6">
        <ConnectionStatus />
      </footer>
    </div>
  );
}
