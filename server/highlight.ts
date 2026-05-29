import path from "path";
import { getSharedHighlighter } from "@pierre/diffs";
import type { SupportedLanguages } from "@pierre/diffs";
import type { BundledLanguage, Highlighter, SpecialLanguage } from "shiki";
import type { DiffFile, SourceLine } from "../shared/types";
import { themes, type ThemeId } from "../shared/themes";

type ShikiLanguage = BundledLanguage | SpecialLanguage;

const languageByExtension: Record<string, ShikiLanguage> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  jsonc: "json",
  md: "markdown",
  mdx: "mdx",
  css: "css",
  scss: "scss",
  less: "less",
  html: "html",
  htm: "html",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  go: "go",
  rs: "rust",
  py: "python",
  java: "java",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  rb: "ruby",
  swift: "swift",
  sql: "sql",
  graphql: "graphql",
  gql: "graphql",
  gitignore: "codeowners",
};

const shikiThemes = [
  "dark-plus",
  "light-plus",
  "pierre-dark",
  "pierre-light",
  "gruvbox-dark-hard",
  "gruvbox-dark-soft",
  "gruvbox-light-medium",
  "dracula",
];

const shikiLanguages: SupportedLanguages[] = [
  "text",
  "typescript",
  "tsx",
  "javascript",
  "jsx",
  "json",
  "markdown",
  "mdx",
  "css",
  "scss",
  "less",
  "html",
  "yaml",
  "toml",
  "bash",
  "go",
  "rust",
  "python",
  "java",
  "c",
  "cpp",
  "csharp",
  "php",
  "ruby",
  "swift",
  "sql",
  "graphql",
  "dockerfile",
  "codeowners",
];

const themeById = new Map(themes.map((theme) => [theme.id, theme]));

let highlighterPromise: Promise<Highlighter> | null = null;

const getHighlighterInstance = () => {
  if (!highlighterPromise) {
    highlighterPromise = getSharedHighlighter({
      themes: shikiThemes,
      langs: shikiLanguages,
    }) as Promise<Highlighter>;
  }
  return highlighterPromise;
};

export function warmHighlighter() {
  return getHighlighterInstance();
}

export function getShikiTheme(themeId: ThemeId) {
  return themeById.get(themeId)?.shiki ?? "dark-plus";
}

export async function highlightDiff(files: DiffFile[], themeId: ThemeId) {
  const highlighter = await getHighlighterInstance();
  const theme = getShikiTheme(themeId);

  for (const file of files) {
    const lang = resolveLanguage(file.path);
    for (const hunk of file.hunks) {
      const code = hunk.lines.map((line) => line.content).join("\n");
      if (!code) continue;
      let tokensResult;
      try {
        tokensResult = await highlighter.codeToTokens(code, { lang, theme });
      } catch {
        tokensResult = await highlighter.codeToTokens(code, { lang: "text", theme });
      }
      const { tokens } = tokensResult;
      hunk.lines = hunk.lines.map((line, index) => ({
        ...line,
        html: tokens[index] ? tokensToHtml(tokens[index]) : undefined,
      }));
    }
  }
}

export async function highlightSource(filePath: string, content: string, themeId: ThemeId): Promise<SourceLine[]> {
  const highlighter = await getHighlighterInstance();
  const theme = getShikiTheme(themeId);
  const lang = resolveLanguage(filePath);
  const lines = splitSourceLines(content);

  if (!lines.length) return [];

  let tokensResult;
  try {
    tokensResult = await highlighter.codeToTokens(lines.join("\n"), { lang, theme });
  } catch {
    tokensResult = await highlighter.codeToTokens(lines.join("\n"), { lang: "text", theme });
  }

  return lines.map((line, index) => ({
    number: index + 1,
    content: line,
    html: tokensResult.tokens[index] ? tokensToHtml(tokensResult.tokens[index]) : undefined,
  }));
}

const splitSourceLines = (content: string) => {
  const lines = content.split(/\r?\n/);
  if (content.endsWith("\n")) lines.pop();
  return lines;
};

const resolveLanguage = (filePath: string) => {
  const base = path.basename(filePath);
  if (base.toLowerCase() === "dockerfile") return "dockerfile";
  const ext = path.extname(filePath).toLowerCase().replace(".", "");
  const normalizedExt = ext || (base.startsWith(".") ? base.slice(1).toLowerCase() : "");
  if (!normalizedExt) return languageByExtension.sh;
  return languageByExtension[normalizedExt] ?? "text";
};

const tokensToHtml = (tokens: Array<{ content: string; color?: string; fontStyle?: number }>) =>
  tokens
    .map((token) => {
      const styles: string[] = [];
      if (token.color) styles.push(`color:${token.color}`);
      if (token.fontStyle) {
        if (token.fontStyle & 1) styles.push("font-style:italic");
        if (token.fontStyle & 2) styles.push("font-weight:bold");
        if (token.fontStyle & 4) styles.push("text-decoration:underline");
      }
      const styleAttr = styles.length ? ` style=\"${styles.join(";")}\"` : "";
      return `<span${styleAttr}>${escapeHtml(token.content)}</span>`;
    })
    .join("");

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
