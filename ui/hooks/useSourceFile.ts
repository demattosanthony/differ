import { useEffect, useState } from "react";
import type { CompareSpec, SourceFileData } from "../types";
import type { ThemeId } from "../themes";
import { appendCompareParams } from "../utils/compare";
import { useListVersion } from "./useRepoChanges";

type SourceFileState = {
  data: SourceFileData | null;
  status: "idle" | "loading" | "error";
};

type SourceFileOptions = {
  enabled: boolean;
  filePath: string | null;
  themeId: ThemeId;
  compare: CompareSpec | null;
};

type SourceFileRequest = {
  filePath: string;
  themeId: ThemeId;
  compare: CompareSpec | null;
};

type CachedSource = { data: SourceFileData; etag: string | null };

const maxCachedSourceFiles = 120;
const sourceCache = new Map<string, CachedSource>();
const sourceRequests = new Map<string, Promise<CachedSource>>();

export function useSourceFile({
  enabled,
  filePath,
  themeId,
  compare,
}: SourceFileOptions): SourceFileState {
  const [data, setData] = useState<SourceFileData | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const compareKey = compare ? `${compare.mode}:${compare.base ?? ""}:${compare.head ?? ""}` : "default";
  const listVersion = useListVersion();

  useEffect(() => {
    if (!enabled || !filePath) {
      setData(null);
      setStatus("idle");
      return;
    }

    let cancelled = false;
    const request = { filePath, themeId, compare };
    const cached = getCachedSource(request);
    const showingThisFile = data?.path === filePath;

    if (cached) {
      if (data !== cached.data) setData(cached.data);
      setStatus("idle");
      // Revalidate against the server (ETag): unchanged → 304 no-op; changed → swap.
      revalidateSourceFile(request, cached.etag)
        .then((fresh) => {
          if (!cancelled && fresh) setData(fresh.data);
        })
        .catch(() => {});
    } else {
      if (!showingThisFile) {
        setData(null);
        setStatus("loading");
      } else {
        setStatus("idle");
      }
      loadSourceFile(request)
        .then((result) => {
          if (cancelled) return;
          setData(result.data);
          setStatus("idle");
        })
        .catch(() => {
          if (cancelled) return;
          if (showingThisFile) {
            setStatus("idle");
          } else {
            setData(null);
            setStatus("error");
          }
        });
    }

    return () => {
      cancelled = true;
    };
    // `data` is read for stale-while-revalidate but excluded from deps on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, filePath, themeId, compareKey, listVersion]);

  return { data, status };
}

function buildSourceFileUrl(request: SourceFileRequest) {
  const params = new URLSearchParams();
  params.set("path", request.filePath);
  params.set("theme", request.themeId);
  appendCompareParams(params, request.compare);
  return `/api/source-file?${params.toString()}`;
}

function loadSourceFile(request: SourceFileRequest): Promise<CachedSource> {
  const key = getSourceCacheKey(request);
  const cached = getCachedSourceByKey(key);
  if (cached) return Promise.resolve(cached);

  const inflight = sourceRequests.get(key);
  if (inflight) return inflight;

  const promise = fetch(buildSourceFileUrl(request))
    .then((res) => {
      if (!res.ok) return Promise.reject();
      const etag = res.headers.get("etag");
      return res.json().then((data: SourceFileData) => ({ data, etag }));
    })
    .then((value: CachedSource) => {
      rememberSource(key, value);
      return value;
    })
    .finally(() => {
      sourceRequests.delete(key);
    });

  sourceRequests.set(key, promise);
  return promise;
}

function revalidateSourceFile(request: SourceFileRequest, etag: string | null): Promise<CachedSource | null> {
  const headers: Record<string, string> = {};
  if (etag) headers["If-None-Match"] = etag;

  return fetch(buildSourceFileUrl(request), { headers, cache: "no-store" }).then((res) => {
    if (res.status === 304 || !res.ok) return null;
    const nextEtag = res.headers.get("etag");
    return res.json().then((data: SourceFileData) => {
      const value: CachedSource = { data, etag: nextEtag };
      rememberSource(getSourceCacheKey(request), value);
      return value;
    });
  });
}

function getCachedSource(request: SourceFileRequest) {
  return getCachedSourceByKey(getSourceCacheKey(request));
}

function getCachedSourceByKey(key: string) {
  const cached = sourceCache.get(key);
  if (!cached) return null;
  sourceCache.delete(key);
  sourceCache.set(key, cached);
  return cached;
}

function rememberSource(key: string, value: CachedSource) {
  sourceCache.set(key, value);
  while (sourceCache.size > maxCachedSourceFiles) {
    const oldestKey = sourceCache.keys().next().value;
    if (!oldestKey) return;
    sourceCache.delete(oldestKey);
  }
}

function getSourceCacheKey({ filePath, themeId, compare }: SourceFileRequest) {
  const compareKey = compare ? `${compare.mode}:${compare.base ?? ""}:${compare.head ?? ""}` : "default";
  return [compareKey, themeId, filePath].join("\0");
}
