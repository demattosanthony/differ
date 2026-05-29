import { useSyncExternalStore } from "react";

// Single source of truth for live repo changes. One EventSource feeds a single
// monotonic `listVersion` that bumps on any change. It is purely a "something
// changed, go revalidate" poke: consumers refetch the file list and revalidate
// the file on screen against the server (via ETag). Correctness never depends
// on which path the watcher reported — atomic saves report a temp file, so the
// path is unreliable, but the content hash on revalidation is not.

type Listener = () => void;

const listeners = new Set<Listener>();
let listVersion = 0;
let started = false;

function emit() {
  for (const listener of listeners) listener();
}

function ensureStarted() {
  if (started || typeof window === "undefined") return;
  started = true;
  const source = new EventSource("/api/watch");
  const bump = () => {
    listVersion += 1;
    emit();
  };
  source.addEventListener("diff", bump);
  source.addEventListener("message", bump);
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

// Refetch / revalidate trigger: bumps whenever anything in the repo changes.
export function useListVersion(): number {
  return useSyncExternalStore(subscribe, getListVersion, getListVersion);
}
