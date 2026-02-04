import path from "path";
import { watch } from "fs";

export function startRepoWatcher(repoRoot: string, onChange: () => void) {
  const ignoreRoots = new Set(["node_modules", ".differ-dist"]);
  const shouldIgnore = (value?: string) => {
    if (!value) return false;
    const normalized = value.replace(/\\/g, "/");
    if (normalized === ".git" || normalized.startsWith(".git/")) return true;
    const root = normalized.split("/")[0];
    return ignoreRoots.has(root);
  };

  watch(repoRoot, { recursive: true }, (_event, filename) => {
    if (typeof filename !== "string") {
      onChange();
      return;
    }
    if (shouldIgnore(filename)) return;
    onChange();
  });

  const gitIndex = path.join(repoRoot, ".git", "index");
  try {
    watch(gitIndex, () => onChange());
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
      watch(watchPath, () => onChange());
    } catch {
      // ignore missing git refs
    }
  }
}
