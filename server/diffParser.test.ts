import { describe, expect, test } from "bun:test";
import { parseDiff } from "./diffParser";

describe("parseDiff", () => {
  test("adds line numbers and review coordinates for each diff line", () => {
    const [file] = parseDiff(`diff --git a/src/example.ts b/src/example.ts
index 1111111..2222222 100644
--- a/src/example.ts
+++ b/src/example.ts
@@ -10,3 +10,4 @@ export function example() {
 const kept = true;
-const removed = true;
+const added = true;
+const addedLater = true;
 }`);

    expect(file.path).toBe("src/example.ts");
    expect(file.hunks[0].lines).toEqual([
      {
        type: "context",
        content: "const kept = true;",
        oldLineNumber: 10,
        newLineNumber: 10,
        diffPosition: 1,
        reviewCoordinates: {
          LEFT: { side: "LEFT", line: 10, diffPosition: 1 },
          RIGHT: { side: "RIGHT", line: 10, diffPosition: 1 },
        },
      },
      {
        type: "del",
        content: "const removed = true;",
        oldLineNumber: 11,
        newLineNumber: null,
        diffPosition: 2,
        reviewCoordinates: {
          LEFT: { side: "LEFT", line: 11, diffPosition: 2 },
        },
      },
      {
        type: "add",
        content: "const added = true;",
        oldLineNumber: null,
        newLineNumber: 11,
        diffPosition: 3,
        reviewCoordinates: {
          RIGHT: { side: "RIGHT", line: 11, diffPosition: 3 },
        },
      },
      {
        type: "add",
        content: "const addedLater = true;",
        oldLineNumber: null,
        newLineNumber: 12,
        diffPosition: 4,
        reviewCoordinates: {
          RIGHT: { side: "RIGHT", line: 12, diffPosition: 4 },
        },
      },
      {
        type: "context",
        content: "}",
        oldLineNumber: 12,
        newLineNumber: 13,
        diffPosition: 5,
        reviewCoordinates: {
          LEFT: { side: "LEFT", line: 12, diffPosition: 5 },
          RIGHT: { side: "RIGHT", line: 13, diffPosition: 5 },
        },
      },
    ]);
  });

  test("resets diff positions for each file", () => {
    const files = parseDiff(`diff --git a/a.ts b/a.ts
index 1111111..2222222 100644
--- a/a.ts
+++ b/a.ts
@@ -1 +1 @@
-old
+new
diff --git a/b.ts b/b.ts
index 3333333..4444444 100644
--- a/b.ts
+++ b/b.ts
@@ -5 +5 @@
-before
+after`);

    expect(files[0].hunks[0].lines.map((line) => line.diffPosition)).toEqual([1, 2]);
    expect(files[1].hunks[0].lines.map((line) => line.diffPosition)).toEqual([1, 2]);
  });
});
