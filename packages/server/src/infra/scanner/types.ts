export type SourceKind = "file" | "env-file" | "keychain" | "regex-file";
export type ParserId = "json" | "yaml" | "toml" | "dotenv" | "raw" | "keychain";

export interface SourceDefinition {
  id: string;
  kind: SourceKind;
  /** Path template; `~` expands to the user home directory. */
  path: string;
  parser: ParserId;
  providerHint?: string;
  enabled: boolean;
  priority: number;
  notes?: string;
}

/** One credential-shaped value discovered inside a document. */
export interface ParsedEntry {
  pointer: string;
  keyName: string;
  value: string;
  /** Sibling fields that name the owner of the value (`provider: deepseek`). */
  context?: string[];
}

export interface SourceEvidence {
  sourceId: string;
  sourceKind: SourceKind;
  sourcePath: string;
  pointer?: string;
  envVarName?: string;
  sourceMtime?: number;
}

export interface Candidate extends SourceEvidence {
  provider: string;
  value?: string;
}

export type ScanPhase =
  "started" | "source" | "candidate" | "error" | "finished" | "canceled";

export interface ScanEvent {
  runId: string;
  at: string;
  phase: ScanPhase;
  sourceId?: string;
  message: string;
  counts?: { newCount: number; updatedCount: number; removedCount: number };
}

export interface KeySink {
  upsert(candidate: Candidate): { id: string; isNew: boolean };
}

export interface ScanCounts {
  newCount: number;
  updatedCount: number;
  removedCount: number;
  totalCount: number;
}
