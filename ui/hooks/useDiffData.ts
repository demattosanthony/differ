import { useEffect, useState } from "react";
import type { DiffData } from "../../shared/types";
import type { ThemeId } from "../../shared/themes";

export function useDiffData(themeId: ThemeId) {
  const [data, setData] = useState<DiffData | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    fetch(`/api/diff?theme=${encodeURIComponent(themeId)}`)
      .then((res) => res.json())
      .then((json) => setData(json))
      .catch(() => setData(null));
  }, [themeId, refreshTick]);

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
