import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { DashboardPage } from "../features/DashboardPage";
import { api } from "../api/client";
import type { KeyList } from "@skp/contracts";

const KEYS: KeyList = {
  total: 2,
  items: [
    {
      id: "k1",
      provider: "anthropic",
      providerLabel: "Anthropic (Claude)",
      maskedValue: "sk-ant••••abcd",
      fingerprint: "fp1",
      sourceKind: "file",
      sourcePath: "/Users/owner/.codex/auth.json",
      sourcePointer: "OPENAI_API_KEY",
      envVarName: undefined,
      firstSeenAt: "2026-08-01T10:00:00.000Z",
      lastSeenAt: "2026-08-05T10:00:00.000Z",
      sourceMtime: "2026-08-02T10:00:00.000Z",
      lastVerifiedAt: undefined,
      verificationStatus: "valid",
      status: "active",
    },
    {
      id: "k2",
      provider: "github",
      providerLabel: "GitHub",
      maskedValue: "ghp_••••wxyz",
      fingerprint: "fp2",
      sourceKind: "keychain",
      sourcePath: "keychain:login:generic-password",
      sourcePointer: "GitHub CLI (pat)",
      envVarName: undefined,
      firstSeenAt: "2026-07-20T10:00:00.000Z",
      lastSeenAt: "2026-08-05T10:00:00.000Z",
      sourceMtime: undefined,
      lastVerifiedAt: undefined,
      verificationStatus: "unknown",
      status: "removed",
    },
  ],
};

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api.keys, "list").mockResolvedValue(KEYS);
    vi.spyOn(api.sources, "list").mockResolvedValue({
      items: [
        {
          id: "codex-auth",
          kind: "file",
          path: "~/.codex/auth.json",
          parser: "json",
          providerHint: "openai",
          enabled: true,
          priority: 10,
        },
        {
          id: "keychain-generic",
          kind: "keychain",
          path: "keychain:login:generic-password",
          parser: "keychain",
          enabled: true,
          priority: 50,
        },
      ],
    });
    vi.spyOn(api.scans, "list").mockResolvedValue({
      items: [
        {
          id: "r1",
          status: "completed",
          triggerKind: "manual",
          startedAt: "2026-08-05T10:00:00.000Z",
          finishedAt: "2026-08-05T10:01:00.000Z",
          sourceCount: 2,
          newCount: 2,
          updatedCount: 0,
          removedCount: 0,
          totalCount: 2,
        },
      ],
      total: 1,
      totalKeys: 2,
    });
  });

  it("renders masked keys with provider, source and date added", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const rows = await screen.findAllByRole("row");
    // header row + 2 key rows
    expect(rows).toHaveLength(3);

    const anthropicRow = rows[1] as HTMLElement;
    expect(within(anthropicRow).getByText("Anthropic (Claude)")).toBeInTheDocument();
    expect(within(anthropicRow).getByText("sk-ant••••abcd")).toBeInTheDocument();
    expect(within(anthropicRow).getByTitle(/\.codex\/auth\.json/)).toBeInTheDocument();
    expect(within(anthropicRow).getByText("active")).toBeInTheDocument();

    const githubRow = rows[2] as HTMLElement;
    expect(within(githubRow).getByText("macOS Keychain")).toBeInTheDocument();
  });

  it("shows the summary counters", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Keys discovered")).toBeInTheDocument();
    expect(screen.getByText("Providers")).toBeInTheDocument();
    expect(screen.getByText("Needs attention")).toBeInTheDocument();
  });
});
