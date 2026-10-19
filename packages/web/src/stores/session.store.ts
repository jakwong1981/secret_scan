import { create } from "zustand";
import type { AuthUserView, SessionUser } from "@skp/contracts";

export type AuthMethod = "password" | "google";

export interface SessionState {
  user: AuthUserView | null;
  method: AuthMethod | null;
  sensitiveUntil: string | null;
  setUser: (user: AuthUserView | null, method?: AuthMethod | null) => void;
  grantSensitive: (until: string) => void;
  hasSensitiveScope: (now?: Date) => boolean;
  reset: () => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  user: null,
  method: null,
  sensitiveUntil: null,

  setUser: (user, method = null) =>
    set({
      user,
      method: user ? (method ?? get().method) : null,
      sensitiveUntil: null,
    }),

  grantSensitive: (until) => set({ sensitiveUntil: until }),

  hasSensitiveScope: (now = new Date()) => {
    const until = get().sensitiveUntil;
    return until !== null && new Date(until).getTime() > now.getTime();
  },

  reset: () => set({ user: null, method: null, sensitiveUntil: null }),
}));

export function sessionUserFromAuthUserView(user: AuthUserView): SessionUser {
  return { id: user.id, email: user.email, methods: user.methods };
}
