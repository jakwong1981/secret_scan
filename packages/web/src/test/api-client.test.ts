import { describe, expect, it, vi, afterEach } from "vitest";
import { api, ApiError } from "../api/client";
import { useSessionStore } from "../stores/session.store";

const ENVELOPE = {
  code: "OK",
  timestamp: "2026-10-19T00:00:00.000Z",
  traceId: "t1",
};

function envelopeWith(
  code: string,
  message: string,
): { ok: boolean; text: () => Promise<string> } {
  return {
    ok: false,
    text: async () => JSON.stringify({ ...ENVELOPE, code, message }),
  };
}

describe("api client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    useSessionStore.getState().reset();
  });

  it("targets the API on the page origin so session cookies stay first-party", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({ ...ENVELOPE, data: { needsBootstrap: false } }),
      headers: new Headers(),
    });
    vi.stubGlobal("fetch", fetchMock);

    await api.auth.status();

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("/api/v1/auth/status");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      credentials: "include",
    });
  });

  it("resets the session and sends the browser to /login when the session is dead", async () => {
    useSessionStore.getState().setUser(
      { id: "u1", email: "owner@example.com", methods: ["password"] },
      "password",
    );
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { assign, pathname: "/" } });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        envelopeWith("UNAUTHENTICATED", "Authentication required"),
      ),
    );

    await expect(api.settings.get()).rejects.toBeInstanceOf(ApiError);

    expect(useSessionStore.getState().user).toBeNull();
    expect(assign).toHaveBeenCalledWith("/login");
  });

  it("keeps the signed-in store untouched for other auth failures", async () => {
    useSessionStore.getState().setUser(
      { id: "u1", email: "owner@example.com", methods: ["password"] },
      "password",
    );
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { assign, pathname: "/" } });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        envelopeWith("UNAUTHENTICATED", "re-authentication required"),
      ),
    );

    await expect(api.settings.get()).rejects.toBeInstanceOf(ApiError);

    expect(useSessionStore.getState().user).not.toBeNull();
    expect(assign).not.toHaveBeenCalled();
  });
});
