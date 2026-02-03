export const themes = [
  { id: "vscode-dark", label: "VS Code Dark", mode: "dark", shiki: "dark-plus" },
  { id: "vscode-light", label: "VS Code Light", mode: "light", shiki: "light-plus" },
  { id: "pierre-dark", label: "Pierre Dark", mode: "dark", shiki: "pierre-dark" },
  { id: "pierre-light", label: "Pierre Light", mode: "light", shiki: "pierre-light" },
  { id: "gruvbox-dark-hard", label: "Gruvbox Dark Hard", mode: "dark", shiki: "gruvbox-dark-hard" },
  { id: "gruvbox-dark-soft", label: "Gruvbox Dark Soft", mode: "dark", shiki: "gruvbox-dark-soft" },
  { id: "gruvbox-light", label: "Gruvbox Light", mode: "light", shiki: "gruvbox-light-medium" },
  { id: "dracula", label: "Dracula", mode: "dark", shiki: "dracula" },
] as const;

export type ThemeId = (typeof themes)[number]["id"];
export type ThemeMode = (typeof themes)[number]["mode"];
export type Theme = (typeof themes)[number];
