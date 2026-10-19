import { describe, expect, it, vi, afterEach } from "vitest";
import { api } from "../api/client";

const ENVELOPE = {
  code: "OK",
  timestamp: "2026-10-19T00:00:00.000Z",
  traceId: "t1",
};

describe("api client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
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
});
