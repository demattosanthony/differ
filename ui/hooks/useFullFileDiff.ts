import { useEffect, useState } from "react";
import type { CompareSpec, DiffFile } from "../../shared/types";
import type { ThemeId } from "../../shared/themes";
import { appendCompareParams } from "../utils/compare";

type FullFileState = {
  diff: DiffFile | null;
  status: "idle" | "loading" | "error";
};

type FullFileOptions = {
  enabled: boolean;
  filePath: string | null;
  themeId: ThemeId;
  compare: CompareSpec | null;
  revision?: string;
};

export function useFullFileDiff({ enabled, filePath, themeId, compare, revision }: FullFileOptions): FullFileState {
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
    setStatus("loading");
    const params = new URLSearchParams();
    params.set("path", filePath);
    params.set("theme", themeId);
    params.set("full", "1");
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
  }, [enabled, filePath, themeId, revision, compareKey]);

  return { diff, status };
}
