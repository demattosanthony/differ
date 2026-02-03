import { useEffect } from "react";
import { themes, type ThemeId } from "../../shared/themes";

const themeById = new Map(themes.map((theme) => [theme.id, theme]));

export function useTheme(themeId: ThemeId) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const theme = themeById.get(themeId) ?? themes[0];
    document.documentElement.dataset.theme = theme.id;
    document.documentElement.style.colorScheme = theme.mode;
    updateThemeColor();
  }, [themeId]);
}

function updateThemeColor() {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) return;
  const color = getComputedStyle(document.documentElement).getPropertyValue("--bg-deep").trim();
  if (color) meta.setAttribute("content", color);
}
