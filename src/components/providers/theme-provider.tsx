"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { UserPreferences } from "@/types/database";

type Theme = "light" | "dark" | "system";
type Accent = "blue" | "violet" | "teal" | "rose" | "amber" | "emerald" | "orange" | "indigo";
type Density = "comfortable" | "compact";

type ThemeContextValue = {
  theme: Theme;
  accent: Accent;
  density: Density;
  resolvedTheme: "light" | "dark";
  setTheme: (t: Theme) => void;
  setAccent: (a: Accent) => void;
  setDensity: (d: Density) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyThemeToDOM(theme: Theme, accent: Accent, density: Density) {
  const root = document.documentElement;
  const resolved = theme === "system" ? getSystemTheme() : theme;

  root.classList.add("transitioning");

  root.classList.remove("dark", "theme-system");
  if (theme === "dark") root.classList.add("dark");
  if (theme === "system") root.classList.add("theme-system");

  const accentClasses = ["accent-violet", "accent-teal", "accent-rose", "accent-amber", "accent-emerald", "accent-orange", "accent-indigo"];
  root.classList.remove(...accentClasses);
  if (accent !== "blue") root.classList.add(`accent-${accent}`);

  root.classList.remove("density-compact");
  if (density === "compact") root.classList.add("density-compact");

  setTimeout(() => root.classList.remove("transitioning"), 250);

  return resolved;
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function persistToServer(userId: string, prefs: Partial<UserPreferences>) {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    fetch(`/api/users/${userId}/preferences`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prefs),
    }).catch(() => {});
  }, 500);
}

export function ThemeProvider({
  children,
  userId,
  initialPreferences,
}: {
  children: React.ReactNode;
  userId: string;
  initialPreferences: UserPreferences;
}) {
  const [theme, setThemeState] = useState<Theme>(initialPreferences.theme ?? "light");
  const [accent, setAccentState] = useState<Accent>(initialPreferences.accent ?? "blue");
  const [density, setDensityState] = useState<Density>(initialPreferences.density ?? "comfortable");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const resolved = applyThemeToDOM(theme, accent, density);
    setResolvedTheme(resolved);
    localStorage.setItem("avalon-theme", JSON.stringify({ theme, accent, density }));
  }, [theme, accent, density]);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const resolved = applyThemeToDOM(theme, accent, density);
      setResolvedTheme(resolved);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme, accent, density]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    persistToServer(userId, { theme: t, accent, density });
  }, [userId, accent, density]);

  const setAccent = useCallback((a: Accent) => {
    setAccentState(a);
    persistToServer(userId, { theme, accent: a, density });
  }, [userId, theme, density]);

  const setDensity = useCallback((d: Density) => {
    setDensityState(d);
    persistToServer(userId, { theme, accent, density: d });
  }, [userId, theme, accent]);

  return (
    <ThemeContext value={{ theme, accent, density, resolvedTheme, setTheme, setAccent, setDensity }}>
      {children}
    </ThemeContext>
  );
}
