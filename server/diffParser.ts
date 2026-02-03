import type { DiffFile, DiffHunk } from "../shared/types";

export function parseDiff(diff: string): DiffFile[] {
  const files: DiffFile[] = [];
  const lines = diff.split(/\r?\n/);
  let currentFile: DiffFile | null = null;
  let currentHunk: DiffHunk | null = null;
  const isMetaLine = (line: string) =>
    line.startsWith("index ") ||
    line.startsWith("--- ") ||
    line.startsWith("+++ ") ||
    line.startsWith("new file mode ") ||
    line.startsWith("deleted file mode ") ||
    line.startsWith("similarity index ") ||
    line.startsWith("rename from ") ||
    line.startsWith("rename to ") ||
    line.startsWith("old mode ") ||
    line.startsWith("new mode ") ||
    line.startsWith("Binary files ");

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      const match = line.split(" b/");
      const filePath = match[1] ?? "";
      currentFile = {
        path: filePath,
        additions: 0,
        deletions: 0,
        hunks: [],
      };
      files.push(currentFile);
      currentHunk = null;
      continue;
    }

    if (!currentFile) continue;

    if (line.startsWith("@@")) {
      currentHunk = { header: line, lines: [] };
      currentFile.hunks.push(currentHunk);
      continue;
    }

    if (isMetaLine(line)) {
      continue;
    }

    if (!currentHunk) continue;

    if (line.startsWith("+") && !line.startsWith("+++")) {
      currentFile.additions += 1;
      currentHunk.lines.push({ type: "add", content: line.slice(1) });
      continue;
    }

    if (line.startsWith("-") && !line.startsWith("---")) {
      currentFile.deletions += 1;
      currentHunk.lines.push({ type: "del", content: line.slice(1) });
      continue;
    }

    currentHunk.lines.push({ type: "context", content: line.startsWith(" ") ? line.slice(1) : line });
  }

  return files;
}
