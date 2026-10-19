import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { MaskedKey, ScanProgressEvent } from "@skp/contracts";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  formatDate,
  Input,
  Spinner,
} from "../components/ui";

const SORTS = [
  { id: "date_added", label: "Date added" },
  { id: "provider", label: "Provider" },
  { id: "last_seen", label: "Last seen" },
] as const;

function verificationTone(
  key: MaskedKey,
): "neutral" | "ok" | "warn" | "danger" {
  if (key.verificationStatus === "valid") return "ok";
  if (key.verificationStatus === "invalid") return "danger";
  if (key.verificationStatus === "error") return "warn";
  return "neutral";
}

/** Every home of the key except the one already shown in the row. */
function otherLocations(key: MaskedKey): string[] {
  return key.sources
    .filter(
      (source) =>
        source.sourcePath !== key.sourcePath ||
        (source.sourcePointer ?? "") !== (key.sourcePointer ?? ""),
    )
    .map((source) =>
      source.sourcePointer
        ? `${source.sourcePath} → ${source.sourcePointer}`
        : source.sourcePath,
    );
}

function statusTone(key: MaskedKey): "neutral" | "warn" | "danger" {
  if (key.status === "removed") return "danger";
  if (key.status === "archived") return "warn";
  return "neutral";
}

export function DashboardPage() {
  const queryClient = useQueryClient();
  const [provider, setProvider] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<(typeof SORTS)[number]["id"]>("date_added");
  const [progress, setProgress] = useState<ScanProgressEvent[]>([]);
  const [scanning, setScanning] = useState(false);

  const keys = useQuery({
    queryKey: ["keys", provider, search, sort],
    queryFn: () =>
      api.keys.list({
        provider: provider || undefined,
        search: search || undefined,
        sort,
        limit: 100,
      }),
    refetchInterval: scanning ? 3000 : false,
  });

  const sources = useQuery({
    queryKey: ["sources"],
    queryFn: api.sources.list,
  });
  const providers = useMemo(() => {
    const names = new Set<string>();
    for (const item of keys.data?.items ?? [])
      names.add(`${item.provider}:${item.providerLabel}`);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [keys.data]);

  const scan = useMutation({
    mutationFn: () => api.scans.trigger(),
    onMutate: () => {
      setScanning(true);
      setProgress([]);
    },
    onSuccess: async (result) => {
      const unsubscribe = api.scans.events(
        result.outcome.runId,
        (event) => setProgress((previous) => [...previous.slice(-99), event]),
        () => {
          unsubscribe();
          setScanning(false);
          void queryClient.invalidateQueries({ queryKey: ["keys"] });
        },
      );
    },
    onError: () => setScanning(false),
  });

  const items = keys.data?.items ?? [];
  const totalKeys = keys.data?.total ?? 0;
  const providerCount = new Set(items.map((item) => item.provider)).size;
  const needingAttention = items.filter(
    (item) =>
      item.status === "removed" || item.verificationStatus === "invalid",
  ).length;
  const lastScan = useQuery({ queryKey: ["scans"], queryFn: api.scans.list });
  const lastScanDate = lastScan.data?.items?.[0]?.startedAt;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">
            API keys on this Mac
          </h1>
          <p className="text-sm text-muted">
            {sources.data?.items.filter((source) => source.enabled).length ?? 0}{" "}
            sources monitored · last scan {formatDate(lastScanDate)}
          </p>
        </div>
        <Button onClick={() => scan.mutate()} disabled={scanning}>
          {scanning ? "Scanning…" : "Scan now"}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted">
            Keys discovered
          </p>
          <p className="mt-1 text-2xl font-semibold text-ink">{totalKeys}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted">
            Providers
          </p>
          <p className="mt-1 text-2xl font-semibold text-ink">
            {providerCount}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted">
            Needs attention
          </p>
          <p className="mt-1 text-2xl font-semibold text-ink">
            {needingAttention}
          </p>
        </Card>
      </div>

      {scanning || progress.length > 0 ? (
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-ink">Scan progress</p>
            {scanning ? (
              <Spinner label="running" />
            ) : (
              <Badge tone="ok">finished</Badge>
            )}
          </div>
          <ol
            aria-live="polite"
            className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-muted"
          >
            {progress.map((event, index) => (
              <li key={`${event.at}-${index}`}>
                <span className="font-mono text-ink/70">{event.phase}</span>{" "}
                {event.message}
              </li>
            ))}
          </ol>
        </Card>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Input
            label="Search path, provider or label"
            value={search}
            onChange={setSearch}
            placeholder={`e.g. codex, ~/.codex/auth.json, anthropic`}
          />
        </div>
        <div className="sm:w-56">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-ink">Provider</span>
            <select
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
              className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            >
              <option value="">All providers</option>
              {providers.map((entry) => {
                const [id, label] = entry.split(":");
                return (
                  <option key={entry} value={id}>
                    {label}
                  </option>
                );
              })}
            </select>
          </label>
        </div>
        <div className="sm:w-44">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-ink">Sort by</span>
            <select
              value={sort}
              onChange={(event) =>
                setSort(event.target.value as (typeof SORTS)[number]["id"])
              }
              className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            >
              {SORTS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {keys.isPending ? (
        <Card className="p-8">
          <Spinner label="Loading keys" />
        </Card>
      ) : items.length === 0 ? (
        <EmptyState
          title="No keys found yet"
          description="Run a scan to inspect AI agent configs, dotfiles and the macOS keychain."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="border-b border-line bg-surface text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Provider
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Key
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Source
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Date added
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-line last:border-0"
                  >
                    <td className="px-4 py-3">
                      <span className="font-medium text-ink">
                        {item.providerLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        aria-label="masked API key"
                        className="font-mono text-xs text-ink"
                      >
                        {item.maskedValue}
                      </span>
                      {item.envVarName ? (
                        <span className="ml-2 text-xs text-muted">
                          {item.envVarName}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-xs text-muted"
                        title={item.sourcePath}
                      >
                        {item.sourceKind === "keychain"
                          ? "macOS Keychain"
                          : item.sourcePath}
                      </span>
                      {item.sourcePointer ? (
                        <span className="block text-xs text-muted/80">
                          {item.sourcePointer}
                        </span>
                      ) : null}
                      {item.sources.length > 1 ? (
                        <span
                          className="block text-xs text-muted/80"
                          title={otherLocations(item).join("\n")}
                        >
                          +{item.sources.length - 1} more location
                          {item.sources.length > 2 ? "s" : ""}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {formatDate(item.sourceMtime ?? item.firstSeenAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <Badge tone={statusTone(item)}>{item.status}</Badge>
                        <Badge tone={verificationTone(item)}>
                          {item.verificationStatus}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/keys/${item.id}`}
                        className="text-sm font-medium text-accent hover:underline"
                      >
                        Details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
