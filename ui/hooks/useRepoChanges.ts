import { useCallback, useSyncExternalStore } from "react";

// Single source of truth for live repo changes. One EventSource feeds two kinds
// of version signals:
//   - listVersion: bumps on any change, so the file list / project tree refetch.
//   - per-file version: bumps only for the files that actually changed, so a
//     file you are viewing never re-renders when an unrelated file is edited.
// A repo-wide change (staging, commit, branch switch) bumps `epoch`, which is
// part of every file's version and therefore invalidates them all at once.

type ChangePayload = { paths?: string[]; all?: boolean };
type Listener = () => void;

const listeners = new Set<Listener>();
const pathVersions = new Map<string, number>();
let epoch = 0;
let listVersion = 0;
let started = false;

function emit() {
  for (const listener of listeners) listener();
}

function applyChange(payload: ChangePayload) {
  listVersion += 1;
  if (payload.all || !payload.paths || payload.paths.length === 0) {
    epoch += 1;
    pathVersions.clear();
  } else {
    for (const path of payload.paths) {
      pathVersions.set(path, (pathVersions.get(path) ?? 0) + 1);
    }
  }
  emit();
}

function parsePayload(data: unknown): ChangePayload {
  if (typeof data !== "string" || data.length === 0) return { all: true };
  try {
    const parsed = JSON.parse(data);
    if (parsed && typeof parsed === "object") return parsed as ChangePayload;
  } catch {
    // Unknown payload — treat as repo-wide to stay correct.
  }
  return { all: true };
}

function ensureStarted() {
  if (started || typeof window === "undefined") return;
  started = true;
  const source = new EventSource("/api/watch");
  const handleDiff = (event: MessageEvent) => applyChange(parsePayload(event.data));
  source.addEventListener("diff", handleDiff);
  source.addEventListener("message", handleDiff);
}

function subscribe(listener: Listener) {
  ensureStarted();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getListVersion() {
  return listVersion;
}

// Imperative read for non-reactive call sites (e.g. prefetch cache keys).
export function getFileVersion(path: string | null): string {
  if (!path) return `${epoch}:0`;
  return `${epoch}:${pathVersions.get(path) ?? 0}`;
}

// Refetch trigger for list-level data (diff summary, project tree).
export function useListVersion(): number {
  return useSyncExternalStore(subscribe, getListVersion, getListVersion);
}

// Refetch trigger for a single file. The snapshot only changes when this file
// (or the whole repo) changes, so React skips re-rendering otherwise.
export function useFileVersion(path: string | null): string {
  const getSnapshot = useCallback(() => getFileVersion(path), [path]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
