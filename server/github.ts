import type {
  GitHubRepository,
  PullRequestContextData,
  PullRequestFileData,
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

type GitHubErrorResponse = {
  message?: string;
};

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
    return { repository, currentBranch, pullRequest: null, files: [] };
  }

  const pullRequest = pullRequestNumber
    ? await getPullRequest(repository, pullRequestNumber)
    : await findPullRequestForBranch(repository, currentBranch);

  if (!pullRequest) {
    return { repository, currentBranch, pullRequest: null, files: [] };
  }

  return {
    repository,
    currentBranch,
    pullRequest,
    files: await getPullRequestFiles(repository, pullRequest.number),
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

async function githubFetch<T>(repository: GitHubRepository, path: string): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: getGitHubHeaders(repository),
  });

  if (response.ok) return (await response.json()) as T;

  let message = `GitHub request failed with status ${response.status}`;
  try {
    const error = (await response.json()) as GitHubErrorResponse;
    if (error.message) message = error.message;
  } catch {
    // Preserve the generic status message when GitHub does not return JSON.
  }
  throw new GitHubApiError(message, response.status);
}

function getGitHubHeaders(repository: GitHubRepository): HeadersInit {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": `differ/${repository.owner}-${repository.name}`,
    "X-GitHub-Api-Version": "2022-11-28",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
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
