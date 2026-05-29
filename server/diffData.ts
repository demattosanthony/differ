import path from "path";
import { createHash } from "crypto";
import type { ChangeSectionId, CompareSpec, DiffData, DiffFile, DiffSection } from "../shared/types";
import type { ThemeId } from "../shared/themes";
import { parseDiff } from "./diffParser";
import { getDiffNumstat, getFileDiffPatch, getWorkingNumstat } from "./git";
import { getShikiTheme, highlightDiff } from "./highlight";

const parsedCache = new Map<string, { hash: string; data: DiffData }>();
const fileDiffCache = new Map<string, { hash: string; data: DiffFile }>();

type DiffStat = { path: string; additions: number; deletions: number };
type WorkingSectionDefinition = { id: ChangeSectionId; title: string };

const workingSections: WorkingSectionDefinition[] = [
  { id: "staged", title: "Staged Changes" },
  { id: "unstaged", title: "Unstaged Changes" },
];

const parseNumstat = (output: string): DiffStat[] => {
  if (!output.trim()) return [];
  return output
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => {
      const [additionsRaw, deletionsRaw, ...pathParts] = line.split("\t");
      const path = pathParts.join("\t");
      const additions = Number(additionsRaw);
      const deletions = Number(deletionsRaw);
      return {
        path: normalizeRenamePath(path),
        additions: Number.isFinite(additions) ? additions : 0,
        deletions: Number.isFinite(deletions) ? deletions : 0,
      };
    });
};

const normalizeRenamePath = (path: string) => {
  if (!path.includes("=>")) return path;
  if (path.includes("{")) {
    const replaced = path.replace(/\{([^{}]*?)\s=>\s([^{}]*?)\}/g, "$2");
    if (replaced !== path) return replaced;
  }
  const arrowIndex = path.indexOf("=>");
  return arrowIndex >= 0 ? path.slice(arrowIndex + 2).trim() : path;
};

const getCompareKey = (compare: CompareSpec) =>
  compare.mode === "working" ? "working" : `range:${compare.base ?? ""}...${compare.head ?? ""}`;

const getRepoCompareKey = (repoRoot: string, compare: CompareSpec) => `${repoRoot}::${getCompareKey(compare)}`;

export function invalidateRepoCaches(repoRoot: string) {
  invalidateRepoListCache(repoRoot);
  const prefix = `${repoRoot}::`;
  for (const key of fileDiffCache.keys()) {
    if (key.startsWith(prefix)) fileDiffCache.delete(key);
  }
}

// Invalidate only the diff-summary cache (the file list with numstat counts).
// Any working-tree change can shift add/del counts or add/remove a file, so the
// list is always rebuilt on change — but individual file diffs are left intact.
export function invalidateRepoListCache(repoRoot: string) {
  const prefix = `${repoRoot}::`;
  for (const key of parsedCache.keys()) {
    if (key.startsWith(prefix)) parsedCache.delete(key);
  }
}

// Invalidate cached diffs for specific files only. Files that did not change
// keep their highlighted diff, so viewing an untouched file never recomputes.
export function invalidateRepoFileCache(repoRoot: string, paths: Iterable<string>) {
  const changed = new Set(paths);
  if (changed.size === 0) return;
  const prefix = `${repoRoot}::`;
  for (const [key, value] of fileDiffCache) {
    if (!key.startsWith(prefix)) continue;
    if (changed.has(value.data.path)) fileDiffCache.delete(key);
  }
}

export async function getDiffData(repoRoot: string, themeId: ThemeId, compare: CompareSpec): Promise<DiffData> {
  if (compare.mode === "working") return getWorkingDiffData(repoRoot, compare);

  const output = getDiffNumstat(repoRoot, compare);
  const hash = createHash("sha1").update(output).digest("hex");
  const cacheKey = getRepoCompareKey(repoRoot, compare);
  const cached = parsedCache.get(cacheKey);
  let baseData: DiffData;

  if (!cached || cached.hash !== hash) {
    const stats = parseNumstat(output);
    const files = stats.map((file) => ({
      path: file.path,
      additions: file.additions,
      deletions: file.deletions,
      hunks: [],
    }));
    const summary = stats.reduce(
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
  return baseData;
}

function getWorkingDiffData(repoRoot: string, compare: CompareSpec): DiffData {
  const outputs = new Map(workingSections.map((section) => [section.id, getWorkingNumstat(repoRoot, section.id)]));
  const hash = createHash("sha1")
    .update(outputs.get("staged") ?? "")
    .update("\0unstaged\0")
    .update(outputs.get("unstaged") ?? "")
    .digest("hex");
  const cacheKey = getRepoCompareKey(repoRoot, compare);
  const cached = parsedCache.get(cacheKey);
  if (cached?.hash === hash) return cached.data;

  const sections = workingSections.map((section) => {
    const stats = parseNumstat(outputs.get(section.id) ?? "");
    const files = stats.map((file) => ({
      path: file.path,
      change: section.id,
      additions: file.additions,
      deletions: file.deletions,
      hunks: [],
    }));
    return {
      id: section.id,
      title: section.title,
      summary: summarizeFiles(files),
      files,
    };
  });
  const files = sections.flatMap((section) => section.files);
  const data = {
    repo: { root: repoRoot, name: path.basename(repoRoot) },
    summary: summarizeFiles(files),
    revision: hash,
    compare,
    files,
    sections,
  };

  parsedCache.set(cacheKey, { hash, data });
  return data;
}

export async function getFileDiff(
  repoRoot: string,
  filePath: string,
  themeId: ThemeId,
  fullContext: boolean,
  compare: CompareSpec,
  change?: ChangeSectionId
): Promise<DiffFile | null> {
  const unified = fullContext ? 999999 : 3;
  const diff = getFileDiffPatch(repoRoot, filePath, unified, compare, change);
  if (!diff.trim()) return null;

  const hash = createHash("sha1").update(diff).digest("hex");
  const theme = getShikiTheme(themeId);
  const cacheKey = `${getRepoCompareKey(repoRoot, compare)}:${change ?? ""}:${filePath}:${theme}:${fullContext ? "full" : "diff"}`;
  const cached = fileDiffCache.get(cacheKey);
  if (cached && cached.hash === hash) return cached.data;

  const files = parseDiff(diff);
  const file = files.find((item) => item.path === filePath) ?? files[0];
  if (!file) return null;
  if (change) file.change = change;

  await highlightDiff([file], themeId);
  fileDiffCache.set(cacheKey, { hash, data: file });
  return file;
}

function summarizeFiles(files: DiffFile[]) {
  return files.reduce(
    (acc, file) => {
      acc.files += 1;
      acc.additions += file.additions;
      acc.deletions += file.deletions;
      return acc;
    },
    { files: 0, additions: 0, deletions: 0 }
  );
}
