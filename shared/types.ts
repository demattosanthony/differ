export type DiffLine = { type: "add" | "del" | "context"; content: string; html?: string };

export type DiffHunk = { header: string; lines: DiffLine[] };

export type DiffFile = {
  path: string;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
  viewed?: boolean;
};

export type CompareMode = "working" | "range" | "pr";

export type CompareSpec =
  | { mode: "working" }
  | { mode: "range"; base?: string | null; head?: string | null }
  | { mode: "pr"; number: number };

export type DiffData = {
  repo: { root: string; name: string };
  summary: { files: number; additions: number; deletions: number };
  revision: string;
  compare: CompareSpec;
  files: DiffFile[];
  pr?: PullRequestInfo;
  fullFileAvailable?: boolean;
};

export type PullRequestInfo = {
  number: number;
  title: string;
  url: string;
  headSha: string;
  baseRef: string;
  headRef: string;
};
