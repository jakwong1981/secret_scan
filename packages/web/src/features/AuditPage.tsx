import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { Badge, Card, EmptyState, Spinner, formatDate } from "../components/ui";

export function AuditPage() {
  const audit = useQuery({ queryKey: ["audit"], queryFn: () => api.audit.list(100, 0) });

  if (audit.isPending) {
    return (
      <Card className="p-8">
        <Spinner label="Loading audit trail" />
      </Card>
    );
  }

  const entries = audit.data?.items ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Audit trail</h1>
        <p className="text-sm text-muted">
          Every reveal, verification, sign-in and configuration change, with request trace IDs.
        </p>
      </div>

      {entries.length === 0 ? (
        <EmptyState title="No audit events yet" />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-line bg-surface text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    When
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Action
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Actor
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Target
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Outcome
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Trace
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 text-xs text-muted">{formatDate(entry.at)}</td>
                    <td className="px-4 py-3 text-xs text-ink">
                      {entry.action}
                      {entry.detail ? <span className="block text-muted">{entry.detail}</span> : null}
                    </td>
                    <td className="px-4 py-3 text-xs">{entry.actor}</td>
                    <td className="px-4 py-3 text-xs break-all text-muted">{entry.target ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Badge tone={entry.outcome === "success" ? "ok" : entry.outcome === "denied" ? "warn" : "danger"}>
                        {entry.outcome}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-[10px] text-muted">{entry.traceId.slice(0, 8)}</td>
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
