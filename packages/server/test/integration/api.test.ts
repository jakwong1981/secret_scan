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
  home: string;
  sessionCookie: string | undefined;
}

async function harness(): Promise<Harness> {
  const db = createDatabase(":memory:");
  runMigrations(db);
  seedRegistry(db);

  const home = mkdtempSync(join(tmpdir(), "skp-api-home-"));
  mkdirSync(join(home, ".codex"), { recursive: true });
  mkdirSync(join(home, ".claude"), { recursive: true });
  writeFileSync(
    join(home, ".codex/auth.json"),
    JSON.stringify({ OPENAI_API_KEY: ANTHROPIC_KEY, auth_mode: "apikey" }),
  );
  // The same secret, second home — the API must expose both.
  writeFileSync(
    join(home, ".claude/settings.json"),
    JSON.stringify({ env: { ANTHROPIC_API_KEY: ANTHROPIC_KEY } }),
  );

  const sources: SourceDefinition[] = [
    {
      id: "codex-auth",
      kind: "file",
      path: join(home, ".codex/auth.json"),
      parser: "json",
      enabled: true,
      priority: 10,
    },
    {
      id: "claude-settings",
      kind: "file",
      path: join(home, ".claude/settings.json"),
      parser: "json",
      providerHint: "anthropic",
      enabled: true,
      priority: 20,
    },
  ];
  const scanService = createScanService(db, () => sources);
  const app = await buildApp({ db, scanService });
  return { app, db, home, sessionCookie: undefined };
}

function cookieFrom(response: {
  cookies: Array<{ name: string; value: string }>;
}): string {
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
    for (const url of [
      "/api/v1/keys",
      "/api/v1/scans",
      "/api/v1/settings",
      "/api/v1/audit",
      "/api/v1/sources",
    ]) {
      const response = await app.inject({ method: "GET", url });
      expect(response.statusCode).toBe(401);
      expect(response.json().code).toBe("UNAUTHENTICATED");
    }
    await app.close();
    db.close();
  });

  it("bootstraps, signs in, scans, reveals behind re-auth and audits", async () => {
    const { app, db, home } = await harness();

    const status = await app.inject({
      method: "GET",
      url: "/api/v1/auth/status",
    });
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
      payload: {
        email: "owner@example.com",
        masterPassword: "totally-wrong-password",
      },
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

    const keys = await app.inject({
      method: "GET",
      url: "/api/v1/keys",
      headers: { cookie },
    });
    expect(keys.statusCode).toBe(200);
    const items = keys.json().data.items;
    expect(items).toHaveLength(1);
    expect(items[0].provider).toBe("anthropic");
    expect(items[0].maskedValue).not.toContain(ANTHROPIC_KEY);

    // Deduped to one row, but every home is reported.
    const listSources = items[0].sources as Array<{
      sourcePath: string;
      sourcePointer: string;
    }>;
    expect(listSources).toHaveLength(2);
    expect(listSources.map((source) => source.sourcePath).sort()).toEqual(
      [
        join(home, ".claude/settings.json"),
        join(home, ".codex/auth.json"),
      ].sort(),
    );
    expect(
      listSources.find(
        (source) => source.sourcePath === join(home, ".claude/settings.json"),
      )?.sourcePointer,
    ).toBe("env.ANTHROPIC_API_KEY");
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
    const detailSources = (
      detail.json().data.sources as Array<{ sourcePath: string }>
    ).map((source) => source.sourcePath);
    expect([...detailSources].sort()).toEqual(
      listSources
        .map((source: { sourcePath: string }) => source.sourcePath)
        .sort(),
    );
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

    const audit = await app.inject({
      method: "GET",
      url: "/api/v1/audit",
      headers: { cookie },
    });
    const actions = (audit.json().data.items as Array<{ action: string }>).map(
      (entry) => entry.action,
    );
    expect(actions).toContain("auth.bootstrap");
    expect(actions).toContain("key.reveal");
    expect(actions).toContain("key.delete");

    const loggedOut = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: { cookie },
    });
    expect(loggedOut.statusCode).toBe(200);

    const afterLogout = await app.inject({
      method: "GET",
      url: "/api/v1/keys",
      headers: { cookie },
    });
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

describe("self-service registration API", () => {
  it("registers without any session — sign-up is public", async () => {
    const { app, db } = await harness();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        email: "teammate@example.com",
        masterPassword: "teammate-password-1",
        confirmPassword: "teammate-password-1",
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.email).toBe("teammate@example.com");
    await app.close();
    db.close();
  });

  it("registers a member who can then browse the vault", async () => {
    const { app, db } = await harness();
    const bootstrapped = await app.inject({
      method: "POST",
      url: "/api/v1/auth/bootstrap",
      payload: { email: "owner@example.com", masterPassword: MASTER_PASSWORD },
    });
    const ownerCookie = cookieFrom(bootstrapped);

    const registered = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        email: "teammate@example.com",
        masterPassword: "teammate-password-1",
        confirmPassword: "teammate-password-1",
      },
    });
    expect(registered.statusCode).toBe(200);
    expect(registered.json().data.email).toBe("teammate@example.com");

    const members = await app.inject({
      method: "GET",
      url: "/api/v1/auth/users",
      headers: { cookie: ownerCookie },
    });
    expect(members.json().data.total).toBe(2);
    expect(
      (members.json().data.items as Array<{ email: string }>).map(
        (u) => u.email,
      ),
    ).toEqual(["owner@example.com", "teammate@example.com"]);

    const duplicate = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        email: "teammate@example.com",
        masterPassword: "teammate-password-1",
        confirmPassword: "teammate-password-1",
      },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().code).toBe("EMAIL_TAKEN");

    const mismatch = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        email: "other@example.com",
        masterPassword: "teammate-password-1",
        confirmPassword: "not-the-same-pw",
      },
    });
    expect(mismatch.statusCode).toBe(400);

    const memberLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "teammate@example.com",
        masterPassword: "teammate-password-1",
      },
    });
    expect(memberLogin.statusCode).toBe(200);
    const memberCookie = cookieFrom(memberLogin);

    const scanned = await app.inject({
      method: "POST",
      url: "/api/v1/scans",
      headers: { cookie: memberCookie },
    });
    expect(scanned.statusCode).toBe(202);
    const keys = await app.inject({
      method: "GET",
      url: "/api/v1/keys",
      headers: { cookie: memberCookie },
    });
    expect(keys.statusCode).toBe(200);
    expect(keys.json().data.total).toBe(1);
    expect(keys.json().data.items[0].maskedValue).not.toContain(ANTHROPIC_KEY);

    const audit = await app.inject({
      method: "GET",
      url: "/api/v1/audit",
      headers: { cookie: ownerCookie },
    });
    expect(
      (
        audit.json().data.items as Array<{
          action: string;
          target: string | null;
        }>
      ).some(
        (entry) =>
          entry.action === "auth.register" &&
          entry.target === "teammate@example.com",
      ),
    ).toBe(true);

    await app.close();
    db.close();
  });

  it("serves the single-page app for client-side routes", async () => {
    const { app, db } = await harness();
    for (const url of ["/login", "/register", "/settings", "/keys/abc"]) {
      const response = await app.inject({ method: "GET", url });
      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("text/html");
      expect(response.body).toContain('id="root"');
    }
    await app.close();
    db.close();
  });

  it("still answers unknown API routes with the JSON envelope", async () => {
    const { app, db } = await harness();
    const response = await app.inject({ method: "GET", url: "/api/v1/nope" });
    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe("NOT_FOUND");
    await app.close();
    db.close();
  });
});
