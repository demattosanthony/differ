import { useEffect, useState } from "react";
import type { CompareSpec, DiffData } from "../../shared/types";
import type { ThemeId } from "../../shared/themes";
import { appendCompareParams } from "../utils/compare";

type DiffDataOptions = {
  themeId: ThemeId;
  compare: CompareSpec | null;
  githubToken?: string | null;
};

export function useDiffData({ themeId, compare, githubToken }: DiffDataOptions) {
  const [data, setData] = useState<DiffData | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const compareKey = compare
    ? compare.mode === "pr"
      ? `pr:${compare.number}`
      : compare.mode === "range"
        ? `range:${compare.base ?? ""}:${compare.head ?? ""}`
        : "working"
    : "default";

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("theme", themeId);
    appendCompareParams(params, compare);
    fetch(`/api/diff?${params.toString()}`, {
      headers: githubToken ? { "x-github-token": githubToken } : undefined,
    })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((json) => setData(json))
      .catch(() => setData(null));
  }, [themeId, refreshTick, compareKey, githubToken]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const source = new EventSource("/api/watch");
    const handleDiff = () => setRefreshTick((prev) => prev + 1);
    source.addEventListener("diff", handleDiff);
    source.addEventListener("message", handleDiff);
    return () => source.close();
  }, []);

  return data;
}
