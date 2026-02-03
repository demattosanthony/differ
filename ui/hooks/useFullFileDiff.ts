import { useEffect, useState } from "react";
import type { DiffFile } from "../../shared/types";
import type { ThemeId } from "../../shared/themes";

type FullFileState = {
  diff: DiffFile | null;
  status: "idle" | "loading" | "error";
};

type FullFileOptions = {
  enabled: boolean;
  filePath: string | null;
  themeId: ThemeId;
  revision?: string;
};

export function useFullFileDiff({ enabled, filePath, themeId, revision }: FullFileOptions): FullFileState {
  const [diff, setDiff] = useState<DiffFile | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    if (!enabled || !filePath) {
      setDiff(null);
      setStatus("idle");
      return;
    }

    const controller = new AbortController();
    setStatus("loading");
    fetch(
      `/api/diff-file?path=${encodeURIComponent(filePath)}&theme=${encodeURIComponent(themeId)}&full=1`,
      { signal: controller.signal }
    )
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
  }, [enabled, filePath, themeId, revision]);

  return { diff, status };
}
