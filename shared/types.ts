export type DiffLine = { type: "add" | "del" | "context"; content: string; html?: string };

export type DiffHunk = { header: string; lines: DiffLine[] };

export type DiffFile = {
  path: string;
  change?: ChangeSectionId;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
};

export type ChangeSectionId = "staged" | "unstaged";

export type DiffSection = {
  id: ChangeSectionId;
  title: string;
  summary: { files: number; additions: number; deletions: number };
  files: DiffFile[];
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
  sections?: DiffSection[];
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
