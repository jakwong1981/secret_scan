import type { FastifyPluginAsync } from "fastify";
import { createSourceSchema, updateSourceSchema } from "@skp/contracts";
import { ok } from "../../core/http/respond.js";
import {
  deleteSource,
  findSourceById,
  insertSource,
  listSources,
  updateSource,
} from "../../infra/db/repositories/source.repository.js";
import type { SourceRow } from "../../infra/db/repositories/rows.js";
import { recordAudit } from "../../infra/db/repositories/audit.repository.js";
import { NotFoundError, ValidationError } from "../../core/errors/app-error.js";
import { toSourceDefinition } from "./mapper.js";
import type { SourceDefinition } from "../../infra/scanner/types.js";

function toDefinition(row: SourceRow | null): SourceDefinition {
  if (!row) throw new NotFoundError("Source");
  return toSourceDefinition(row);
}

const sourcesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", { config: { requiresSession: true } }, async (request, reply) => {
    return ok(reply, { items: listSources(app.db).map(toDefinition) });
  });

  app.post("/", { config: { requiresSession: true, requiresSensitive: true } }, async (request, reply) => {
    const parsed = createSourceSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError("Invalid source definition");
    const created = toSourceDefinition(insertSource(app.db, parsed.data));
    recordAudit(app.db, {
      traceId: request.id,
      actor: request.email ?? "owner",
      action: "source.create",
      target: created.id,
      outcome: "success",
    });
    return reply.status(201).send(created);
  });

  app.patch("/:id", { config: { requiresSession: true } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = findSourceById(app.db, id);
    if (!existing) throw new NotFoundError("Source");
    const parsed = updateSourceSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError("Invalid source update");
    updateSource(app.db, id, {
      enabled: parsed.data.enabled,
      path: parsed.data.path,
      notes: parsed.data.notes,
    });
    const updated = findSourceById(app.db, id);
    return ok(reply, toDefinition(updated));
  });

  app.delete("/:id", { config: { requiresSession: true, requiresSensitive: true } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = findSourceById(app.db, id);
    if (!existing) throw new NotFoundError("Source");
    deleteSource(app.db, id);
    recordAudit(app.db, {
      traceId: request.id,
      actor: request.email ?? "owner",
      action: "source.delete",
      target: id,
      outcome: "success",
    });
    return ok(reply, { deleted: true } as const);
  });
};

export default sourcesRoutes;
