import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { VerifyKeyResponse } from "@skp/contracts";
import { Alert, Badge, Button, Card, Field, Input, Spinner } from "../components/ui";
import { formatDate } from "../components/ui";
import { useReauth } from "../hooks/useReauth";

export function KeyDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id ?? "";
  const queryClient = useQueryClient();
  const detail = useQuery({ queryKey: ["key", id], queryFn: () => api.keys.detail(id) });

  const [password, setPassword] = useState("");
  const [revealed, setRevealed] = useState<{ value: string; expiresAt: string } | null>(null);
  const [verified, setVerified] = useState<VerifyKeyResponse | null>(null);
  const [label, setLabel] = useState("");
  const reauth = useReauth();

  const reveal = useMutation({
    mutationFn: async () => {
      if (!reauth.hasScope()) await reauth.confirm(password);
      return api.keys.reveal(id);
    },
    onSuccess: (result) => setRevealed(result),
  });

  const verify = useMutation({
    mutationFn: () => api.keys.verify(id),
    onSuccess: (result) => setVerified(result),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!reauth.hasScope()) await reauth.confirm(password);
      return api.keys.remove(id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["keys"] });
      window.location.assign("/");
    },
  });

  if (detail.isPending) {
    return (
      <Card className="p-8">
        <Spinner label="Loading key" />
      </Card>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <div className="space-y-4">
        <Alert tone="error">This key could not be loaded (it may have been deleted).</Alert>
        <Link to="/" className="text-sm font-medium text-accent hover:underline">
          ← Back to dashboard
        </Link>
      </div>
    );
  }

  const key = detail.data;
  const secondsLeft = revealed
    ? Math.max(0, Math.round((new Date(revealed.expiresAt).getTime() - Date.now()) / 1000))
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/" className="text-sm text-muted hover:text-ink">
          ← Back to dashboard
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-ink">
          {key.providerLabel}
          {key.label ? <span className="text-muted"> · {key.label}</span> : null}
        </h1>
        <div className="mt-2 flex flex-wrap gap-2">
          <Badge tone={key.status === "active" ? "ok" : "warn"}>{key.status}</Badge>
          <Badge tone={key.verificationStatus === "valid" ? "ok" : "neutral"}>
            {key.verificationStatus}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-ink">Secret</h2>
          <p className="mt-2 break-all rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs text-ink">
            {revealed ? revealed.value : key.maskedValue}
          </p>
          {revealed ? (
            <p className="mt-2 text-xs text-warn">Auto-hides in {secondsLeft}s — never paste this anywhere.</p>
          ) : (
            <p className="mt-2 text-xs text-muted">
              Revealing requires re-authentication; the value is decrypted only for this response.
            </p>
          )}

          <div className="mt-4 space-y-3">
            {!reauth.hasScope() ? (
              <Input
                label="Confirm master password"
                value={password}
                onChange={setPassword}
                type="password"
                autoComplete="current-password"
              />
            ) : null}
            {reauth.error ? <Alert tone="error">{reauth.error}</Alert> : null}
            {reveal.isError ? (
              <Alert tone="error">
                {(reveal.error as Error).message ?? "Reveal failed"}
              </Alert>
            ) : null}
            <Button onClick={() => reveal.mutate()} disabled={reveal.isPending} title="Decrypt and display">
              {reveal.isPending ? "Decrypting…" : revealed ? "Reveal again" : "Reveal value"}
            </Button>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-ink">Evidence</h2>
          <dl className="mt-2 divide-y divide-line">
            <Field label="Source">
              {key.sourceKind === "keychain" ? "macOS Keychain (metadata only)" : key.sourcePath}
            </Field>
            <Field label={key.sourceKind === "keychain" ? "Item" : "Location in file"}>
              {key.sourcePointer ?? "—"}
            </Field>
            <Field label="Environment variable">{key.envVarName ?? "—"}</Field>
            <Field label="Date added (file mtime)">{formatDate(key.sourceMtime)}</Field>
            <Field label="First seen by SecretKeyPreview">{formatDate(key.firstSeenAt)}</Field>
            <Field label="Last seen">{formatDate(key.lastSeenAt)}</Field>
            <Field label="Last verified">{formatDate(key.lastVerifiedAt)}</Field>
            <Field label="Fingerprint">
              <span className="break-all font-mono text-xs">{key.fingerprint}</span>
            </Field>
          </dl>
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-ink">Actions</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => verify.mutate()} disabled={verify.isPending}>
            {verify.isPending ? "Verifying…" : "Verify with provider"}
          </Button>
          <Button variant="danger" onClick={() => remove.mutate()} disabled={remove.isPending}>
            Delete from vault
          </Button>
        </div>
        {verify.isError ? (
          <Alert tone="error">{(verify.error as Error).message}</Alert>
        ) : null}
        {verified ? (
          <p className="mt-3 text-xs text-muted">
            {verified.detail} · checked {formatDate(verified.checkedAt)}
          </p>
        ) : null}
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-ink">Lifecycle</h2>
        <ol className="mt-3 space-y-2">
          {key.events.map((event) => (
            <li key={event.id} className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <Badge tone={event.type === "revealed" ? "warn" : "neutral"}>{event.type}</Badge>
              <span>{formatDate(event.at)}</span>
              <span className="text-ink">by {event.actor}</span>
              {event.note ? <span className="text-muted">— {event.note}</span> : null}
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
