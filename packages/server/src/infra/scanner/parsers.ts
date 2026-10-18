import { execFileSync } from "node:child_process";
import { parse as parseYaml } from "yaml";
import { parse as parseToml } from "smol-toml";
import type { ParsedEntry, ParserId } from "./types.js";

const SENSITIVE_KEY_NAME =
  /(api[-_ ]?key|apikey|access[-_ ]?key|secret|token|password|passwd|credential|refresh[-_ ]?token|id[-_ ]?token|auth)/i;
const PLACEHOLDER = /^(\.\.\.|x{3,}|changeme|change[_-]?me|your[-_ ].*|<.*>|null|undefined|true|false|)$/i;
const MAX_DEPTH = 8;
const MIN_LENGTH = 8;

function usableValue(value: string): boolean {
  if (value.length < MIN_LENGTH) return false;
  if (/\s/.test(value)) return false;
  if (PLACEHOLDER.test(value.trim())) return false;
  return true;
}

function looksSensitive(keyName: string): boolean {
  return SENSITIVE_KEY_NAME.test(keyName);
}

function flatten(value: unknown, pointer: string, keyName: string, depth: number, out: ParsedEntry[]): void {
  if (depth > MAX_DEPTH) return;
  if (value === null || value === undefined) return;
  if (typeof value === "string") {
    if (!looksSensitive(keyName) || !usableValue(value)) return;
    out.push({ pointer, keyName, value });
    return;
  }
  if (typeof value === "number" || typeof value === "boolean") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => flatten(item, `${pointer}[${index}]`, keyName, depth + 1, out));
    return;
  }
  if (typeof value === "object") {
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      const childPointer = pointer === "" ? childKey : `${pointer}.${childKey}`;
      flatten(childValue, childPointer, childKey, depth + 1, out);
    }
  }
}

export function flattenDocument(document: unknown): ParsedEntry[] {
  const out: ParsedEntry[] = [];
  flatten(document, "", "", 0, out);
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
      while (index < text.length && !(text[index] === "*" && text[index + 1] === "/")) index += 1;
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
    const parsed: unknown = JSON.parse(stripTrailingCommas(stripJsonComments(text)));
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
    const withoutExport = line.startsWith("export ") ? line.slice(7).trim() : line;
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
  { id: "generic", pattern: /["']?[A-Za-z0-9_]*(?:api[_-]?key|token|secret)["']?\s*[:=]\s*["']?([A-Za-z0-9_-]{24,})["']?/gi },
];

export function parseRawText(text: string): ParsedEntry[] {
  const entries: ParsedEntry[] = [];
  const genericKeys = ["api_key", "api-key", "token", "secret"];
  for (const matcher of RAW_PATTERNS) {
    const pattern = new RegExp(matcher.pattern.source, matcher.pattern.flags);
    let match: RegExpExecArray | null = pattern.exec(text);
    while (match !== null) {
      const value = matcher.id === "generic" ? (match[1] ?? "") : (match[0] ?? "");
      if (usableValue(value) && !entries.some((existing) => existing.value === value)) {
        const keyName =
          matcher.id === "generic"
            ? (match[0] ?? "generic").slice(0, 40)
            : genericKeys[entries.length % genericKeys.length] ?? "key";
        entries.push({ pointer: `raw:${matcher.id}`, keyName, value });
      }
      match = pattern.exec(text);
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
