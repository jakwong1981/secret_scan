import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { envelope, ok } from "../../core/http/respond.js";
import {
  countScanRuns,
  findScanRunById,
  listScanRuns,
} from "../../infra/db/repositories/scan.repository.js";
import { countKeys } from "../../infra/db/repositories/scan.repository.js";
import { recordAudit } from "../../infra/db/repositories/audit.repository.js";
import type { ScanService } from "./service.js";
import type { Db } from "../../infra/db/database.js";

export interface ScanRouteDeps {
  db: Db;
  scanService: ScanService;
}

const SSE_TIMEOUT_MS = 120_000;

function writeEvent(reply: FastifyReply, payload: unknown): void {
  reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
}

const scansRoutes: FastifyPluginAsync = async (app) => {
  const deps: ScanRouteDeps = { db: app.db, scanService: app.scanService };

  app.get("/", { config: { requiresSession: true } }, async (request, reply) => {
    const limit = Math.min(Number((request.query as Record<string, string>).limit ?? 20) || 20, 100);
    const offset = Math.max(Number((request.query as Record<string, string>).offset ?? 0) || 0, 0);
    const rows = listScanRuns(app.db, limit, offset);
    const total = countScanRuns(app.db);
    return ok(reply, { items: rows, total, totalKeys: countKeys(app.db) });
  });

  app.post(
    "/",
    { config: { requiresSession: true, rateLimit: { max: 6, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const outcome = await deps.scanService.start({ triggerKind: "manual", actor: request.email ?? "owner" });
      recordAudit(app.db, {
        traceId: request.id,
        actor: request.email ?? "owner",
        action: "scan.trigger",
        target: outcome.runId,
        outcome: "success",
        detail: outcome.status,
      });
      const run = findScanRunById(app.db, outcome.runId);
      return reply
        .status(202)
        .send(envelope(request, { run, outcome: { runId: outcome.runId, status: outcome.status, counts: outcome.counts } }));
    },
  );

  app.get("/:id", { config: { requiresSession: true } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const run = findScanRunById(app.db, id);
    if (!run) return reply.status(404).send({ code: "NOT_FOUND", message: "Scan run not found" });
    return ok(reply, run);
  });

  app.post("/:id/cancel", { config: { requiresSession: true } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const canceled = deps.scanService.cancel(id);
    recordAudit(app.db, {
      traceId: request.id,
      actor: request.email ?? "owner",
      action: "scan.cancel",
      target: id,
      outcome: canceled ? "success" : "denied",
    });
    return ok(reply, { canceled });
  });

  app.get("/:id/events", { config: { requiresSession: true } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    reply.hijack();
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    reply.raw.write("retry: 2000\n\n");

    let sent = 0;
    const flush = (): void => {
      const events = deps.scanService.eventsFor(id);
      while (sent < events.length) {
        const event = events[sent] as (typeof events)[number];
        writeEvent(reply, event);
        sent += 1;
      }
    };

    flush();
    const deadline = Date.now() + SSE_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      flush();
      const run = findScanRunById(app.db, id);
      if (run && run.status !== "running" && run.status !== "queued") break;
    }
    reply.raw.write(`event: end\ndata: ${JSON.stringify({ runId: id })}\n\n`);
    reply.raw.end();
  });
};

export default scansRoutes;
