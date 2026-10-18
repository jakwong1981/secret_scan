import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { Alert, Badge, Button, Card, Field, Input, Spinner } from "../components/ui";
import { useReauth } from "../hooks/useReauth";

interface SettingsView {
  googleAllowedEmails: string[];
  sessionIdleMinutes: number;
  sessionAbsoluteHours: number;
  verifyKeysOptIn: boolean;
  scanRoot: string;
  googleConfigured: boolean;
  publicOrigin: string;
}

export function SettingsPage() {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings.get });
  const sources = useQuery({ queryKey: ["sources"], queryFn: api.sources.list });

  const reauth = useReauth();
  const [emails, setEmails] = useState("");
  const [verifyOptIn, setVerifyOptIn] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      if (!reauth.hasScope()) await reauth.confirm(currentPassword);
      return api.settings.update({
        googleAllowedEmails: emails
          .split(",")
          .map((email) => email.trim().toLowerCase())
          .filter((email) => email.length > 0),
        verifyKeysOptIn: verifyOptIn,
      });
    },
    onSuccess: () => {
      setMessage("Settings saved.");
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });

  const changePassword = useMutation({
    mutationFn: async () => {
      if (!reauth.hasScope()) await reauth.confirm(currentPassword);
      return api.auth.changePassword(currentPassword, newPassword);
    },
    onSuccess: () => {
      setMessage("Master password changed — other sessions were signed out.");
      setCurrentPassword("");
      setNewPassword("");
    },
  });

  if (settings.isPending) {
    return (
      <Card className="p-8">
        <Spinner label="Loading settings" />
      </Card>
    );
  }

  const view: SettingsView | undefined = settings.data;
  if (!view) {
    return <Alert tone="error">Settings could not be loaded.</Alert>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Settings</h1>
        <p className="text-sm text-muted">Owner account, scan registry and security policy.</p>
      </div>

      {message ? <Alert tone="success">{message}</Alert> : null}
      {reauth.error ? <Alert tone="error">{reauth.error}</Alert> : null}
      {save.isError ? <Alert tone="error">{(save.error as Error).message}</Alert> : null}

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-ink">Security policy</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="Idle timeout (minutes)">{view.sessionIdleMinutes}</Field>
          <Field label="Absolute session (hours)">{view.sessionAbsoluteHours}</Field>
          <Field label="Public origin">{view.publicOrigin}</Field>
          <Field label="Scan root">{view.scanRoot}</Field>
          <Field label="Google sign-in">
            {view.googleConfigured ? "configured" : "not configured (SKP_GOOGLE_CLIENT_ID missing)"}
          </Field>
          <Field label="Transport">HTTPS only (TLS 1.3)</Field>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-ink">Owner access</h2>
        <div className="mt-3 space-y-4">
          <Input
            label="Google allow-list (comma separated owner emails)"
            value={emails === "" ? view.googleAllowedEmails.join(", ") : emails}
            onChange={setEmails}
            placeholder="owner@example.com"
          />
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={verifyOptIn || view.verifyKeysOptIn}
              onChange={(event) => setVerifyOptIn(event.target.checked)}
              className="h-4 w-4 rounded border-line"
            />
            Enable live key verification (sends one cheap request per provider probe)
          </label>
          <div className="space-y-3 rounded-lg border border-line p-3">
            <Input
              label="Confirm master password"
              value={currentPassword}
              onChange={setCurrentPassword}
              type="password"
              autoComplete="current-password"
            />
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save settings"}
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-ink">Change master password</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Input
            label="New master password"
            value={newPassword}
            onChange={setNewPassword}
            type="password"
            autoComplete="new-password"
            hint="Minimum 12 characters"
          />
        </div>
        <div className="mt-3">
          <Button variant="secondary" onClick={() => changePassword.mutate()} disabled={changePassword.isPending}>
            {changePassword.isPending ? "Changing…" : "Change password"}
          </Button>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-ink">Scan registry</h2>
        <p className="mt-1 text-sm text-muted">
          {sources.data?.items.length ?? 0} sources configured,{" "}
          {sources.data?.items.filter((source) => source.enabled).length ?? 0} enabled. Paths are read-only.
        </p>
        <div className="mt-3 max-h-72 overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-muted">
              <tr>
                <th scope="col" className="py-2 font-medium">
                  Source
                </th>
                <th scope="col" className="py-2 font-medium">
                  Path
                </th>
                <th scope="col" className="py-2 font-medium">
                  Parser
                </th>
                <th scope="col" className="py-2 font-medium">
                  Enabled
                </th>
              </tr>
            </thead>
            <tbody>
              {(sources.data?.items ?? []).map((source) => (
                <tr key={source.id} className="border-t border-line">
                  <td className="py-2 text-ink">{source.id}</td>
                  <td className="py-2 break-all text-muted">{source.path}</td>
                  <td className="py-2 text-muted">{source.parser}</td>
                  <td className="py-2">
                    <Badge tone={source.enabled ? "ok" : "warn"}>{source.enabled ? "yes" : "no"}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
