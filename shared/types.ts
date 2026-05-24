export type DiffLineType = "add" | "del" | "context";

export type DiffSide = "LEFT" | "RIGHT";

export type DiffReviewCoordinate = {
  side: DiffSide;
  line: number;
  diffPosition: number;
};

export type DiffLine = {
  type: DiffLineType;
  content: string;
  html?: string;
  oldLineNumber: number | null;
  newLineNumber: number | null;
  diffPosition: number;
  reviewCoordinates: Partial<Record<DiffSide, DiffReviewCoordinate>>;
};

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

export type GitHubRepository = {
  owner: string;
  name: string;
  remoteUrl: string;
};

export type PullRequestSummary = {
  number: number;
  title: string;
  state: string;
  url: string;
  author: string | null;
  baseRef: string;
  baseSha: string;
  headRef: string;
  headSha: string;
};

export type PullRequestFileData = {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
};

export type PullRequestContextData = {
  repository: GitHubRepository | null;
  currentBranch: string | null;
  pullRequest: PullRequestSummary | null;
  files: PullRequestFileData[];
};

export type PullRequestReviewComment = {
  id: number;
  reviewId: number | null;
  parentId: number | null;
  author: string | null;
  body: string;
  url: string;
  createdAt: string;
  updatedAt: string;
};

export type PullRequestReviewThread = {
  id: string;
  path: string;
  side: DiffSide | null;
  line: number | null;
  startSide: DiffSide | null;
  startLine: number | null;
  diffHunk: string;
  outdated: boolean;
  comments: PullRequestReviewComment[];
};

export type PullRequestReviewThreadsData = {
  repository: GitHubRepository | null;
  currentBranch: string | null;
  pullRequest: PullRequestSummary | null;
  threads: PullRequestReviewThread[];
};
