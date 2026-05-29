import { useEffect, useState } from "react";
import type { ChangeSectionId, CompareSpec, DiffFile } from "../../shared/types";
import type { ThemeId } from "../../shared/themes";
import { appendCompareParams } from "../utils/compare";

type FileDiffState = {
  diff: DiffFile | null;
  status: "idle" | "loading" | "error";
};

type FileDiffOptions = {
  enabled: boolean;
  filePath: string | null;
  themeId: ThemeId;
  compare: CompareSpec | null;
  change?: ChangeSectionId | null;
  full?: boolean;
  refreshToken?: number;
};

type FileDiffRequest = {
  filePath: string;
  themeId: ThemeId;
  compare: CompareSpec | null;
  change?: ChangeSectionId | null;
  full: boolean;
  refreshToken?: number;
};

type PrefetchFileDiffOptions = {
  enabled: boolean;
  files: DiffFile[];
  activeFile: DiffFile | null;
  themeId: ThemeId;
  compare: CompareSpec | null;
  full?: boolean;
  refreshToken?: number;
};

const maxCachedDiffs = 160;
const maxPrefetchFiles = 80;
const maxPrefetchChangedLines = 8000;
const prefetchConcurrency = 2;
const prefetchDelayMs = 120;
const diffCache = new Map<string, DiffFile>();
const diffRequests = new Map<string, Promise<DiffFile>>();

export function useFileDiff({
  enabled,
  filePath,
  themeId,
  compare,
  change,
  full = false,
  refreshToken,
}: FileDiffOptions): FileDiffState {
  const [diff, setDiff] = useState<DiffFile | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const compareKey = compare ? `${compare.mode}:${compare.base ?? ""}:${compare.head ?? ""}` : "default";

  useEffect(() => {
    if (!enabled || !filePath) {
      setDiff(null);
      setStatus("idle");
      return;
    }

    let cancelled = false;
    const request = { filePath, themeId, compare, change, full, refreshToken };
    const cached = getCachedDiff(request);
    if (cached) {
      setDiff(cached);
      setStatus("idle");
      return;
    }

    setDiff(null);
    setStatus("loading");
    loadFileDiff(request)
      .then((json) => {
        if (cancelled) return;
        setDiff(json);
        setStatus("idle");
      })
      .catch(() => {
        if (cancelled) return;
        setDiff(null);
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, filePath, themeId, compareKey, change, full, refreshToken]);

  return { diff, status };
}

export function usePrefetchFileDiffs({
  enabled,
  files,
  activeFile,
  themeId,
  compare,
  full = false,
  refreshToken,
}: PrefetchFileDiffOptions) {
  const compareKey = compare ? `${compare.mode}:${compare.base ?? ""}:${compare.head ?? ""}` : "default";

  useEffect(() => {
    if (!enabled || files.length === 0) return;

    let cancelled = false;
    let running = 0;
    let index = 0;
    const candidates = getPrefetchCandidates(files, activeFile);

    const pump = () => {
      if (cancelled) return;
      while (running < prefetchConcurrency && index < candidates.length) {
        const file = candidates[index];
        index += 1;
        const request = {
          filePath: file.path,
          themeId,
          compare,
          change: file.change ?? null,
          full,
          refreshToken,
        };
        if (getCachedDiff(request)) continue;

        running += 1;
        loadFileDiff(request)
          .catch(() => {})
          .finally(() => {
            running -= 1;
            pump();
          });
      }
    };

    const timer = window.setTimeout(pump, prefetchDelayMs);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeFile?.change, activeFile?.path, compareKey, enabled, files, full, refreshToken, themeId]);
}

function loadFileDiff(request: FileDiffRequest): Promise<DiffFile> {
  const key = getDiffCacheKey(request);
  const cached = getCachedDiffByKey(key);
  if (cached) return Promise.resolve(cached);

  const inflight = diffRequests.get(key);
  if (inflight) return inflight;

  const params = new URLSearchParams();
  params.set("path", request.filePath);
  params.set("theme", request.themeId);
  if (request.change) params.set("change", request.change);
  if (request.full) params.set("full", "1");
  appendCompareParams(params, request.compare);

  const promise = fetch(`/api/diff-file?${params.toString()}`)
    .then((res) => (res.ok ? res.json() : Promise.reject()))
    .then((json: DiffFile) => {
      rememberDiff(key, json);
      return json;
    })
    .finally(() => {
      diffRequests.delete(key);
    });

  diffRequests.set(key, promise);
  return promise;
}

function getPrefetchCandidates(files: DiffFile[], activeFile: DiffFile | null) {
  const candidates: DiffFile[] = [];
  const seen = new Set<string>();
  let changedLines = 0;

  const addCandidate = (file: DiffFile, force = false) => {
    const key = `${file.change ?? ""}:${file.path}`;
    if (seen.has(key) || candidates.length >= maxPrefetchFiles) return;
    const fileChangedLines = file.additions + file.deletions;
    if (!force && changedLines + fileChangedLines > maxPrefetchChangedLines) return;
    seen.add(key);
    candidates.push(file);
    changedLines += fileChangedLines;
  };

  if (activeFile) addCandidate(activeFile, true);
  for (const file of files) addCandidate(file);
  return candidates;
}

function getCachedDiff(request: FileDiffRequest) {
  return getCachedDiffByKey(getDiffCacheKey(request));
}

function getCachedDiffByKey(key: string) {
  const cached = diffCache.get(key);
  if (!cached) return null;
  diffCache.delete(key);
  diffCache.set(key, cached);
  return cached;
}

function rememberDiff(key: string, diff: DiffFile) {
  diffCache.set(key, diff);
  while (diffCache.size > maxCachedDiffs) {
    const oldestKey = diffCache.keys().next().value;
    if (!oldestKey) return;
    diffCache.delete(oldestKey);
  }
}

function getDiffCacheKey({ filePath, themeId, compare, change, full, refreshToken }: FileDiffRequest) {
  const compareKey = compare ? `${compare.mode}:${compare.base ?? ""}:${compare.head ?? ""}` : "default";
  return [refreshToken ?? 0, compareKey, themeId, full ? "full" : "diff", change ?? "", filePath].join("\0");
}
