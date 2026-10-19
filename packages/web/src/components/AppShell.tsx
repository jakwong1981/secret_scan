import { NavLink, Outlet } from "react-router-dom";
import { useSessionStore } from "../stores/session.store";
import { api } from "../api/client";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard" },
  { to: "/scans", label: "Scans" },
  { to: "/audit", label: "Audit" },
  { to: "/settings", label: "Settings" },
];

export function AppShell() {
  const user = useSessionStore((state) => state.user);
  const reset = useSessionStore((state) => state.reset);

  const logout = (): void => {
    void api.auth.logout().finally(() => {
      reset();
    });
  };

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-base font-semibold tracking-tight text-ink">
              SecretKeyPreview
            </p>
            <p className="text-xs text-muted">
              Local AI API key vault · HTTPS only
            </p>
          </div>
          <nav aria-label="Main" className="flex flex-wrap items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    isActive
                      ? "bg-accent-soft text-accent"
                      : "text-muted hover:text-ink"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
            <button
              type="button"
              onClick={logout}
              className="ml-2 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-muted transition hover:text-ink"
            >
              Sign out
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
      <footer className="mx-auto max-w-6xl px-4 pb-8 text-xs text-muted">
        Signed in as {user?.email ?? "owner"} · values stay encrypted locally
      </footer>
    </div>
  );
}
