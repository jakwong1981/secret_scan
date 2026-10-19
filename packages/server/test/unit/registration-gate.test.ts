import type { Db } from "../../src/infra/db/database.js";
import type { AuthUserView } from "../../src/modules/auth/service.js";
import type { ForbiddenError } from "../../src/core/errors/app-error.js";
import { describe, expect, it, vi } from "vitest";

const REGISTER_REQUEST = {
  email: "teammate@example.com",
  masterPassword: "teammate-password-1",
  confirmPassword: "teammate-password-1",
};

/**
 * `env.js` resolves config once at import, so every scenario resets the module
 * graph after shaping `process.env`, then re-imports the service stood up with
 * that exact configuration.
 */
async function loadWith(
  overrides: Record<string, string | undefined>,
): Promise<{
  db: Db;
  register: (db: Db, input: Record<string, string>) => AuthUserView;
  ForbiddenError: typeof ForbiddenError;
}> {
  vi.resetModules();
  delete process.env.SKP_ENABLE_REGISTRATION;
  delete process.env.SKP_HOST;
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const { createDatabase, runMigrations } = await import(
    "../../src/infra/db/database.js"
  );
  const { seedRegistry } = await import("../../src/infra/db/seed.js");
  const service = await import("../../src/modules/auth/service.js");
  const errors = await import("../../src/core/errors/app-error.js");
  const db = createDatabase(":memory:");
  runMigrations(db);
  seedRegistry(db);
  return {
    db,
    register: service.register as (
      db: Db,
      input: Record<string, string>,
    ) => AuthUserView,
    ForbiddenError: errors.ForbiddenError,
  };
}

describe("self-service registration gate", () => {
  it("explicit SKP_ENABLE_REGISTRATION=false rejects sign-up", async () => {
    const { db, register, ForbiddenError } = await loadWith({
      SKP_ENABLE_REGISTRATION: "false",
    });
    try {
      register(db, REGISTER_REQUEST);
      expect.unreachable("registration should have been rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenError);
      expect((error as ForbiddenError).code).toBe("REGISTRATION_DISABLED");
    }
    db.close();
  });

  it("a non-loopback bind disables sign-up unless opted in", async () => {
    const { db, register, ForbiddenError } = await loadWith({
      SKP_HOST: "0.0.0.0",
    });
    try {
      register(db, REGISTER_REQUEST);
      expect.unreachable("registration should have been rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenError);
      expect((error as ForbiddenError).code).toBe("REGISTRATION_DISABLED");
    }
    db.close();
  });

  it("an explicit opt-in keeps sign-up open on a non-loopback bind", async () => {
    const { db, register } = await loadWith({
      SKP_HOST: "0.0.0.0",
      SKP_ENABLE_REGISTRATION: "true",
    });
    const created = register(db, REGISTER_REQUEST);
    expect(created.email).toBe("teammate@example.com");
    db.close();
  });

  it("the default loopback bind keeps the documented behaviour: open sign-up", async () => {
    const { db, register } = await loadWith({});
    const created = register(db, REGISTER_REQUEST);
    expect(created.email).toBe("teammate@example.com");
    db.close();
  });
});
