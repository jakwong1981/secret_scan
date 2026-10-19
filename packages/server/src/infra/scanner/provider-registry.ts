/**
 * Provider catalogue: value prefixes (authoritative) + env-var / key-name hints.
 *
 * `nameHints` covers the real-world shapes of this Mac's agent tooling: the
 * key name or its JSON pointer usually embeds the vendor or the CLI that owns
 * it (`.pi/agent/auth.json` → `kimi-coding.access`, `~/.arkcli-bp/.env` →
 * `VOLCENGINE_STS_ACCESS_KEY`), which no exact env-var hint can express.
 */

export interface ProviderDefinition {
  id: string;
  label: string;
  keyPrefixes: string[];
  envHints?: string[];
  /** Vendor / tool tokens matched as substrings of a normalized name. */
  nameHints?: string[];
  docsUrl?: string;
}

export const PROVIDER_REGISTRY: ProviderDefinition[] = [
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    keyPrefixes: ["sk-ant-", "sk-ant-api03-", "sk-ant-oat01-"],
    envHints: [
      "ANTHROPIC_API_KEY",
      "ANTHROPIC_ADMIN_KEY",
      "ANTHROPIC_AUTH_TOKEN",
      "CLAUDE_API_KEY",
    ],
    nameHints: ["ANTHROPIC", "CLAUDE"],
    docsUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "openai",
    label: "OpenAI",
    keyPrefixes: ["sk-proj-", "sk-svcacct-", "sess-"],
    envHints: ["OPENAI_API_KEY"],
    nameHints: ["OPENAI", "CODEX"],
    docsUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "google-ai",
    label: "Google AI Studio (Gemini)",
    keyPrefixes: ["AIza"],
    envHints: ["GOOGLE_API_KEY", "GEMINI_API_KEY"],
    nameHints: ["GEMINI", "GOOGLE_API", "AISTUDIO", "GOOGLE"],
    docsUrl: "https://aistudio.google.com/app/apikey",
  },
  {
    id: "google-oauth",
    label: "Google OAuth credential",
    keyPrefixes: ["1//"],
    envHints: ["GOOGLE_REFRESH_TOKEN", "GOOGLE_ACCESS_TOKEN"],
    nameHints: ["GOOGLE_OAUTH", "GOOGLE_REFRESH", "GOOGLE_ACCESS", "GOOGLE_ID"],
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    keyPrefixes: ["xai-"],
    envHints: ["XAI_API_KEY", "GROK_API_KEY"],
    nameHints: ["GROK", "XAI"],
    docsUrl: "https://console.x.ai",
  },
  {
    id: "byteplus-ark",
    label: "BytePlus ModelArk (Volcano Ark)",
    keyPrefixes: ["ark-"],
    envHints: [
      "ARK_API_KEY",
      "VOLC_ARK_API_KEY",
      "ARKCLI_API_KEY",
      "BYTEPLUS_API_KEY",
    ],
    nameHints: ["ARKCLI", "VOLCENGINE", "BYTEPLUS", "MODELARK", "ARK_API"],
    docsUrl: "https://console.byteplus.com/ark",
  },
  {
    id: "qwen",
    label: "Qwen Code / DashScope (Alibaba)",
    keyPrefixes: [],
    envHints: [
      "DASHSCOPE_API_KEY",
      "QWEN_API_KEY",
      "QWEN_OAUTH_TOKEN",
      "QWEN_CODE_API_KEY",
      "QWEN_TOKEN_PLAN_API_KEY",
    ],
    nameHints: ["QWEN", "DASHSCOPE", "ALIBABA"],
    docsUrl: "https://bailian.console.aliyun.com",
  },
  {
    id: "bailian",
    label: "Alibaba Cloud Bailian (Token Plan)",
    keyPrefixes: [],
    envHints: ["BAILIAN_TOKEN_PLAN_API_KEY", "BAILIAN_API_KEY"],
    nameHints: ["BAILIAN"],
  },
  {
    id: "groq",
    label: "Groq",
    keyPrefixes: ["gsk_"],
    envHints: ["GROQ_API_KEY"],
    nameHints: ["GROQ"],
    docsUrl: "https://console.groq.com/keys",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    keyPrefixes: ["sk-or-", "sk-or-v1-"],
    envHints: ["OPENROUTER_API_KEY"],
    nameHints: ["OPENROUTER"],
    docsUrl: "https://openrouter.ai/keys",
  },
  {
    id: "perplexity",
    label: "Perplexity",
    keyPrefixes: ["pplx-"],
    envHints: ["PERPLEXITY_API_KEY"],
    nameHints: ["PERPLEXITY"],
  },
  {
    id: "mistral",
    label: "Mistral AI",
    keyPrefixes: [],
    envHints: ["MISTRAL_API_KEY"],
    nameHints: ["MISTRAL"],
  },
  {
    id: "cohere",
    label: "Cohere",
    keyPrefixes: [],
    envHints: ["COHERE_API_KEY"],
    nameHints: ["COHERE"],
  },
  {
    id: "together",
    label: "Together AI",
    keyPrefixes: ["togai-"],
    envHints: ["TOGETHER_API_KEY"],
    nameHints: ["TOGETHER"],
  },
  {
    id: "fireworks",
    label: "Fireworks AI",
    keyPrefixes: ["fw_"],
    envHints: ["FIREWORKS_API_KEY"],
    nameHints: ["FIREWORKS"],
  },
  {
    id: "deepinfra",
    label: "DeepInfra",
    keyPrefixes: ["di_"],
    envHints: ["DEEPINFRA_API_KEY"],
    nameHints: ["DEEPINFRA"],
  },
  {
    id: "cerebras",
    label: "Cerebras",
    keyPrefixes: ["csk-"],
    envHints: ["CEREBRAS_API_KEY"],
    nameHints: ["CEREBRAS"],
  },
  {
    id: "huggingface",
    label: "Hugging Face",
    keyPrefixes: ["hf_"],
    envHints: ["HUGGINGFACE_API_KEY", "HF_TOKEN", "HUGGINGFACEHUB_API_TOKEN"],
    nameHints: ["HUGGINGFACE"],
    docsUrl: "https://huggingface.co/settings/tokens",
  },
  {
    id: "github",
    label: "GitHub",
    keyPrefixes: ["ghp_", "gho_", "ghu_", "ghs_", "ghr_", "github_pat_"],
    envHints: ["GH_TOKEN", "GITHUB_TOKEN"],
    nameHints: ["GITHUB"],
  },
  {
    id: "github-copilot",
    label: "GitHub Copilot",
    keyPrefixes: [],
    envHints: ["COPILOT_API_KEY", "COPILOT_TOKEN", "GITHUB_COPILOT_TOKEN"],
    nameHints: ["GITHUB_COPILOT", "COPILOT"],
  },
  {
    id: "npm",
    label: "npm registry",
    keyPrefixes: ["npm_"],
    envHints: ["NPM_TOKEN", "NPM_CONFIG_TOKEN"],
  },
  {
    id: "pypi",
    label: "PyPI",
    keyPrefixes: ["pypi-"],
    envHints: ["PYPI_TOKEN", "UV_PUBLISH_TOKEN"],
  },
  {
    id: "azure-openai",
    label: "Azure OpenAI",
    keyPrefixes: [],
    envHints: ["AZURE_OPENAI_API_KEY", "AZURE_API_KEY"],
    nameHints: ["AZURE"],
  },
  {
    id: "aws",
    label: "AWS (Bedrock)",
    keyPrefixes: ["AKIA", "ASIA"],
    envHints: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"],
    nameHints: ["AWS", "BEDROCK"],
  },
  {
    id: "ollama",
    label: "Ollama Cloud",
    keyPrefixes: ["oll_"],
    envHints: ["OLLAMA_API_KEY"],
    nameHints: ["OLLAMA"],
  },
  {
    id: "moonshot",
    label: "Moonshot Kimi (Kimi Code / Kimi CLI)",
    keyPrefixes: [],
    envHints: ["MOONSHOT_API_KEY", "KIMI_API_KEY", "KIMI_CODING_API_KEY"],
    nameHints: ["KIMI", "MOONSHOT"],
  },
  {
    id: "zhipu",
    label: "Zhipu AI (GLM)",
    keyPrefixes: [],
    envHints: ["ZHIPU_API_KEY", "ZHIPUAI_API_KEY", "GLM_API_KEY"],
    nameHints: ["ZHIPU", "GLM", "CHATGLM"],
  },
  {
    id: "minimax",
    label: "MiniMax",
    keyPrefixes: [],
    envHints: ["MINIMAX_API_KEY"],
    nameHints: ["MINIMAX"],
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    keyPrefixes: [],
    envHints: ["DEEPSEEK_API_KEY"],
    nameHints: ["DEEPSEEK"],
  },
  {
    id: "siliconflow",
    label: "SiliconFlow",
    keyPrefixes: [],
    envHints: ["SILICONFLOW_API_KEY", "SILICONFLOW_TOKEN"],
  },
  {
    id: "novita",
    label: "Novita AI",
    keyPrefixes: [],
    envHints: ["NOVITA_API_KEY"],
  },
  {
    id: "opencode",
    label: "OpenCode Zen",
    keyPrefixes: [],
    envHints: ["OPENCODE_API_KEY"],
    nameHints: ["OPENCODE"],
  },
  {
    id: "cursor",
    label: "Cursor",
    keyPrefixes: ["key_", "cur_"],
    envHints: ["CURSOR_API_KEY"],
    nameHints: ["CURSOR"],
  },
  {
    id: "unknown",
    label: "Unknown / unclassified",
    keyPrefixes: [],
    envHints: [],
  },
];

export const PROVIDER_BY_ID: ReadonlyMap<string, ProviderDefinition> = new Map(
  PROVIDER_REGISTRY.map((definition) => [definition.id, definition]),
);

/**
 * Longest-prefix-first ordering so `sk-ant-` beats `sk-proj-`. The bare `sk-`
 * prefix is intentionally excluded: it is shared by OpenAI, Bailian and others,
 * so it is resolved by hint (see `classifyProvider`).
 */
const PREFIX_MATCHERS = [...PROVIDER_REGISTRY]
  .filter((definition) => definition.keyPrefixes.length > 0)
  .flatMap((definition) =>
    definition.keyPrefixes.map((prefix) => ({ prefix, id: definition.id })),
  )
  .filter((matcher) => matcher.prefix !== "sk-")
  .sort((a, b) => b.prefix.length - a.prefix.length);

/**
 * Longest-needle-first so `GITHUB_COPILOT` beats `GITHUB` and `GOOGLE_OAUTH`
 * beats `GOOGLE` when a name mentions both.
 */
const NAME_HINT_MATCHERS = [...PROVIDER_REGISTRY]
  .filter((definition) => definition.id !== "unknown")
  .flatMap((definition) =>
    (definition.nameHints ?? []).map((needle) => ({
      needle: normalizeHint(needle),
      id: definition.id,
    })),
  )
  .sort((a, b) => b.needle.length - a.needle.length);

function firstHintMatch(names: string[]): string | null {
  for (const definition of PROVIDER_REGISTRY) {
    if (definition.id === "unknown") continue;
    for (const hint of definition.envHints ?? []) {
      if (names.some((name) => normalizeHint(name) === normalizeHint(hint))) {
        return definition.id;
      }
    }
  }
  return null;
}

function firstNameHintMatch(names: string[]): string | null {
  for (const matcher of NAME_HINT_MATCHERS) {
    if (names.some((name) => normalizeHint(name).includes(matcher.needle))) {
      return matcher.id;
    }
  }
  return null;
}

export interface ClassifyInput {
  value: string;
  keyName: string;
  envVarName?: string;
  providerHint?: string;
  keychainService?: string;
  keychainAccount?: string;
  /** Sibling fields naming the owner of the value (`provider: deepseek`). */
  context?: string[];
}

/**
 * How a classification was reached, strongest first. The same secret often
 * lives in several tool configs; the strongest evidence across all of them
 * names the provider (see `preferProvider`).
 */
export type Evidence =
  | "prefix"
  | "name"
  | "context"
  | "source-hint"
  | "env-hint"
  | "key-name"
  | "default";

const EVIDENCE_RANK: Record<Evidence, number> = {
  prefix: 0,
  name: 1,
  context: 2,
  "source-hint": 3,
  "env-hint": 4,
  "key-name": 5,
  default: 6,
};

export interface Classification {
  provider: string;
  evidence: Evidence;
}

/**
 * Keeps the stronger of two classifications for one secret. A bare `sk-`
 * value that no file named specifically defaults to `openai`; once another
 * home names its vendor, that vendor wins.
 */
export function preferProvider(
  existing: Classification | undefined,
  incoming: Classification,
): Classification {
  if (!existing) return incoming;
  if (existing.provider === incoming.provider) return existing;
  return EVIDENCE_RANK[incoming.evidence] < EVIDENCE_RANK[existing.evidence]
    ? incoming
    : existing;
}

const EVIDENCE_LABELS = new Set<string>(Object.keys(EVIDENCE_RANK));

/**
 * Narrows a persisted evidence label to a rank. `null` for labels this build
 * does not know (or a value written by an older one), which the caller must
 * treat as "no stored evidence" rather than the weakest rank.
 */
export function asEvidence(raw: string | null | undefined): Evidence | null {
  if (raw === null || raw === undefined || !EVIDENCE_LABELS.has(raw)) {
    return null;
  }
  return raw as Evidence;
}

/**
 * Classification order (strongest signal first):
 *   1. the value's prefix (authoritative; bare `sk-` is shared by many vendors)
 *   2. a vendor or CLI token in the key name / JSON pointer
 *      (`kimi-coding.access`, `VOLCENGINE_STS_ACCESS_KEY`)
 *   3. a sibling field naming the owner (`provider: deepseek`)
 *   4. the scan source's provider hint (the vendor that file belongs to)
 *   5. an exact env-var / keychain hint (`DASHSCOPE_API_KEY`) — every CLI
 *      writes `OPENAI_API_KEY` for any OpenAI-compatible key, so a generic
 *      name is weaker evidence than a file that belongs to one vendor
 *   6. a provider name embedded in the key name
 *   7. `unknown`
 */
export function classifyProviderDetailed(input: ClassifyInput): Classification {
  for (const matcher of PREFIX_MATCHERS) {
    if (input.value.startsWith(matcher.prefix)) {
      return { provider: matcher.id, evidence: "prefix" };
    }
  }

  const named = (): string[] =>
    [
      input.envVarName,
      input.keyName,
      input.keychainAccount,
      input.keychainService,
    ].filter(
      (name): name is string => typeof name === "string" && name.length > 0,
    );

  const vendorNamed = firstNameHintMatch(named());
  if (vendorNamed) return { provider: vendorNamed, evidence: "name" };

  const contextNamed = firstNameHintMatch(input.context ?? []);
  if (contextNamed) return { provider: contextNamed, evidence: "context" };

  const hint = sourceHint(input);
  if (hint) return { provider: hint, evidence: "source-hint" };

  const hinted = firstHintMatch(named());
  if (hinted) return { provider: hinted, evidence: "env-hint" };

  if (startsWithInsensitive(input.keyName, "anthropic"))
    return { provider: "anthropic", evidence: "key-name" };
  if (startsWithInsensitive(input.keyName, "openai"))
    return { provider: "openai", evidence: "key-name" };
  if (startsWithInsensitive(input.keyName, "github"))
    return { provider: "github", evidence: "key-name" };
  if (startsWithInsensitive(input.keyName, "azure"))
    return { provider: "azure-openai", evidence: "key-name" };
  if (
    startsWithInsensitive(input.keyName, "gemini") ||
    startsWithInsensitive(input.keyName, "google")
  ) {
    return { provider: "google-ai", evidence: "key-name" };
  }

  if (input.value.startsWith("sk-")) {
    return { provider: "openai", evidence: "default" };
  }
  return { provider: "unknown", evidence: "default" };
}

export function classifyProvider(input: ClassifyInput): string {
  return classifyProviderDetailed(input).provider;
}

function sourceHint(input: ClassifyInput): string | null {
  return input.providerHint && PROVIDER_BY_ID.has(input.providerHint)
    ? input.providerHint
    : null;
}

function normalizeHint(name: string): string {
  return name.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function startsWithInsensitive(value: string, needle: string): boolean {
  return value.toLowerCase().includes(needle);
}
