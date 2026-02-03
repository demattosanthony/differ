export const iconNames = [
  "Folder",
  "FolderOpen",
  "Document",
  "Typescript",
  "TypescriptDef",
  "React_ts",
  "Javascript",
  "React",
  "Json",
  "Markdown",
  "Css",
  "Sass",
  "Html",
  "Yaml",
  "Go",
  "Rust",
  "Python",
  "Java",
  "C",
  "H",
  "Cpp",
  "Hpp",
  "Csharp",
  "Php",
  "Ruby",
  "Console",
  "Database",
] as const;

export type IconName = (typeof iconNames)[number];

const extensionIcons: Record<string, IconName> = {
  "d.ts": "TypescriptDef",
  ts: "Typescript",
  tsx: "React_ts",
  js: "Javascript",
  jsx: "React",
  json: "Json",
  md: "Markdown",
  mdx: "Markdown",
  css: "Css",
  scss: "Sass",
  html: "Html",
  htm: "Html",
  yml: "Yaml",
  yaml: "Yaml",
  go: "Go",
  rs: "Rust",
  py: "Python",
  java: "Java",
  c: "C",
  h: "H",
  cpp: "Cpp",
  cc: "Cpp",
  cxx: "Cpp",
  hpp: "Hpp",
  cs: "Csharp",
  php: "Php",
  rb: "Ruby",
  sh: "Console",
  bash: "Console",
  zsh: "Console",
  sql: "Database",
};

const defaultFileIcon: IconName = "Document";
const defaultFolderIcon: IconName = "Folder";
const defaultFolderOpenIcon: IconName = "FolderOpen";

const basenameOf = (p: string) =>
  p
    .replace(/[/\\]+$/, "")
    .split(/[\\/]/)
    .pop() ?? "";

const extensionOf = (name: string) => {
  const lower = name.toLowerCase();
  if (lower.endsWith(".d.ts")) return "d.ts";
  const idx = lower.lastIndexOf(".");
  return idx === -1 ? "" : lower.slice(idx + 1);
};

export function chooseIconName(path: string, type: "file" | "directory", expanded: boolean): IconName {
  if (type === "directory") {
    return expanded ? defaultFolderOpenIcon : defaultFolderIcon;
  }

  const base = basenameOf(path);
  const ext = extensionOf(base);
  if (ext && extensionIcons[ext]) return extensionIcons[ext];
  return defaultFileIcon;
}
