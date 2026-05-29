import { useEffect, useState } from "react";
import type { CompareSpec, DiffData } from "../../shared/types";
import type { ThemeId } from "../../shared/themes";
import { appendCompareParams } from "../utils/compare";
import { useListVersion } from "./useRepoChanges";

type DiffDataOptions = {
  themeId: ThemeId;
  compare: CompareSpec | null;
};

export function useDiffData({ themeId, compare }: DiffDataOptions) {
  const [data, setData] = useState<DiffData | null>(null);
  const listVersion = useListVersion();
  const compareKey = compare ? `${compare.mode}:${compare.base ?? ""}:${compare.head ?? ""}` : "default";

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    params.set("theme", themeId);
    appendCompareParams(params, compare);
    fetch(`/api/diff?${params.toString()}`)
      .then((res) => res.json())
      .then((json: DiffData) => {
        if (cancelled) return;
        // Keep the same object when nothing meaningful changed so the list and
        // every downstream consumer skip a re-render.
        setData((previous) => (previous && previous.revision === json.revision ? previous : json));
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [themeId, listVersion, compareKey]);

  return { data, refreshToken: listVersion };
}
