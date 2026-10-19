import type { Db } from "../../src/infra/db/database.js";
import { describe, expect, it, vi } from "vitest";

// `env.js` parses config at import, so the Google client must be present in
// the environment before the service (transitively) loads it.
process.env.SKP_GOOGLE_CLIENT_ID = "skp-test-client-id";
process.env.SKP_GOOGLE_CLIENT_SECRET = "skp-test-client-secret";

const { createDatabase, runMigrations } = await import(
  "../../src/infra/db/database.js"
);
const { seedRegistry } = await import("../../src/infra/db/seed.js");
const { createOauthChallenge } = await import(
  "../../src/infra/db/repositories/oauth-state.repository.js"
);
const { completeGoogleAuth } = await import("../../src/modules/auth/service.js");

const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";

const { createSign, generateKeyPairSync } = await import("node:crypto");
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const jwk = publicKey.export({ format: "jwk" }) as { n: string; e: string };

interface TokenOptions {
  sub: string;
  email: string;
  emailVerified: boolean;
  nonce: string;
}

function base64UrlJson(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signIdToken(options: TokenOptions): string {
  const header = base64UrlJson({ alg: "RS256", kid: "skp-test-key" });
  const payload = base64UrlJson({
    aud: process.env.SKP_GOOGLE_CLIENT_ID,
    iss: "https://accounts.google.com",
    exp: Math.floor(Date.now() / 1000) + 3600,
    nonce: options.nonce,
    sub: options.sub,
    email: options.email,
    email_verified: options.emailVerified,
  });
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  const signature = signer.sign(privateKey).toString("base64url");
  return `${header}.${payload}.${signature}`;
}

/** Mutable token the stubbed Google token endpoint hands out for the next code. */
let issuedIdToken = "";

vi.stubGlobal(
  "fetch",
  vi.fn(async (input: unknown): Promise<Response> => {
    const url = String(input);
    if (url === "https://oauth2.googleapis.com/token") {
      return new Response(
        JSON.stringify({ access_token: "test-access-token", id_token: issuedIdToken }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url === JWKS_URL) {
      return new Response(
        JSON.stringify({
          keys: [
            {
              kid: "skp-test-key",
              kty: "RSA",
              alg: "RS256",
              use: "sig",
              n: jwk.n,
              e: jwk.e,
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    throw new Error(`unexpected fetch target: ${url}`);
  }),
);

function freshDb(): Db {
  const db = createDatabase(":memory:");
  runMigrations(db);
  seedRegistry(db);
  return db;
}

describe("Google sign-in email verification", () => {
  it("links a verified Google identity and creates the first account", async () => {
    const db = freshDb();
    const challenge = createOauthChallenge(db);
    issuedIdToken = signIdToken({
      sub: "google-sub-1",
      email: "owner@test.example",
      emailVerified: true,
      nonce: challenge.nonce,
    });

    const context = await completeGoogleAuth(db, {
      code: "authorization-code",
      state: challenge.state,
      ip: "127.0.0.1",
      userAgent: "unit-test",
    });

    expect(context.user.email).toBe("owner@test.example");
    db.close();
  });

  it("rejects a Google identity whose email is not verified", async () => {
    const db = freshDb();
    const challenge = createOauthChallenge(db);
    issuedIdToken = signIdToken({
      sub: "google-sub-2",
      email: "owner@test.example",
      emailVerified: false,
      nonce: challenge.nonce,
    });

    await expect(
      completeGoogleAuth(db, {
        code: "authorization-code-2",
        state: challenge.state,
        ip: "127.0.0.1",
        userAgent: "unit-test",
      }),
    ).rejects.toThrow(/email is not verified/);

    db.close();
  });
});
