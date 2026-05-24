import { describe, expect, test } from "bun:test";
import { parseGitHubRemoteUrl, toPullRequestReviewThreads } from "./github";

describe("parseGitHubRemoteUrl", () => {
  test("parses HTTPS GitHub remotes", () => {
    expect(parseGitHubRemoteUrl("https://github.com/demattosanthony/differ.git")).toEqual({
      owner: "demattosanthony",
      name: "differ",
    });
  });

  test("parses SSH GitHub remotes", () => {
    expect(parseGitHubRemoteUrl("git@github.com:demattosanthony/differ.git")).toEqual({
      owner: "demattosanthony",
      name: "differ",
    });
  });

  test("ignores non-GitHub remotes", () => {
    expect(parseGitHubRemoteUrl("https://gitlab.com/demattosanthony/differ.git")).toBeNull();
  });
});

describe("toPullRequestReviewThreads", () => {
  test("groups review comment replies under their root comment", () => {
    const threads = toPullRequestReviewThreads([
      {
        id: 101,
        pull_request_review_id: 10,
        diff_hunk: "@@ -1 +1 @@",
        path: "shared/types.ts",
        position: 3,
        original_position: 3,
        user: { login: "alice" },
        body: "Root comment",
        created_at: "2026-05-24T01:00:00Z",
        updated_at: "2026-05-24T01:00:00Z",
        html_url: "https://github.com/example/repo/pull/1#discussion_r101",
        line: 8,
        original_line: 8,
        side: "RIGHT",
        start_line: null,
        original_start_line: null,
        start_side: null,
      },
      {
        id: 102,
        pull_request_review_id: 10,
        in_reply_to_id: 101,
        diff_hunk: "@@ -1 +1 @@",
        path: "shared/types.ts",
        position: 3,
        original_position: 3,
        user: { login: "bob" },
        body: "Reply",
        created_at: "2026-05-24T01:01:00Z",
        updated_at: "2026-05-24T01:01:00Z",
        html_url: "https://github.com/example/repo/pull/1#discussion_r102",
        line: 8,
        original_line: 8,
        side: "RIGHT",
        start_line: null,
        original_start_line: null,
        start_side: null,
      },
    ]);

    expect(threads).toEqual([
      {
        id: "101",
        path: "shared/types.ts",
        side: "RIGHT",
        line: 8,
        startSide: null,
        startLine: null,
        diffHunk: "@@ -1 +1 @@",
        outdated: false,
        comments: [
          {
            id: 101,
            reviewId: 10,
            parentId: null,
            author: "alice",
            body: "Root comment",
            url: "https://github.com/example/repo/pull/1#discussion_r101",
            createdAt: "2026-05-24T01:00:00Z",
            updatedAt: "2026-05-24T01:00:00Z",
          },
          {
            id: 102,
            reviewId: 10,
            parentId: 101,
            author: "bob",
            body: "Reply",
            url: "https://github.com/example/repo/pull/1#discussion_r102",
            createdAt: "2026-05-24T01:01:00Z",
            updatedAt: "2026-05-24T01:01:00Z",
          },
        ],
      },
    ]);
  });

  test("marks comments without current line positions as outdated", () => {
    const [thread] = toPullRequestReviewThreads([
      {
        id: 201,
        pull_request_review_id: null,
        diff_hunk: "@@ -1 +1 @@",
        path: "server/github.ts",
        position: null,
        original_position: 4,
        user: null,
        body: "Outdated",
        created_at: "2026-05-24T01:00:00Z",
        updated_at: "2026-05-24T01:00:00Z",
        html_url: "https://github.com/example/repo/pull/1#discussion_r201",
        line: null,
        original_line: 11,
        side: "RIGHT",
        start_line: null,
        original_start_line: null,
        start_side: null,
      },
    ]);

    expect(thread.outdated).toBe(true);
    expect(thread.line).toBeNull();
  });
});
