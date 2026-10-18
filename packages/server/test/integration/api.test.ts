import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { createDatabase, runMigrations } from "../../src/infra/db/database.js";
import { seedRegistry } from "../../src/infra/db/seed.js";
import { createScanService } from "../../src/modules/scans/service.js";
import type { SourceDefinition } from "../../src/infra/scanner/types.js";
import type { Db } from "../../src/infra/db/database.js";

const MASTER_PASSWORD = "integration-master-pw";
const ANTHROPIC_KEY = "sk-ant-api03-IntegrationKey1234567890abcd";

interface Harness {
  app: FastifyInstance;
  db: Db;
  sessionCookie: string | undefined;
}

async function harness(): Promise<Harness> {
  const db = createDatabase(":memory:");
  runMigrations(db);
  seedRegistry(db);

  const home = mkdtempSync(join(tmpdir(), "skp-api-home-"));
  mkdirSync(join(home, ".codex"), { recursive: true });
  writeFileSync(
    join(home, ".codex/auth.json"),
    JSON.stringify({ OPENAI_API_KEY: ANTHROPIC_KEY, auth_mode: "apikey" }),
  );

  const sources: SourceDefinition[] = [
    { id: "codex-auth", kind: "file", path: join(home, ".codex/auth.json"), parser: "json", enabled: true, priority: 10 },
  ];
  const scanService = createScanService(db, () => sources);
  const app = await buildApp({ db, scanService });
  return { app, db, sessionCookie: undefined };
}

function cookieFrom(response: { cookies: Array<{ name: string; value: string }> }): string {
  return `skp_session=${response.cookies.find((c) => c.name === "skp_session")?.value ?? ""}`;
}

describe("API end-to-end", () => {
  it("reports health over HTTPS-only configuration", async () => {
    const { app, db } = await harness();
    const response = await app.inject({ method: "GET", url: "/api/v1/health" });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.tls).toBe(true);
    expect(body.traceId).toBeTruthy();
    await app.close();
    db.close();
  });

  it("protects every owner route without a session", async () => {
    const { app, db } = await harness();
    for (const url of ["/api/v1/keys", "/api/v1/scans", "/api/v1/settings", "/api/v1/audit", "/api/v1/sources"]) {
      const response = await app.inject({ method: "GET", url });
      expect(response.statusCode).toBe(401);
      expect(response.json().code).toBe("UNAUTHENTICATED");
    }
    await app.close();
    db.close();
  });

  it("bootstraps, signs in, scans, reveals behind re-auth and audits", async () => {
    const { app, db } = await harness();

    const status = await app.inject({ method: "GET", url: "/api/v1/auth/status" });
    expect(status.json().data.needsBootstrap).toBe(true);

    const bootstrapped = await app.inject({
      method: "POST",
      url: "/api/v1/auth/bootstrap",
      payload: { email: "owner@example.com", masterPassword: MASTER_PASSWORD },
    });
    expect(bootstrapped.statusCode).toBe(200);
    expect(bootstrapped.json().data.email).toBe("owner@example.com");
    const cookie = cookieFrom(bootstrapped);

    const duplicate = await app.inject({
      method: "POST",
      url: "/api/v1/auth/bootstrap",
      payload: { email: "owner@example.com", masterPassword: MASTER_PASSWORD },
    });
    expect(duplicate.statusCode).toBe(409);

    const badLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "owner@example.com", masterPassword: "totally-wrong-password" },
    });
    expect(badLogin.statusCode).toBe(401);
    expect(badLogin.json().code).toBe("INVALID_CREDENTIALS");

    const goodLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "owner@example.com", masterPassword: MASTER_PASSWORD },
    });
    expect(goodLogin.statusCode).toBe(200);

    const triggered = await app.inject({
      method: "POST",
      url: "/api/v1/scans",
      headers: { cookie },
    });
    expect(triggered.statusCode).toBe(202);
    expect(triggered.json().data.outcome.counts.newCount).toBe(1);

    const keys = await app.inject({ method: "GET", url: "/api/v1/keys", headers: { cookie } });
    expect(keys.statusCode).toBe(200);
    const items = keys.json().data.items;
    expect(items).toHaveLength(1);
    expect(items[0].provider).toBe("anthropic");
    expect(items[0].maskedValue).not.toContain(ANTHROPIC_KEY);
    const keyId = items[0].id as string;

    const blockedReveal = await app.inject({
      method: "POST",
      url: `/api/v1/keys/${keyId}/reveal`,
      headers: { cookie },
    });
    expect(blockedReveal.statusCode).toBe(401);
    expect(blockedReveal.json().code).toBe("UNAUTHENTICATED");

    const reauth = await app.inject({
      method: "POST",
      url: "/api/v1/auth/verify-password",
      headers: { cookie },
      payload: { masterPassword: MASTER_PASSWORD },
    });
    expect(reauth.statusCode).toBe(200);

    const revealed = await app.inject({
      method: "POST",
      url: `/api/v1/keys/${keyId}/reveal`,
      headers: { cookie },
    });
    expect(revealed.json().data.value).toBe(ANTHROPIC_KEY);

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/keys/${keyId}`,
      headers: { cookie },
    });
    const events = detail.json().data.events as Array<{ type: string }>;
    expect(events.map((event) => event.type)).toContain("revealed");

    const patched = await app.inject({
      method: "PATCH",
      url: `/api/v1/keys/${keyId}`,
      headers: { cookie },
      payload: { label: "primary", tags: ["owner"] },
    });
    expect(patched.statusCode).toBe(200);

    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/v1/keys/${keyId}`,
      headers: { cookie },
    });
    expect(deleted.statusCode).toBe(200);

    const audit = await app.inject({ method: "GET", url: "/api/v1/audit", headers: { cookie } });
    const actions = (audit.json().data.items as Array<{ action: string }>).map((entry) => entry.action);
    expect(actions).toContain("auth.bootstrap");
    expect(actions).toContain("key.reveal");
    expect(actions).toContain("key.delete");

    const loggedOut = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: { cookie },
    });
    expect(loggedOut.statusCode).toBe(200);

    const afterLogout = await app.inject({ method: "GET", url: "/api/v1/keys", headers: { cookie } });
    expect(afterLogout.statusCode).toBe(401);

    await app.close();
    db.close();
  });

  it("falls back to the SPA for unknown non-API routes", async () => {
    const { app, db } = await harness();
    // no web/dist in tests: static plugin is skipped, so the not-found handler
    // answers with the envelope for API routes and 404 for the rest.
    const response = await app.inject({ method: "GET", url: "/api/v1/nope" });
    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe("NOT_FOUND");
    await app.close();
    db.close();
  });
});
