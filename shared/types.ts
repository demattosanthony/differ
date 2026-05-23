export type DiffLine = { type: "add" | "del" | "context"; content: string; html?: string };

export type DiffHunk = { header: string; lines: DiffLine[] };

export type DiffFile = {
  path: string;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
};

export type CompareMode = "working" | "range";

export type CompareSpec = {
  mode: CompareMode;
  base?: string | null;
  head?: string | null;
};

export type DiffData = {
  repo: { root: string; name: string };
  summary: { files: number; additions: number; deletions: number };
  revision: string;
  compare: CompareSpec;
  files: DiffFile[];
};

export type ProjectFilesData = {
  repo: { root: string; name: string };
  revision: string;
  compare: CompareSpec;
  paths: string[];
  directories: string[];
  searchLimited?: boolean;
};

export type SourceLine = {
  number: number;
  content: string;
  html?: string;
};

export type SourceFileData = {
  path: string;
  size: number;
  truncated: boolean;
  binary: boolean;
  lines: SourceLine[];
};
