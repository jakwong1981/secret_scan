/** Session cookie policy — HTTPS-only deployment, so `Secure` is always on. */
export const SESSION_COOKIE = {
  name: "skp_session",
  httpOnly: true,
  secure: true,
  sameSite: "strict",
  path: "/",
} as const;

export const SENSITIVE_COOKIE = {
  name: "skp_sensitive",
  httpOnly: true,
  secure: true,
  sameSite: "strict",
  path: "/",
} as const;
