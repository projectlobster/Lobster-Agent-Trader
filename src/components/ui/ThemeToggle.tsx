"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";
const KEY = "lighter-trader-theme";

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const stored = window.localStorage.getItem(KEY);
    if (stored === "light" || stored === "dark") {
      setTheme(stored);
      return;
    }
    setTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem(KEY, next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle color theme"
      className={className ?? "font-mono text-label-sm uppercase text-ink-muted transition-colors hover:text-ink"}
    >
      {theme === "dark" ? "LIGHT" : "DARK"}
    </button>
  );
}
