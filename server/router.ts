import path from "path";
import type { ChangeSectionId, CompareSpec, DiffSide } from "../shared/types";
import type { ThemeId } from "../shared/themes";
import type { DiffNotifier } from "./notifier";
import { getDiffData, getFileDiff } from "./diffData";
import { normalizeCompare } from "./git";
import {
  createPullRequestReviewComment,
  deletePullRequestReviewComment,
  getPullRequestContext,
  getPullRequestReviewThreads,
  GitHubApiError,
  replyToPullRequestReviewThread,
  submitPullRequestReview,
  updatePullRequestReviewComment,
} from "./github";
import { getProjectFilesData, getSourceFile } from "./projectFiles";

type RequestHandlerOptions = {
  repoRoot: string;
  distDir: string;
  notifier: DiffNotifier;
  defaultCompare: CompareSpec;
};

export function createRequestHandler({ repoRoot, distDir, notifier, defaultCompare }: RequestHandlerOptions) {
  return async (request: Request) => {
    const url = new URL(request.url);
    if (url.pathname === "/api/watch") {
      return notifier.connect();
    }

    if (url.pathname === "/api/diff") {
      const requestedTheme = (url.searchParams.get("theme") as ThemeId | null) ?? "vscode-dark";
      const compare = getCompareFromRequest(url, repoRoot, defaultCompare);
      const data = await getDiffData(repoRoot, requestedTheme, compare);
      return Response.json(data);
    }

    if (url.pathname === "/api/diff-file") {
      const filePath = url.searchParams.get("path");
      const requestedTheme = (url.searchParams.get("theme") as ThemeId | null) ?? "vscode-dark";
      const full = url.searchParams.get("full") === "1";
      if (!filePath) return new Response("Missing path", { status: 400 });
      const compare = getCompareFromRequest(url, repoRoot, defaultCompare);
      const data = await getFileDiff(repoRoot, filePath, requestedTheme, full, compare, getChangeFromRequest(url));
      if (!data) return new Response("Not found", { status: 404 });
      return Response.json(data);
    }

    if (url.pathname === "/api/project-files") {
      const compare = getCompareFromRequest(url, repoRoot, defaultCompare);
      const data = getProjectFilesData(repoRoot, compare, url.searchParams.getAll("dir"), url.searchParams.get("q") ?? "");
      return Response.json(data);
    }

    if (url.pathname === "/api/source-file") {
      const filePath = url.searchParams.get("path");
      const requestedTheme = (url.searchParams.get("theme") as ThemeId | null) ?? "vscode-dark";
      if (!filePath) return new Response("Missing path", { status: 400 });
      const compare = getCompareFromRequest(url, repoRoot, defaultCompare);
      const data = await getSourceFile(repoRoot, filePath, requestedTheme, compare);
      if (!data) return new Response("Not found", { status: 404 });
      return Response.json(data);
    }

    if (url.pathname === "/api/github/pr-context") {
      const pullRequestNumber = getPullRequestNumberFromRequest(url);
      try {
        const data = await getPullRequestContext(repoRoot, pullRequestNumber);
        return Response.json(data);
      } catch (error) {
        if (error instanceof GitHubApiError) {
          return Response.json({ error: error.message }, { status: error.status });
        }
        return Response.json({ error: "Unable to load pull request context" }, { status: 500 });
      }
    }

    if (url.pathname === "/api/github/pr-review-threads") {
      const pullRequestNumber = getPullRequestNumberFromRequest(url);
      try {
        const data = await getPullRequestReviewThreads(repoRoot, pullRequestNumber);
        return Response.json(data);
      } catch (error) {
        if (error instanceof GitHubApiError) {
          return Response.json({ error: error.message }, { status: error.status });
        }
        return Response.json({ error: "Unable to load pull request review threads" }, { status: 500 });
      }
    }

    if (url.pathname === "/api/github/pr-review-replies" && request.method === "POST") {
      try {
        const mutation = await getReviewCommentMutationRequest(request);

        if (!mutation) {
          return Response.json({ error: "Missing pull request number, comment ID, or body" }, { status: 400 });
        }

        const data = await replyToPullRequestReviewThread(
          repoRoot,
          mutation.pullRequestNumber,
          mutation.commentId,
          mutation.body
        );
        return Response.json(data);
      } catch (error) {
        if (error instanceof GitHubApiError) {
          return Response.json({ error: error.message }, { status: error.status });
        }
        return Response.json({ error: "Unable to reply to pull request review thread" }, { status: 500 });
      }
    }

    if (url.pathname === "/api/github/pr-review-comments" && request.method === "PATCH") {
      try {
        const mutation = await getReviewCommentMutationRequest(request);

        if (!mutation) {
          return Response.json({ error: "Missing pull request number, comment ID, or body" }, { status: 400 });
        }

        const data = await updatePullRequestReviewComment(
          repoRoot,
          mutation.pullRequestNumber,
          mutation.commentId,
          mutation.body
        );
        return Response.json(data);
      } catch (error) {
        if (error instanceof GitHubApiError) {
          return Response.json({ error: error.message }, { status: error.status });
        }
        return Response.json({ error: "Unable to update pull request review comment" }, { status: 500 });
      }
    }

    if (url.pathname === "/api/github/pr-review-comments" && request.method === "POST") {
      try {
        const body = await getJsonRequestBody(request);
        const pullRequestNumber = getPositiveInteger(body.number);
        const line = getPositiveInteger(body.line);
        const path = typeof body.path === "string" ? body.path.trim() : "";
        const side = body.side === "LEFT" || body.side === "RIGHT" ? body.side : null;
        const commentBody = typeof body.body === "string" ? body.body.trim() : "";

        if (!pullRequestNumber || !line || !path || !side || !commentBody) {
          return Response.json({ error: "Missing pull request number, path, side, line, or body" }, { status: 400 });
        }

        const data = await createPullRequestReviewComment(repoRoot, pullRequestNumber, path, side, line, commentBody);
        return Response.json(data);
      } catch (error) {
        if (error instanceof GitHubApiError) {
          return Response.json({ error: error.message }, { status: error.status });
        }
        return Response.json({ error: "Unable to create pull request review comment" }, { status: 500 });
      }
    }

    if (url.pathname === "/api/github/pr-review-comments" && request.method === "DELETE") {
      try {
        const body = await getJsonRequestBody(request);
        const pullRequestNumber = getPositiveInteger(body.number);
        const commentId = getPositiveInteger(body.commentId);

        if (!pullRequestNumber || !commentId) {
          return Response.json({ error: "Missing pull request number or comment ID" }, { status: 400 });
        }

        const data = await deletePullRequestReviewComment(repoRoot, pullRequestNumber, commentId);
        return Response.json(data);
      } catch (error) {
        if (error instanceof GitHubApiError) {
          return Response.json({ error: error.message }, { status: error.status });
        }
        return Response.json({ error: "Unable to delete pull request review comment" }, { status: 500 });
      }
    }

    if (url.pathname === "/api/github/pr-reviews" && request.method === "POST") {
      try {
        const body = await getJsonRequestBody(request);
        const pullRequestNumber = getPositiveInteger(body.number);
        const event = getReviewEvent(body.event);
        const reviewBody = typeof body.body === "string" ? body.body.trim() : "";
        const comments = getPendingReviewComments(body.comments);

        if (!pullRequestNumber || !event) {
          return Response.json({ error: "Missing pull request number or review event" }, { status: 400 });
        }

        if (event === "REQUEST_CHANGES" && !reviewBody) {
          return Response.json({ error: "Request changes requires a summary" }, { status: 400 });
        }

        const data = await submitPullRequestReview(repoRoot, pullRequestNumber, event, reviewBody, comments);
        return Response.json(data);
      } catch (error) {
        if (error instanceof GitHubApiError) {
          return Response.json({ error: error.message }, { status: error.status });
        }
        return Response.json({ error: "Unable to submit pull request review" }, { status: 500 });
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

function getChangeFromRequest(url: URL): ChangeSectionId | undefined {
  const change = url.searchParams.get("change");
  return change === "staged" || change === "unstaged" ? change : undefined;
}

function getPullRequestNumberFromRequest(url: URL): number | undefined {
  const value = url.searchParams.get("number");
  if (!value) return undefined;
  return getPositiveInteger(value);
}

async function getJsonRequestBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function getReviewCommentMutationRequest(request: Request) {
  const body = await getJsonRequestBody(request);
  const pullRequestNumber = getPositiveInteger(body.number);
  const commentId = getPositiveInteger(body.commentId);
  const commentBody = typeof body.body === "string" ? body.body.trim() : "";

  if (!pullRequestNumber || !commentId || !commentBody) return null;
  return { pullRequestNumber, commentId, body: commentBody };
}

function getPositiveInteger(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(number) && number > 0 ? number : undefined;
}

function getReviewEvent(value: unknown) {
  return value === "COMMENT" || value === "APPROVE" || value === "REQUEST_CHANGES" ? value : null;
}

function getPendingReviewComments(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const comment = item as Record<string, unknown>;
    const path = typeof comment.path === "string" ? comment.path.trim() : "";
    const side = comment.side === "LEFT" || comment.side === "RIGHT" ? comment.side : null;
    const line = getPositiveInteger(comment.line);
    const body = typeof comment.body === "string" ? comment.body.trim() : "";
    return path && side && line && body ? [{ path, side: side as DiffSide, line, body }] : [];
  });
}

function getCompareFromRequest(url: URL, repoRoot: string, fallback: CompareSpec): CompareSpec {
  const mode = url.searchParams.get("compare");
  const base = url.searchParams.get("base");
  const head = url.searchParams.get("head");
  if (!mode && !base && !head) return fallback;
  if (mode === "working") return { mode: "working" };
  if (mode) {
    return normalizeCompare(repoRoot, {
      mode,
      base: base ?? fallback.base,
      head: head ?? fallback.head,
    });
  }
  return normalizeCompare(repoRoot, { base, head });
}
