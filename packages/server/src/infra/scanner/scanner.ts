import { readFileSync, statSync } from "node:fs";
import type { Db } from "../db/database.js";
import {
  createScanRun,
  completeScanRun,
  cancelScanRun,
} from "../db/repositories/scan.repository.js";
import { upsertFromCandidate, markUnseenAsRemoved } from "../db/repositories/key.repository.js";
import { classifyProvider } from "./provider-registry.js";
import { parseWithParser, readKeychainMetadata } from "./parsers.js";
import { expandPath } from "./source-registry.js";
import type { ScanEvent, SourceDefinition } from "./types.js";

const MAX_FILE_BYTES = 4 * 1024 * 1024;

export interface ScanOptions {
  db: Db;
  runId?: string;
  sources: SourceDefinition[];
  triggerKind: "manual" | "schedule";
  actor: string;
  emit: (event: ScanEvent) => void;
  signal?: AbortSignal;
}

export interface ScanOutcome {
  runId: string;
  status: "completed" | "canceled" | "failed";
  counts: { newCount: number; updatedCount: number; removedCount: number; totalCount: number };
  errorCode?: string;
}

function makeEvent(runId: string, event: Omit<ScanEvent, "runId" | "at">): ScanEvent {
  return { runId, at: new Date().toISOString(), ...event };
}

const nextTick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** Runs one full pass over the enabled sources. */
export async function runScan(options: ScanOptions): Promise<ScanOutcome> {
  const { db, sources, emit, signal, triggerKind } = options;
  const run = createScanRun(db, { triggerKind, sourceCount: sources.length, runId: options.runId });
  const seenFingerprints: string[] = [];
  let newCount = 0;
  let updatedCount = 0;

  emit(makeEvent(run.id, { phase: "started", message: `scan started over ${sources.length} source(s)` }));

  for (const source of sources) {
    if (signal?.aborted) {
      cancelScanRun(db, run.id);
      emit(makeEvent(run.id, { phase: "canceled", message: "scan canceled by owner" }));
      return {
        runId: run.id,
        status: "canceled",
        counts: { newCount, updatedCount, removedCount: 0, totalCount: newCount + updatedCount },
      };
    }
    await nextTick();

    try {
      const found = scanSource(source, db, seenFingerprints);
      newCount += found.newCount;
      updatedCount += found.updatedCount;
      emit(
        makeEvent(run.id, {
          phase: "source",
          sourceId: source.id,
          message: `${source.path}: ${found.candidates} candidate(s)`,
          counts: { newCount, updatedCount, removedCount: 0 },
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      emit(makeEvent(run.id, { phase: "error", sourceId: source.id, message }));
    }
  }

  const removedCount = markUnseenAsRemoved(db, seenFingerprints, options.actor);
  const totalCount = newCount + updatedCount;
  completeScanRun(db, run.id, { newCount, updatedCount, removedCount, totalCount });
  emit(
    makeEvent(run.id, {
      phase: "finished",
      message: `scan finished: ${totalCount} key(s), ${removedCount} removed`,
      counts: { newCount, updatedCount, removedCount },
    }),
  );
  return { runId: run.id, status: "completed", counts: { newCount, updatedCount, removedCount, totalCount } };
}

function scanSource(
  source: SourceDefinition,
  db: Db,
  seenFingerprints: string[],
): { candidates: number; newCount: number; updatedCount: number } {
  let candidates = 0;
  let newCount = 0;
  let updatedCount = 0;

  if (source.kind === "keychain") {
    for (const item of readKeychainMetadata()) {
      const provider = classifyProvider({
        value: item.service,
        keyName: item.service,
        keychainService: item.service,
        keychainAccount: item.account,
        providerHint: source.providerHint,
      });
      candidates += 1;
      const pointer = `${item.service}${item.account ? ` (${item.account})` : ""}`;
      const result = upsertFromCandidate(db, {
        provider,
        sourceKind: "keychain",
        sourcePath: source.path,
        sourcePointer: pointer,
      });
      if (result.isNew) newCount += 1;
      else updatedCount += 1;
      seenFingerprints.push(result.fingerprint);
    }
    return { candidates, newCount, updatedCount };
  }

  const path = expandPath(source.path);
  let mtime: number | undefined;
  try {
    const stat = statSync(path);
    if (!stat.isFile()) return { candidates: 0, newCount, updatedCount };
    if (stat.size > MAX_FILE_BYTES) return { candidates: 0, newCount, updatedCount };
    mtime = stat.mtimeMs;
  } catch {
    return { candidates: 0, newCount, updatedCount };
  }

  const text = readFileSync(path, "utf8");
  for (const entry of parseWithParser(text, source.parser)) {
    candidates += 1;
    const isDotenv = source.parser === "dotenv";
    const provider = classifyProvider({
      value: entry.value,
      keyName: entry.keyName,
      envVarName: isDotenv ? entry.keyName : entry.pointer,
      providerHint: source.providerHint,
    });
    const result = upsertFromCandidate(db, {
      provider,
      value: entry.value,
      sourceKind: source.kind,
      sourcePath: path,
      sourcePointer: entry.pointer,
      envVarName: isDotenv ? entry.keyName : undefined,
      sourceMtime: mtime,
    });
    if (result.isNew) newCount += 1;
    else updatedCount += 1;
    seenFingerprints.push(result.fingerprint);
  }
  return { candidates, newCount, updatedCount };
}
