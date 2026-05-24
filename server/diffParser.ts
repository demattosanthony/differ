import type { DiffFile, DiffHunk, DiffLine } from "../shared/types";

const parseHunkHeader = (header: string) => {
  const match = header.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
  if (!match) return { oldStart: 0, newStart: 0 };
  return { oldStart: Number(match[1]), newStart: Number(match[2]) };
};

export function parseDiff(diff: string): DiffFile[] {
  const files: DiffFile[] = [];
  const lines = diff.split(/\r?\n/);
  let currentFile: DiffFile | null = null;
  let currentHunk: DiffHunk | null = null;
  let oldLineNumber = 0;
  let newLineNumber = 0;
  let diffPosition = 0;
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
      diffPosition = 0;
      continue;
    }

    if (!currentFile) continue;

    if (line.startsWith("@@")) {
      currentHunk = { header: line, lines: [] };
      currentFile.hunks.push(currentHunk);
      const hunkRange = parseHunkHeader(line);
      oldLineNumber = hunkRange.oldStart;
      newLineNumber = hunkRange.newStart;
      continue;
    }

    if (isMetaLine(line)) {
      continue;
    }

    if (!currentHunk) continue;

    if (line.startsWith("+") && !line.startsWith("+++")) {
      currentFile.additions += 1;
      diffPosition += 1;
      currentHunk.lines.push(createDiffLine("add", line.slice(1), null, newLineNumber, diffPosition));
      newLineNumber += 1;
      continue;
    }

    if (line.startsWith("-") && !line.startsWith("---")) {
      currentFile.deletions += 1;
      diffPosition += 1;
      currentHunk.lines.push(createDiffLine("del", line.slice(1), oldLineNumber, null, diffPosition));
      oldLineNumber += 1;
      continue;
    }

    diffPosition += 1;
    currentHunk.lines.push(
      createDiffLine("context", line.startsWith(" ") ? line.slice(1) : line, oldLineNumber, newLineNumber, diffPosition)
    );
    oldLineNumber += 1;
    newLineNumber += 1;
  }

  return files;
}

function createDiffLine(
  type: DiffLine["type"],
  content: string,
  oldLineNumber: number | null,
  newLineNumber: number | null,
  diffPosition: number
): DiffLine {
  return {
    type,
    content,
    oldLineNumber,
    newLineNumber,
    diffPosition,
    reviewCoordinates: {
      ...(oldLineNumber === null ? {} : { LEFT: { side: "LEFT" as const, line: oldLineNumber, diffPosition } }),
      ...(newLineNumber === null ? {} : { RIGHT: { side: "RIGHT" as const, line: newLineNumber, diffPosition } }),
    },
  };
}
