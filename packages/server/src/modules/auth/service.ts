import { createHash } from "node:crypto";
import type { Db } from "../../infra/db/database.js";
import type { SessionRow, UserRow } from "../../infra/db/repositories/rows.js";
import {
  countUsers,
  createUser,
  findGoogleIdentityBySub,
  findUserByEmail,
  findUserById,
  linkGoogleIdentity,
  touchLastLogin,
  updatePasswordHash,
  userMethods,
} from "../../infra/db/repositories/user.repository.js";
import {
  createSession,
  findSessionById,
  grantSensitiveScope,
  hasSensitiveScope,
  isSessionUsable,
  revokeSession,
  rotateSession,
  touchSession,
} from "../../infra/db/repositories/session.repository.js";
import { recordAudit } from "../../infra/db/repositories/audit.repository.js";
import { allowedGoogleEmails, sessionLimits } from "../../infra/db/repositories/settings.repository.js";
import {
  clearFailedAttempts,
  isLockedOut,
  recordLoginAttempt,
} from "../../infra/db/repositories/login-attempt.repository.js";
import {
  consumeOauthChallenge,
  createOauthChallenge,
  purgeExpiredOauthChallenges,
} from "../../infra/db/repositories/oauth-state.repository.js";
import { hashPassword, verifyPassword } from "../../core/crypto/password.js";
import { exchangeGoogleCode, verifyGoogleIdToken } from "../../core/crypto/google-id-token.js";
import { env, googleRedirectUri } from "../../config/env.js";
import {
  ConflictError,
  ForbiddenError,
  GoogleNotAllowedError,
  InvalidCredentialsError,
  RateLimitedError,
  UnauthenticatedError,
  ValidationError,
} from "../../core/errors/app-error.js";
import { logger } from "../../core/logging/logger.js";

export interface AuthUserView {
  id: string;
  email: string;
  methods: Array<"password" | "google">;
}

export interface SessionContext {
  session: SessionRow;
  user: UserRow;
}

export function viewOf(user: UserRow, db: Db): AuthUserView {
  return { id: user.id, email: user.email, methods: userMethods(db, user) };
}

export function needsBootstrap(db: Db): boolean {
  return countUsers(db) === 0;
}

function base64UrlSha256(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

export function bootstrap(
  db: Db,
  input: { email: string; masterPassword: string; ip?: string; userAgent?: string },
): SessionContext {
  if (!needsBootstrap(db)) throw new ConflictError("Owner account already exists", "ALREADY_BOOTSTRAPPED");
  if (input.masterPassword.length < env.SKP_PASSWORD_MIN_LENGTH) {
    throw new ValidationError(`Master password must be at least ${env.SKP_PASSWORD_MIN_LENGTH} characters`);
  }
  const user = createUser(db, { email: input.email, passwordHash: hashPassword(input.masterPassword) });
  const limits = sessionLimits(db);
  const session = createSession(db, {
    userId: user.id,
    idleMinutes: limits.idleMinutes,
    absoluteHours: limits.absoluteHours,
    ip: input.ip,
    userAgent: input.userAgent,
  });
  logger.info({ userId: user.id }, "owner account bootstrapped");
  return { session, user };
}

export function login(
  db: Db,
  input: { email: string; masterPassword: string; ip?: string; userAgent?: string },
): SessionContext {
  if (isLockedOut(db, input.email, input.ip)) throw new RateLimitedError();
  const user = findUserByEmail(db, input.email);
  if (!user || !user.password_hash || !verifyPassword(input.masterPassword, user.password_hash)) {
    recordLoginAttempt(db, { email: input.email, ip: input.ip, ok: false });
    throw new InvalidCredentialsError();
  }
  recordLoginAttempt(db, { email: input.email, ip: input.ip, ok: true });
  clearFailedAttempts(db, input.email);
  touchLastLogin(db, user.id);
  const limits = sessionLimits(db);
  const session = createSession(db, {
    userId: user.id,
    idleMinutes: limits.idleMinutes,
    absoluteHours: limits.absoluteHours,
    ip: input.ip,
    userAgent: input.userAgent,
  });
  return { session, user };
}

export function logout(db: Db, sessionId: string): void {
  revokeSession(db, sessionId);
}

export function reauthenticate(db: Db, input: { sessionId: string; masterPassword: string }): Date {
  const session = findSessionById(db, input.sessionId);
  if (!session) throw new UnauthenticatedError();
  const user = findUserById(db, session.user_id);
  if (!user?.password_hash || !verifyPassword(input.masterPassword, user.password_hash)) {
    throw new InvalidCredentialsError();
  }
  return grantSensitiveScope(db, session.id, 5);
}

/** Synchronous resolution used by the auth guard (preHandler may stay sync). */
export function resolveSession(db: Db, sessionId: string | undefined | null): SessionContext | null {
  if (!sessionId) return null;
  const session = findSessionById(db, sessionId);
  if (!session || !isSessionUsable(session)) return null;
  const user = findUserById(db, session.user_id);
  if (!user) return null;
  return { session, user };
}

export function touchForRequest(db: Db, context: SessionContext): SessionContext {
  const limits = sessionLimits(db);
  const session = touchSession(db, context.session, limits.idleMinutes);
  return { session, user: context.user };
}

export function assertSensitiveScope(session: SessionRow): void {
  if (!hasSensitiveScope(session)) throw new UnauthenticatedError("re-authentication required");
}

export function startGoogleAuth(db: Db): { authorizationUrl: string; state: string; expiresAt: Date } {
  if (!env.SKP_GOOGLE_CLIENT_ID || !env.SKP_GOOGLE_CLIENT_SECRET) {
    throw new ValidationError("Google sign-in is not configured");
  }
  purgeExpiredOauthChallenges(db);
  const challenge = createOauthChallenge(db);
  const params = new URLSearchParams({
    client_id: env.SKP_GOOGLE_CLIENT_ID,
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state: challenge.state,
    nonce: challenge.nonce,
    code_challenge: base64UrlSha256(challenge.codeVerifier),
    code_challenge_method: "S256",
    access_type: "online",
    prompt: "select_account",
  });
  return {
    authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    state: challenge.state,
    expiresAt: challenge.expiresAt,
  };
}

export async function completeGoogleAuth(
  db: Db,
  input: { code: string; state: string; ip?: string; userAgent?: string },
): Promise<SessionContext> {
  if (!env.SKP_GOOGLE_CLIENT_ID || !env.SKP_GOOGLE_CLIENT_SECRET) {
    throw new ValidationError("Google sign-in is not configured");
  }
  const challenge = consumeOauthChallenge(db, input.state);
  if (!challenge) throw new ForbiddenError("INVALID_OAUTH_STATE", "Unknown or expired sign-in attempt");

  const tokens = await exchangeGoogleCode({
    code: input.code,
    codeVerifier: challenge.code_verifier,
    redirectUri: googleRedirectUri(),
  });
  if (!tokens.id_token) throw new UnauthenticatedError("Google did not return an ID token");

  const claims = await verifyGoogleIdToken(tokens.id_token, challenge.nonce);
  const allowlist = allowedGoogleEmails(db);
  if (allowlist.length > 0 && !allowlist.includes(claims.email.toLowerCase())) {
    throw new GoogleNotAllowedError();
  }

  const existingIdentity = findGoogleIdentityBySub(db, claims.sub);
  const user = existingIdentity ? findUserById(db, existingIdentity.user_id) : bootstrapFromGoogle(db, claims.email);
  if (!user) throw new UnauthenticatedError();

  linkGoogleIdentity(db, { userId: user.id, sub: claims.sub, email: claims.email, pictureUrl: claims.picture });
  touchLastLogin(db, user.id);
  const limits = sessionLimits(db);
  const session = createSession(db, {
    userId: user.id,
    idleMinutes: limits.idleMinutes,
    absoluteHours: limits.absoluteHours,
    ip: input.ip,
    userAgent: input.userAgent,
  });
  logger.info({ userId: user.id, sub: claims.sub }, "google sign-in completed");
  return { session, user };
}

function bootstrapFromGoogle(db: Db, email: string): UserRow {
  if (needsBootstrap(db)) return createUser(db, { email, passwordHash: null });
  const existing = findUserByEmail(db, email);
  if (existing) return existing;
  throw new ForbiddenError("OWNER_ACCOUNT_EXISTS", "A different owner account is already configured");
}

export function changePassword(
  db: Db,
  input: { sessionId: string; currentPassword: string; newPassword: string },
): void {
  const session = findSessionById(db, input.sessionId);
  if (!session) throw new UnauthenticatedError();
  const user = findUserById(db, session.user_id);
  if (!user?.password_hash || !verifyPassword(input.currentPassword, user.password_hash)) {
    throw new InvalidCredentialsError();
  }
  if (input.newPassword.length < env.SKP_PASSWORD_MIN_LENGTH) {
    throw new ValidationError(`Master password must be at least ${env.SKP_PASSWORD_MIN_LENGTH} characters`);
  }
  updatePasswordHash(db, user.id, hashPassword(input.newPassword));
  revokeSession(db, session.id);
  rotateSession(db, session.id);
  logger.info({ userId: user.id }, "master password changed, sessions rotated");
}

export function auditAuth(
  db: Db,
  input: {
    traceId: string;
    actor: string;
    action: string;
    target?: string;
    outcome: "success" | "denied" | "error";
    detail?: string;
  },
): void {
  recordAudit(db, input);
}
