import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { LoginPage } from "../features/LoginPage";
import { api } from "../api/client";
import { useSessionStore } from "../stores/session.store";
import type { AuthStatus } from "@skp/contracts";

function renderLogin(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const SIGNED_UP: AuthStatus = {
  needsBootstrap: false,
  passwordConfigured: true,
  googleConfigured: true,
  googleAllowedEmails: ["owner@example.com"],
  passwordMinLength: 12,
};

const FRESH_INSTALL: AuthStatus = {
  needsBootstrap: true,
  passwordConfigured: false,
  googleConfigured: true,
  googleAllowedEmails: [],
  passwordMinLength: 12,
};

describe("LoginPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useSessionStore.getState().reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useSessionStore.getState().reset();
  });

  it("shows the bootstrap form on a fresh install", async () => {
    vi.spyOn(api.auth, "status").mockResolvedValue(FRESH_INSTALL);
    renderLogin();
    await waitFor(() => {
      expect(screen.getByText(/No owner account yet/i)).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: /Create owner account/i }),
    ).toBeInTheDocument();
  });

  it("submits the master password and stores the session", async () => {
    vi.spyOn(api.auth, "status").mockResolvedValue(SIGNED_UP);
    const login = vi.spyOn(api.auth, "login").mockResolvedValue({
      id: "u1",
      email: "owner@example.com",
      methods: ["password"],
    });
    renderLogin();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^Email$/i), "owner@example.com");
    await user.type(
      screen.getByLabelText(/^Password$/i),
      "correct-horse-battery",
    );
    await user.click(screen.getByRole("button", { name: /Sign in/i }));

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith({
        email: "owner@example.com",
        masterPassword: "correct-horse-battery",
      });
    });
  });

  it("surfaces API errors from a failed sign-in", async () => {
    vi.spyOn(api.auth, "status").mockResolvedValue(SIGNED_UP);
    vi.spyOn(api.auth, "login").mockRejectedValue(
      new (await import("../api/client")).ApiError(
        "INVALID_CREDENTIALS",
        "Invalid credentials",
        "t1",
      ),
    );
    renderLogin();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^Email$/i), "owner@example.com");
    await user.type(
      screen.getByLabelText(/^Password$/i),
      "wrong-password-here",
    );
    await user.click(screen.getByRole("button", { name: /Sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Invalid credentials",
      );
    });
  });

  it("lands in the vault after creating the owner account", async () => {
    vi.spyOn(api.auth, "status").mockResolvedValue(FRESH_INSTALL);
    vi.spyOn(api.auth, "bootstrap").mockResolvedValue({
      id: "u1",
      email: "owner@example.com",
      methods: ["password"],
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/login"]}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<p>vault home</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const user = userEvent.setup();
    await user.type(
      await screen.findByLabelText(/^Email$/i),
      "owner@example.com",
    );
    await user.type(
      screen.getByLabelText(/Master password/i),
      "super-secret-pass-123",
    );
    await user.click(
      screen.getByRole("button", { name: /Create owner account/i }),
    );

    await waitFor(() => {
      expect(screen.getByText("vault home")).toBeInTheDocument();
    });
  });

  it("offers self-service sign-up once an account exists", async () => {
    vi.spyOn(api.auth, "status").mockResolvedValue(SIGNED_UP);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/login"]}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<p>sign-up page</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("link", { name: /Create one/i }));

    await waitFor(() => {
      expect(screen.getByText("sign-up page")).toBeInTheDocument();
    });
  });

  it("hides the sign-up link on a fresh install", async () => {
    vi.spyOn(api.auth, "status").mockResolvedValue(FRESH_INSTALL);
    renderLogin();

    await waitFor(() => {
      expect(screen.getByText(/No owner account yet/i)).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("link", { name: /Create one/i }),
    ).not.toBeInTheDocument();
  });

  it("shows the notice left behind by a fresh sign-up", async () => {
    vi.spyOn(api.auth, "status").mockResolvedValue(SIGNED_UP);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter
          initialEntries={[
            {
              pathname: "/login",
              state: {
                notice: "new@example.com created — sign in to open the vault.",
              },
            },
          ]}
        >
          <Routes>
            <Route path="/login" element={<LoginPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        /new@example.com created/i,
      );
    });
  });
});
