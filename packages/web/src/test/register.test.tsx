import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { RegisterPage } from "../features/RegisterPage";
import { api, ApiError } from "../api/client";
import { useSessionStore } from "../stores/session.store";
import type { AuthStatus } from "@skp/contracts";

const SIGNED_UP: AuthStatus = {
  needsBootstrap: false,
  passwordConfigured: true,
  googleConfigured: false,
  googleAllowedEmails: [],
  passwordMinLength: 12,
};

function renderRegister(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/register"]}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/login" element={<p>sign in page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function fillSignup(
  user: ReturnType<typeof userEvent.setup>,
): Promise<void> {
  await user.type(screen.getByLabelText(/^Email$/i), "new@example.com");
  await user.type(screen.getByLabelText(/^Password/i), "member-password-1");
  await user.type(
    screen.getByLabelText(/Confirm password/i),
    "member-password-1",
  );
}

describe("RegisterPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useSessionStore.getState().reset();
    vi.spyOn(api.auth, "status").mockResolvedValue(SIGNED_UP);
  });

  it("shows the configured minimum password length", async () => {
    renderRegister();
    await waitFor(() => {
      expect(screen.getByText(/Minimum 12 characters/i)).toBeInTheDocument();
    });
  });

  it("creates the account and returns to the sign-in page", async () => {
    const register = vi.spyOn(api.auth, "register").mockResolvedValue({
      id: "u3",
      email: "new@example.com",
      methods: ["password"],
    });

    renderRegister();
    const user = userEvent.setup();
    await fillSignup(user);
    await user.click(screen.getByRole("button", { name: /Create account/i }));

    await waitFor(() => {
      expect(register).toHaveBeenCalledWith({
        email: "new@example.com",
        masterPassword: "member-password-1",
        confirmPassword: "member-password-1",
      });
    });
    await waitFor(() => {
      expect(screen.getByText("sign in page")).toBeInTheDocument();
    });
  });

  it("surfaces a duplicate email conflict", async () => {
    vi.spyOn(api.auth, "register").mockRejectedValue(
      new ApiError("EMAIL_TAKEN", "Email already registered", "t1"),
    );

    renderRegister();
    const user = userEvent.setup();
    await fillSignup(user);
    await user.click(screen.getByRole("button", { name: /Create account/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "That email is already registered",
      );
    });
  });

  it("blocks a mismatched confirmation", async () => {
    const register = vi.spyOn(api.auth, "register");

    renderRegister();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^Email$/i), "new@example.com");
    await user.type(screen.getByLabelText(/^Password/i), "member-password-1");
    await user.type(
      screen.getByLabelText(/Confirm password/i),
      "a-different-password",
    );

    expect(
      screen.getByRole("button", { name: /Create account/i }),
    ).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /Create account/i }));
    expect(register).not.toHaveBeenCalled();
  });

  it("keeps the page public — no session is required", () => {
    renderRegister();
    expect(
      screen.queryByLabelText(/Your master password/i),
    ).not.toBeInTheDocument();
  });
});
