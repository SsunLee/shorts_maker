export type AppTheme = "light" | "dark";

const THEME_STORAGE_KEY = "shorts-maker:theme";
export const THEME_CHANGED_EVENT = "shorts-maker:theme-changed";

export function normalizeTheme(value: unknown): AppTheme {
  return value === "dark" ? "dark" : "light";
}

export function getStoredTheme(): AppTheme {
  if (typeof window === "undefined") {
    return "light";
  }
  return normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
}

export function applyTheme(theme: AppTheme): void {
  if (typeof document === "undefined") {
    return;
  }
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

export function setStoredTheme(theme: AppTheme): void {
  if (typeof window === "undefined") {
    return;
  }
  const nextTheme = normalizeTheme(theme);
  window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  applyTheme(nextTheme);
  window.dispatchEvent(
    new CustomEvent(THEME_CHANGED_EVENT, {
      detail: { theme: nextTheme }
    })
  );
}
