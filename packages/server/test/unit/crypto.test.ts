import { describe, expect, it } from "vitest";
import { fingerprint, hashPassword, verifyPassword } from "../../src/core/crypto/password.js";
import { maskSecret } from "../../src/core/crypto/mask.js";
import { decryptSecret, encryptSecret } from "../../src/core/crypto/vault.js";

describe("password hashing", () => {
  it("produces a scrypt hash that verifies", () => {
    const stored = hashPassword("correct horse battery staple");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("correct horse battery staple", stored)).toBe(true);
    expect(verifyPassword("wrong horse battery staple", stored)).toBe(false);
  });

  it("uses a unique salt per hash", () => {
    const a = hashPassword("same-password-123");
    const b = hashPassword("same-password-123");
    expect(a).not.toBe(b);
  });
});

describe("masking", () => {
  it("keeps head and tail only", () => {
    expect(maskSecret("sk-ant-api03-AdT1234567890wXyZ")).toBe("sk-ant••••••wXyZ");
  });

  it("fully masks short values", () => {
    expect(maskSecret("short")).toBe("•••••");
  });
});

describe("vault envelope", () => {
  it("round-trips a secret", () => {
    const envelope = encryptSecret("sk-ant-super-secret-key");
    const decrypted = decryptSecret(envelope);
    expect(decrypted).toBe("sk-ant-super-secret-key");
  });

  it("uses a fresh IV per encryption", () => {
    const a = encryptSecret("same-value");
    const b = encryptSecret("same-value");
    expect(a.iv).not.toBe(b.iv);
    expect(a.cipherText).not.toBe(b.cipherText);
  });

  it("detects tampering with the ciphertext", () => {
    const envelope = encryptSecret("sk-ant-tamper-check");
    const tampered = { ...envelope, cipherText: Buffer.from(envelope.cipherText, "base64").toString("base64") };
    const flipped = Buffer.from(tampered.cipherText, "base64");
    flipped[0] = (flipped[0] ?? 0) ^ 0xff;
    tampered.cipherText = flipped.toString("base64");
    expect(() => decryptSecret(tampered)).toThrowError();
  });
});

describe("fingerprint", () => {
  it("is stable and length 64 hex", () => {
    const value = "sk-ant-fingerprint";
    expect(fingerprint(value)).toBe(fingerprint(value));
    expect(fingerprint(value)).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprint(value)).not.toBe(fingerprint("other"));
  });
});
