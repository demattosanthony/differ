import { useEffect, useState } from "react";
import type { CompareSpec, DiffFile } from "../../shared/types";
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
  full?: boolean;
  refreshToken?: number;
};

export function useFileDiff({
  enabled,
  filePath,
  themeId,
  compare,
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

    const controller = new AbortController();
    setDiff(null);
    setStatus("loading");
    const params = new URLSearchParams();
    params.set("path", filePath);
    params.set("theme", themeId);
    if (full) params.set("full", "1");
    appendCompareParams(params, compare);
    fetch(`/api/diff-file?${params.toString()}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((json) => {
        setDiff(json);
        setStatus("idle");
      })
      .catch((error) => {
        if (error?.name === "AbortError") return;
        setDiff(null);
        setStatus("error");
      });

    return () => controller.abort();
  }, [enabled, filePath, themeId, compareKey, full, refreshToken]);

  return { diff, status };
}
