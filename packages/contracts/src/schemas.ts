import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared API contract (contract-first: packages/server and packages/web both
// import these schemas; the OpenAPI document lives in /contracts/openapi.yaml).
// ---------------------------------------------------------------------------

export const ISO_DATE = z.string().min(1);

export const apiErrorResponseSchema = z.object({
  code: z.string(),
  message: z.string(),
  data: z.unknown().optional(),
  timestamp: ISO_DATE,
  traceId: z.string(),
});

export const apiOkSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({
    code: z.literal("OK"),
    message: z.string().optional(),
    data,
    timestamp: ISO_DATE,
    traceId: z.string(),
  });

// --- auth ------------------------------------------------------------------

export interface AuthUserView {
  id: string;
  email: string;
  methods: Array<"password" | "google">;
}

export const authStatusSchema = z.object({
  needsBootstrap: z.boolean(),
  passwordConfigured: z.boolean(),
  googleConfigured: z.boolean(),
  googleAllowedEmails: z.array(z.string()),
  passwordMinLength: z.number(),
});

export const bootstrapRequestSchema = z.object({
  email: z.email(),
  masterPassword: z.string().min(12),
});

export const loginRequestSchema = z.object({
  email: z.email(),
  masterPassword: z.string().min(1),
});

export const verifyPasswordRequestSchema = z.object({
  masterPassword: z.string().min(1),
});

/**
 * Lower bound is the config floor (SKP_PASSWORD_MIN_LENGTH accepts 8-64); the
 * authoritative length rule is server-side so the contract stays env-agnostic.
 */
export const registerRequestSchema = z.object({
  email: z.email(),
  masterPassword: z.string().min(8),
  confirmPassword: z.string().min(8),
});

export const userListItemSchema = z.object({
  id: z.string(),
  email: z.string(),
  methods: z.array(z.enum(["password", "google"])),
  createdAt: ISO_DATE,
  lastLoginAt: ISO_DATE.nullable(),
});

export const userListSchema = z.object({
  items: z.array(userListItemSchema),
  total: z.number(),
});

export const googleStartResponseSchema = z.object({
  authorizationUrl: z.string(),
  state: z.string(),
  expiresAt: ISO_DATE,
});

export const sessionUserSchema = z.object({
  id: z.string(),
  email: z.email(),
  methods: z.array(z.enum(["password", "google"])),
});

export const logoutResponseSchema = z.object({ revoked: z.literal(true) });

// --- providers / sources ---------------------------------------------------

export const providerSchema = z.object({
  id: z.string(),
  label: z.string(),
  keyPrefixes: z.array(z.string()),
  docsUrl: z.string().optional(),
});

export const sourceKindSchema = z.enum([
  "file",
  "env-file",
  "keychain",
  "regex-file",
]);

export const sourceSchema = z.object({
  id: z.string(),
  kind: sourceKindSchema,
  path: z.string(),
  parser: z.enum(["json", "yaml", "toml", "dotenv", "raw", "keychain"]),
  providerHint: z.string().optional(),
  enabled: z.boolean(),
  priority: z.number(),
  notes: z.string().optional(),
});

export const createSourceSchema = z.object({
  kind: sourceKindSchema,
  path: z.string().min(1),
  parser: z.enum(["json", "yaml", "toml", "dotenv", "raw", "keychain"]),
  providerHint: z.string().optional(),
  notes: z.string().optional(),
});

export const updateSourceSchema = z.object({
  enabled: z.boolean().optional(),
  path: z.string().min(1).optional(),
  notes: z.string().optional(),
});

// --- keys ------------------------------------------------------------------

export const keyStatusSchema = z.enum(["active", "removed", "archived"]);
export const verificationStatusSchema = z.enum([
  "unknown",
  "valid",
  "invalid",
  "error",
]);

/**
 * One place a secret was found. Keys are deduped by value, so one secret can
 * hold several homes (`~/.codex/auth.json` and `~/.claude/settings.json` can
 * carry the same relay token); `sources` lists them all, oldest first, and
 * includes the key's primary source.
 */
export const sourceSightingSchema = z.object({
  sourceKind: sourceKindSchema,
  sourcePath: z.string(),
  sourcePointer: z.string().optional(),
  envVarName: z.string().optional(),
  firstSeenAt: ISO_DATE,
  lastSeenAt: ISO_DATE,
});

export const maskedKeySchema = z.object({
  id: z.string(),
  provider: z.string(),
  providerLabel: z.string(),
  label: z.string().optional(),
  maskedValue: z.string(),
  fingerprint: z.string(),
  sourceKind: sourceKindSchema,
  sourcePath: z.string(),
  sourcePointer: z.string().optional(),
  envVarName: z.string().optional(),
  firstSeenAt: ISO_DATE,
  lastSeenAt: ISO_DATE,
  sourceMtime: ISO_DATE.optional(),
  lastVerifiedAt: ISO_DATE.optional(),
  verificationStatus: verificationStatusSchema,
  status: keyStatusSchema,
  sources: z.array(sourceSightingSchema),
});

export const keyEventSchema = z.object({
  id: z.string(),
  type: z.enum([
    "discovered",
    "revealed",
    "verified",
    "rotated",
    "removed",
    "archived",
    "deleted",
  ]),
  at: ISO_DATE,
  actor: z.string(),
  note: z.string().optional(),
});

export const keyDetailSchema = maskedKeySchema.extend({
  events: z.array(keyEventSchema),
  tags: z.array(z.string()),
});

export const revealKeyResponseSchema = z.object({
  value: z.string(),
  expiresAt: ISO_DATE,
});

export const verifyKeyResponseSchema = z.object({
  verificationStatus: verificationStatusSchema,
  detail: z.string(),
  checkedAt: ISO_DATE,
});

export const updateKeyRequestSchema = z.object({
  label: z.string().max(120).optional(),
  tags: z.array(z.string().max(40)).max(10).optional(),
  status: z.enum(["active", "archived"]).optional(),
});

export const keyListSchema = z.object({
  items: z.array(maskedKeySchema),
  total: z.number(),
});

// --- scans -----------------------------------------------------------------

export const scanStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
  "canceled",
]);

export const scanRunSchema = z.object({
  id: z.string(),
  status: scanStatusSchema,
  triggerKind: z.enum(["manual", "schedule"]),
  startedAt: ISO_DATE,
  finishedAt: ISO_DATE.optional(),
  sourceCount: z.number(),
  newCount: z.number(),
  updatedCount: z.number(),
  removedCount: z.number(),
  totalCount: z.number(),
  errorCode: z.string().optional(),
});

export const scanProgressEventSchema = z.object({
  runId: z.string(),
  at: ISO_DATE,
  phase: z.enum([
    "started",
    "source",
    "candidate",
    "error",
    "finished",
    "canceled",
  ]),
  sourceId: z.string().optional(),
  message: z.string(),
  counts: z
    .object({
      newCount: z.number(),
      updatedCount: z.number(),
      removedCount: z.number(),
    })
    .optional(),
});

export const triggerScanRequestSchema = z.object({
  sourceIds: z.array(z.string()).optional(),
});

// --- settings / audit ------------------------------------------------------

export const settingsSchema = z.object({
  googleAllowedEmails: z.array(z.string()),
  sessionIdleMinutes: z.number(),
  sessionAbsoluteHours: z.number(),
  verifyKeysOptIn: z.boolean(),
  scanRoot: z.string(),
});

export const updateSettingsSchema = z.object({
  googleAllowedEmails: z.array(z.string()).optional(),
  sessionIdleMinutes: z.number().min(5).max(240).optional(),
  sessionAbsoluteHours: z.number().min(1).max(168).optional(),
  verifyKeysOptIn: z.boolean().optional(),
});

export const auditEntrySchema = z.object({
  id: z.string(),
  at: ISO_DATE,
  traceId: z.string(),
  actor: z.string(),
  action: z.string(),
  target: z.string().optional(),
  outcome: z.enum(["success", "denied", "error"]),
  detail: z.string().optional(),
});

export const auditListSchema = z.object({
  items: z.array(auditEntrySchema),
  total: z.number(),
});

export const healthSchema = z.object({
  status: z.literal("ok"),
  version: z.string(),
  uptimeSeconds: z.number(),
  tls: z.literal(true),
});

// --- inferred types --------------------------------------------------------

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
export type AuthStatus = z.infer<typeof authStatusSchema>;
export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type UserListItem = z.infer<typeof userListItemSchema>;
export type UserList = z.infer<typeof userListSchema>;
export type BootstrapRequest = z.infer<typeof bootstrapRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type VerifyPasswordRequest = z.infer<typeof verifyPasswordRequestSchema>;
export type GoogleStartResponse = z.infer<typeof googleStartResponseSchema>;
export type SessionUser = z.infer<typeof sessionUserSchema>;
export type Provider = z.infer<typeof providerSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type SourceKind = z.infer<typeof sourceKindSchema>;
export type CreateSourceInput = z.infer<typeof createSourceSchema>;
export type UpdateSourceInput = z.infer<typeof updateSourceSchema>;
export type SourceSighting = z.infer<typeof sourceSightingSchema>;
export type MaskedKey = z.infer<typeof maskedKeySchema>;
export type KeyEvent = z.infer<typeof keyEventSchema>;
export type KeyDetail = z.infer<typeof keyDetailSchema>;
export type KeyStatus = z.infer<typeof keyStatusSchema>;
export type VerificationStatus = z.infer<typeof verificationStatusSchema>;
export type RevealKeyResponse = z.infer<typeof revealKeyResponseSchema>;
export type VerifyKeyResponse = z.infer<typeof verifyKeyResponseSchema>;
export type UpdateKeyInput = z.infer<typeof updateKeyRequestSchema>;
export type KeyList = z.infer<typeof keyListSchema>;
export type ScanRun = z.infer<typeof scanRunSchema>;
export type ScanStatus = z.infer<typeof scanStatusSchema>;
export type ScanProgressEvent = z.infer<typeof scanProgressEventSchema>;
export type TriggerScanInput = z.infer<typeof triggerScanRequestSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
export type AuditEntry = z.infer<typeof auditEntrySchema>;
export type AuditList = z.infer<typeof auditListSchema>;
export type Health = z.infer<typeof healthSchema>;
