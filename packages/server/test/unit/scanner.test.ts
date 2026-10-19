import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createDatabase, runMigrations } from "../../src/infra/db/database.js";
import { seedRegistry } from "../../src/infra/db/seed.js";
import { runScan } from "../../src/infra/scanner/scanner.js";
import {
  findKeyById,
  listKeys,
  listKeySources,
  markUnseenAsRemoved,
} from "../../src/infra/db/repositories/key.repository.js";
import { decryptKeyValue } from "../../src/infra/db/repositories/key.repository.js";
import type {
  ScanEvent,
  SourceDefinition,
} from "../../src/infra/scanner/types.js";

const ANTHROPIC_KEY = "sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz012345";
const OPENAI_KEY = "sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz012345";
const HF_KEY = "hf_abcdefghijklmnopqrstuvwxyz";
const SHARED_KEY = "sk-sp-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";
const TEAMO_TOKEN =
  "sk-teamo-333f4ca58d303de649849ddf20be9d11be50b240de2d1f52e048cfacc42ee6e0";
const OPENAI_PROJECT_KEY = "sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz012345";

let home: string;
let db: ReturnType<typeof createDatabase>;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "skp-scan-home-"));
  mkdirSync(join(home, ".codex"), { recursive: true });
  mkdirSync(join(home, ".ollama"), { recursive: true });
  writeFileSync(
    join(home, ".codex/auth.json"),
    JSON.stringify({ auth_mode: "apikey", OPENAI_API_KEY: OPENAI_KEY }),
  );
  writeFileSync(
    join(home, ".ollama/config.json"),
    JSON.stringify({ token: HF_KEY }),
  );
  writeFileSync(
    join(home, ".zshrc"),
    `export ANTHROPIC_API_KEY="${ANTHROPIC_KEY}"\nexport PATH=/usr/bin:$PATH\n`,
  );
  db = createDatabase(":memory:");
  runMigrations(db);
  seedRegistry(db);
});

afterEach(() => {
  db.close();
});

function sources(
  overrides: Partial<SourceDefinition> = {},
): SourceDefinition[] {
  return [
    {
      id: "codex-auth",
      kind: "file",
      path: join(home, ".codex/auth.json"),
      parser: "json",
      enabled: true,
      priority: 10,
    },
    {
      id: "ollama-config",
      kind: "file",
      path: join(home, ".ollama/config.json"),
      parser: "json",
      enabled: true,
      priority: 11,
    },
    {
      id: "shell-zshrc",
      kind: "env-file",
      path: join(home, ".zshrc"),
      parser: "dotenv",
      enabled: true,
      priority: 12,
    },
    ...(Object.keys(overrides).length > 0
      ? [
          {
            ...overrides,
            id: overrides.id ?? "extra",
            enabled: true,
            priority: 13,
          } as SourceDefinition,
        ]
      : []),
  ];
}

describe("scan pipeline", () => {
  it("discovers, classifies and stores keys with evidence", async () => {
    const events: ScanEvent[] = [];
    const outcome = await runScan({
      db,
      sources: sources(),
      triggerKind: "manual",
      actor: "test",
      emit: (event) => events.push(event),
    });

    expect(outcome.status).toBe("completed");
    expect(outcome.counts.totalCount).toBe(3);
    expect(outcome.counts.newCount).toBe(3);
    expect(events.map((event) => event.phase)).toContain("finished");

    const keys = listKeys(db, { limit: 50, offset: 0, sort: "provider" });
    expect(keys.map((key) => key.provider).sort()).toEqual([
      "anthropic",
      "huggingface",
      "openai",
    ]);

    const anthropic = keys.find((key) => key.provider === "anthropic");
    expect(anthropic?.source_path).toBe(join(home, ".zshrc"));
    expect(anthropic?.source_mtime).not.toBeNull();
    expect(anthropic?.masked_value.startsWith("sk-ant")).toBe(true);
    expect(anthropic?.masked_value).not.toContain(ANTHROPIC_KEY);
    if (anthropic) {
      expect(decryptKeyValue(anthropic)).toBe(ANTHROPIC_KEY);
    }
  });

  it("dedupes the same value across files", async () => {
    await runScan({
      db,
      sources: sources(),
      triggerKind: "manual",
      actor: "test",
      emit: () => {},
    });
    const first = listKeys(db, { limit: 50, offset: 0, sort: "provider" });
    expect(first).toHaveLength(3);

    writeFileSync(
      join(home, ".ollama/config.json"),
      JSON.stringify({ token: ANTHROPIC_KEY }),
    );
    const outcome = await runScan({
      db,
      sources: sources(),
      triggerKind: "manual",
      actor: "test",
      emit: () => {},
    });
    expect(outcome.counts.newCount).toBe(0);
    const second = listKeys(db, { limit: 50, offset: 0, sort: "provider" });
    expect(second).toHaveLength(3);
  });

  it("marks keys that disappeared from their source as removed", async () => {
    await runScan({
      db,
      sources: sources(),
      triggerKind: "manual",
      actor: "test",
      emit: () => {},
    });
    const before = listKeys(db, { limit: 50, offset: 0, sort: "provider" });
    const hf = before.find((key) => key.provider === "huggingface");
    expect(hf?.status).toBe("active");

    writeFileSync(
      join(home, ".ollama/config.json"),
      JSON.stringify({ token: "unrelated" }),
    );
    const outcome = await runScan({
      db,
      sources: sources(),
      triggerKind: "manual",
      actor: "test",
      emit: () => {},
    });
    expect(outcome.counts.removedCount).toBe(1);
    const after = listKeys(db, {
      limit: 50,
      offset: 0,
      sort: "provider",
      status: "removed",
    });
    expect(after).toHaveLength(1);
  });

  it("skips missing sources without failing the run", async () => {
    const withMissing = sources({
      id: "missing",
      kind: "file",
      path: join(home, "does-not-exist.json"),
      parser: "json",
      priority: 20,
    });
    const outcome = await runScan({
      db,
      sources: withMissing,
      triggerKind: "manual",
      actor: "test",
      emit: () => {},
    });
    expect(outcome.status).toBe("completed");
    expect(outcome.counts.totalCount).toBe(3);
  });

  it("can be canceled", async () => {
    const controller = new AbortController();
    controller.abort();
    const outcome = await runScan({
      db,
      sources: sources(),
      triggerKind: "manual",
      actor: "test",
      emit: () => {},
      signal: controller.signal,
    });
    expect(outcome.status).toBe("canceled");
  });

  it("re-arms a removed key when the secret reappears", async () => {
    await runScan({
      db,
      sources: sources(),
      triggerKind: "manual",
      actor: "test",
      emit: () => {},
    });
    writeFileSync(
      join(home, ".ollama/config.json"),
      JSON.stringify({ token: "unrelated" }),
    );
    await runScan({
      db,
      sources: sources(),
      triggerKind: "manual",
      actor: "test",
      emit: () => {},
    });
    writeFileSync(
      join(home, ".ollama/config.json"),
      JSON.stringify({ token: HF_KEY }),
    );
    await runScan({
      db,
      sources: sources(),
      triggerKind: "manual",
      actor: "test",
      emit: () => {},
    });
    const active = listKeys(db, {
      limit: 50,
      offset: 0,
      sort: "provider",
      status: "active",
    });
    expect(active.some((key) => key.provider === "huggingface")).toBe(true);
    const hf = findKeyById(
      db,
      active.find((key) => key.provider === "huggingface")?.id ?? "",
    );
    expect(hf?.status).toBe("active");
  });
});

describe("agent tool auth stores", () => {
  function extraSource(
    id: string,
    relativePath: string,
    parser: SourceDefinition["parser"],
    providerHint?: string,
  ): SourceDefinition {
    return {
      id,
      kind:
        parser === "dotenv"
          ? "env-file"
          : parser === "raw"
            ? "regex-file"
            : "file",
      path: join(home, relativePath),
      parser,
      providerHint,
      enabled: true,
      priority: 90,
    };
  }

  async function scanOnly(list: SourceDefinition[]): Promise<void> {
    await runScan({
      db,
      sources: list,
      triggerKind: "manual",
      actor: "test",
      emit: () => {},
    });
  }

  it("classifies continue.yaml models by their provider sibling", async () => {
    mkdirSync(join(home, ".continue"), { recursive: true });
    writeFileSync(
      join(home, ".continue/config.yaml"),
      `models:
  - name: DeepSeek Coder
    provider: deepseek
    model: deepseek-coder
    apiKey: sk-7ade33b3fe744b83bb017e0efb437dca
`,
    );
    await scanOnly([
      extraSource("continue-config", ".continue/config.yaml", "yaml"),
    ]);

    const keys = listKeys(db, { limit: 50, offset: 0, sort: "provider" });
    expect(keys.map((key) => key.provider)).toEqual(["deepseek"]);
    expect(decryptKeyValue(keys[0]!)).toBe(
      "sk-7ade33b3fe744b83bb017e0efb437dca",
    );
  });

  it("classifies pi / openclaw / opencode / kimi auth stores", async () => {
    mkdirSync(join(home, ".pi/agent"), { recursive: true });
    mkdirSync(join(home, ".openclaw"), { recursive: true });
    mkdirSync(join(home, ".local/share/opencode"), { recursive: true });
    mkdirSync(join(home, ".kimi-code"), { recursive: true });
    writeFileSync(
      join(home, ".pi/agent/auth.json"),
      JSON.stringify({
        "kimi-coding": {
          type: "oauth",
          access: "e30.eyJhbGciOiJSUzI1NiJ9.kimi-access-signature",
          refresh: "r30.kimiRefreshTokenValue123456",
        },
        "qwen-token-plan-individual": {
          type: "oauth",
          key: "sk-sp-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789",
        },
        opencode: {
          type: "oauth",
          key: "opencode-abcdefghijklmnopqrstuvwx",
        },
        anthropic: {
          type: "oauth",
          key: "sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz012345",
        },
      }),
    );
    writeFileSync(
      join(home, ".openclaw/openclaw.json"),
      JSON.stringify({
        models: {
          providers: {
            "byteplus-plan": { apiKey: "bp-abcdefghijklmnopqrstuvwxyz012345" },
          },
        },
        gateway: { auth: { token: "gt-abcdefghijklmnopqrstuvwxyz012345" } },
      }),
    );
    writeFileSync(
      join(home, ".local/share/opencode/auth.json"),
      JSON.stringify({
        opencode: { type: "oauth", key: "opencode-local-abcdefghijklmnop" },
      }),
    );
    writeFileSync(
      join(home, ".kimi-code/config.toml"),
      `[providers.teamorouter]
type = "openai"
api_key = "sk-teamAbCdEfGhIjKlMnOpQrStUvWxYz0123"
`,
    );

    await scanOnly([
      extraSource("pi-agent-auth", ".pi/agent/auth.json", "json"),
      extraSource("openclaw-config", ".openclaw/openclaw.json", "json"),
      extraSource(
        "opencode-local-auth",
        ".local/share/opencode/auth.json",
        "json",
      ),
      extraSource(
        "kimi-code-config",
        ".kimi-code/config.toml",
        "toml",
        "moonshot",
      ),
    ]);

    const keys = listKeys(db, { limit: 50, offset: 0, sort: "provider" });
    const providers = keys.map((key) => key.provider).sort();
    expect(providers).toEqual([
      "anthropic",
      "byteplus-ark",
      "moonshot",
      "moonshot",
      "moonshot",
      "opencode",
      "opencode",
      "qwen",
      "unknown",
    ]);
    expect(
      keys.filter((key) => key.provider === "moonshot")[0]?.source_path,
    ).toBe(join(home, ".kimi-code/config.toml"));
    expect(
      keys.find((key) => key.provider === "byteplus-ark")?.source_pointer,
    ).toBe("models.providers.byteplus-plan.apiKey");
  });

  it("prefers the strongest evidence when one secret has several homes", async () => {
    // First home names nothing specific (bare sk- → default openai), the second
    // one names the vendor: the vendor must win.
    mkdirSync(join(home, ".bailian"), { recursive: true });
    mkdirSync(join(home, ".qwen"), { recursive: true });
    writeFileSync(
      join(home, ".bailian/config.json"),
      JSON.stringify({ "token-plan": { api_key: SHARED_KEY } }),
    );
    writeFileSync(
      join(home, ".qwen/settings.json"),
      JSON.stringify({ env: { DASHSCOPE_API_KEY: SHARED_KEY } }),
    );
    await scanOnly([
      extraSource("bailian-config", ".bailian/config.json", "json"),
      extraSource("qwen-settings", ".qwen/settings.json", "json", "qwen"),
    ]);

    const keys = listKeys(db, { limit: 50, offset: 0, sort: "provider" });
    expect(keys).toHaveLength(1);
    expect(keys[0]?.provider).toBe("qwen");
  });

  it("keeps a real OpenAI prefix even when a later file hints another vendor", async () => {
    mkdirSync(join(home, ".qwen"), { recursive: true });
    writeFileSync(
      join(home, ".qwen/settings.json"),
      JSON.stringify({ env: { OPENAI_API_KEY: OPENAI_PROJECT_KEY } }),
    );
    await scanOnly([
      extraSource("qwen-settings", ".qwen/settings.json", "json", "qwen"),
    ]);

    const keys = listKeys(db, { limit: 50, offset: 0, sort: "provider" });
    expect(keys[0]?.provider).toBe("openai");
  });

  it("harvests the Anthropic token from ~/.claude/settings.json", async () => {
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(
      join(home, ".claude/settings.json"),
      JSON.stringify({
        env: {
          ANTHROPIC_AUTH_TOKEN: TEAMO_TOKEN,
          ANTHROPIC_BASE_URL: "https://api.teamorouter.com",
          ANTHROPIC_DEFAULT_OPUS_MODEL: "claude-opus-5-5",
        },
        model: "opus[1m]",
        enabledPlugins: { "figma@claude-plugins-official": true },
      }),
    );
    await scanOnly([
      extraSource("claude-settings", ".claude/settings.json", "json"),
    ]);

    const keys = listKeys(db, { limit: 50, offset: 0, sort: "provider" });
    expect(keys).toHaveLength(1);
    expect(keys[0]?.provider).toBe("anthropic");
    expect(keys[0]?.source_pointer).toBe("env.ANTHROPIC_AUTH_TOKEN");
    expect(decryptKeyValue(keys[0]!)).toBe(TEAMO_TOKEN);
  });

  it("keeps the Anthropic owner of a token a vendor file also claims", async () => {
    // Same relay token in `~/.claude/settings.json` (named ANTHROPIC_*) and in
    // `~/.kimi-code/config.toml` (a moonshot provider hint). The key name is the
    // stronger evidence, so the later hint must not steal the key.
    mkdirSync(join(home, ".claude"), { recursive: true });
    mkdirSync(join(home, ".kimi-code"), { recursive: true });
    writeFileSync(
      join(home, ".claude/settings.json"),
      JSON.stringify({ env: { ANTHROPIC_AUTH_TOKEN: TEAMO_TOKEN } }),
    );
    writeFileSync(
      join(home, ".kimi-code/config.toml"),
      `[providers.teamorouter]\ntype = "openai"\napi_key = "${TEAMO_TOKEN}"\n`,
    );

    const claude = extraSource(
      "claude-settings",
      ".claude/settings.json",
      "json",
    );
    const kimi = extraSource(
      "kimi-code-config",
      ".kimi-code/config.toml",
      "toml",
      "moonshot",
    );

    await scanOnly([claude, kimi]);
    const keys = listKeys(db, { limit: 50, offset: 0, sort: "provider" });
    expect(keys).toHaveLength(1);
    expect(keys[0]?.provider).toBe("anthropic");
    expect(keys[0]?.provider_evidence).toBe("name");
    expect(decryptKeyValue(keys[0]!)).toBe(TEAMO_TOKEN);

    // Re-scanning in the opposite order must not demote it either.
    await scanOnly([kimi, claude]);
    const again = listKeys(db, { limit: 50, offset: 0, sort: "provider" });
    expect(again).toHaveLength(1);
    expect(again[0]?.provider).toBe("anthropic");
    expect(again[0]?.provider_evidence).toBe("name");
    expect(again[0]?.source_pointer).toBe("env.ANTHROPIC_AUTH_TOKEN");
  });

  it("records every home of a secret shared by several files", async () => {
    mkdirSync(join(home, ".claude"), { recursive: true });
    mkdirSync(join(home, ".kimi-code"), { recursive: true });
    writeFileSync(
      join(home, ".claude/settings.json"),
      JSON.stringify({
        env: { ANTHROPIC_API_KEY: SHARED_KEY, ANTHROPIC_BASE_URL: "https://x" },
      }),
    );
    writeFileSync(
      join(home, ".kimi-code/config.toml"),
      `[providers.relay]\ntype = "openai"\napi_key = "${SHARED_KEY}"\n`,
    );

    const claude = extraSource(
      "claude-settings",
      ".claude/settings.json",
      "json",
    );
    const kimi = extraSource(
      "kimi-code-config",
      ".kimi-code/config.toml",
      "toml",
      "moonshot",
    );
    await scanOnly([claude, kimi]);

    const keys = listKeys(db, { limit: 50, offset: 0, sort: "provider" });
    expect(keys).toHaveLength(1);
    const keyId = keys[0]!.id;
    const first = listKeySources(db, keyId);
    expect(first.map((row) => row.source_path)).toEqual([
      join(home, ".claude/settings.json"),
      join(home, ".kimi-code/config.toml"),
    ]);
    expect(first[0]?.source_pointer).toBe("env.ANTHROPIC_API_KEY");
    expect(first[1]?.source_pointer).toBe("providers.relay.api_key");
    expect(first[0]?.env_var_name).toBeNull();
    expect(first[0]?.last_seen_at).toBe(first[0]?.first_seen_at);

    // Re-seeing both homes refreshes `last_seen_at` and adds no duplicate rows.
    await scanOnly([kimi, claude]);
    const second = listKeySources(db, keyId);
    expect(second).toHaveLength(2);
    expect(second.map((row) => row.source_path)).toEqual(
      first.map((row) => row.source_path),
    );
    expect(second.every((row) => row.last_seen_at >= row.first_seen_at)).toBe(
      true,
    );

    // dotenv homes also carry the variable name.
    writeFileSync(join(home, ".zshrc"), `export RELAY_KEY="${SHARED_KEY}"\n`);
    await scanOnly([extraSource("shell-zshrc", ".zshrc", "dotenv", "openai")]);
    const envHome = listKeySources(db, keyId).find(
      (row) => row.source_path === join(home, ".zshrc"),
    );
    expect(envHome?.env_var_name).toBe("RELAY_KEY");
  });

  it("reads a single-token file such as ~/.qwen/token", async () => {
    mkdirSync(join(home, ".qwen"), { recursive: true });
    writeFileSync(
      join(home, ".qwen/token"),
      "sk-sp-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789\n",
    );
    await scanOnly([extraSource("qwen-token", ".qwen/token", "raw", "qwen")]);

    const keys = listKeys(db, { limit: 50, offset: 0, sort: "provider" });
    expect(keys.map((key) => key.provider)).toEqual(["qwen"]);
    expect(decryptKeyValue(keys[0]!)).toBe(
      "sk-sp-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789",
    );
  });
});

describe("markUnseenAsRemoved", () => {
  it("is a no-op when everything is seen", async () => {
    await runScan({
      db,
      sources: sources(),
      triggerKind: "manual",
      actor: "test",
      emit: () => {},
    });
    const fingerprints = listKeys(db, {
      limit: 50,
      offset: 0,
      sort: "provider",
    }).map((key) => key.fingerprint);
    expect(markUnseenAsRemoved(db, fingerprints)).toBe(0);
  });
});
