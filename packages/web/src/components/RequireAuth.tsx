import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useSessionStore } from "../stores/session.store";

export function RequireAuth({ children }: { children: ReactNode }) {
  const user = useSessionStore((state) => state.user);
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
