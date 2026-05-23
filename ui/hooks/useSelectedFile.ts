import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { ChangeSectionId, DiffFile } from "../types";

export type SelectedDiffFile = { path: string; change?: ChangeSectionId } | null;

const parseChange = (value: string | null): ChangeSectionId | undefined => {
  if (value === "staged" || value === "unstaged") return value;
  return undefined;
};

const getSelectedFromUrl = () => {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const path = params.get("file");
  if (!path) return null;
  return { path, change: parseChange(params.get("change")) };
};

const setSelectedInUrl = (selected: SelectedDiffFile) => {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (selected?.path) {
    url.searchParams.set("file", selected.path);
    if (selected.change) url.searchParams.set("change", selected.change);
    else url.searchParams.delete("change");
  } else {
    url.searchParams.delete("file");
    url.searchParams.delete("change");
  }
  if (url.href === window.location.href) return;
  window.history.replaceState({}, "", url);
};

export const useSelectedFile = (files: DiffFile[]) => {
  const [selected, setSelectedState] = useState<SelectedDiffFile>(() => getSelectedFromUrl());
  const setSelected = useCallback<Dispatch<SetStateAction<SelectedDiffFile>>>((nextValue) => {
    setSelectedState((previous) => {
      const next = typeof nextValue === "function" ? nextValue(previous) : nextValue;
      return selectionsEqual(previous, next) ? previous : next;
    });
  }, []);

  useEffect(() => {
    if (!files.length) return;
    setSelected((prev) => {
      const fromUrl = getSelectedFromUrl();
      if (fromUrl && containsSelection(files, fromUrl)) return normalizeSelection(files, fromUrl);
      if (prev && containsSelection(files, prev)) return normalizeSelection(files, prev);
      return fileToSelection(files[0]);
    });
  }, [files]);

  useEffect(() => {
    setSelectedInUrl(selected);
  }, [selected]);

  useEffect(() => {
    const handlePop = () => {
      const next = getSelectedFromUrl();
      setSelected(next);
    };
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, []);

  return [selected, setSelected] as const;
};

function containsSelection(files: DiffFile[], selected: NonNullable<SelectedDiffFile>) {
  return files.some((file) => matchesSelection(file, selected));
}

function normalizeSelection(files: DiffFile[], selected: NonNullable<SelectedDiffFile>) {
  return fileToSelection(files.find((file) => matchesSelection(file, selected)) ?? null);
}

function matchesSelection(file: DiffFile, selected: NonNullable<SelectedDiffFile>) {
  if (file.path !== selected.path) return false;
  return selected.change ? file.change === selected.change : true;
}

function fileToSelection(file: DiffFile | null | undefined): SelectedDiffFile {
  if (!file) return null;
  return file.change ? { path: file.path, change: file.change } : { path: file.path };
}

function selectionsEqual(left: SelectedDiffFile, right: SelectedDiffFile) {
  return left?.path === right?.path && left?.change === right?.change;
}
