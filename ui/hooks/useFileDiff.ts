import { useEffect, useState } from "react";
import type { ChangeSectionId, CompareSpec, DiffFile } from "../../shared/types";
import type { ThemeId } from "../../shared/themes";
import { appendCompareParams } from "../utils/compare";
import { useListVersion } from "./useRepoChanges";

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
};

type FileDiffRequest = {
  filePath: string;
  themeId: ThemeId;
  compare: CompareSpec | null;
  change?: ChangeSectionId | null;
  full: boolean;
};

type CachedDiff = { diff: DiffFile; etag: string | null };

type PrefetchFileDiffOptions = {
  enabled: boolean;
  files: DiffFile[];
  activeFile: DiffFile | null;
  themeId: ThemeId;
  compare: CompareSpec | null;
  full?: boolean;
};

const maxCachedDiffs = 160;
const maxPrefetchFiles = 80;
const maxPrefetchChangedLines = 8000;
const prefetchConcurrency = 2;
const prefetchDelayMs = 120;
const diffCache = new Map<string, CachedDiff>();
const diffRequests = new Map<string, Promise<CachedDiff>>();

export function useFileDiff({
  enabled,
  filePath,
  themeId,
  compare,
  change,
  full = false,
}: FileDiffOptions): FileDiffState {
  const [diff, setDiff] = useState<DiffFile | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const compareKey = compare ? `${compare.mode}:${compare.base ?? ""}:${compare.head ?? ""}` : "default";
  const listVersion = useListVersion();

  useEffect(() => {
    if (!enabled || !filePath) {
      setDiff(null);
      setStatus("idle");
      return;
    }

    let cancelled = false;
    const request = { filePath, themeId, compare, change, full };
    const cached = getCachedDiff(request);
    const showingThisFile = diff?.path === filePath;

    if (cached) {
      if (diff !== cached.diff) setDiff(cached.diff);
      setStatus("idle");
      // Verify against the server on every change. The watcher can't be trusted
      // (atomic saves report a temp path), so the content hash (ETag) is the only
      // reliable freshness check. Unchanged → 304, no-op; changed → swap in place.
      revalidateFileDiff(request, cached.etag)
        .then((fresh) => {
          if (!cancelled && fresh) setDiff(fresh.diff);
        })
        .catch(() => {});
    } else {
      // No cached content for this file/params yet: blank to a spinner only when
      // we are not already showing this file (first open or a file switch).
      if (!showingThisFile) {
        setDiff(null);
        setStatus("loading");
      } else {
        setStatus("idle");
      }
      loadFileDiff(request)
        .then((result) => {
          if (cancelled) return;
          setDiff(result.diff);
          setStatus("idle");
        })
        .catch(() => {
          if (cancelled) return;
          if (showingThisFile) {
            setStatus("idle");
          } else {
            setDiff(null);
            setStatus("error");
          }
        });
    }

    return () => {
      cancelled = true;
    };
    // `diff` is read for stale-while-revalidate but excluded from deps on purpose:
    // only the request inputs and `listVersion` should retrigger this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, filePath, themeId, compareKey, change, full, listVersion]);

  return { diff, status };
}

export function usePrefetchFileDiffs({
  enabled,
  files,
  activeFile,
  themeId,
  compare,
  full = false,
}: PrefetchFileDiffOptions) {
  const compareKey = compare ? `${compare.mode}:${compare.base ?? ""}:${compare.head ?? ""}` : "default";
  const listVersion = useListVersion();

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
  }, [activeFile?.change, activeFile?.path, compareKey, enabled, files, full, listVersion, themeId]);
}

function buildDiffFileUrl(request: FileDiffRequest) {
  const params = new URLSearchParams();
  params.set("path", request.filePath);
  params.set("theme", request.themeId);
  if (request.change) params.set("change", request.change);
  if (request.full) params.set("full", "1");
  appendCompareParams(params, request.compare);
  return `/api/diff-file?${params.toString()}`;
}

function loadFileDiff(request: FileDiffRequest): Promise<CachedDiff> {
  const key = getDiffCacheKey(request);
  const cached = getCachedDiffByKey(key);
  if (cached) return Promise.resolve(cached);

  const inflight = diffRequests.get(key);
  if (inflight) return inflight;

  const promise = fetch(buildDiffFileUrl(request))
    .then((res) => {
      if (!res.ok) return Promise.reject();
      const etag = res.headers.get("etag");
      return res.json().then((diff: DiffFile) => ({ diff, etag }));
    })
    .then((value: CachedDiff) => {
      rememberDiff(key, value);
      return value;
    })
    .finally(() => {
      diffRequests.delete(key);
    });

  diffRequests.set(key, promise);
  return promise;
}

// Conditional revalidation: returns null when the server confirms 304 (unchanged),
// or the fresh diff (and refreshes the cache) when the content has changed.
function revalidateFileDiff(request: FileDiffRequest, etag: string | null): Promise<CachedDiff | null> {
  const headers: Record<string, string> = {};
  if (etag) headers["If-None-Match"] = etag;

  return fetch(buildDiffFileUrl(request), { headers, cache: "no-store" }).then((res) => {
    if (res.status === 304 || !res.ok) return null;
    const nextEtag = res.headers.get("etag");
    return res.json().then((diff: DiffFile) => {
      const value: CachedDiff = { diff, etag: nextEtag };
      rememberDiff(getDiffCacheKey(request), value);
      return value;
    });
  });
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

function rememberDiff(key: string, value: CachedDiff) {
  diffCache.set(key, value);
  while (diffCache.size > maxCachedDiffs) {
    const oldestKey = diffCache.keys().next().value;
    if (!oldestKey) return;
    diffCache.delete(oldestKey);
  }
}

function getDiffCacheKey({ filePath, themeId, compare, change, full }: FileDiffRequest) {
  const compareKey = compare ? `${compare.mode}:${compare.base ?? ""}:${compare.head ?? ""}` : "default";
  return [compareKey, themeId, full ? "full" : "diff", change ?? "", filePath].join("\0");
}
