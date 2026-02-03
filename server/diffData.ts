import path from "path";
import { createHash } from "crypto";
import type { DiffData, DiffFile } from "../shared/types";
import type { ThemeId } from "../shared/themes";
import { parseDiff } from "./diffParser";
import { getFileDiffPatch, getWorkingDiff } from "./git";
import { getShikiTheme, highlightDiff } from "./highlight";

const parsedCache = new Map<string, { hash: string; data: DiffData }>();
const highlightCache = new Map<string, DiffFile[]>();
const fileDiffCache = new Map<string, { hash: string; data: DiffFile }>();

export function invalidateRepoCaches(repoRoot: string) {
  parsedCache.delete(repoRoot);
  for (const key of highlightCache.keys()) {
    if (key.startsWith(`${repoRoot}:`)) highlightCache.delete(key);
  }
  for (const key of fileDiffCache.keys()) {
    if (key.startsWith(`${repoRoot}:`)) fileDiffCache.delete(key);
  }
}

export async function getDiffData(repoRoot: string, themeId: ThemeId): Promise<DiffData> {
  const diff = getWorkingDiff(repoRoot, 3);
  const hash = createHash("sha1").update(diff).digest("hex");
  const cached = parsedCache.get(repoRoot);
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
      files,
    };
    parsedCache.set(repoRoot, { hash, data: baseData });
  } else {
    baseData = cached.data;
  }

  const theme = getShikiTheme(themeId);
  const highlightKey = `${repoRoot}:${hash}:${theme}`;
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
  fullContext: boolean
): Promise<DiffFile | null> {
  const unified = fullContext ? 999999 : 3;
  const diff = getFileDiffPatch(repoRoot, filePath, unified);
  if (!diff.trim()) return null;

  const hash = createHash("sha1").update(diff).digest("hex");
  const theme = getShikiTheme(themeId);
  const cacheKey = `${repoRoot}:${filePath}:${theme}:${fullContext ? "full" : "diff"}`;
  const cached = fileDiffCache.get(cacheKey);
  if (cached && cached.hash === hash) return cached.data;

  const files = parseDiff(diff);
  const file = files.find((item) => item.path === filePath) ?? files[0];
  if (!file) return null;

  await highlightDiff([file], themeId);
  fileDiffCache.set(cacheKey, { hash, data: file });
  return file;
}
