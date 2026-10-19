import { describe, expect, it } from "vitest";
import { classifyProvider } from "../../src/infra/scanner/provider-registry.js";
import { PROVIDER_BY_ID } from "../../src/infra/scanner/provider-registry.js";
import { asEvidence } from "../../src/infra/scanner/provider-registry.js";

describe("classifyProvider", () => {
  it("uses value prefixes as the authoritative signal", () => {
    expect(
      classifyProvider({ value: "sk-ant-api03-abc", keyName: "token" }),
    ).toBe("anthropic");
    expect(
      classifyProvider({ value: "hf_abcdefghijk", keyName: "token" }),
    ).toBe("huggingface");
    expect(
      classifyProvider({ value: "ghp_abcdefghijk", keyName: "password" }),
    ).toBe("github");
    expect(
      classifyProvider({ value: "AIzaSyA-12345", keyName: "secret" }),
    ).toBe("google-ai");
  });

  it("prefers env-var hints over disputed prefixes", () => {
    expect(
      classifyProvider({
        value: "sk-sharedPrefixValue123456",
        keyName: "token",
        envVarName: "DASHSCOPE_API_KEY",
      }),
    ).toBe("qwen");
  });

  it("reads the vendor or CLI out of the key name and JSON pointer", () => {
    // ~/.arkcli-bp/.env — Volcengine tokens with no vendor prefix.
    expect(
      classifyProvider({
        value: "AKTP27JkExampleSecretValue",
        keyName: "VOLCENGINE_STS_ACCESS_KEY",
        envVarName: "VOLCENGINE_STS_ACCESS_KEY",
      }),
    ).toBe("byteplus-ark");
    // ~/.openclaw/openclaw.json — provider block named in the pointer.
    expect(
      classifyProvider({
        value: "bp-abcdefghijklmnopqrstuvwxyz",
        keyName: "apiKey",
        envVarName: "models.providers.byteplus-plan.apiKey",
      }),
    ).toBe("byteplus-ark");
    // ~/.pi/agent/auth.json — the provider id is the pointer segment.
    expect(
      classifyProvider({
        value: "e30.eyJhbGciOiJSUzI1NiJ9.payload-signature",
        keyName: "access",
        envVarName: "kimi-coding.access",
      }),
    ).toBe("moonshot");
    expect(
      classifyProvider({
        value: "sk-or-v1-abcdefghijklmnopqrstuvwx",
        keyName: "key",
        envVarName: "openrouter.key",
      }),
    ).toBe("openrouter");
    // ~/.grok/auth.json — the pointer embeds auth.x.ai.
    expect(
      classifyProvider({
        value: "IOQR8mExampleRefreshTokenValue",
        keyName: "refresh_token",
        envVarName: "https://auth.x.ai::guid.refresh_token",
      }),
    ).toBe("xai");
  });

  it("keeps ~/.qwen/settings.json on qwen via the source hint", () => {
    expect(
      classifyProvider({
        value: "sk-sp-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789",
        keyName: "apiKey",
        envVarName: "security.auth.apiKey",
        providerHint: "qwen",
      }),
    ).toBe("qwen");
    expect(PROVIDER_BY_ID.has("qwen")).toBe(true);
  });

  it("respects the source provider hint when known", () => {
    expect(
      classifyProvider({
        value: "whatever-value",
        keyName: "k",
        providerHint: "byteplus-ark",
      }),
    ).toBe("byteplus-ark");
  });

  it("lets a strong value prefix beat the source hint", () => {
    expect(
      classifyProvider({
        value: "sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz",
        keyName: "token",
        providerHint: "openai",
      }),
    ).toBe("anthropic");
  });

  it("routes bare sk- values to the source hint when nothing stronger matches", () => {
    expect(
      classifyProvider({
        value: "sk-abcdefghijklmnopqrstuvw",
        keyName: "token",
        providerHint: "bailian",
      }),
    ).toBe("bailian");
  });

  it("falls back to unknown without evidence", () => {
    expect(classifyProvider({ value: "Zz1234567890zz", keyName: "misc" })).toBe(
      "unknown",
    );
  });

  it("keeps the catalogue consistent", () => {
    for (const id of ["anthropic", "openai", "bailian", "unknown"]) {
      expect(PROVIDER_BY_ID.has(id)).toBe(true);
    }
    expect(PROVIDER_BY_ID.get("anthropic")?.label).toBe("Anthropic (Claude)");
  });
});

describe("asEvidence", () => {
  it("narrows a persisted evidence label", () => {
    expect(asEvidence("name")).toBe("name");
    expect(asEvidence("source-hint")).toBe("source-hint");
    expect(asEvidence("default")).toBe("default");
  });

  it("rejects unknown or missing labels instead of ranking them", () => {
    // A label this build does not know must count as "no stored evidence",
    // otherwise every newly added weaker signal would outvote it.
    expect(asEvidence("vibes")).toBeNull();
    expect(asEvidence("")).toBeNull();
    expect(asEvidence(null)).toBeNull();
    expect(asEvidence(undefined)).toBeNull();
  });
});
