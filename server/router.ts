import path from "path";
import type { ChangeSectionId, CompareSpec } from "../shared/types";
import type { ThemeId } from "../shared/themes";
import type { DiffNotifier } from "./notifier";
import { getDiffData, getFileDiff } from "./diffData";
import { normalizeCompare } from "./git";
import {
  getPullRequestContext,
  getPullRequestReviewThreads,
  GitHubApiError,
  replyToPullRequestReviewThread,
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
        const body = await getJsonRequestBody(request);
        const pullRequestNumber = getPositiveInteger(body.number);
        const commentId = getPositiveInteger(body.commentId);
        const commentBody = typeof body.body === "string" ? body.body.trim() : "";

        if (!pullRequestNumber || !commentId || !commentBody) {
          return Response.json({ error: "Missing pull request number, comment ID, or body" }, { status: 400 });
        }

        const data = await replyToPullRequestReviewThread(repoRoot, pullRequestNumber, commentId, commentBody);
        return Response.json(data);
      } catch (error) {
        if (error instanceof GitHubApiError) {
          return Response.json({ error: error.message }, { status: error.status });
        }
        return Response.json({ error: "Unable to reply to pull request review thread" }, { status: 500 });
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

function getPositiveInteger(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(number) && number > 0 ? number : undefined;
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
