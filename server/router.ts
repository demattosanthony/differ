import path from "path";
import type { ThemeId } from "../shared/themes";
import type { DiffNotifier } from "./notifier";
import { getDiffData, getFileDiff } from "./diffData";

type RequestHandlerOptions = {
  repoRoot: string;
  distDir: string;
  notifier: DiffNotifier;
};

export function createRequestHandler({ repoRoot, distDir, notifier }: RequestHandlerOptions) {
  return async (request: Request) => {
    const url = new URL(request.url);
    if (url.pathname === "/api/watch") {
      return notifier.connect();
    }

    if (url.pathname === "/api/diff") {
      const requestedTheme = (url.searchParams.get("theme") as ThemeId | null) ?? "vscode-dark";
      const data = await getDiffData(repoRoot, requestedTheme);
      return Response.json(data);
    }

    if (url.pathname === "/api/diff-file") {
      const filePath = url.searchParams.get("path");
      const requestedTheme = (url.searchParams.get("theme") as ThemeId | null) ?? "vscode-dark";
      const full = url.searchParams.get("full") === "1";
      if (!filePath) return new Response("Missing path", { status: 400 });
      const data = await getFileDiff(repoRoot, filePath, requestedTheme, full);
      if (!data) return new Response("Not found", { status: 404 });
      return Response.json(data);
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
