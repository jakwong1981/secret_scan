import {
  randomBytes,
  scryptSync as _scrypt,
  timingSafeEqual,
  createHash,
} from "node:crypto";

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 32;

function scrypt(password: string, salt: Buffer): Buffer {
  return _scrypt(password, salt, KEY_LENGTH, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
}

/** Returns `scrypt$N$r$p$saltHex$hashHex` for storage in `users.password_hash`. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scrypt(password, salt);
  return ["scrypt", SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString("hex"), hash.toString("hex")].join("$");
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [n, r, p] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  const salt = Buffer.from(parts[4] ?? "", "hex");
  const expected = Buffer.from(parts[5] ?? "", "hex");
  if (!Number.isFinite(n) || salt.length === 0 || expected.length === 0) return false;
  const actual = salt.length === 16 ? scrypt(password, salt) : _scrypt(password, salt, expected.length, { N: n, r, p });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Deterministic SHA-256 fingerprint — used for dedupe, never for secrecy. */
export function fingerprint(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
