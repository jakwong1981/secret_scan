import type { FastifyPluginAsync } from "fastify";
import { updateSettingsSchema } from "@skp/contracts";
import { ok } from "../../core/http/respond.js";
import {
  readSettings,
  updateSettings,
} from "../../infra/db/repositories/settings.repository.js";
import { recordAudit } from "../../infra/db/repositories/audit.repository.js";
import { ValidationError } from "../../core/errors/app-error.js";
import { env, googleAllowedEmails } from "../../config/env.js";

const settingsRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/",
    { config: { requiresSession: true } },
    async (request, reply) => {
      const settings = readSettings(app.db);
      const storedEmails = JSON.parse(
        settings.google_allowed_emails,
      ) as string[];
      return ok(reply, {
        googleAllowedEmails:
          storedEmails.length > 0 ? storedEmails : googleAllowedEmails(),
        sessionIdleMinutes: Number(settings.session_idle_minutes),
        sessionAbsoluteHours: Number(settings.session_absolute_hours),
        verifyKeysOptIn: settings.verify_keys_opt_in === 1,
        scanRoot: settings.scan_root,
        googleConfigured: Boolean(
          env.SKP_GOOGLE_CLIENT_ID && env.SKP_GOOGLE_CLIENT_SECRET,
        ),
        publicOrigin: env.SKP_PUBLIC_ORIGIN,
      });
    },
  );

  app.put(
    "/",
    { config: { requiresSession: true, requiresSensitive: true } },
    async (request, reply) => {
      const parsed = updateSettingsSchema.safeParse(request.body);
      if (!parsed.success)
        throw new ValidationError("Invalid settings payload");
      const updated = updateSettings(app.db, parsed.data);
      recordAudit(app.db, {
        traceId: request.id,
        actor: request.email ?? "owner",
        action: "settings.update",
        outcome: "success",
        detail: JSON.stringify(Object.keys(parsed.data)),
      });
      return ok(reply, {
        googleAllowedEmails: JSON.parse(
          updated.google_allowed_emails,
        ) as string[],
        sessionIdleMinutes: Number(updated.session_idle_minutes),
        sessionAbsoluteHours: Number(updated.session_absolute_hours),
        verifyKeysOptIn: updated.verify_keys_opt_in === 1,
        scanRoot: updated.scan_root,
        googleConfigured: Boolean(
          env.SKP_GOOGLE_CLIENT_ID && env.SKP_GOOGLE_CLIENT_SECRET,
        ),
        publicOrigin: env.SKP_PUBLIC_ORIGIN,
      });
    },
  );
};

export default settingsRoutes;
