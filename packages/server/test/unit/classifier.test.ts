import { describe, expect, it } from "vitest";
import { classifyProvider } from "../../src/infra/scanner/provider-registry.js";
import { PROVIDER_BY_ID } from "../../src/infra/scanner/provider-registry.js";

describe("classifyProvider", () => {
  it("uses value prefixes as the authoritative signal", () => {
    expect(classifyProvider({ value: "sk-ant-api03-abc", keyName: "token" })).toBe("anthropic");
    expect(classifyProvider({ value: "hf_abcdefghijk", keyName: "token" })).toBe("huggingface");
    expect(classifyProvider({ value: "ghp_abcdefghijk", keyName: "password" })).toBe("github");
    expect(classifyProvider({ value: "AIzaSyA-12345", keyName: "secret" })).toBe("google-ai");
  });

  it("prefers env-var hints over disputed prefixes", () => {
    expect(
      classifyProvider({
        value: "sk-sharedPrefixValue123456",
        keyName: "token",
        envVarName: "DASHSCOPE_API_KEY",
      }),
    ).toBe("bailian");
  });

  it("respects the source provider hint when known", () => {
    expect(
      classifyProvider({ value: "whatever-value", keyName: "k", providerHint: "byteplus-ark" }),
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
      classifyProvider({ value: "sk-abcdefghijklmnopqrstuvw", keyName: "token", providerHint: "bailian" }),
    ).toBe("bailian");
  });

  it("falls back to unknown without evidence", () => {
    expect(classifyProvider({ value: "Zz1234567890zz", keyName: "misc" })).toBe("unknown");
  });

  it("keeps the catalogue consistent", () => {
    for (const id of ["anthropic", "openai", "bailian", "unknown"]) {
      expect(PROVIDER_BY_ID.has(id)).toBe(true);
    }
    expect(PROVIDER_BY_ID.get("anthropic")?.label).toBe("Anthropic (Claude)");
  });
});
