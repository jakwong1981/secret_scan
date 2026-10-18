import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { LoginPage } from "../features/LoginPage";
import { api } from "../api/client";
import type { AuthStatus } from "@skp/contracts";

function renderLogin(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
};

const FRESH_INSTALL: AuthStatus = {
  needsBootstrap: true,
  passwordConfigured: false,
  googleConfigured: true,
  googleAllowedEmails: [],
};

describe("LoginPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the bootstrap form on a fresh install", async () => {
    vi.spyOn(api.auth, "status").mockResolvedValue(FRESH_INSTALL);
    renderLogin();
    await waitFor(() => {
      expect(screen.getByText(/No owner account yet/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Create owner account/i })).toBeInTheDocument();
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
    await user.type(screen.getByLabelText(/Owner email/i), "owner@example.com");
    await user.type(screen.getByLabelText(/Master password/i), "correct-horse-battery");
    await user.click(screen.getByRole("button", { name: /Sign in/i }));

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith({ email: "owner@example.com", masterPassword: "correct-horse-battery" });
    });
  });

  it("surfaces API errors from a failed sign-in", async () => {
    vi.spyOn(api.auth, "status").mockResolvedValue(SIGNED_UP);
    vi.spyOn(api.auth, "login").mockRejectedValue(
      new (await import("../api/client")).ApiError("INVALID_CREDENTIALS", "Invalid credentials", "t1"),
    );
    renderLogin();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/Owner email/i), "owner@example.com");
    await user.type(screen.getByLabelText(/Master password/i), "wrong-password-here");
    await user.click(screen.getByRole("button", { name: /Sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Invalid credentials");
    });
  });
});
