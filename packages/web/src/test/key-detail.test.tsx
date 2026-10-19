import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { KeyDetailPage } from "../features/KeyDetailPage";
import { api } from "../api/client";
import type { KeyDetail } from "@skp/contracts";

const DETAIL: KeyDetail = {
  id: "k1",
  provider: "anthropic",
  providerLabel: "Anthropic (Claude)",
  maskedValue: "sk-tea••••e6e0",
  fingerprint: "fp1",
  sourceKind: "file",
  sourcePath: "/Users/owner/.codex/auth.json",
  sourcePointer: "OPENAI_API_KEY",
  envVarName: undefined,
  firstSeenAt: "2026-08-01T10:00:00.000Z",
  lastSeenAt: "2026-08-05T10:00:00.000Z",
  sourceMtime: "2026-08-02T10:00:00.000Z",
  lastVerifiedAt: undefined,
  verificationStatus: "unknown",
  status: "active",
  sources: [
    {
      sourceKind: "file",
      sourcePath: "/Users/owner/.codex/auth.json",
      sourcePointer: "OPENAI_API_KEY",
      envVarName: "OPENAI_API_KEY",
      firstSeenAt: "2026-08-01T10:00:00.000Z",
      lastSeenAt: "2026-08-05T10:00:00.000Z",
    },
    {
      sourceKind: "file",
      sourcePath: "/Users/owner/.claude/settings.json",
      sourcePointer: "env.ANTHROPIC_AUTH_TOKEN",
      envVarName: undefined,
      firstSeenAt: "2026-08-03T10:00:00.000Z",
      lastSeenAt: "2026-08-05T10:00:00.000Z",
    },
  ],
  tags: [],
  events: [],
};

function renderDetail() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false } },
        })
      }
    >
      <MemoryRouter initialEntries={["/keys/k1"]}>
        <Routes>
          <Route path="/keys/:id" element={<KeyDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("KeyDetailPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api.keys, "detail").mockResolvedValue(DETAIL);
  });

  it("lists every place the secret was found", async () => {
    renderDetail();

    const locations = await screen.findByLabelText("all locations");
    expect(
      within(locations).getByText("/Users/owner/.codex/auth.json"),
    ).toBeInTheDocument();
    expect(
      within(locations).getByText("env.ANTHROPIC_AUTH_TOKEN"),
    ).toBeInTheDocument();
    expect(screen.getByText("Found in 2 locations")).toBeInTheDocument();
    // `formatDate` renders with the runtime locale (jsdom: en-US).
    expect(
      within(locations).getByText(/first seen 8\/1\/2026/),
    ).toBeInTheDocument();
  });

  it("omits the location list when the secret has a single home", async () => {
    vi.spyOn(api.keys, "detail").mockResolvedValue({
      ...DETAIL,
      sourcePath: "/Users/owner/.claude/settings.json",
      sourcePointer: "env.ANTHROPIC_AUTH_TOKEN",
      sources: [DETAIL.sources[1]!],
    });
    renderDetail();

    expect(await screen.findByText("Evidence")).toBeInTheDocument();
    expect(screen.queryByLabelText("all locations")).toBeNull();
    expect(screen.queryByText(/Found in \d+ locations/)).toBeNull();
  });
});
