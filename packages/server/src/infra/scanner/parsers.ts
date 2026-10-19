import { execFileSync } from "node:child_process";
import { parse as parseYaml } from "yaml";
import { parse as parseToml } from "smol-toml";
import type { ParsedEntry, ParserId } from "./types.js";

const SENSITIVE_KEY_NAME =
  /(api[-_ ]?key|apikey|access[-_ ]?key|secret|token|password|passwd|credential|refresh[-_ ]?token|id[-_ ]?token|auth)/i;
/** Standalone credential leaves: `key`, `access`, `refresh` (as in `~/.pi/agent/auth.json`). */
const CREDENTIAL_LEAF =
  /(?:^|[^a-z0-9])(?:key|access|refresh|credential)(?:$|[^a-z0-9])/i;
const PLACEHOLDER =
  /^(\.\.\.|x{3,}|changeme|change[_-]?me|your[-_ ].*|<.*>|null|undefined|true|false|)$/i;
const MAX_DEPTH = 8;
const MIN_LENGTH = 8;
/** Another variable's name, not a secret: `DASHSCOPE_API_KEY`. */
const ENV_VAR_NAME = /^[A-Z][A-Z0-9_]*$/;
/** Dotted lowercase identifier: `video.upload`, `image.describe`. */
const DOTTED_IDENTIFIER = /^[a-z][a-z0-9]*(?:\.[a-z0-9_-]+)+$/;
/** A path reference, not a secret: `oauth/kimi-code-env-0e4f99…`. */
const PATH_LIKE = /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+$/;
const DIGITS_ONLY = /^\d+$/;

function usableValue(value: string): boolean {
  if (value.length < MIN_LENGTH) return false;
  if (/\s/.test(value)) return false;
  if (PLACEHOLDER.test(value.trim())) return false;
  // URLs, `plugin:figma` notices, `trn:service:…` ids and timestamps are not
  // credentials, however credential-shaped their key name looks.
  if (value.includes(":")) return false;
  if (ENV_VAR_NAME.test(value)) return false;
  if (DOTTED_IDENTIFIER.test(value)) return false;
  if (PATH_LIKE.test(value)) return false;
  if (DIGITS_ONLY.test(value)) return false;
  return true;
}

function looksSensitive(keyName: string): boolean {
  return SENSITIVE_KEY_NAME.test(keyName) || CREDENTIAL_LEAF.test(keyName);
}

/**
 * Sibling keys that name the owner of a value. `~/.continue/config.yaml`
 * stores its credentials as `{ name: "DeepSeek Coder", provider: "deepseek",
 * apiKey: … }`, so the pointer alone (`models[0].apiKey`) carries no vendor.
 */
const CONTEXT_KEY_NAME =
  /^(provider|providerName|provider_name|vendor|name|label|service|apiName|api_name)$/i;
const MAX_CONTEXT = 8;

function contextOf(entries: Array<[string, unknown]>): string[] {
  const context: string[] = [];
  for (const [childKey, childValue] of entries) {
    if (context.length >= MAX_CONTEXT) break;
    if (typeof childValue !== "string" || childValue.length > 80) continue;
    if (!CONTEXT_KEY_NAME.test(childKey)) continue;
    if (context.includes(childValue)) continue;
    context.push(childValue);
  }
  return context;
}

function flatten(
  value: unknown,
  pointer: string,
  keyName: string,
  depth: number,
  out: ParsedEntry[],
  context: string[],
): void {
  if (depth > MAX_DEPTH) return;
  if (value === null || value === undefined) return;
  if (typeof value === "string") {
    if (!looksSensitive(keyName) || !usableValue(value)) return;
    out.push({ pointer, keyName, value, context });
    return;
  }
  if (typeof value === "number" || typeof value === "boolean") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      flatten(item, `${pointer}[${index}]`, keyName, depth + 1, out, context),
    );
    return;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    const childContext = contextOf(entries);
    for (const [childKey, childValue] of entries) {
      const childPointer = pointer === "" ? childKey : `${pointer}.${childKey}`;
      flatten(
        childValue,
        childPointer,
        childKey,
        depth + 1,
        out,
        childContext.length > 0 ? childContext : context,
      );
    }
  }
}

export function flattenDocument(document: unknown): ParsedEntry[] {
  const out: ParsedEntry[] = [];
  flatten(document, "", "", 0, out, []);
  return out;
}

function stripJsonComments(text: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  let index = 0;
  while (index < text.length) {
    const char = text[index] as string;
    if (inString) {
      out += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      index += 1;
      continue;
    }
    if (char === '"') {
      inString = true;
      out += char;
      index += 1;
      continue;
    }
    if (char === "/" && text[index + 1] === "/") {
      while (index < text.length && text[index] !== "\n") index += 1;
      continue;
    }
    if (char === "/" && text[index + 1] === "*") {
      index += 2;
      while (
        index < text.length &&
        !(text[index] === "*" && text[index + 1] === "/")
      )
        index += 1;
      index += 2;
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
}

function stripTrailingCommas(text: string): string {
  return text.replace(/,(\s*[}\]])/g, "$1");
}

export function parseJsonText(text: string): ParsedEntry[] {
  try {
    const parsed: unknown = JSON.parse(
      stripTrailingCommas(stripJsonComments(text)),
    );
    return flattenDocument(parsed);
  } catch {
    return [];
  }
}

export function parseYamlText(text: string): ParsedEntry[] {
  try {
    return flattenDocument(parseYaml(text) as unknown);
  } catch {
    return [];
  }
}

export function parseTomlText(text: string): ParsedEntry[] {
  try {
    return flattenDocument(parseToml(text) as unknown);
  } catch {
    return [];
  }
}

export function parseDotenvText(text: string): ParsedEntry[] {
  const entries: ParsedEntry[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const withoutExport = line.startsWith("export ")
      ? line.slice(7).trim()
      : line;
    const separator = withoutExport.indexOf("=");
    if (separator <= 0) continue;
    const keyName = withoutExport.slice(0, separator).trim();
    let value = withoutExport.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    if (!looksSensitive(keyName) || !usableValue(value)) continue;
    entries.push({ pointer: keyName, keyName, value });
  }
  return entries;
}

const RAW_PATTERNS: Array<{ id: string; pattern: RegExp }> = [
  { id: "anthropic", pattern: /sk-ant-[A-Za-z0-9_-]{20,}/g },
  { id: "openai", pattern: /sk-(?:proj|svcacct)-[A-Za-z0-9_-]{20,}/g },
  { id: "google-ai", pattern: /AIza[A-Za-z0-9_-]{10,}/g },
  { id: "xai", pattern: /xai-[A-Za-z0-9_-]{20,}/g },
  { id: "byteplus-ark", pattern: /ark-[A-Za-z0-9_-]{20,}/g },
  { id: "groq", pattern: /gsk_[A-Za-z0-9]{20,}/g },
  { id: "openrouter", pattern: /sk-or-[A-Za-z0-9_-]{20,}/g },
  { id: "perplexity", pattern: /pplx-[A-Za-z0-9]{20,}/g },
  { id: "fireworks", pattern: /fw_[A-Za-z0-9]{20,}/g },
  { id: "cerebras", pattern: /csk-[A-Za-z0-9]{20,}/g },
  { id: "huggingface", pattern: /hf_[A-Za-z0-9]{20,}/g },
  { id: "github", pattern: /gh[pousr]_[A-Za-z0-9]{20,}/g },
  { id: "github", pattern: /github_pat_[A-Za-z0-9_]{20,}/g },
  { id: "npm", pattern: /npm_[A-Za-z0-9]{20,}/g },
  { id: "aws", pattern: /(?:AKIA|ASIA)[A-Z0-9]{12,}/g },
  { id: "ollama", pattern: /oll_[A-Za-z0-9]{20,}/g },
  {
    id: "generic",
    pattern:
      /["']?[A-Za-z0-9_]*(?:api[_-]?key|token|secret)["']?\s*[:=]\s*["']?([A-Za-z0-9_-]{24,})["']?/gi,
  },
];

export function parseRawText(text: string): ParsedEntry[] {
  const entries: ParsedEntry[] = [];
  const genericKeys = ["api_key", "api-key", "token", "secret"];
  for (const matcher of RAW_PATTERNS) {
    const pattern = new RegExp(matcher.pattern.source, matcher.pattern.flags);
    let match: RegExpExecArray | null = pattern.exec(text);
    while (match !== null) {
      const value =
        matcher.id === "generic" ? (match[1] ?? "") : (match[0] ?? "");
      if (
        usableValue(value) &&
        !entries.some((existing) => existing.value === value)
      ) {
        const keyName =
          matcher.id === "generic"
            ? (match[0] ?? "generic").slice(0, 40)
            : (genericKeys[entries.length % genericKeys.length] ?? "key");
        entries.push({ pointer: `raw:${matcher.id}`, keyName, value });
      }
      match = pattern.exec(text);
    }
  }
  // A whole file that is one bare token (`~/.qwen/token`, DeepSeek's token file).
  if (entries.length === 0) {
    const bare = text.trim();
    if (usableValue(bare)) {
      entries.push({ pointer: "raw:token", keyName: "token", value: bare });
    }
  }
  return entries;
}

export interface KeychainItem {
  service: string;
  account: string;
}

/** Metadata-only enumeration (never reads secret bytes). Returns [] off macOS. */
export function readKeychainMetadata(): KeychainItem[] {
  if (process.platform !== "darwin") return [];
  let output: string;
  try {
    output = execFileSync("security", ["dump-keychain"], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return [];
  }
  const items: KeychainItem[] = [];
  const seen = new Set<string>();
  for (const block of output.split(/class: "genp"/)) {
    const service = /"svce"<blob>=?"([^"]*)"/.exec(block)?.[1];
    const account = /"acct"<blob>=?"([^"]*)"/.exec(block)?.[1];
    if (!service) continue;
    const key = `${service}::${account ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ service, account: account ?? "" });
  }
  return items;
}

export function parseWithParser(text: string, parser: ParserId): ParsedEntry[] {
  switch (parser) {
    case "json":
      return parseJsonText(text);
    case "yaml":
      return parseYamlText(text);
    case "toml":
      return parseTomlText(text);
    case "dotenv":
      return parseDotenvText(text);
    case "raw":
      return parseRawText(text);
    case "keychain":
      return [];
  }
}
