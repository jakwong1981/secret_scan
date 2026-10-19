import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";
import { Alert, Button, Card, Input } from "../components/ui";

const CONFLICT_MESSAGES: Record<string, string> = {
  EMAIL_TAKEN: "That email is already registered — sign in instead.",
};

export function RegisterPage() {
  const status = useQuery({
    queryKey: ["auth-status"],
    queryFn: api.auth.status,
  });
  const minLength = status.data?.passwordMinLength ?? 8;

  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const created = await api.auth.register({
        email,
        masterPassword: password,
        confirmPassword,
      });
      await queryClient.invalidateQueries({ queryKey: ["auth-status"] });
      navigate("/login", {
        replace: true,
        state: {
          notice: `${created.email} created — sign in to open the vault.`,
        },
      });
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? (CONFLICT_MESSAGES[caught.code] ?? caught.message)
          : "Registration failed",
      );
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            SecretKeyPreview
          </h1>
          <p className="mt-1 text-sm text-muted">
            Create an account to preview this Mac&apos;s AI API keys.
          </p>
        </div>

        <Card className="p-6">
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <Input
              label="Email"
              value={email}
              onChange={setEmail}
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
            />
            <Input
              label="Password"
              value={password}
              onChange={setPassword}
              type="password"
              autoComplete="new-password"
              required
              hint={`Minimum ${minLength} characters — stored as an scrypt hash, never in plain text.`}
            />
            <Input
              label="Confirm password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              type="password"
              autoComplete="new-password"
              required
              hint={
                password !== confirmPassword && confirmPassword !== ""
                  ? "Passwords do not match"
                  : undefined
              }
            />

            <p className="text-sm text-muted">
              Every account previews the same encrypted keys, so keep this vault
              on loopback over TLS — the port is the only thing standing between
              the keys and the network.
            </p>

            {error ? <Alert tone="error">{error}</Alert> : null}

            <Button
              type="submit"
              disabled={
                busy ||
                !email ||
                !password ||
                !confirmPassword ||
                password !== confirmPassword
              }
            >
              {busy ? "Creating…" : "Create account"}
            </Button>
          </form>
        </Card>

        <p className="mt-6 text-center text-sm text-muted">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-accent hover:underline">
            Sign in
          </Link>
        </p>

        <p className="mt-2 text-center text-xs text-muted">
          Runs locally on <code>127.0.0.1</code> over TLS 1.3 · no data leaves
          this Mac.
        </p>
      </div>
    </main>
  );
}
