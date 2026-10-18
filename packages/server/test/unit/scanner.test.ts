import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createDatabase, runMigrations } from "../../src/infra/db/database.js";
import { seedRegistry } from "../../src/infra/db/seed.js";
import { runScan } from "../../src/infra/scanner/scanner.js";
import { findKeyById, listKeys, markUnseenAsRemoved } from "../../src/infra/db/repositories/key.repository.js";
import { decryptKeyValue } from "../../src/infra/db/repositories/key.repository.js";
import type { ScanEvent, SourceDefinition } from "../../src/infra/scanner/types.js";

const ANTHROPIC_KEY = "sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz012345";
const OPENAI_KEY = "sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz012345";
const HF_KEY = "hf_abcdefghijklmnopqrstuvwxyz";

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
  writeFileSync(join(home, ".ollama/config.json"), JSON.stringify({ token: HF_KEY }));
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

function sources(overrides: Partial<SourceDefinition> = {}): SourceDefinition[] {
  return [
    { id: "codex-auth", kind: "file", path: join(home, ".codex/auth.json"), parser: "json", enabled: true, priority: 10 },
    { id: "ollama-config", kind: "file", path: join(home, ".ollama/config.json"), parser: "json", enabled: true, priority: 11 },
    { id: "shell-zshrc", kind: "env-file", path: join(home, ".zshrc"), parser: "dotenv", enabled: true, priority: 12 },
    ...(Object.keys(overrides).length > 0 ? [{ ...overrides, id: overrides.id ?? "extra", enabled: true, priority: 13 } as SourceDefinition] : []),
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
    expect(keys.map((key) => key.provider).sort()).toEqual(["anthropic", "huggingface", "openai"]);

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
    await runScan({ db, sources: sources(), triggerKind: "manual", actor: "test", emit: () => {} });
    const first = listKeys(db, { limit: 50, offset: 0, sort: "provider" });
    expect(first).toHaveLength(3);

    writeFileSync(join(home, ".ollama/config.json"), JSON.stringify({ token: ANTHROPIC_KEY }));
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
    await runScan({ db, sources: sources(), triggerKind: "manual", actor: "test", emit: () => {} });
    const before = listKeys(db, { limit: 50, offset: 0, sort: "provider" });
    const hf = before.find((key) => key.provider === "huggingface");
    expect(hf?.status).toBe("active");

    writeFileSync(join(home, ".ollama/config.json"), JSON.stringify({ token: "unrelated" }));
    const outcome = await runScan({
      db,
      sources: sources(),
      triggerKind: "manual",
      actor: "test",
      emit: () => {},
    });
    expect(outcome.counts.removedCount).toBe(1);
    const after = listKeys(db, { limit: 50, offset: 0, sort: "provider", status: "removed" });
    expect(after).toHaveLength(1);
  });

  it("skips missing sources without failing the run", async () => {
    const withMissing = sources({ id: "missing", kind: "file", path: join(home, "does-not-exist.json"), parser: "json", priority: 20 });
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
    await runScan({ db, sources: sources(), triggerKind: "manual", actor: "test", emit: () => {} });
    writeFileSync(join(home, ".ollama/config.json"), JSON.stringify({ token: "unrelated" }));
    await runScan({ db, sources: sources(), triggerKind: "manual", actor: "test", emit: () => {} });
    writeFileSync(join(home, ".ollama/config.json"), JSON.stringify({ token: HF_KEY }));
    await runScan({ db, sources: sources(), triggerKind: "manual", actor: "test", emit: () => {} });
    const active = listKeys(db, { limit: 50, offset: 0, sort: "provider", status: "active" });
    expect(active.some((key) => key.provider === "huggingface")).toBe(true);
    const hf = findKeyById(db, active.find((key) => key.provider === "huggingface")?.id ?? "");
    expect(hf?.status).toBe("active");
  });
});

describe("markUnseenAsRemoved", () => {
  it("is a no-op when everything is seen", async () => {
    await runScan({ db, sources: sources(), triggerKind: "manual", actor: "test", emit: () => {} });
    const fingerprints = listKeys(db, { limit: 50, offset: 0, sort: "provider" }).map((key) => key.fingerprint);
    expect(markUnseenAsRemoved(db, fingerprints)).toBe(0);
  });
});
