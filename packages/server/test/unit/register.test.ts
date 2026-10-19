import { describe, expect, it } from "vitest";
import { createDatabase, runMigrations } from "../../src/infra/db/database.js";
import { seedRegistry } from "../../src/infra/db/seed.js";
import {
  bootstrap,
  listUserViews,
  login,
  register,
} from "../../src/modules/auth/service.js";
import {
  ConflictError,
  ValidationError,
} from "../../src/core/errors/app-error.js";
import type { Db } from "../../src/infra/db/database.js";

const OWNER = {
  email: "owner@example.com",
  masterPassword: "owner-master-password",
};

function freshDb(): Db {
  const db = createDatabase(":memory:");
  runMigrations(db);
  seedRegistry(db);
  return db;
}

const NEW_MEMBER = {
  email: "teammate@example.com",
  masterPassword: "teammate-password-1",
  confirmPassword: "teammate-password-1",
};

describe("account registration", () => {
  it("creates a second account that can sign in", () => {
    const db = freshDb();
    bootstrap(db, { ...OWNER, ip: "127.0.0.1" });

    const created = register(db, NEW_MEMBER);

    expect(created.email).toBe("teammate@example.com");
    expect(created.methods).toEqual(["password"]);

    const session = login(db, {
      email: NEW_MEMBER.email,
      masterPassword: NEW_MEMBER.masterPassword,
      ip: "127.0.0.1",
    });
    expect(session.user.id).toBe(created.id);
    db.close();
  });

  it("normalises the email to lower case", () => {
    const db = freshDb();
    bootstrap(db, { ...OWNER, ip: "127.0.0.1" });
    const created = register(db, {
      ...NEW_MEMBER,
      email: "  Teammate@Example.COM ",
    });
    expect(created.email).toBe("teammate@example.com");
    db.close();
  });

  it("rejects an email that is already enrolled", () => {
    const db = freshDb();
    bootstrap(db, { ...OWNER, ip: "127.0.0.1" });
    register(db, NEW_MEMBER);
    expect(() => register(db, NEW_MEMBER)).toThrow(ConflictError);
    try {
      register(db, NEW_MEMBER);
    } catch (error) {
      expect((error as ConflictError).code).toBe("EMAIL_TAKEN");
      expect((error as ConflictError).statusCode).toBe(409);
    }
    db.close();
  });

  it("rejects mismatched confirmation", () => {
    const db = freshDb();
    bootstrap(db, { ...OWNER, ip: "127.0.0.1" });
    expect(() =>
      register(db, { ...NEW_MEMBER, confirmPassword: "something-else" }),
    ).toThrow(ValidationError);
    db.close();
  });

  it("rejects a password below the configured minimum", () => {
    const db = freshDb();
    bootstrap(db, { ...OWNER, ip: "127.0.0.1" });
    const short = "short";
    expect(() =>
      register(db, {
        ...NEW_MEMBER,
        masterPassword: short,
        confirmPassword: short,
      }),
    ).toThrow(/at least \d+ characters/);
    db.close();
  });

  it("lists every member oldest first with login state", () => {
    const db = freshDb();
    bootstrap(db, { ...OWNER, ip: "127.0.0.1" });
    register(db, NEW_MEMBER);

    const items = listUserViews(db);

    expect(items.map((item) => item.email)).toEqual([
      "owner@example.com",
      "teammate@example.com",
    ]);
    expect(items[0]?.lastLoginAt).toBeNull();
    expect(items[1]?.createdAt).toBeTruthy();

    login(db, {
      email: NEW_MEMBER.email,
      masterPassword: NEW_MEMBER.masterPassword,
      ip: "127.0.0.1",
    });
    expect(listUserViews(db)[1]?.lastLoginAt).not.toBeNull();
    db.close();
  });
});
