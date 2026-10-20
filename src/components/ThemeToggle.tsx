import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const THEME_STORAGE_KEY = "theme";
const DEFAULT_THEME = "dark";

/**
 * XDEV-04 / defect XD-02. Both of these were unguarded, and BOTH are throw sites
 * in restricted-storage browsers: reading the `localStorage` property throws
 * `SecurityError` where site data is blocked, and `setItem` throws
 * `QuotaExceededError` in Safari private browsing (quota ~0). The read ran in a
 * `useState` initializer and the write ran in a `useEffect`, so either throw
 * escaped into React and unmounted the tree — a white screen, from a theme
 * preference. A theme is a preference: losing it must never cost the app.
 *
 * `typeof window` is not a sufficient guard here. It protects against SSR, not
 * against a browser that refuses storage while very much having a window.
 */
function readStoredTheme(): "dark" | "light" {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Storage unavailable — fall through to the default.
  }
  return DEFAULT_THEME;
}

function persistTheme(theme: "dark" | "light"): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage unavailable — the theme still applies for this tab's lifetime.
  }
}

export const ThemeToggle = () => {
  const [theme, setTheme] = useState<"dark" | "light">(readStoredTheme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.remove("light");
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
      root.classList.add("light");
    }
    persistTheme(theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className="h-8 w-8 rounded-full"
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {theme === "dark" ? (
        <Sun className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
      ) : (
        <Moon className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
      )}
    </Button>
  );
};
