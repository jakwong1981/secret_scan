import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";
import { useSessionStore } from "../stores/session.store";
import { Alert, Button, Card, Input, Tabs } from "../components/ui";

type Tab = "password" | "google";

export function LoginPage() {
  const setUser = useSessionStore((state) => state.setUser);
  const location = useLocation();
  const notice = (location.state as { notice?: string } | null)?.notice ?? null;
  const status = useQuery({
    queryKey: ["auth-status"],
    queryFn: api.auth.status,
  });

  const [tab, setTab] = useState<Tab>("password");
  const navigate = useNavigate();

  const needsBootstrap = status.data?.needsBootstrap ?? false;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleInfo, setGoogleInfo] = useState<string | null>(null);

  useEffect(() => {
    const onMessage = (event: MessageEvent): void => {
      const data = event.data as {
        type?: string;
        ok?: boolean;
        message?: string;
      };
      if (data?.type !== "skp:google-auth") return;
      if (data.ok) {
        setGoogleInfo(null);
        window.location.assign("/");
      } else {
        setGoogleInfo(data.message ?? "Google sign-in failed");
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      if (needsBootstrap) {
        const user = await api.auth.bootstrap({
          email,
          masterPassword: password,
        });
        setUser(user, "password");
      } else {
        const user = await api.auth.login({ email, masterPassword: password });
        setUser(user, "password");
      }
      navigate("/", { replace: true });
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "Authentication failed",
      );
    } finally {
      setBusy(false);
    }
  };

  const startGoogle = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setGoogleInfo(null);
    try {
      const challenge = await api.auth.googleStart();
      window.location.assign(challenge.authorizationUrl);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Google sign-in unavailable",
      );
      setBusy(false);
    }
  };

  const passwordLabel = needsBootstrap
    ? "Master password (12+ characters)"
    : "Password";

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            SecretKeyPreview
          </h1>
          <p className="mt-1 text-sm text-muted">
            Local vault for every AI API key on this Mac.
          </p>
        </div>

        <Card className="p-6">
          {needsBootstrap ? (
            <p className="mb-4 text-sm text-muted">
              No owner account yet — create the master password that protects
              the vault.
            </p>
          ) : (
            <Tabs
              tabs={[
                { id: "password", label: "Password" },
                { id: "google", label: "Google" },
              ]}
              active={tab}
              onChange={(id) => setTab(id as Tab)}
            />
          )}

          <div className="mt-5 space-y-4">
            {tab === "google" ? (
              <>
                <p className="text-sm text-muted">
                  Sign in with Google. Access is limited to allow-listed
                  addresses configured in Settings.
                </p>
                {status.data && !status.data.googleConfigured ? (
                  <Alert tone="error">
                    Google sign-in is not configured (set{" "}
                    <code>SKP_GOOGLE_CLIENT_ID</code> and{" "}
                    <code>SKP_GOOGLE_CLIENT_SECRET</code>).
                  </Alert>
                ) : null}
                {googleInfo ? <Alert tone="error">{googleInfo}</Alert> : null}
                {error ? <Alert tone="error">{error}</Alert> : null}
                <Button
                  onClick={() => void startGoogle()}
                  disabled={
                    busy || (status.data && !status.data.googleConfigured)
                  }
                >
                  {busy ? "Opening Google…" : "Continue with Google"}
                </Button>
              </>
            ) : (
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submit();
                }}
              >
                {notice ? <Alert tone="success">{notice}</Alert> : null}
                <Input
                  label="Email"
                  value={email}
                  onChange={setEmail}
                  type="email"
                  autoComplete="email"
                  required
                />
                <Input
                  label={passwordLabel}
                  value={password}
                  onChange={setPassword}
                  type="password"
                  autoComplete={
                    needsBootstrap ? "new-password" : "current-password"
                  }
                  required
                  hint={
                    needsBootstrap
                      ? "Stored as an Argon2-grade scrypt hash; it also re-authenticates reveal/delete."
                      : undefined
                  }
                />
                {error ? <Alert tone="error">{error}</Alert> : null}
                <Button type="submit" disabled={busy}>
                  {busy
                    ? "Checking…"
                    : needsBootstrap
                      ? "Create owner account"
                      : "Sign in"}
                </Button>
              </form>
            )}
          </div>
        </Card>

        {needsBootstrap ? null : (
          <p className="mt-4 text-center text-sm text-muted">
            No account yet?{" "}
            <Link
              to="/register"
              className="font-medium text-accent hover:underline"
            >
              Create one
            </Link>
          </p>
        )}

        <p className="mt-6 text-center text-xs text-muted">
          Runs locally on <code>127.0.0.1</code> over TLS 1.3 · no data leaves
          this Mac.
        </p>
      </div>
    </main>
  );
}
