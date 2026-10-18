import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { RequireAuth } from "./components/RequireAuth";
import { DashboardPage } from "./features/DashboardPage";
import { KeyDetailPage } from "./features/KeyDetailPage";
import { LoginPage } from "./features/LoginPage";
import { ScansPage } from "./features/ScansPage";
import { SettingsPage } from "./features/SettingsPage";
import { AuditPage } from "./features/AuditPage";
import { useSessionStore } from "./stores/session.store";
import { api } from "./api/client";
import { ApiError } from "./api/client";

export function App() {
  const setUser = useSessionStore((state) => state.setUser);
  const user = useSessionStore((state) => state.user);

  useEffect(() => {
    if (user) return;
    let cancelled = false;
    void api.auth
      .me()
      .then((session) => {
        if (cancelled) return;
        setUser({ id: session.id, email: session.email, methods: session.methods });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && (error.code === "UNAUTHENTICATED" || error.code === "INVALID_CREDENTIALS")) {
          return;
        }
        // unknown transport error: stay on the login page
      });
    return () => {
      cancelled = true;
    };
  }, [setUser, user]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route path="/" element={<DashboardPage />} />
          <Route path="/keys/:id" element={<KeyDetailPage />} />
          <Route path="/scans" element={<ScansPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/audit" element={<AuditPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
