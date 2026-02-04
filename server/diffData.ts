import path from "path";
import { createHash } from "crypto";
import type { CompareSpec, DiffData, DiffFile } from "../shared/types";
import type { ThemeId } from "../shared/themes";
import { parseDiff } from "./diffParser";
import { getDiff, getFileDiffPatch, getOriginRepoInfo } from "./git";
import { getShikiTheme, highlightDiff } from "./highlight";
import { createGitHubClient } from "./github";

const parsedCache = new Map<string, { hash: string; data: DiffData }>();
const highlightCache = new Map<string, DiffFile[]>();
const fileDiffCache = new Map<string, { hash: string; data: DiffFile }>();

const getCompareKey = (compare: CompareSpec) => {
  if (compare.mode === "working") return "working";
  if (compare.mode === "pr") return `pr:${compare.number}`;
  return `range:${compare.base ?? ""}...${compare.head ?? ""}`;
};

const getRepoCompareKey = (repoRoot: string, compare: CompareSpec) => `${repoRoot}::${getCompareKey(compare)}`;

export function invalidateRepoCaches(repoRoot: string) {
  const prefix = `${repoRoot}::`;
  for (const key of parsedCache.keys()) {
    if (key.startsWith(prefix)) parsedCache.delete(key);
  }
  for (const key of highlightCache.keys()) {
    if (key.startsWith(prefix)) highlightCache.delete(key);
  }
  for (const key of fileDiffCache.keys()) {
    if (key.startsWith(prefix)) fileDiffCache.delete(key);
  }
}

export async function getDiffData(
  repoRoot: string,
  themeId: ThemeId,
  compare: CompareSpec,
  githubToken?: string | null
): Promise<DiffData> {
  if (compare.mode === "pr") {
    return getPullRequestDiffData(repoRoot, themeId, compare.number, githubToken ?? null);
  }
  const diff = getDiff(repoRoot, compare, 3);
  const hash = createHash("sha1").update(diff).digest("hex");
  const cacheKey = getRepoCompareKey(repoRoot, compare);
  const cached = parsedCache.get(cacheKey);
  let baseData: DiffData;

  if (!cached || cached.hash !== hash) {
    const files = parseDiff(diff);
    const summary = files.reduce(
      (acc, file) => {
        acc.files += 1;
        acc.additions += file.additions;
        acc.deletions += file.deletions;
        return acc;
      },
      { files: 0, additions: 0, deletions: 0 }
    );

    baseData = {
      repo: { root: repoRoot, name: path.basename(repoRoot) },
      summary,
      revision: hash,
      compare,
      files,
    };
    parsedCache.set(cacheKey, { hash, data: baseData });
  } else {
    baseData = cached.data;
  }

  const theme = getShikiTheme(themeId);
  const highlightKey = `${cacheKey}:${hash}:${theme}`;
  const cachedHighlighted = highlightCache.get(highlightKey);
  if (cachedHighlighted) {
    return { ...baseData, files: cachedHighlighted };
  }

  const highlightedFiles = structuredClone(baseData.files);
  await highlightDiff(highlightedFiles, themeId);
  highlightCache.set(highlightKey, highlightedFiles);
  return { ...baseData, files: highlightedFiles };
}

export async function getFileDiff(
  repoRoot: string,
  filePath: string,
  themeId: ThemeId,
  fullContext: boolean,
  compare: CompareSpec,
  githubToken?: string | null
): Promise<DiffFile | null> {
  if (compare.mode === "pr") {
    return getPullRequestFileDiff(repoRoot, filePath, themeId, compare.number, githubToken ?? null);
  }
  const unified = fullContext ? 999999 : 3;
  const diff = getFileDiffPatch(repoRoot, filePath, unified, compare);
  if (!diff.trim()) return null;

  const hash = createHash("sha1").update(diff).digest("hex");
  const theme = getShikiTheme(themeId);
  const cacheKey = `${getRepoCompareKey(repoRoot, compare)}:${filePath}:${theme}:${fullContext ? "full" : "diff"}`;
  const cached = fileDiffCache.get(cacheKey);
  if (cached && cached.hash === hash) return cached.data;

  const files = parseDiff(diff);
  const file = files.find((item) => item.path === filePath) ?? files[0];
  if (!file) return null;

  await highlightDiff([file], themeId);
  fileDiffCache.set(cacheKey, { hash, data: file });
  return file;
}

type PullRequestResponse = {
  number: number;
  title: string;
  html_url: string;
  head: { sha: string; ref: string };
  base: { ref: string };
};

type PullRequestFileResponse = {
  filename: string;
  viewed?: boolean;
};

const getPullRequestDiffData = async (
  repoRoot: string,
  themeId: ThemeId,
  prNumber: number,
  token: string | null
): Promise<DiffData> => {
  if (!Number.isFinite(prNumber) || prNumber <= 0) throw new Error("Invalid pull request number");
  const repoInfo = getOriginRepoInfo(repoRoot);
  if (!repoInfo) throw new Error("Unable to resolve GitHub origin");
  if (!token) throw new Error("Missing GitHub token");

  const client = createGitHubClient({ token });
  const pr = await client.requestJson<PullRequestResponse>(
    `/repos/${repoInfo.owner}/${repoInfo.repo}/pulls/${prNumber}`
  );
  const diff = await client.requestText(`/repos/${repoInfo.owner}/${repoInfo.repo}/pulls/${prNumber}`, {
    headers: { Accept: "application/vnd.github.v3.diff" },
  });
  const hash = createHash("sha1").update(diff).digest("hex");
  const cacheKey = getRepoCompareKey(repoRoot, { mode: "pr", number: prNumber });
  const cached = parsedCache.get(cacheKey);
  let baseData: DiffData;

  if (!cached || cached.hash !== hash) {
    const files = parseDiff(diff);
    const summary = files.reduce(
      (acc, file) => {
        acc.files += 1;
        acc.additions += file.additions;
        acc.deletions += file.deletions;
        return acc;
      },
      { files: 0, additions: 0, deletions: 0 }
    );

    baseData = {
      repo: { root: repoRoot, name: path.basename(repoRoot) },
      summary,
      revision: hash,
      compare: { mode: "pr", number: prNumber },
      files,
      pr: {
        number: pr.number,
        title: pr.title,
        url: pr.html_url,
        headSha: pr.head.sha,
        baseRef: pr.base.ref,
        headRef: pr.head.ref,
      },
      fullFileAvailable: false,
    };
    parsedCache.set(cacheKey, { hash, data: baseData });
  } else {
    baseData = cached.data;
  }

  const prFiles = await client.requestAllPages<PullRequestFileResponse>(
    `/repos/${repoInfo.owner}/${repoInfo.repo}/pulls/${prNumber}/files?per_page=100`
  );
  const viewedByPath = new Map(
    prFiles
      .filter((file) => typeof file.viewed === "boolean")
      .map((file) => [file.filename, file.viewed as boolean])
  );

  const theme = getShikiTheme(themeId);
  const highlightKey = `${cacheKey}:${hash}:${theme}`;
  const cachedHighlighted = highlightCache.get(highlightKey);
  if (cachedHighlighted) {
    const merged = cachedHighlighted.map((file) => ({
      ...file,
      viewed: viewedByPath.get(file.path) ?? file.viewed,
    }));
    return { ...baseData, files: merged };
  }

  const highlightedFiles = structuredClone(baseData.files);
  await highlightDiff(highlightedFiles, themeId);
  const merged = highlightedFiles.map((file) => ({
    ...file,
    viewed: viewedByPath.get(file.path) ?? file.viewed,
  }));
  highlightCache.set(highlightKey, merged);
  return { ...baseData, files: merged };
};

const getPullRequestFileDiff = async (
  repoRoot: string,
  filePath: string,
  themeId: ThemeId,
  prNumber: number,
  token: string | null
) => {
  const data = await getPullRequestDiffData(repoRoot, themeId, prNumber, token);
  return data.files.find((file) => file.path === filePath) ?? null;
};
