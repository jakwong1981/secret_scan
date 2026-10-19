import { describe, expect, it } from "vitest";
import {
  parseDotenvText,
  parseJsonText,
  parseRawText,
  parseTomlText,
  parseYamlText,
} from "../../src/infra/scanner/parsers.js";

describe("json parser", () => {
  it("extracts credential-shaped values with pointers", () => {
    const text = JSON.stringify({
      auth_mode: "apikey",
      OPENAI_API_KEY: "sk-proj-abcdefghijklmnopqrstuvwx",
      nested: { providers: [{ api_key: "gsk_abcdefghijklmnopqrstuvwx" }] },
      innocuous: "not-a-secret",
    });
    const entries = parseJsonText(text);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      keyName: "OPENAI_API_KEY",
      pointer: "OPENAI_API_KEY",
    });
    expect(entries[1]).toMatchObject({
      pointer: "nested.providers[0].api_key",
    });
  });

  it("tolerates JSONC comments and trailing commas", () => {
    const text = `{
      // codex style config
      "token": "hf_abcdefghijklmnopqrstuvwxyz",
    }`;
    const entries = parseJsonText(text);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.value).toBe("hf_abcdefghijklmnopqrstuvwxyz");
  });

  it("ignores placeholders and short values", () => {
    const text = JSON.stringify({
      api_key: "changeme",
      token: "abc",
      secret: "<your-key>",
    });
    expect(parseJsonText(text)).toHaveLength(0);
  });

  it("ignores names, identifiers, paths, urls and timestamps", () => {
    const text = JSON.stringify({
      token_plan: { api_key_capabilities: ["video.upload", "image.describe"] },
      apiKey: "DASHSCOPE_API_KEY",
      envKey: "OPENAI_API_KEY",
      oauth: { key: "oauth/kimi-code-env-0e4f99c69cc27850" },
      token_uri: "https://oauth2.googleapis.com/token",
      notice: "plugin:figma",
      refreshed_at: "1792076800000",
      mcpNeedsAuthNoticed: ["plugin:figma"],
    });
    expect(parseJsonText(text)).toHaveLength(0);
  });

  it("reads standalone credential leaves such as key/access/refresh", () => {
    const text = JSON.stringify({
      kimi: {
        coding: {
          access: "e30.eyJhbGciOiJSUzI1NiJ9.sig",
          refresh: "r30.RefreshTokenValue",
        },
      },
      opencode: { key: "opencode-abcdefghijklmnopqrstuvwx" },
      envKey: "JUST_A_NAME",
    });
    const entries = parseJsonText(text);
    expect(entries.map((entry) => entry.pointer)).toEqual([
      "kimi.coding.access",
      "kimi.coding.refresh",
      "opencode.key",
    ]);
  });
});

describe("yaml parser", () => {
  it("reads nested provider api keys", () => {
    const text = `
models:
  - name: claude
    provider: anthropic
    apiKey: "sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz"
`;
    const entries = parseYamlText(text);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.value).toBe("sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz");
    expect(entries[0]?.pointer).toBe("models[0].apiKey");
  });
});

describe("toml parser", () => {
  it("reads tables", () => {
    const text = `
[providers.openai]
api_key = "sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz"
`;
    const entries = parseTomlText(text);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.pointer).toBe("providers.openai.api_key");
  });
});

describe("dotenv parser", () => {
  it("reads exports and quoted values", () => {
    const text = `
# comment
export ANTHROPIC_API_KEY="sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz"
OPENAI_API_KEY=sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz
NOT_A_SECRET=hello
`;
    const entries = parseDotenvText(text);
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.keyName)).toEqual([
      "ANTHROPIC_API_KEY",
      "OPENAI_API_KEY",
    ]);
  });
});

describe("raw parser", () => {
  it("finds key-shaped values anywhere in a file", () => {
    const text = `irrelevant header\nsome_token=sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz\nfooter`;
    const entries = parseRawText(text);
    expect(
      entries.some((entry) => entry.value.startsWith("sk-ant-api03-")),
    ).toBe(true);
  });

  it("reads a file that is a single bare token", () => {
    const entries = parseRawText("sk-sp-AbCdEfGhIjKlMnOpQrStUvWxYz012345\n");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.value).toBe("sk-sp-AbCdEfGhIjKlMnOpQrStUvWxYz012345");
    expect(entries[0]?.pointer).toBe("raw:token");
  });

  it("deduplicates repeated values", () => {
    const text =
      "sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz";
    const entries = parseRawText(text);
    expect(
      entries.filter((entry) => entry.value.startsWith("sk-ant-")),
    ).toHaveLength(1);
  });
});
