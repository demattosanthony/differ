import type {
  DiffSide,
  GitHubRepository,
  PullRequestContextData,
  PullRequestFileData,
  PullRequestReviewComment,
  PullRequestReviewEvent,
  PullRequestReviewThread,
  PullRequestReviewThreadsData,
  PullRequestSummary,
} from "../shared/types";
import { runGit } from "./git";

type GitHubPullRequestResponse = {
  number: number;
  title: string;
  state: string;
  html_url: string;
  user: { login: string } | null;
  base: { ref: string; sha: string };
  head: { ref: string; sha: string };
};

type GitHubPullRequestFileResponse = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
};

type GitHubReviewCommentResponse = {
  id: number;
  pull_request_review_id: number | null;
  in_reply_to_id?: number;
  diff_hunk: string;
  path: string;
  position: number | null;
  original_position: number | null;
  user: { login: string } | null;
  body: string;
  created_at: string;
  updated_at: string;
  html_url: string;
  line?: number | null;
  original_line?: number | null;
  side?: string | null;
  start_line?: number | null;
  original_start_line?: number | null;
  start_side?: string | null;
};

type GitHubErrorResponse = {
  message?: string;
  errors?: Array<string | { message?: string }>;
};

type GitHubViewerResponse = {
  login: string;
};

let cachedGitHubToken: string | null | undefined;

export class GitHubApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

export async function getPullRequestContext(
  repoRoot: string,
  pullRequestNumber?: number
): Promise<PullRequestContextData> {
  const repository = getGitHubRepository(repoRoot);
  const currentBranch = getCurrentBranch(repoRoot);

  if (!repository) {
    return { repository, currentBranch, viewerLogin: null, pullRequest: null, files: [] };
  }
  const viewerLogin = await getGitHubViewerLogin(repository);

  const pullRequest = pullRequestNumber
    ? await getPullRequest(repository, pullRequestNumber)
    : await findPullRequestForBranch(repository, currentBranch);

  if (!pullRequest) {
    return { repository, currentBranch, viewerLogin, pullRequest: null, files: [] };
  }

  return {
    repository,
    currentBranch,
    viewerLogin,
    pullRequest,
    files: await getPullRequestFiles(repository, pullRequest.number),
  };
}

export async function getPullRequestReviewThreads(
  repoRoot: string,
  pullRequestNumber?: number
): Promise<PullRequestReviewThreadsData> {
  const repository = getGitHubRepository(repoRoot);
  const currentBranch = getCurrentBranch(repoRoot);

  if (!repository) {
    return { repository, currentBranch, viewerLogin: null, pullRequest: null, threads: [] };
  }
  const viewerLogin = await getGitHubViewerLogin(repository);

  const pullRequest = pullRequestNumber
    ? await getPullRequest(repository, pullRequestNumber)
    : await findPullRequestForBranch(repository, currentBranch);

  if (!pullRequest) {
    return { repository, currentBranch, viewerLogin, pullRequest: null, threads: [] };
  }

  const comments = await getPullRequestReviewComments(repository, pullRequest.number);
  return {
    repository,
    currentBranch,
    viewerLogin,
    pullRequest,
    threads: toPullRequestReviewThreads(comments),
  };
}

export async function replyToPullRequestReviewThread(
  repoRoot: string,
  pullRequestNumber: number,
  commentId: number,
  body: string
): Promise<PullRequestReviewThreadsData> {
  const repository = getGitHubRepository(repoRoot);
  const currentBranch = getCurrentBranch(repoRoot);

  if (!repository) {
    return { repository, currentBranch, viewerLogin: null, pullRequest: null, threads: [] };
  }
  const viewerLogin = await getGitHubViewerLogin(repository);

  const pullRequest = await getPullRequest(repository, pullRequestNumber);
  await githubFetch<GitHubReviewCommentResponse>(
    repository,
    `/repos/${repository.owner}/${repository.name}/pulls/${pullRequestNumber}/comments/${commentId}/replies`,
    {
      method: "POST",
      body: JSON.stringify({ body }),
    }
  );

  const comments = await getPullRequestReviewComments(repository, pullRequest.number);
  return {
    repository,
    currentBranch,
    viewerLogin,
    pullRequest,
    threads: toPullRequestReviewThreads(comments),
  };
}

export async function updatePullRequestReviewComment(
  repoRoot: string,
  pullRequestNumber: number,
  commentId: number,
  body: string
): Promise<PullRequestReviewThreadsData> {
  const repository = getGitHubRepository(repoRoot);
  const currentBranch = getCurrentBranch(repoRoot);

  if (!repository) {
    return { repository, currentBranch, viewerLogin: null, pullRequest: null, threads: [] };
  }
  const viewerLogin = await getGitHubViewerLogin(repository);

  const pullRequest = await getPullRequest(repository, pullRequestNumber);
  await githubFetch<GitHubReviewCommentResponse>(
    repository,
    `/repos/${repository.owner}/${repository.name}/pulls/comments/${commentId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ body }),
    }
  );

  const comments = await getPullRequestReviewComments(repository, pullRequest.number);
  return {
    repository,
    currentBranch,
    viewerLogin,
    pullRequest,
    threads: toPullRequestReviewThreads(comments),
  };
}

export async function deletePullRequestReviewComment(
  repoRoot: string,
  pullRequestNumber: number,
  commentId: number
): Promise<PullRequestReviewThreadsData> {
  const repository = getGitHubRepository(repoRoot);
  const currentBranch = getCurrentBranch(repoRoot);

  if (!repository) {
    return { repository, currentBranch, viewerLogin: null, pullRequest: null, threads: [] };
  }
  const viewerLogin = await getGitHubViewerLogin(repository);

  const pullRequest = await getPullRequest(repository, pullRequestNumber);
  await githubFetch<void>(repository, `/repos/${repository.owner}/${repository.name}/pulls/comments/${commentId}`, {
    method: "DELETE",
  });

  const comments = await getPullRequestReviewComments(repository, pullRequest.number);
  return {
    repository,
    currentBranch,
    viewerLogin,
    pullRequest,
    threads: toPullRequestReviewThreads(comments),
  };
}

export async function createPullRequestReviewComment(
  repoRoot: string,
  pullRequestNumber: number,
  path: string,
  side: DiffSide,
  line: number,
  body: string
): Promise<PullRequestReviewThreadsData> {
  const repository = getGitHubRepository(repoRoot);
  const currentBranch = getCurrentBranch(repoRoot);

  if (!repository) {
    return { repository, currentBranch, viewerLogin: null, pullRequest: null, threads: [] };
  }
  const viewerLogin = await getGitHubViewerLogin(repository);

  const pullRequest = await getPullRequest(repository, pullRequestNumber);
  await githubFetch<GitHubReviewCommentResponse>(
    repository,
    `/repos/${repository.owner}/${repository.name}/pulls/${pullRequestNumber}/comments`,
    {
      method: "POST",
      body: JSON.stringify({
        body,
        commit_id: pullRequest.headSha,
        path,
        side,
        line,
      }),
    }
  );

  const comments = await getPullRequestReviewComments(repository, pullRequest.number);
  return {
    repository,
    currentBranch,
    viewerLogin,
    pullRequest,
    threads: toPullRequestReviewThreads(comments),
  };
}

export async function submitPullRequestReview(
  repoRoot: string,
  pullRequestNumber: number,
  event: PullRequestReviewEvent,
  body: string,
  comments: Array<{ path: string; side: DiffSide; line: number; body: string }>
): Promise<PullRequestReviewThreadsData> {
  const repository = getGitHubRepository(repoRoot);
  const currentBranch = getCurrentBranch(repoRoot);

  if (!repository) {
    return { repository, currentBranch, viewerLogin: null, pullRequest: null, threads: [] };
  }
  const viewerLogin = await getGitHubViewerLogin(repository);

  const pullRequest = await getPullRequest(repository, pullRequestNumber);
  await githubFetch(
    repository,
    `/repos/${repository.owner}/${repository.name}/pulls/${pullRequestNumber}/reviews`,
    {
      method: "POST",
      body: JSON.stringify({
        commit_id: pullRequest.headSha,
        event,
        body,
        comments: comments.map((comment) => ({
          path: comment.path,
          side: comment.side,
          line: comment.line,
          body: comment.body,
        })),
      }),
    }
  );

  const refreshedComments = await getPullRequestReviewComments(repository, pullRequest.number);
  return {
    repository,
    currentBranch,
    viewerLogin,
    pullRequest,
    threads: toPullRequestReviewThreads(refreshedComments),
  };
}

export function getGitHubRepository(repoRoot: string): GitHubRepository | null {
  const remoteUrl = runGit(repoRoot, ["remote", "get-url", "origin"]).trim();
  const parsed = parseGitHubRemoteUrl(remoteUrl);
  if (!parsed) return null;
  return { ...parsed, remoteUrl };
}

export function parseGitHubRemoteUrl(remoteUrl: string): Pick<GitHubRepository, "owner" | "name"> | null {
  const normalized = remoteUrl.trim();
  const sshMatch = normalized.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
  if (sshMatch) return { owner: sshMatch[1], name: sshMatch[2] };

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    return null;
  }

  if (url.hostname !== "github.com") return null;
  const [owner, repo] = url.pathname.replace(/^\/|\/$/g, "").split("/");
  if (!owner || !repo) return null;
  return { owner, name: repo.replace(/\.git$/, "") };
}

function getCurrentBranch(repoRoot: string) {
  return runGit(repoRoot, ["branch", "--show-current"]).trim() || null;
}

async function findPullRequestForBranch(repository: GitHubRepository, branch: string | null) {
  if (!branch) return null;
  const params = new URLSearchParams({
    state: "open",
    head: `${repository.owner}:${branch}`,
    per_page: "1",
  });
  const pullRequests = await githubFetch<GitHubPullRequestResponse[]>(
    repository,
    `/repos/${repository.owner}/${repository.name}/pulls?${params.toString()}`
  );
  return pullRequests[0] ? toPullRequestSummary(pullRequests[0]) : null;
}

async function getPullRequest(repository: GitHubRepository, pullRequestNumber: number) {
  const pullRequest = await githubFetch<GitHubPullRequestResponse>(
    repository,
    `/repos/${repository.owner}/${repository.name}/pulls/${pullRequestNumber}`
  );
  return toPullRequestSummary(pullRequest);
}

async function getPullRequestFiles(repository: GitHubRepository, pullRequestNumber: number) {
  const files = await githubFetchPages<GitHubPullRequestFileResponse>(
    repository,
    `/repos/${repository.owner}/${repository.name}/pulls/${pullRequestNumber}/files`
  );
  return files.map(toPullRequestFile);
}

async function getPullRequestReviewComments(repository: GitHubRepository, pullRequestNumber: number) {
  return githubFetchPages<GitHubReviewCommentResponse>(
    repository,
    `/repos/${repository.owner}/${repository.name}/pulls/${pullRequestNumber}/comments`
  );
}

async function githubFetchPages<T>(repository: GitHubRepository, path: string) {
  const results: T[] = [];
  let page = 1;

  while (true) {
    const separator = path.includes("?") ? "&" : "?";
    const items = await githubFetch<T[]>(repository, `${path}${separator}per_page=100&page=${page}`);
    results.push(...items);
    if (items.length < 100) return results;
    page += 1;
  }
}

async function githubFetch<T>(repository: GitHubRepository, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: getGitHubHeaders(repository),
  });

  if (response.ok) {
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  let message = `GitHub request failed with status ${response.status}`;
  try {
    const error = (await response.json()) as GitHubErrorResponse;
    message = getGitHubErrorMessage(error) ?? message;
  } catch {
    // Preserve the generic status message when GitHub does not return JSON.
  }
  throw new GitHubApiError(message, response.status);
}

async function getGitHubViewerLogin(repository: GitHubRepository) {
  if (!getGitHubToken()) return null;
  try {
    const viewer = await githubFetch<GitHubViewerResponse>(repository, "/user");
    return viewer.login;
  } catch {
    return null;
  }
}

function getGitHubHeaders(repository: GitHubRepository): HeadersInit {
  const token = getGitHubToken();
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": `differ/${repository.owner}-${repository.name}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function getGitHubToken() {
  if (cachedGitHubToken !== undefined) return cachedGitHubToken;

  const envToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (envToken) {
    cachedGitHubToken = envToken;
    return cachedGitHubToken;
  }

  const result = Bun.spawnSync(["gh", "auth", "token"], {
    stdout: "pipe",
    stderr: "ignore",
  });
  const ghToken = result.exitCode === 0 ? result.stdout.toString().trim() : "";
  cachedGitHubToken = ghToken || null;
  return cachedGitHubToken;
}

function getGitHubErrorMessage(error: GitHubErrorResponse) {
  const detail = error.errors
    ?.map((item) => (typeof item === "string" ? item : item.message))
    .find((item): item is string => Boolean(item));
  if (detail) return detail.replace(/^Review\s+/, "");
  return error.message;
}

function toPullRequestSummary(pullRequest: GitHubPullRequestResponse): PullRequestSummary {
  return {
    number: pullRequest.number,
    title: pullRequest.title,
    state: pullRequest.state,
    url: pullRequest.html_url,
    author: pullRequest.user?.login ?? null,
    baseRef: pullRequest.base.ref,
    baseSha: pullRequest.base.sha,
    headRef: pullRequest.head.ref,
    headSha: pullRequest.head.sha,
  };
}

function toPullRequestFile(file: GitHubPullRequestFileResponse): PullRequestFileData {
  return {
    path: file.filename,
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
    changes: file.changes,
    patch: file.patch,
  };
}

export function toPullRequestReviewThreads(comments: GitHubReviewCommentResponse[]): PullRequestReviewThread[] {
  const commentsById = new Map(comments.map((comment) => [comment.id, comment]));
  const childrenByParentId = new Map<number, GitHubReviewCommentResponse[]>();

  for (const comment of comments) {
    if (!comment.in_reply_to_id) continue;
    const children = childrenByParentId.get(comment.in_reply_to_id) ?? [];
    children.push(comment);
    childrenByParentId.set(comment.in_reply_to_id, children);
  }

  return comments
    .filter((comment) => !comment.in_reply_to_id || !commentsById.has(comment.in_reply_to_id))
    .map((comment) => {
      const replies = childrenByParentId.get(comment.id) ?? [];
      const threadComments = [comment, ...replies].sort((first, second) =>
        first.created_at.localeCompare(second.created_at)
      );
      return {
        id: String(comment.id),
        path: comment.path,
        side: toDiffSide(comment.side),
        line: comment.line ?? null,
        startSide: toDiffSide(comment.start_side),
        startLine: comment.start_line ?? null,
        diffHunk: comment.diff_hunk,
        outdated: comment.line === null || comment.position === null,
        comments: threadComments.map(toPullRequestReviewComment),
      };
    });
}

function toPullRequestReviewComment(comment: GitHubReviewCommentResponse): PullRequestReviewComment {
  return {
    id: comment.id,
    reviewId: comment.pull_request_review_id,
    parentId: comment.in_reply_to_id ?? null,
    author: comment.user?.login ?? null,
    body: comment.body,
    url: comment.html_url,
    createdAt: comment.created_at,
    updatedAt: comment.updated_at,
  };
}

function toDiffSide(side: string | null | undefined): DiffSide | null {
  if (side === "LEFT" || side === "RIGHT") return side;
  return null;
}
