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

    const controller = new AbortController();
    const params = new URLSearchParams();
    params.set("path", filePath);
    params.set("theme", themeId);
    appendCompareParams(params, compare);

    setData(null);
    setStatus("loading");
    fetch(`/api/source-file?${params.toString()}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((json) => {
        setData(json);
        setStatus("idle");
      })
      .catch((error) => {
        if (error?.name === "AbortError") return;
        setData(null);
        setStatus("error");
      });

    return () => controller.abort();
  }, [enabled, filePath, themeId, compareKey, refreshToken]);

  return { data, status };
}
