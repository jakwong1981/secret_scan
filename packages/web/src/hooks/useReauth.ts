import { useCallback, useState } from "react";
import { api } from "../api/client";
import { useSessionStore } from "../stores/session.store";

export interface ReauthController {
  hasScope: () => boolean;
  confirm: (masterPassword: string) => Promise<void>;
  busy: boolean;
  error: string | null;
  clearError: () => void;
}

/**
 * Sensitive operations (reveal / delete / settings change) require a fresh
 * password confirmation. Components render their own confirmation input and
 * call `confirm`, keeping this hook free of UI popups.
 */
export function useReauth(): ReauthController {
  const hasSensitiveScope = useSessionStore((state) => state.hasSensitiveScope);
  const grantSensitive = useSessionStore((state) => state.grantSensitive);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = useCallback(
    async (masterPassword: string) => {
      setBusy(true);
      setError(null);
      try {
        const result = await api.auth.verifyPassword(masterPassword);
        grantSensitive(result.sensitiveScopeUntil);
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : "Re-authentication failed",
        );
        throw caught;
      } finally {
        setBusy(false);
      }
    },
    [grantSensitive],
  );

  return {
    hasScope: hasSensitiveScope,
    confirm,
    busy,
    error,
    clearError: () => setError(null),
  };
}
