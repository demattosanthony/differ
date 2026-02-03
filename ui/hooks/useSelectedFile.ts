import { useEffect, useState } from "react";
import type { DiffFile } from "../types";

const getSelectedFromUrl = () => {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("file");
};

const setSelectedInUrl = (path: string | null) => {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (path) {
    url.searchParams.set("file", path);
  } else {
    url.searchParams.delete("file");
  }
  window.history.replaceState({}, "", url);
};

export const useSelectedFile = (files: DiffFile[]) => {
  const [selected, setSelected] = useState<string | null>(() => getSelectedFromUrl());

  useEffect(() => {
    if (!files.length) return;
    setSelected((prev) => {
      const fromUrl = getSelectedFromUrl();
      if (fromUrl && files.some((file) => file.path === fromUrl)) return fromUrl;
      if (prev && files.some((file) => file.path === prev)) return prev;
      return files[0]?.path ?? null;
    });
  }, [files]);

  useEffect(() => {
    if (selected) setSelectedInUrl(selected);
  }, [selected]);

  useEffect(() => {
    const handlePop = () => {
      const next = getSelectedFromUrl();
      if (next) setSelected(next);
    };
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, []);

  return [selected, setSelected] as const;
};
