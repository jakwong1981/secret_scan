import { describe, expect, it } from "vitest";
import { createDatabase, runMigrations } from "../../src/infra/db/database.js";
import { seedRegistry } from "../../src/infra/db/seed.js";
import {
  bootstrap,
  changePassword,
  login,
  register,
} from "../../src/modules/auth/service.js";
import {
  findSessionById,
  isSessionUsable,
  revokeAllSessionsForUser,
} from "../../src/infra/db/repositories/session.repository.js";
import {
  InvalidCredentialsError,
  UnauthenticatedError,
} from "../../src/core/errors/app-error.js";
import type { Db } from "../../src/infra/db/database.js";

const OWNER = {
  email: "owner@example.com",
  masterPassword: "owner-master-password",
};

const NEW_PASSWORD = "rotated-master-password";

function freshDb(): Db {
  const db = createDatabase(":memory:");
  runMigrations(db);
  seedRegistry(db);
  return db;
}

describe("changePassword", () => {
  it("rotates the current session and keeps it usable", () => {
    const db = freshDb();
    const { user } = bootstrap(db, { ...OWNER, ip: "127.0.0.1" });
    const { session } = login(db, { ...OWNER, ip: "127.0.0.1" });

    const newSessionId = changePassword(db, {
      sessionId: session.id,
      currentPassword: OWNER.masterPassword,
      newPassword: NEW_PASSWORD,
    });

    expect(newSessionId).not.toBe(session.id);
    expect(findSessionById(db, session.id)?.revoked_at).not.toBeNull();
    const rotated = findSessionById(db, newSessionId);
    expect(rotated?.user_id).toBe(user.id);
    expect(rotated !== null && isSessionUsable(rotated)).toBe(true);
    db.close();
  });

  it("signs out every other session of the same user", () => {
    const db = freshDb();
    bootstrap(db, { ...OWNER, ip: "127.0.0.1" });
    const browser = login(db, { ...OWNER, ip: "127.0.0.1" });
    const otherDevice = login(db, { ...OWNER, ip: "10.0.0.2" });

    const newSessionId = changePassword(db, {
      sessionId: browser.session.id,
      currentPassword: OWNER.masterPassword,
      newPassword: NEW_PASSWORD,
    });

    expect(
      findSessionById(db, otherDevice.session.id)?.revoked_at,
    ).not.toBeNull();
    const rotated = findSessionById(db, newSessionId);
    expect(rotated !== null && isSessionUsable(rotated)).toBe(true);
    db.close();
  });

  it("does not touch sessions of other accounts", () => {
    const db = freshDb();
    bootstrap(db, { ...OWNER, ip: "127.0.0.1" });
    const member = register(db, {
      email: "teammate@example.com",
      masterPassword: "teammate-password-1",
      confirmPassword: "teammate-password-1",
    });
    const memberSession = login(db, {
      email: member.email,
      masterPassword: "teammate-password-1",
      ip: "127.0.0.1",
    });
    const browser = login(db, { ...OWNER, ip: "127.0.0.1" });

    changePassword(db, {
      sessionId: browser.session.id,
      currentPassword: OWNER.masterPassword,
      newPassword: NEW_PASSWORD,
    });

    const untouched = findSessionById(db, memberSession.session.id);
    expect(untouched?.revoked_at).toBeNull();
    expect(untouched !== null && isSessionUsable(untouched)).toBe(true);
    db.close();
  });

  it("invalidates the old password and accepts the new one", () => {
    const db = freshDb();
    bootstrap(db, { ...OWNER, ip: "127.0.0.1" });
    const { session } = login(db, { ...OWNER, ip: "127.0.0.1" });

    changePassword(db, {
      sessionId: session.id,
      currentPassword: OWNER.masterPassword,
      newPassword: NEW_PASSWORD,
    });

    expect(() => login(db, { ...OWNER, ip: "127.0.0.1" })).toThrow(
      InvalidCredentialsError,
    );
    const reLogin = login(db, {
      email: OWNER.email,
      masterPassword: NEW_PASSWORD,
      ip: "127.0.0.1",
    });
    expect(reLogin.user.email).toBe(OWNER.email);
    db.close();
  });

  it("rejects a wrong current password and leaves the session alive", () => {
    const db = freshDb();
    bootstrap(db, { ...OWNER, ip: "127.0.0.1" });
    const { session } = login(db, { ...OWNER, ip: "127.0.0.1" });

    expect(() =>
      changePassword(db, {
        sessionId: session.id,
        currentPassword: "wrong-current-password",
        newPassword: NEW_PASSWORD,
      }),
    ).toThrow(InvalidCredentialsError);

    const untouched = findSessionById(db, session.id);
    expect(untouched !== null && isSessionUsable(untouched)).toBe(true);
    db.close();
  });

  it("rejects an unknown session", () => {
    const db = freshDb();
    bootstrap(db, { ...OWNER, ip: "127.0.0.1" });

    expect(() =>
      changePassword(db, {
        sessionId: "missing-session",
        currentPassword: OWNER.masterPassword,
        newPassword: NEW_PASSWORD,
      }),
    ).toThrow(UnauthenticatedError);
    db.close();
  });
});

describe("revokeAllSessionsForUser", () => {
  it("only revokes the given user's sessions, honouring the exception", () => {
    const db = freshDb();
    const bootstrapped = bootstrap(db, { ...OWNER, ip: "127.0.0.1" });
    const member = register(db, {
      email: "teammate@example.com",
      masterPassword: "teammate-password-1",
      confirmPassword: "teammate-password-1",
    });
    const keep = login(db, { ...OWNER, ip: "127.0.0.1" });
    const revokeTarget = login(db, { ...OWNER, ip: "10.0.0.2" });
    const memberSession = login(db, {
      email: member.email,
      masterPassword: "teammate-password-1",
      ip: "127.0.0.1",
    });

    const revokedCount = revokeAllSessionsForUser(
      db,
      bootstrapped.user.id,
      keep.session.id,
    );

    expect(revokedCount).toBe(2);
    expect(findSessionById(db, bootstrapped.session.id)?.revoked_at).not.toBe(
      null,
    );
    expect(
      findSessionById(db, revokeTarget.session.id)?.revoked_at,
    ).not.toBeNull();
    expect(findSessionById(db, keep.session.id)?.revoked_at).toBeNull();
    expect(findSessionById(db, memberSession.session.id)?.revoked_at).toBeNull();
    db.close();
  });
});
