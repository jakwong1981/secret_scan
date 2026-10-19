import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { env } from "../../config/env.js";
import { AppError } from "../errors/app-error.js";
import { logger } from "../logging/logger.js";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const AAD = "SecretKeyPreview.vault.v1";
const KDF_SALT = "SecretKeyPreview.vault.kdf.v1";

export interface CipherEnvelope {
  cipherText: string;
  iv: string;
  authTag: string;
}

function keychainReadMasterKey(): string | null {
  try {
    const value = execFileSync(
      "security",
      ["find-generic-password", "-s", env.SKP_VAULT_KEYCHAIN_SERVICE, "-w"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return value.trim();
  } catch {
    return null;
  }
}

function keychainWriteMasterKey(base64Key: string): void {
  execFileSync(
    "security",
    [
      "add-generic-password",
      "-U",
      "-s",
      env.SKP_VAULT_KEYCHAIN_SERVICE,
      "-a",
      "SecretKeyPreview",
      "-w",
      base64Key,
      "-D",
      "SecretKeyPreview vault master key",
    ],
    { stdio: ["ignore", "ignore", "ignore"] },
  );
}

/**
 * Master key resolution order:
 *  1. `SKP_VAULT_MASTER_KEY_FILE` (32-byte base64 file)
 *  2. macOS login keychain (auto-created on first run)
 *  3. `SKP_VAULT_MASTER_PASSWORD` (Argon2-like deterministic KDF) — container/headless mode
 */
export function resolveMasterKey(): Buffer {
  if (env.SKP_VAULT_MASTER_KEY_FILE) {
    const raw = readFileSync(env.SKP_VAULT_MASTER_KEY_FILE, "utf8").trim();
    const key = Buffer.from(raw, "base64");
    if (key.length !== 32) {
      throw new AppError(
        500,
        "VAULT_KEY_INVALID",
        "Vault master key file must contain 32 base64 bytes",
      );
    }
    return key;
  }

  if (process.platform === "darwin") {
    const existing = keychainReadMasterKey();
    if (existing) return Buffer.from(existing, "base64");
    const fresh = randomBytes(32);
    keychainWriteMasterKey(fresh.toString("base64"));
    logger.info("generated a new vault master key in the macOS keychain");
    return fresh;
  }

  if (env.SKP_VAULT_MASTER_PASSWORD) {
    return scryptSync(env.SKP_VAULT_MASTER_PASSWORD, KDF_SALT, 32);
  }

  throw new AppError(
    500,
    "VAULT_KEY_MISSING",
    "No vault master key available: set SKP_VAULT_MASTER_KEY_FILE or SKP_VAULT_MASTER_PASSWORD",
  );
}

let cachedKey: Buffer | null = null;

export function masterKey(): Buffer {
  cachedKey ??= resolveMasterKey();
  return cachedKey;
}

export function encryptSecret(plaintext: string): CipherEnvelope {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, masterKey(), iv, {
    authTagLength: 16,
  });
  cipher.setAAD(Buffer.from(AAD, "utf8"));
  const cipherText = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return {
    cipherText: cipherText.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptSecret(envelope: CipherEnvelope): string {
  const decipher = createDecipheriv(
    ALGORITHM,
    masterKey(),
    Buffer.from(envelope.iv, "base64"),
    { authTagLength: 16 },
  );
  decipher.setAAD(Buffer.from(AAD, "utf8"));
  decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));
  try {
    return Buffer.concat([
      decipher.update(Buffer.from(envelope.cipherText, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new AppError(
      500,
      "VAULT_DECRYPTION_ERROR",
      "Stored value could not be decrypted",
    );
  }
}

/** Test seam: keeps a fixed key for the process lifetime. */
export function __resetMasterKeyForTests(): void {
  cachedKey = null;
}
