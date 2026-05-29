import { useEffect, useState } from "react";
import type { CompareSpec, SourceFileData } from "../types";
import type { ThemeId } from "../themes";
import { appendCompareParams } from "../utils/compare";

type SourceFileState = {
  data: SourceFileData | null;
  status: "idle" | "loading" | "error";
};

type SourceFileOptions = {
  enabled: boolean;
  filePath: string | null;
  themeId: ThemeId;
  compare: CompareSpec | null;
  refreshToken?: number;
};

type SourceFileRequest = {
  filePath: string;
  themeId: ThemeId;
  compare: CompareSpec | null;
  refreshToken?: number;
};

const maxCachedSourceFiles = 120;
const sourceCache = new Map<string, SourceFileData>();
const sourceRequests = new Map<string, Promise<SourceFileData>>();

export function useSourceFile({
  enabled,
  filePath,
  themeId,
  compare,
  refreshToken,
}: SourceFileOptions): SourceFileState {
  const [data, setData] = useState<SourceFileData | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const compareKey = compare ? `${compare.mode}:${compare.base ?? ""}:${compare.head ?? ""}` : "default";

  useEffect(() => {
    if (!enabled || !filePath) {
      setData(null);
      setStatus("idle");
      return;
    }

    let cancelled = false;
    const request = { filePath, themeId, compare, refreshToken };
    const cached = getCachedSource(request);
    if (cached) {
      setData(cached);
      setStatus("idle");
      return;
    }

    setData(null);
    setStatus("loading");
    loadSourceFile(request)
      .then((json) => {
        if (cancelled) return;
        setData(json);
        setStatus("idle");
      })
      .catch(() => {
        if (cancelled) return;
        setData(null);
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, filePath, themeId, compareKey, refreshToken]);

  return { data, status };
}

function loadSourceFile(request: SourceFileRequest) {
  const key = getSourceCacheKey(request);
  const cached = getCachedSourceByKey(key);
  if (cached) return Promise.resolve(cached);

  const inflight = sourceRequests.get(key);
  if (inflight) return inflight;

  const params = new URLSearchParams();
  params.set("path", request.filePath);
  params.set("theme", request.themeId);
  appendCompareParams(params, request.compare);

  const promise = fetch(`/api/source-file?${params.toString()}`)
    .then((res) => (res.ok ? res.json() : Promise.reject()))
    .then((json: SourceFileData) => {
      rememberSource(key, json);
      return json;
    })
    .finally(() => {
      sourceRequests.delete(key);
    });

  sourceRequests.set(key, promise);
  return promise;
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

function rememberSource(key: string, data: SourceFileData) {
  sourceCache.set(key, data);
  while (sourceCache.size > maxCachedSourceFiles) {
    const oldestKey = sourceCache.keys().next().value;
    if (!oldestKey) return;
    sourceCache.delete(oldestKey);
  }
}

function getSourceCacheKey({ filePath, themeId, compare, refreshToken }: SourceFileRequest) {
  const compareKey = compare ? `${compare.mode}:${compare.base ?? ""}:${compare.head ?? ""}` : "default";
  return [refreshToken ?? 0, compareKey, themeId, filePath].join("\0");
}
