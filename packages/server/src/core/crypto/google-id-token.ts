import { createPublicKey, createVerify } from "node:crypto";
import { env } from "../../config/env.js";
import { UnauthenticatedError } from "../errors/app-error.js";

const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const VALID_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

interface GoogleJwk {
  kid: string;
  kty: string;
  alg: string;
  use: string;
  n: string;
  e: string;
}

interface Jwks {
  keys: GoogleJwk[];
}

let jwksCache: { fetchedAt: number; keys: GoogleJwk[] } | null = null;
const JWKS_TTL_MS = 10 * 60_000;

async function fetchJwks(): Promise<GoogleJwk[]> {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS)
    return jwksCache.keys;
  const response = await fetch(JWKS_URL, {
    headers: { accept: "application/json" },
  });
  if (!response.ok)
    throw new UnauthenticatedError("Could not fetch Google signing keys");
  const body = (await response.json()) as Jwks;
  jwksCache = { fetchedAt: Date.now(), keys: body.keys };
  return body.keys;
}

export interface GoogleIdTokenClaims {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
  nonce: string;
}

function decodeSegment(segment: string): string {
  return Buffer.from(segment, "base64url").toString("utf8");
}

/** Verifies a Google ID token (RS256) against Google's published keys. */
export async function verifyGoogleIdToken(
  idToken: string,
  expectedNonce: string,
): Promise<GoogleIdTokenClaims> {
  if (!env.SKP_GOOGLE_CLIENT_ID)
    throw new UnauthenticatedError("Google sign-in is not configured");

  const parts = idToken.split(".");
  if (parts.length !== 3) throw new UnauthenticatedError("Malformed ID token");
  const [rawHeader, rawPayload, rawSignature] = parts as [
    string,
    string,
    string,
  ];

  const header = JSON.parse(decodeSegment(rawHeader)) as {
    alg?: string;
    kid?: string;
  };
  if (header.alg !== "RS256" || !header.kid)
    throw new UnauthenticatedError("Unsupported ID token header");

  const keys = await fetchJwks();
  const jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk) throw new UnauthenticatedError("Unknown Google signing key");

  const publicKey = createPublicKey({ key: jwk, format: "jwk" });
  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${rawHeader}.${rawPayload}`);
  if (!verifier.verify(publicKey, Buffer.from(rawSignature, "base64url"))) {
    throw new UnauthenticatedError("ID token signature check failed");
  }

  const claims = JSON.parse(decodeSegment(rawPayload)) as Record<
    string,
    unknown
  >;
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (
    typeof claims.aud !== "string" ||
    claims.aud !== env.SKP_GOOGLE_CLIENT_ID
  ) {
    throw new UnauthenticatedError("ID token audience mismatch");
  }
  if (typeof claims.iss !== "string" || !VALID_ISSUERS.includes(claims.iss)) {
    throw new UnauthenticatedError("ID token issuer mismatch");
  }
  if (typeof claims.exp !== "number" || claims.exp <= nowSeconds) {
    throw new UnauthenticatedError("ID token expired");
  }
  if (typeof claims.nbf === "number" && claims.nbf > nowSeconds + 60) {
    throw new UnauthenticatedError("ID token not yet valid");
  }
  if (typeof claims.nonce !== "string" || claims.nonce !== expectedNonce) {
    throw new UnauthenticatedError("ID token nonce mismatch");
  }
  if (typeof claims.sub !== "string" || typeof claims.email !== "string") {
    throw new UnauthenticatedError("ID token missing subject or email");
  }

  return {
    sub: claims.sub,
    email: claims.email,
    emailVerified: claims.email_verified === true,
    name: typeof claims.name === "string" ? claims.name : undefined,
    picture: typeof claims.picture === "string" ? claims.picture : undefined,
    nonce: claims.nonce,
  };
}

export interface GoogleTokenResponse {
  access_token: string;
  id_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}

/** Exchanges an authorization code (PKCE) for tokens. */
export async function exchangeGoogleCode(input: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    client_id: env.SKP_GOOGLE_CLIENT_ID ?? "",
    client_secret: env.SKP_GOOGLE_CLIENT_SECRET ?? "",
    code_verifier: input.codeVerifier,
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body,
  });

  if (!response.ok) {
    throw new UnauthenticatedError("Google token exchange failed");
  }
  return (await response.json()) as GoogleTokenResponse;
}
