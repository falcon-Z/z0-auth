/** Resolved theme from the user's system preference (no stored override yet). */
export type ResolvedTheme = "light" | "dark";

export function resolveSystemTheme(): ResolvedTheme {
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme: ResolvedTheme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

/** Subscribe to OS theme changes; returns cleanup. Safe to call once per app load. */
export function initSystemTheme(onChange?: (theme: ResolvedTheme) => void): () => void {
  const mq = matchMedia("(prefers-color-scheme: dark)");
  const apply = () => {
    const theme = resolveSystemTheme();
    applyTheme(theme);
    onChange?.(theme);
  };
  apply();
  mq.addEventListener("change", apply);
  return () => mq.removeEventListener("change", apply);
}
