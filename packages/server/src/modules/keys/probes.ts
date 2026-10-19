import { PROVIDER_BY_ID } from "../../infra/scanner/provider-registry.js";
import type { VerificationStatus } from "@skp/contracts";

export interface ProbeResult {
  status: VerificationStatus;
  detail: string;
}

const TIMEOUT_MS = 8000;

interface ProbeDefinition {
  url: string;
  headers: (key: string) => Record<string, string>;
}

const PROBES: Record<string, ProbeDefinition> = {
  anthropic: {
    url: "https://api.anthropic.com/v1/models",
    headers: (key) => ({ "x-api-key": key, "anthropic-version": "2023-06-01" }),
  },
  openai: {
    url: "https://api.openai.com/v1/models",
    headers: (key) => ({ authorization: `Bearer ${key}` }),
  },
  "google-ai": {
    url: "https://generativelanguage.googleapis.com/v1beta/models",
    headers: (key) => ({ "x-goog-api-key": key }),
  },
  groq: {
    url: "https://api.groq.com/openai/v1/models",
    headers: (key) => ({ authorization: `Bearer ${key}` }),
  },
  openrouter: {
    url: "https://openrouter.ai/api/v1/models",
    headers: (key) => ({ authorization: `Bearer ${key}` }),
  },
  together: {
    url: "https://api.together.xyz/v1/models",
    headers: (key) => ({ authorization: `Bearer ${key}` }),
  },
  cerebras: {
    url: "https://api.cerebras.ai/v1/models",
    headers: (key) => ({ authorization: `Bearer ${key}` }),
  },
  huggingface: {
    url: "https://huggingface.co/api/whoami-v2",
    headers: (key) => ({ authorization: `Bearer ${key}` }),
  },
  github: {
    url: "https://api.github.com/user",
    headers: (key) => ({
      authorization: `Bearer ${key}`,
      accept: "application/vnd.github+json",
    }),
  },
  perplexity: {
    url: "https://api.perplexity.ai/chat/completions",
    headers: (key) => ({ authorization: `Bearer ${key}` }),
  },
  fireworks: {
    url: "https://api.fireworks.ai/inventory/v1/accounts",
    headers: (key) => ({ authorization: `Bearer ${key}` }),
  },
  "byteplus-ark": {
    url: "https://ark.ap-southeast.bytepluses.com/api/v3/models",
    headers: (key) => ({ authorization: `Bearer ${key}` }),
  },
  bailian: {
    url: "https://dashscope.aliyuncs.com/compatible-mode/v1/models",
    headers: (key) => ({ authorization: `Bearer ${key}` }),
  },
  xai: {
    url: "https://api.x.ai/v1/models",
    headers: (key) => ({ authorization: `Bearer ${key}` }),
  },
  ollama: {
    url: "https://ollama.com/api/tags",
    headers: (key) => ({ authorization: `Bearer ${key}` }),
  },
};

export async function probeProvider(
  provider: string,
  value: string,
): Promise<ProbeResult> {
  const probe = PROBES[provider];
  if (!probe) {
    return {
      status: "error",
      detail: `No safe verification endpoint for provider "${provider}"`,
    };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(probe.url, {
      method: "GET",
      headers: { ...probe.headers(value), accept: "application/json" },
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403) {
      return {
        status: "invalid",
        detail: `provider rejected the key (HTTP ${response.status})`,
      };
    }
    if (response.status === 429) {
      return { status: "error", detail: "provider is rate limiting this key" };
    }
    if (response.ok || response.status === 404) {
      const label = PROVIDER_BY_ID.get(provider)?.label ?? provider;
      return {
        status: "valid",
        detail: `accepted by ${label} (HTTP ${response.status})`,
      };
    }
    return {
      status: "error",
      detail: `unexpected provider response (HTTP ${response.status})`,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.name : "unknown";
    return { status: "error", detail: `network error: ${reason}` };
  } finally {
    clearTimeout(timer);
  }
}

export function supportsProbe(provider: string): boolean {
  return provider in PROBES;
}
