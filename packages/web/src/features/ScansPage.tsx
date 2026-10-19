import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { Badge, Card, EmptyState, Spinner, formatDate } from "../components/ui";

export function ScansPage() {
  const scans = useQuery({ queryKey: ["scans"], queryFn: api.scans.list });

  if (scans.isPending) {
    return (
      <Card className="p-8">
        <Spinner label="Loading scan history" />
      </Card>
    );
  }

  const runs = scans.data?.items ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">
          Scan history
        </h1>
        <p className="text-sm text-muted">
          {scans.data?.totalKeys ?? 0} keys currently in the vault.
        </p>
      </div>

      {runs.length === 0 ? (
        <EmptyState
          title="No scans yet"
          description="Trigger a scan from the dashboard."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-line bg-surface text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Started
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Trigger
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Sources
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    New
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Updated
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Removed
                  </th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr
                    key={run.id}
                    className="border-b border-line last:border-0"
                  >
                    <td className="px-4 py-3 text-xs text-muted">
                      {formatDate(run.startedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        tone={
                          run.status === "completed"
                            ? "ok"
                            : run.status === "failed"
                              ? "danger"
                              : "warn"
                        }
                      >
                        {run.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs">{run.triggerKind}</td>
                    <td className="px-4 py-3 text-xs">{run.sourceCount}</td>
                    <td className="px-4 py-3 text-xs">{run.newCount}</td>
                    <td className="px-4 py-3 text-xs">{run.updatedCount}</td>
                    <td className="px-4 py-3 text-xs">{run.removedCount}</td>
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
