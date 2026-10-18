import { homedir } from "node:os";
import type { SourceDefinition } from "./types.js";

const HOME = homedir();

export function expandPath(path: string): string {
  return path.startsWith("~/") ? `${HOME}${path.slice(1)}` : path;
}

/**
 * Curated, read-only scan registry. Verified against the AI-agent tooling that
 * actually exists on this Mac plus the common cross-platform locations.
 * Owners may add/disable entries in the Settings UI.
 */
export const DEFAULT_SOURCES: SourceDefinition[] = [
  {
    id: "codex-auth",
    kind: "file",
    path: "~/.codex/auth.json",
    parser: "json",
    providerHint: "openai",
    enabled: true,
    priority: 10,
    notes: "OpenAI Codex CLI credential file (OPENAI_API_KEY)",
  },
  { id: "codex-config", kind: "file", path: "~/.codex/config.toml", parser: "toml", enabled: true, priority: 11 },
  { id: "grok-auth", kind: "file", path: "~/.grok/auth.json", parser: "json", enabled: true, priority: 12 },
  { id: "grok-config", kind: "file", path: "~/.grok/config.toml", parser: "toml", enabled: true, priority: 13 },
  { id: "bailian-config", kind: "file", path: "~/.bailian/config.json", parser: "json", enabled: true, priority: 14 },
  {
    id: "arkcli-config",
    kind: "file",
    path: "~/.arkcli-bp/config.yaml",
    parser: "yaml",
    providerHint: "byteplus-ark",
    enabled: true,
    priority: 15,
  },
  { id: "arkcli-env", kind: "env-file", path: "~/.arkcli-bp/.env", parser: "dotenv", enabled: true, priority: 16 },
  { id: "gemini-oauth", kind: "file", path: "~/.gemini/oauth_creds.json", parser: "json", enabled: true, priority: 17 },
  {
    id: "gemini-accounts",
    kind: "file",
    path: "~/.gemini/google_accounts.json",
    parser: "json",
    providerHint: "google-ai",
    enabled: true,
    priority: 18,
  },
  { id: "gemini-settings", kind: "file", path: "~/.gemini/settings.json", parser: "json", enabled: true, priority: 19 },
  { id: "copilot-config", kind: "file", path: "~/.copilot/config.json", parser: "json", enabled: true, priority: 20 },
  { id: "cursor-cli-config", kind: "file", path: "~/.cursor/cli-config.json", parser: "json", enabled: true, priority: 21 },
  { id: "cursor-mcp", kind: "file", path: "~/.cursor/mcp.json", parser: "json", enabled: true, priority: 22 },
  { id: "deepseek-token", kind: "regex-file", path: "~/.deepseek/token/.deepseek-token", parser: "raw", providerHint: "deepseek", enabled: true, priority: 23 },
  { id: "qwen-settings", kind: "file", path: "~/.qwen/settings.json", parser: "json", enabled: true, priority: 24 },
  { id: "qwen-envrc", kind: "env-file", path: "~/.qwen/.env", parser: "dotenv", enabled: true, priority: 25 },
  { id: "continue-config", kind: "file", path: "~/.continue/config.yaml", parser: "yaml", enabled: true, priority: 26 },
  { id: "continue-rc", kind: "file", path: "~/.continue/.continuerc.json", parser: "json", enabled: true, priority: 27 },
  { id: "opencode-config", kind: "file", path: "~/.config/opencode/opencode.jsonc", parser: "json", enabled: true, priority: 28 },
  { id: "opencode-auth", kind: "file", path: "~/.config/opencode/auth.json", parser: "json", enabled: true, priority: 29 },
  { id: "aider-config", kind: "file", path: "~/.aider/config.yml", parser: "yaml", enabled: true, priority: 30 },
  { id: "ollama-config", kind: "file", path: "~/.ollama/config.json", parser: "json", providerHint: "ollama", enabled: true, priority: 31 },
  { id: "claude-session-env", kind: "env-file", path: "~/.claude/session-env/current.env", parser: "dotenv", enabled: true, priority: 32 },
  { id: "claude-config", kind: "file", path: "~/.claude.json", parser: "json", enabled: true, priority: 33, notes: "apiKeyHelper only — never harvested" },
  { id: "colab-token", kind: "file", path: "~/.config/colab-cli/token.json", parser: "json", providerHint: "google-oauth", enabled: true, priority: 34 },
  { id: "docker-config", kind: "file", path: "~/.docker/config.json", parser: "json", enabled: true, priority: 35 },
  { id: "configstore", kind: "file", path: "~/.config/configstore/update-notifier-npm.json", parser: "json", enabled: true, priority: 36 },
  { id: "aws-credentials", kind: "regex-file", path: "~/.aws/credentials", parser: "raw", providerHint: "aws", enabled: false, priority: 37, notes: "disabled by default: opt-in in Settings" },
  { id: "aws-config", kind: "regex-file", path: "~/.aws/config", parser: "raw", providerHint: "aws", enabled: false, priority: 38 },
  { id: "git-credentials", kind: "regex-file", path: "~/.git-credentials", parser: "raw", providerHint: "github", enabled: false, priority: 39 },
  { id: "npmrc", kind: "env-file", path: "~/.npmrc", parser: "dotenv", enabled: true, priority: 40 },
  { id: "pypirc", kind: "regex-file", path: "~/.pypirc", parser: "raw", providerHint: "pypi", enabled: false, priority: 41 },
  { id: "shell-zshrc", kind: "env-file", path: "~/.zshrc", parser: "dotenv", enabled: true, priority: 42 },
  { id: "shell-zprofile", kind: "env-file", path: "~/.zprofile", parser: "dotenv", enabled: true, priority: 43 },
  { id: "shell-bash-profile", kind: "env-file", path: "~/.bash_profile", parser: "dotenv", enabled: true, priority: 44 },
  { id: "shell-profile", kind: "env-file", path: "~/.profile", parser: "dotenv", enabled: true, priority: 45 },
  { id: "keychain-generic", kind: "keychain", path: "keychain:login:generic-password", parser: "keychain", enabled: true, priority: 50, notes: "metadata only; secrets read on explicit reveal" },
];
