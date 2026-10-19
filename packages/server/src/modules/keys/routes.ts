import type { FastifyPluginAsync } from "fastify";
import { updateKeyRequestSchema } from "@skp/contracts";
import { ok } from "../../core/http/respond.js";
import {
  countKeys,
  decryptKeyValue,
  deleteKey,
  findKeyById,
  listKeyEvents,
  listKeySources,
  listKeySourcesFor,
  listKeys,
  recordKeyEvent,
  setVerification,
  updateKey,
} from "../../infra/db/repositories/key.repository.js";
import { providerLabel } from "../../infra/db/repositories/provider.repository.js";
import { recordAudit } from "../../infra/db/repositories/audit.repository.js";
import { isVerifyOptIn } from "../../infra/db/repositories/settings.repository.js";
import {
  safeParseTags,
  toKeyEvent,
  toMaskedKey,
  toSourceSighting,
} from "./mapper.js";
import { probeProvider } from "./probes.js";
import { ForbiddenError, NotFoundError } from "../../core/errors/app-error.js";

const keysRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/",
    { config: { requiresSession: true } },
    async (request, reply) => {
      const query = request.query as Record<string, string | undefined>;
      const limit = Math.min(Number(query.limit ?? 50) || 50, 200);
      const offset = Math.max(Number(query.offset ?? 0) || 0, 0);
      const sort = (query.sort ?? "date_added") as
        "date_added" | "provider" | "last_seen";
      const rows = listKeys(app.db, {
        provider: query.provider,
        status: query.status,
        sourceKind: query.sourceKind,
        search: query.search,
        limit,
        offset,
        sort,
      });
      const total = countKeys(app.db, {
        provider: query.provider,
        status: query.status,
        sourceKind: query.sourceKind,
        search: query.search,
      });
      const sightings = listKeySourcesFor(
        app.db,
        rows.map((row) => row.id),
      );
      return ok(reply, {
        items: rows.map((row) =>
          toMaskedKey(
            row,
            providerLabel(app.db, row.provider),
            (sightings.get(row.id) ?? []).map(toSourceSighting),
          ),
        ),
        total,
      });
    },
  );

  app.get(
    "/:id",
    { config: { requiresSession: true } },
    async (request, reply) => {
      const { id } = request.params as unknown as { id: string };
      const row = findKeyById(app.db, id);
      if (!row) throw new NotFoundError("API key");
      const events = listKeyEvents(app.db, id).map(toKeyEvent);
      const sources = listKeySources(app.db, id).map(toSourceSighting);
      return ok(reply, {
        ...toMaskedKey(row, providerLabel(app.db, row.provider), sources),
        tags: safeParseTags(row.tags),
        events,
      });
    },
  );

  app.post(
    "/:id/reveal",
    { config: { requiresSession: true, requiresSensitive: true } },
    async (request, reply) => {
      const { id } = request.params as unknown as { id: string };
      const row = findKeyById(app.db, id);
      if (!row) throw new NotFoundError("API key");
      const value = decryptKeyValue(row);
      if (value === "") {
        recordAudit(app.db, {
          traceId: request.id,
          actor: request.email ?? "owner",
          action: "key.reveal",
          target: id,
          outcome: "error",
          detail: "keychain metadata item has no stored secret",
        });
        throw new ForbiddenError(
          "KEYCHAIN_METADATA_ONLY",
          "This entry is macOS Keychain metadata - view the secret in Keychain Access",
        );
      }
      const expiresAt = new Date(Date.now() + 30_000).toISOString();
      recordKeyEvent(app.db, {
        keyId: id,
        type: "revealed",
        actor: request.email ?? "owner",
      });
      recordAudit(app.db, {
        traceId: request.id,
        actor: request.email ?? "owner",
        action: "key.reveal",
        target: id,
        outcome: "success",
      });
      return ok(reply, { value, expiresAt });
    },
  );

  app.post(
    "/:id/verify",
    { config: { requiresSession: true } },
    async (request, reply) => {
      const { id } = request.params as unknown as { id: string };
      if (!isVerifyOptIn(app.db)) {
        throw new ForbiddenError(
          "VERIFY_DISABLED",
          "Live key verification is disabled in Settings",
        );
      }
      const row = findKeyById(app.db, id);
      if (!row) throw new NotFoundError("API key");
      const value = decryptKeyValue(row);
      if (value === "") {
        return ok(reply, {
          verificationStatus: "error" as const,
          detail: "keychain metadata item cannot be probed",
          checkedAt: new Date().toISOString(),
        });
      }
      const result = await probeProvider(row.provider, value);
      setVerification(
        app.db,
        id,
        result.status,
        result.detail,
        request.email ?? "owner",
      );
      recordAudit(app.db, {
        traceId: request.id,
        actor: request.email ?? "owner",
        action: "key.verify",
        target: id,
        outcome: "success",
        detail: result.status,
      });
      return ok(reply, { ...result, checkedAt: new Date().toISOString() });
    },
  );

  app.patch(
    "/:id",
    { config: { requiresSession: true } },
    async (request, reply) => {
      const { id } = request.params as unknown as { id: string };
      const parsed = updateKeyRequestSchema.safeParse(request.body);
      if (!parsed.success) throw new NotFoundError("API key");
      const row = findKeyById(app.db, id);
      if (!row) throw new NotFoundError("API key");
      updateKey(app.db, id, {
        label: parsed.data.label,
        tags: parsed.data.tags,
        status: parsed.data.status,
      });
      if (parsed.data.status === "archived") {
        recordKeyEvent(app.db, {
          keyId: id,
          type: "archived",
          actor: request.email ?? "owner",
        });
      }
      return ok(reply, { updated: true } as const);
    },
  );

  app.delete(
    "/:id",
    { config: { requiresSession: true, requiresSensitive: true } },
    async (request, reply) => {
      const { id } = request.params as unknown as { id: string };
      const row = findKeyById(app.db, id);
      if (!row) throw new NotFoundError("API key");
      recordKeyEvent(app.db, {
        keyId: id,
        type: "deleted",
        actor: request.email ?? "owner",
        note: "deleted by owner",
      });
      deleteKey(app.db, id);
      recordAudit(app.db, {
        traceId: request.id,
        actor: request.email ?? "owner",
        action: "key.delete",
        target: id,
        outcome: "success",
      });
      return ok(reply, { deleted: true } as const);
    },
  );
};

export default keysRoutes;
