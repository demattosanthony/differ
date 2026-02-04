import path from "path";
import type { CompareSpec } from "../shared/types";
import type { ThemeId } from "../shared/themes";
import type { DiffNotifier } from "./notifier";
import { getDiffData, getFileDiff } from "./diffData";
import { getOriginRepoInfo, normalizeCompare } from "./git";
import { createGitHubClient } from "./github";

type RequestHandlerOptions = {
  repoRoot: string;
  distDir: string;
  notifier: DiffNotifier;
  defaultCompare: CompareSpec;
};

export function createRequestHandler({ repoRoot, distDir, notifier, defaultCompare }: RequestHandlerOptions) {
  return async (request: Request) => {
    const url = new URL(request.url);
    const githubToken = request.headers.get("x-github-token");
    const toErrorResponse = (error: unknown, fallbackMessage = "GitHub request failed") => {
      if (error && typeof error === "object" && "status" in error) {
        const status = Number((error as { status?: number }).status) || 400;
        const message = error instanceof Error ? error.message : fallbackMessage;
        return new Response(message, { status });
      }
      const message = error instanceof Error ? error.message : fallbackMessage;
      return new Response(message, { status: 400 });
    };
    if (url.pathname === "/api/watch") {
      return notifier.connect();
    }

    if (url.pathname === "/api/diff") {
      const requestedTheme = (url.searchParams.get("theme") as ThemeId | null) ?? "vscode-dark";
      const compare = getCompareFromRequest(url, repoRoot, defaultCompare);
      try {
        const data = await getDiffData(repoRoot, requestedTheme, compare, githubToken);
        return Response.json(data);
      } catch (error) {
        return toErrorResponse(error, "Unable to load diff");
      }
    }

    if (url.pathname === "/api/diff-file") {
      const filePath = url.searchParams.get("path");
      const requestedTheme = (url.searchParams.get("theme") as ThemeId | null) ?? "vscode-dark";
      const full = url.searchParams.get("full") === "1";
      if (!filePath) return new Response("Missing path", { status: 400 });
      const compare = getCompareFromRequest(url, repoRoot, defaultCompare);
      try {
        const data = await getFileDiff(repoRoot, filePath, requestedTheme, full, compare, githubToken);
        if (!data) return new Response("Not found", { status: 404 });
        return Response.json(data);
      } catch (error) {
        return toErrorResponse(error, "Unable to load file");
      }
    }

    if (url.pathname === "/api/github/repo") {
      try {
        const repoInfo = getOriginRepoInfo(repoRoot);
        if (!repoInfo) return new Response("Missing GitHub origin", { status: 400 });
        return Response.json(repoInfo);
      } catch (error) {
        return toErrorResponse(error, "Unable to load repo info");
      }
    }

    if (url.pathname === "/api/github/pr") {
      try {
        const repoInfo = getOriginRepoInfo(repoRoot);
        const number = Number(url.searchParams.get("number"));
        if (!repoInfo) return new Response("Missing GitHub origin", { status: 400 });
        if (!githubToken) return new Response("Missing GitHub token", { status: 401 });
        if (!Number.isFinite(number) || number <= 0) return new Response("Missing PR number", { status: 400 });
        const client = createGitHubClient({ token: githubToken });
        const pr = await client.requestJson<any>(
          `/repos/${repoInfo.owner}/${repoInfo.repo}/pulls/${number}`
        );
        return Response.json({
          number: pr.number,
          title: pr.title,
          url: pr.html_url,
          headSha: pr.head?.sha ?? "",
          baseRef: pr.base?.ref ?? "",
          headRef: pr.head?.ref ?? "",
        });
      } catch (error) {
        return toErrorResponse(error, "Unable to load pull request");
      }
    }

    if (url.pathname === "/api/github/pr-files") {
      try {
        const repoInfo = getOriginRepoInfo(repoRoot);
        const number = Number(url.searchParams.get("number"));
        if (!repoInfo) return new Response("Missing GitHub origin", { status: 400 });
        if (!githubToken) return new Response("Missing GitHub token", { status: 401 });
        if (!Number.isFinite(number) || number <= 0) return new Response("Missing PR number", { status: 400 });
        const client = createGitHubClient({ token: githubToken });
        const files = await client.requestAllPages<any>(
          `/repos/${repoInfo.owner}/${repoInfo.repo}/pulls/${number}/files?per_page=100`
        );
        const response = files.map((file: any) => ({
          path: file.filename,
          viewed: typeof file.viewed === "boolean" ? file.viewed : undefined,
        }));
        return Response.json(response);
      } catch (error) {
        return toErrorResponse(error, "Unable to load PR files");
      }
    }

    if (url.pathname === "/api/github/pr-comments" && request.method === "GET") {
      try {
        const repoInfo = getOriginRepoInfo(repoRoot);
        const number = Number(url.searchParams.get("number"));
        if (!repoInfo) return new Response("Missing GitHub origin", { status: 400 });
        if (!githubToken) return new Response("Missing GitHub token", { status: 401 });
        if (!Number.isFinite(number) || number <= 0) return new Response("Missing PR number", { status: 400 });
        const client = createGitHubClient({ token: githubToken });
        const comments = await client.requestAllPages<any>(
          `/repos/${repoInfo.owner}/${repoInfo.repo}/pulls/${number}/comments?per_page=100`
        );
        const response = comments.map((comment: any) => ({
          id: comment.id,
          body: comment.body,
          path: comment.path,
          line: comment.line ?? null,
          side: comment.side ?? "RIGHT",
          startLine: comment.start_line ?? null,
          startSide: comment.start_side ?? null,
          inReplyToId: comment.in_reply_to_id ?? null,
          createdAt: comment.created_at,
          user: {
            login: comment.user?.login ?? "unknown",
            avatarUrl: comment.user?.avatar_url ?? "",
          },
        }));
        return Response.json(response);
      } catch (error) {
        return toErrorResponse(error, "Unable to load PR comments");
      }
    }

    if (url.pathname === "/api/github/pr-comments" && request.method === "POST") {
      try {
        const repoInfo = getOriginRepoInfo(repoRoot);
        if (!repoInfo) return new Response("Missing GitHub origin", { status: 400 });
        if (!githubToken) return new Response("Missing GitHub token", { status: 401 });
        const payload = await request.json();
        const number = Number(payload.number);
        const reviewId = payload.reviewId ? Number(payload.reviewId) : null;
        const path = String(payload.path ?? "");
        const line = Number(payload.line);
        const positionValue = payload.position != null ? Number(payload.position) : undefined;
        const side = payload.side === "LEFT" ? "LEFT" : "RIGHT";
        const body = String(payload.body ?? "");
        if (!Number.isFinite(number) || number <= 0) return new Response("Missing PR number", { status: 400 });
        if (!path || !body) {
          return new Response("Missing comment details", { status: 400 });
        }
        const hasPosition = typeof positionValue === "number" && Number.isFinite(positionValue) && positionValue > 0;
        if (!hasPosition && (!Number.isFinite(line) || line <= 0)) {
          return new Response("Missing comment details", { status: 400 });
        }
        if (reviewId && (!Number.isFinite(reviewId) || reviewId <= 0)) {
          return new Response("Invalid review id", { status: 400 });
        }
        const client = createGitHubClient({ token: githubToken });
        const pr = await client.requestJson<any>(
          `/repos/${repoInfo.owner}/${repoInfo.repo}/pulls/${number}`
        );
        const commentBody = {
          body,
          commit_id: pr.head?.sha,
          path,
          position: positionValue,
          line: hasPosition ? undefined : line,
          side: hasPosition ? undefined : side,
          start_line: hasPosition ? undefined : payload.startLine,
          start_side: hasPosition ? undefined : payload.startSide,
          pull_request_review_id: reviewId ?? undefined,
        };
        const response = await client.requestJson<any>(
          `/repos/${repoInfo.owner}/${repoInfo.repo}/pulls/${number}/comments`,
          {
            method: "POST",
            body: JSON.stringify(commentBody),
          }
        );
        return Response.json({
          id: response.id,
          body: response.body,
          path: response.path,
          line: response.line ?? null,
          side: response.side ?? "RIGHT",
          startLine: response.start_line ?? null,
          startSide: response.start_side ?? null,
          inReplyToId: response.in_reply_to_id ?? null,
          createdAt: response.created_at,
          user: {
            login: response.user?.login ?? "unknown",
            avatarUrl: response.user?.avatar_url ?? "",
          },
        });
      } catch (error) {
        return toErrorResponse(error, "Unable to create comment");
      }
    }

    if (url.pathname === "/api/github/pr-comments/reply" && request.method === "POST") {
      try {
        const repoInfo = getOriginRepoInfo(repoRoot);
        if (!repoInfo) return new Response("Missing GitHub origin", { status: 400 });
        if (!githubToken) return new Response("Missing GitHub token", { status: 401 });
        const payload = await request.json();
        const number = Number(payload.number);
        const commentId = Number(payload.commentId);
        const body = String(payload.body ?? "");
        if (!Number.isFinite(number) || number <= 0) return new Response("Missing PR number", { status: 400 });
        if (!Number.isFinite(commentId) || commentId <= 0 || !body) {
          return new Response("Missing reply details", { status: 400 });
        }
        const client = createGitHubClient({ token: githubToken });
        const response = await client.requestJson<any>(
          `/repos/${repoInfo.owner}/${repoInfo.repo}/pulls/${number}/comments/${commentId}/replies`,
          {
            method: "POST",
            body: JSON.stringify({ body }),
          }
        );
        return Response.json({ id: response.id });
      } catch (error) {
        return toErrorResponse(error, "Unable to reply to comment");
      }
    }

    if (url.pathname === "/api/github/pr-comments/update" && request.method === "PATCH") {
      try {
        const repoInfo = getOriginRepoInfo(repoRoot);
        if (!repoInfo) return new Response("Missing GitHub origin", { status: 400 });
        if (!githubToken) return new Response("Missing GitHub token", { status: 401 });
        const payload = await request.json();
        const commentId = Number(payload.commentId);
        const body = String(payload.body ?? "");
        if (!Number.isFinite(commentId) || commentId <= 0 || !body) {
          return new Response("Missing comment details", { status: 400 });
        }
        const client = createGitHubClient({ token: githubToken });
        const response = await client.requestJson<any>(
          `/repos/${repoInfo.owner}/${repoInfo.repo}/pulls/comments/${commentId}`,
          {
            method: "PATCH",
            body: JSON.stringify({ body }),
          }
        );
        return Response.json({ id: response.id });
      } catch (error) {
        return toErrorResponse(error, "Unable to update comment");
      }
    }

    if (url.pathname === "/api/github/pr-comments/delete" && request.method === "DELETE") {
      try {
        const repoInfo = getOriginRepoInfo(repoRoot);
        if (!repoInfo) return new Response("Missing GitHub origin", { status: 400 });
        if (!githubToken) return new Response("Missing GitHub token", { status: 401 });
        const payload = await request.json();
        const commentId = Number(payload.commentId);
        if (!Number.isFinite(commentId) || commentId <= 0) {
          return new Response("Missing comment id", { status: 400 });
        }
        const client = createGitHubClient({ token: githubToken });
        await client.request(`/repos/${repoInfo.owner}/${repoInfo.repo}/pulls/comments/${commentId}`, {
          method: "DELETE",
        });
        return new Response("", { status: 204 });
      } catch (error) {
        return toErrorResponse(error, "Unable to delete comment");
      }
    }

    if (url.pathname === "/api/github/user" && request.method === "GET") {
      try {
        if (!githubToken) return new Response("Missing GitHub token", { status: 401 });
        const client = createGitHubClient({ token: githubToken });
        const user = await client.requestJson<any>("/user");
        return Response.json({ login: user.login ?? "" });
      } catch (error) {
        return toErrorResponse(error, "Unable to load GitHub user");
      }
    }

    if (url.pathname === "/api/github/pr-reviews/start" && request.method === "POST") {
      try {
        const repoInfo = getOriginRepoInfo(repoRoot);
        if (!repoInfo) return new Response("Missing GitHub origin", { status: 400 });
        if (!githubToken) return new Response("Missing GitHub token", { status: 401 });
        const payload = await request.json();
        const number = Number(payload.number);
        if (!Number.isFinite(number) || number <= 0) return new Response("Missing PR number", { status: 400 });
        const client = createGitHubClient({ token: githubToken });
        const response = await client.requestJson<any>(
          `/repos/${repoInfo.owner}/${repoInfo.repo}/pulls/${number}/reviews`,
          { method: "POST", body: JSON.stringify({}) }
        );
        return Response.json({ id: response.id });
      } catch (error) {
        return toErrorResponse(error, "Unable to start review");
      }
    }

    if (url.pathname === "/api/github/pr-reviews/pending" && request.method === "GET") {
      try {
        const repoInfo = getOriginRepoInfo(repoRoot);
        const number = Number(url.searchParams.get("number"));
        if (!repoInfo) return new Response("Missing GitHub origin", { status: 400 });
        if (!githubToken) return new Response("Missing GitHub token", { status: 401 });
        if (!Number.isFinite(number) || number <= 0) return new Response("Missing PR number", { status: 400 });
        const client = createGitHubClient({ token: githubToken });
        const user = await client.requestJson<any>("/user");
        const reviews = await client.requestAllPages<any>(
          `/repos/${repoInfo.owner}/${repoInfo.repo}/pulls/${number}/reviews?per_page=100`
        );
        const pending = reviews.find(
          (review: any) => review.state === "PENDING" && review.user?.login === user.login
        );
        return Response.json({ id: pending?.id ?? null });
      } catch (error) {
        return toErrorResponse(error, "Unable to load pending review");
      }
    }

    if (url.pathname === "/api/github/pr-reviews/submit" && request.method === "POST") {
      try {
        const repoInfo = getOriginRepoInfo(repoRoot);
        if (!repoInfo) return new Response("Missing GitHub origin", { status: 400 });
        if (!githubToken) return new Response("Missing GitHub token", { status: 401 });
        const payload = await request.json();
        const number = Number(payload.number);
        const reviewId = Number(payload.reviewId);
        const event = String(payload.event ?? "COMMENT");
        const body = String(payload.body ?? "");
        if (!Number.isFinite(number) || number <= 0) return new Response("Missing PR number", { status: 400 });
        if (!Number.isFinite(reviewId) || reviewId <= 0) return new Response("Missing review id", { status: 400 });
        const client = createGitHubClient({ token: githubToken });
        const response = await client.requestJson<any>(
          `/repos/${repoInfo.owner}/${repoInfo.repo}/pulls/${number}/reviews/${reviewId}/events`,
          {
            method: "POST",
            body: JSON.stringify({ body, event }),
          }
        );
        return Response.json({ id: response.id });
      } catch (error) {
        return toErrorResponse(error, "Unable to submit review");
      }
    }

    if (url.pathname === "/api/github/pr-reviews/comments" && request.method === "GET") {
      try {
        const repoInfo = getOriginRepoInfo(repoRoot);
        const number = Number(url.searchParams.get("number"));
        const reviewId = Number(url.searchParams.get("reviewId"));
        if (!repoInfo) return new Response("Missing GitHub origin", { status: 400 });
        if (!githubToken) return new Response("Missing GitHub token", { status: 401 });
        if (!Number.isFinite(number) || number <= 0) return new Response("Missing PR number", { status: 400 });
        if (!Number.isFinite(reviewId) || reviewId <= 0) return new Response("Missing review id", { status: 400 });
        const client = createGitHubClient({ token: githubToken });
        const comments = await client.requestAllPages<any>(
          `/repos/${repoInfo.owner}/${repoInfo.repo}/pulls/${number}/reviews/${reviewId}/comments?per_page=100`
        );
        const response = comments.map((comment: any) => ({
          id: comment.id,
          body: comment.body,
          path: comment.path,
          line: comment.line ?? null,
          side: comment.side ?? "RIGHT",
          startLine: comment.start_line ?? null,
          startSide: comment.start_side ?? null,
          inReplyToId: comment.in_reply_to_id ?? null,
          createdAt: comment.created_at,
          user: {
            login: comment.user?.login ?? "unknown",
            avatarUrl: comment.user?.avatar_url ?? "",
          },
        }));
        return Response.json(response);
      } catch (error) {
        return toErrorResponse(error, "Unable to load review comments");
      }
    }

    if (url.pathname === "/api/github/pr-files/viewed" && request.method === "PUT") {
      try {
        const repoInfo = getOriginRepoInfo(repoRoot);
        const number = Number(url.searchParams.get("number"));
        const filePath = url.searchParams.get("path");
        if (!repoInfo) return new Response("Missing GitHub origin", { status: 400 });
        if (!githubToken) return new Response("Missing GitHub token", { status: 401 });
        if (!Number.isFinite(number) || number <= 0) return new Response("Missing PR number", { status: 400 });
        if (!filePath) return new Response("Missing file path", { status: 400 });
        const client = createGitHubClient({ token: githubToken });
        await client.request(
          `/repos/${repoInfo.owner}/${repoInfo.repo}/pulls/${number}/files/${encodeURIComponent(filePath)}/viewed`,
          { method: "PUT" }
        );
        return new Response("", { status: 204 });
      } catch (error) {
        return toErrorResponse(error, "Unable to mark file as viewed");
      }
    }

    if (url.pathname === "/api/github/pr-files/viewed" && request.method === "DELETE") {
      try {
        const repoInfo = getOriginRepoInfo(repoRoot);
        const number = Number(url.searchParams.get("number"));
        const filePath = url.searchParams.get("path");
        if (!repoInfo) return new Response("Missing GitHub origin", { status: 400 });
        if (!githubToken) return new Response("Missing GitHub token", { status: 401 });
        if (!Number.isFinite(number) || number <= 0) return new Response("Missing PR number", { status: 400 });
        if (!filePath) return new Response("Missing file path", { status: 400 });
        const client = createGitHubClient({ token: githubToken });
        await client.request(
          `/repos/${repoInfo.owner}/${repoInfo.repo}/pulls/${number}/files/${encodeURIComponent(filePath)}/viewed`,
          { method: "DELETE" }
        );
        return new Response("", { status: 204 });
      } catch (error) {
        return toErrorResponse(error, "Unable to unmark file as viewed");
      }
    }

    const filePath = url.pathname === "/" ? "/index.html" : url.pathname;
    const resolved = path.resolve(distDir, `.${filePath}`);
    if (!resolved.startsWith(distDir)) {
      return new Response("Not found", { status: 404 });
    }

    const file = Bun.file(resolved);
    if (!(await file.exists())) {
      return new Response("Not found", { status: 404 });
    }
    return new Response(file);
  };
}

function getCompareFromRequest(url: URL, repoRoot: string, fallback: CompareSpec): CompareSpec {
  const mode = url.searchParams.get("compare");
  const base = url.searchParams.get("base");
  const head = url.searchParams.get("head");
  const prNumber = url.searchParams.get("pr");
  if (!mode && !base && !head && !prNumber) return fallback;
  if (mode === "working") return { mode: "working" };
  if (mode === "pr") {
    const number = Number(prNumber);
    if (Number.isFinite(number) && number > 0) return { mode: "pr", number };
    return fallback;
  }
  if (mode) {
    return normalizeCompare(repoRoot, {
      mode,
      base: base ?? (fallback.mode === "range" ? fallback.base : null),
      head: head ?? (fallback.mode === "range" ? fallback.head : null),
    });
  }
  return normalizeCompare(repoRoot, { base, head });
}
