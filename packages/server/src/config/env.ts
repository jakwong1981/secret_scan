import { z } from "zod";

const boolFromEnv = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((v) =>
      v === undefined || v === "" ? fallback : v === "true" || v === "1",
    );

const envSchema = z.object({
  SKP_HOST: z.string().default("127.0.0.1"),
  SKP_PORT: z.coerce.number().int().min(1).max(65535).default(4173),
  SKP_PUBLIC_ORIGIN: z
    .url({ protocol: /^https$/ })
    .default("https://127.0.0.1:4173"),
  SKP_LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  SKP_NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("production"),

  SKP_DATA_DIR: z.string().default("./data"),
  SKP_DB_FILE: z.string().default("secretkeypreview.db"),

  SKP_TLS_CERT_PATH: z.string().default("./certs/localhost.pem"),
  SKP_TLS_KEY_PATH: z.string().default("./certs/localhost-key.pem"),
  SKP_TLS_MIN_VERSION: z.enum(["TLSv1.2", "TLSv1.3"]).default("TLSv1.3"),
  SKP_CERTS_DIR: z.string().default("./certs"),
  SKP_ENABLE_HTTP_REDIRECT: boolFromEnv(false),
  SKP_HTTP_REDIRECT_PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .default(4180),

  SKP_VAULT_KEYCHAIN_SERVICE: z.string().default("SecretKeyPreview.vault"),
  SKP_VAULT_MASTER_KEY_FILE: z.string().optional(),
  SKP_VAULT_MASTER_PASSWORD: z.string().optional(),

  SKP_SESSION_IDLE_MINUTES: z.coerce.number().int().min(5).max(240).default(30),
  SKP_SESSION_ABSOLUTE_HOURS: z.coerce
    .number()
    .int()
    .min(1)
    .max(168)
    .default(12),
  SKP_PASSWORD_MIN_LENGTH: z.coerce.number().int().min(8).max(64).default(12),

  SKP_GOOGLE_CLIENT_ID: z.string().optional(),
  SKP_GOOGLE_CLIENT_SECRET: z.string().optional(),
  SKP_GOOGLE_ALLOWED_EMAILS: z.string().optional(),

  SKP_SCAN_ROOT: z.string().default("~"),
  SKP_VERIFY_KEYS_OPT_IN: boolFromEnv(false),
  /**
   * Self-service sign-up default: on for loopback bindings, off when the server
   * binds beyond 127.0.0.1/localhost — every account previews the same vault,
   * so a non-loopback bind must opt into public registration explicitly.
   */
  SKP_ENABLE_REGISTRATION: boolFromEnv(true),
  /** Disable the macOS Keychain source (CI, containers, headless hosts). */
  SKP_KEYCHAIN_SCAN: boolFromEnv(true),
});

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

export type AppEnv = z.infer<typeof envSchema>;

function load(): AppEnv {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  const data = parsed.data;
  if (
    process.env.SKP_ENABLE_REGISTRATION === undefined ||
    process.env.SKP_ENABLE_REGISTRATION === ""
  ) {
    data.SKP_ENABLE_REGISTRATION = LOOPBACK_HOSTS.has(data.SKP_HOST);
  }
  return data;
}

export const env: AppEnv = load();

export function googleAllowedEmails(): string[] {
  return (env.SKP_GOOGLE_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
}

export function googleConfigured(): boolean {
  return Boolean(env.SKP_GOOGLE_CLIENT_ID && env.SKP_GOOGLE_CLIENT_SECRET);
}

export const googleRedirectUri = (): string =>
  `${env.SKP_PUBLIC_ORIGIN}/api/v1/auth/google/callback`;
