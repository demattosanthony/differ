import path from "path";
import { watch } from "fs";

// `onChange` receives the repo-relative path that changed, or `null` when the
// change is repo-wide / unknown (e.g. staging, commits, branch switches) and
// every file's diff must be considered stale.
export function startRepoWatcher(repoRoot: string, onChange: (changedPath: string | null) => void) {
  const ignoreRoots = new Set(["node_modules", ".differ-dist"]);
  const normalize = (value: string) => value.replace(/\\/g, "/");
  const shouldIgnore = (value: string) => {
    if (value === ".git" || value.startsWith(".git/")) return true;
    const root = value.split("/")[0];
    return ignoreRoots.has(root);
  };

  watch(repoRoot, { recursive: true }, (_event, filename) => {
    if (typeof filename !== "string") {
      onChange(null);
      return;
    }
    const normalized = normalize(filename);
    if (shouldIgnore(normalized)) return;
    onChange(normalized);
  });

  const gitIndex = path.join(repoRoot, ".git", "index");
  try {
    watch(gitIndex, () => onChange(null));
  } catch {
    // ignore missing git index
  }

  const gitDir = path.join(repoRoot, ".git");
  const gitWatchPaths = [
    path.join(gitDir, "HEAD"),
    path.join(gitDir, "packed-refs"),
    path.join(gitDir, "refs", "heads"),
    path.join(gitDir, "refs", "remotes"),
  ];
  for (const watchPath of gitWatchPaths) {
    try {
      watch(watchPath, () => onChange(null));
    } catch {
      // ignore missing git refs
    }
  }
}
