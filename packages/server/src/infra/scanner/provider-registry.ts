/** Provider catalogue: value prefixes (authoritative) + env-var / key-name hints. */

export interface ProviderDefinition {
  id: string;
  label: string;
  keyPrefixes: string[];
  envHints?: string[];
  docsUrl?: string;
}

export const PROVIDER_REGISTRY: ProviderDefinition[] = [
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    keyPrefixes: ["sk-ant-", "sk-ant-api03-", "sk-ant-oat01-"],
    envHints: ["ANTHROPIC_API_KEY", "ANTHROPIC_ADMIN_KEY", "CLAUDE_API_KEY"],
    docsUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "openai",
    label: "OpenAI",
    keyPrefixes: ["sk-proj-", "sk-svcacct-", "sess-"],
    envHints: ["OPENAI_API_KEY"],
    docsUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "google-ai",
    label: "Google AI Studio (Gemini)",
    keyPrefixes: ["AIza"],
    envHints: ["GOOGLE_API_KEY", "GEMINI_API_KEY"],
    docsUrl: "https://aistudio.google.com/app/apikey",
  },
  {
    id: "google-oauth",
    label: "Google OAuth credential",
    keyPrefixes: ["1//"],
    envHints: ["GOOGLE_REFRESH_TOKEN", "GOOGLE_ACCESS_TOKEN"],
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    keyPrefixes: ["xai-"],
    envHints: ["XAI_API_KEY", "GROK_API_KEY"],
    docsUrl: "https://console.x.ai",
  },
  {
    id: "byteplus-ark",
    label: "BytePlus ModelArk (Volcano Ark)",
    keyPrefixes: ["ark-"],
    envHints: ["ARK_API_KEY", "VOLC_ARK_API_KEY"],
    docsUrl: "https://console.byteplus.com/ark",
  },
  {
    id: "bailian",
    label: "Alibaba Cloud Bailian / DashScope",
    keyPrefixes: ["sk-"],
    envHints: ["DASHSCOPE_API_KEY", "BAILIAN_TOKEN_PLAN_API_KEY", "BAILIAN_API_KEY", "QWEN_API_KEY"],
  },
  {
    id: "groq",
    label: "Groq",
    keyPrefixes: ["gsk_"],
    envHints: ["GROQ_API_KEY"],
    docsUrl: "https://console.groq.com/keys",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    keyPrefixes: ["sk-or-", "sk-or-v1-"],
    envHints: ["OPENROUTER_API_KEY"],
    docsUrl: "https://openrouter.ai/keys",
  },
  {
    id: "perplexity",
    label: "Perplexity",
    keyPrefixes: ["pplx-"],
    envHints: ["PERPLEXITY_API_KEY"],
  },
  {
    id: "mistral",
    label: "Mistral AI",
    keyPrefixes: [],
    envHints: ["MISTRAL_API_KEY"],
  },
  {
    id: "cohere",
    label: "Cohere",
    keyPrefixes: [],
    envHints: ["COHERE_API_KEY"],
  },
  {
    id: "together",
    label: "Together AI",
    keyPrefixes: ["togai-"],
    envHints: ["TOGETHER_API_KEY"],
  },
  {
    id: "fireworks",
    label: "Fireworks AI",
    keyPrefixes: ["fw_"],
    envHints: ["FIREWORKS_API_KEY"],
  },
  {
    id: "deepinfra",
    label: "DeepInfra",
    keyPrefixes: ["di_"],
    envHints: ["DEEPINFRA_API_KEY"],
  },
  {
    id: "cerebras",
    label: "Cerebras",
    keyPrefixes: ["csk-"],
    envHints: ["CEREBRAS_API_KEY"],
  },
  {
    id: "huggingface",
    label: "Hugging Face",
    keyPrefixes: ["hf_"],
    envHints: ["HUGGINGFACE_API_KEY", "HF_TOKEN", "HUGGINGFACEHUB_API_TOKEN"],
    docsUrl: "https://huggingface.co/settings/tokens",
  },
  {
    id: "github",
    label: "GitHub",
    keyPrefixes: ["ghp_", "gho_", "ghu_", "ghs_", "ghr_", "github_pat_"],
    envHints: ["GH_TOKEN", "GITHUB_TOKEN"],
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
  },
  {
    id: "aws",
    label: "AWS (Bedrock)",
    keyPrefixes: ["AKIA", "ASIA"],
    envHints: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"],
  },
  {
    id: "ollama",
    label: "Ollama Cloud",
    keyPrefixes: ["oll_"],
    envHints: ["OLLAMA_API_KEY"],
  },
  {
    id: "moonshot",
    label: "Moonshot AI (Kimi)",
    keyPrefixes: [],
    envHints: ["MOONSHOT_API_KEY"],
  },
  {
    id: "zhipu",
    label: "Zhipu AI (GLM)",
    keyPrefixes: [],
    envHints: ["ZHIPU_API_KEY", "ZHIPUAI_API_KEY", "GLM_API_KEY"],
  },
  {
    id: "minimax",
    label: "MiniMax",
    keyPrefixes: [],
    envHints: ["MINIMAX_API_KEY"],
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
  },
  {
    id: "cursor",
    label: "Cursor",
    keyPrefixes: ["key_", "cur_"],
    envHints: ["CURSOR_API_KEY"],
  },
  {
    id: "github-copilot",
    label: "GitHub Copilot",
    keyPrefixes: [],
    envHints: ["COPILOT_API_KEY", "COPILOT_TOKEN"],
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    keyPrefixes: [],
    envHints: ["DEEPSEEK_API_KEY"],
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
  .flatMap((definition) => definition.keyPrefixes.map((prefix) => ({ prefix, id: definition.id })))
  .filter((matcher) => matcher.prefix !== "sk-")
  .sort((a, b) => b.prefix.length - a.prefix.length);

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

export interface ClassifyInput {
  value: string;
  keyName: string;
  envVarName?: string;
  providerHint?: string;
  keychainService?: string;
  keychainAccount?: string;
}

/**
 * Classification order (strongest signal first):
 *   1. the value's prefix (authoritative; bare `sk-` is shared by many vendors)
 *   2. env-var / keychain name hints (disambiguates Bailian `sk-` keys)
 *   3. the scan source's provider hint (a weak default for that file)
 *   4. a provider name embedded in the key name
 */
export function classifyProvider(input: ClassifyInput): string {
  for (const matcher of PREFIX_MATCHERS) {
    if (input.value.startsWith(matcher.prefix)) return matcher.id;
  }

  // `sk-` is shared by OpenAI / Bailian / others: let the surrounding name decide.
  if (input.value.startsWith("sk-")) {
    const hintNames = [input.envVarName, input.keyName, input.keychainAccount, input.keychainService].filter(
      (name): name is string => typeof name === "string" && name.length > 0,
    );
    const sourceHint =
      input.providerHint && PROVIDER_BY_ID.has(input.providerHint) ? input.providerHint : null;
    return firstHintMatch(hintNames) ?? sourceHint ?? "openai";
  }

  const hintNames = [input.envVarName, input.keychainAccount, input.keychainService].filter(
    (name): name is string => typeof name === "string" && name.length > 0,
  );
  const hinted = firstHintMatch(hintNames);
  if (hinted) return hinted;

  if (input.providerHint && PROVIDER_BY_ID.has(input.providerHint)) return input.providerHint;

  if (startsWithInsensitive(input.keyName, "anthropic")) return "anthropic";
  if (startsWithInsensitive(input.keyName, "openai")) return "openai";
  if (startsWithInsensitive(input.keyName, "github")) return "github";
  if (startsWithInsensitive(input.keyName, "azure")) return "azure-openai";
  if (startsWithInsensitive(input.keyName, "gemini") || startsWithInsensitive(input.keyName, "google")) {
    return "google-ai";
  }

  return "unknown";
}

function normalizeHint(name: string): string {
  return name.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function startsWithInsensitive(value: string, needle: string): boolean {
  return value.toLowerCase().includes(needle);
}
