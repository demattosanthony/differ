import path from "path";
import { createHash } from "crypto";
import type { CompareSpec, DiffData, DiffFile } from "../shared/types";
import type { ThemeId } from "../shared/themes";
import { parseDiff } from "./diffParser";
import { getDiff, getFileDiffPatch } from "./git";
import { getShikiTheme, highlightDiff } from "./highlight";

const parsedCache = new Map<string, { hash: string; data: DiffData }>();
const highlightCache = new Map<string, DiffFile[]>();
const fileDiffCache = new Map<string, { hash: string; data: DiffFile }>();

const getCompareKey = (compare: CompareSpec) =>
  compare.mode === "working" ? "working" : `range:${compare.base ?? ""}...${compare.head ?? ""}`;

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

export async function getDiffData(repoRoot: string, themeId: ThemeId, compare: CompareSpec): Promise<DiffData> {
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
  compare: CompareSpec
): Promise<DiffFile | null> {
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
