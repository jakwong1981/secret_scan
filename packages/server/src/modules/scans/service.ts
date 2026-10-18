import { randomUUID } from "node:crypto";
import type { Db } from "../../infra/db/database.js";
import type { ScanEvent, SourceDefinition } from "../../infra/scanner/types.js";
import type { ScanOutcome } from "../../infra/scanner/scanner.js";
import { runScan } from "../../infra/scanner/scanner.js";

const EVENT_BUFFER = 500;

export interface ScanService {
  start(input: { triggerKind: "manual" | "schedule"; actor: string }): Promise<ScanOutcome>;
  cancel(runId: string): boolean;
  eventsFor(runId: string): ScanEvent[];
  sourcesProvider(): SourceDefinition[];
}

export function createScanService(db: Db, sourcesProvider: () => SourceDefinition[]): ScanService {
  const buffers = new Map<string, ScanEvent[]>();
  const controllers = new Map<string, AbortController>();

  return {
    sourcesProvider,

    async start(input) {
      const sources = sourcesProvider().filter((source) => source.enabled);
      const runId = randomUUID();
      buffers.set(runId, []);
      const controller = new AbortController();
      controllers.set(runId, controller);

      const outcome = await runScan({
        db,
        runId,
        sources,
        triggerKind: input.triggerKind,
        actor: input.actor,
        signal: controller.signal,
        emit: (event) => {
          const buffer = buffers.get(event.runId) ?? [];
          buffer.push(event);
          if (buffer.length > EVENT_BUFFER) buffer.shift();
          buffers.set(event.runId, buffer);
        },
      });
      controllers.delete(runId);
      return outcome;
    },

    cancel(runId) {
      const controller = controllers.get(runId);
      if (!controller) return false;
      controller.abort();
      return true;
    },

    eventsFor(runId) {
      return buffers.get(runId) ?? [];
    },
  };
}
