import type {
  AuditList,
  AuthStatus,
  AuthUserView,
  BootstrapRequest,
  GoogleStartResponse,
  KeyDetail,
  KeyList,
  LoginRequest,
  RevealKeyResponse,
  ScanProgressEvent,
  ScanRun,
  SessionUser,
  Settings,
  Source,
  UpdateKeyInput,
  UpdateSettingsInput,
  VerifyKeyResponse,
} from "@skp/contracts";

const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ?? "https://127.0.0.1:4173";
const BASE = `${API_ORIGIN}/api/v1`;

export class ApiError extends Error {
  readonly code: string;
  readonly traceId: string;

  constructor(code: string, message: string, traceId: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.traceId = traceId;
  }
}

interface Envelope<T> {
  code: string;
  message?: string;
  data: T;
  timestamp: string;
  traceId: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: {
      accept: "application/json",
      ...(init?.body ? { "content-type": "application/json" } : {}),
    },
    ...init,
  });

  const text = await response.text();
  const body: unknown = text === "" ? null : JSON.parse(text);

  if (!response.ok) {
    const envelope = body as Partial<Envelope<unknown>> | null;
    throw new ApiError(
      envelope?.code ?? "HTTP_ERROR",
      envelope?.message ?? `Request failed with status ${response.status}`,
      envelope?.traceId ?? "unknown",
    );
  }
  return (body as Envelope<T>).data;
}

export interface KeyQuery {
  provider?: string;
  status?: string;
  sourceKind?: string;
  search?: string;
  sort?: "date_added" | "provider" | "last_seen";
  limit?: number;
  offset?: number;
}

function queryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const serialized = search.toString();
  return serialized === "" ? "" : `?${serialized}`;
}

export const api = {
  auth: {
    status: () => request<AuthStatus>("/auth/status"),
    bootstrap: (payload: BootstrapRequest) =>
      request<AuthUserView>("/auth/bootstrap", { method: "POST", body: JSON.stringify(payload) }),
    login: (payload: LoginRequest) =>
      request<AuthUserView>("/auth/login", { method: "POST", body: JSON.stringify(payload) }),
    logout: () => request<{ revoked: true }>("/auth/logout", { method: "POST" }),
    me: () => request<SessionUser>("/auth/me"),
    googleStart: () => request<GoogleStartResponse>("/auth/google/start", { method: "POST" }),
    verifyPassword: (masterPassword: string) =>
      request<{ sensitiveScopeUntil: string }>("/auth/verify-password", {
        method: "POST",
        body: JSON.stringify({ masterPassword }),
      }),
    changePassword: (currentPassword: string, newPassword: string) =>
      request<{ changed: true }>("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      }),
  },

  keys: {
    list: (params: KeyQuery = {}) =>
      request<KeyList>(`/keys${queryString({ provider: params.provider, status: params.status, sourceKind: params.sourceKind, search: params.search, sort: params.sort, limit: params.limit, offset: params.offset })}`),
    detail: (id: string) => request<KeyDetail>(`/keys/${id}`),
    reveal: (id: string) => request<RevealKeyResponse>(`/keys/${id}/reveal`, { method: "POST" }),
    verify: (id: string) => request<VerifyKeyResponse>(`/keys/${id}/verify`, { method: "POST" }),
    update: (id: string, payload: UpdateKeyInput) =>
      request<{ updated: true }>(`/keys/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
    remove: (id: string) => request<{ deleted: true }>(`/keys/${id}`, { method: "DELETE" }),
  },

  scans: {
    list: () => request<{ items: ScanRun[]; total: number; totalKeys: number }>("/scans"),
    trigger: () => request<{ run: ScanRun; outcome: { runId: string; status: string; counts: Record<string, number> } }>("/scans", { method: "POST" }),
    get: (id: string) => request<ScanRun>(`/scans/${id}`),
    cancel: (id: string) => request<{ canceled: boolean }>(`/scans/${id}/cancel`, { method: "POST" }),
    events: (id: string, onEvent: (event: ScanProgressEvent) => void, onDone?: () => void): (() => void) => {
      const source = new EventSource(`${BASE}/scans/${id}/events`, { withCredentials: true });
      source.onmessage = (message) => {
        try {
          onEvent(JSON.parse(message.data) as ScanProgressEvent);
        } catch {
          // ignore malformed keep-alive frames
        }
      };
      source.addEventListener("end", () => {
        source.close();
        onDone?.();
      });
      source.onerror = () => {
        source.close();
        onDone?.();
      };
      return () => source.close();
    },
  },

  sources: {
    list: () => request<{ items: Source[] }>("/sources"),
  },

  settings: {
    get: () =>
      request<
        Settings & {
          googleConfigured: boolean;
          publicOrigin: string;
          scanRoot: string;
        }
      >("/settings"),
    update: (payload: UpdateSettingsInput) =>
      request<
        Settings & {
          googleConfigured: boolean;
          publicOrigin: string;
          scanRoot: string;
        }
      >("/settings", { method: "PUT", body: JSON.stringify(payload) }),
  },

  audit: {
    list: (limit = 50, offset = 0) => request<AuditList>(`/audit${queryString({ limit, offset })}`),
  },
};

export type { AuthUserView, SessionUser };
