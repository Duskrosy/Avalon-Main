"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import type { UserPreferences } from "@/types/database";

type Theme = "light" | "dark" | "system" | "avalon";
type Accent = "blue" | "violet" | "teal" | "rose" | "amber" | "emerald" | "orange" | "indigo";
type Density = "comfortable" | "compact";

type ThemeContextValue = {
  theme: Theme;
  accent: Accent;
  density: Density;
  resolvedTheme: "light" | "dark";
  avalonUnlocked: boolean;
  materiaRevealed: boolean;
  setTheme: (t: Theme) => void;
  setAccent: (a: Accent) => void;
  setDensity: (d: Density) => void;
  setAvalonUnlocked: (u: boolean, opts?: { silent?: boolean }) => void;
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
  let resolved: "light" | "dark" = "light";

  root.classList.add("transitioning");
  root.classList.remove("dark", "theme-system", "avalon-brand");

  if (theme === "avalon") {
    root.classList.add("avalon-brand");
    resolved = "light";
  } else if (theme === "dark") {
    root.classList.add("dark");
    resolved = "dark";
  } else if (theme === "system") {
    root.classList.add("theme-system");
    resolved = getSystemTheme();
  }

  const accentClasses = ["accent-violet", "accent-teal", "accent-rose", "accent-amber", "accent-emerald", "accent-orange", "accent-indigo"];
  root.classList.remove(...accentClasses);
  if (theme !== "avalon" && accent !== "blue") root.classList.add(`accent-${accent}`);

  root.classList.remove("density-compact");
  if (density === "compact") root.classList.add("density-compact");

  setTimeout(() => root.classList.remove("transitioning"), 250);

  return resolved;
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function persistToServer(userId: string, prefs: Partial<UserPreferences>, immediate = false) {
  if (persistTimer) clearTimeout(persistTimer);
  const send = () => {
    fetch(`/api/users/${userId}/preferences`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prefs),
    }).catch(() => {});
  };
  if (immediate) send();
  else persistTimer = setTimeout(send, 500);
}

// Konami code: ↑ ↑ ↓ ↓ ← → ← → B A
const KONAMI = ["ArrowUp","ArrowUp","ArrowDown","ArrowDown","ArrowLeft","ArrowRight","ArrowLeft","ArrowRight","b","a"];

export function ThemeProvider({
  children,
  userId,
  initialPreferences,
}: {
  children: React.ReactNode;
  userId: string;
  initialPreferences: UserPreferences;
}) {
  const [theme, setThemeState] = useState<Theme>((initialPreferences.theme as Theme) ?? "light");
  const [accent, setAccentState] = useState<Accent>(initialPreferences.accent ?? "blue");
  const [density, setDensityState] = useState<Density>(initialPreferences.density ?? "comfortable");
  const [avalonUnlocked, setAvalonUnlockedState] = useState<boolean>(Boolean(initialPreferences.avalon_unlocked));
  const [materiaRevealed, setMateriaRevealed] = useState(false);
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const hideMateriaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // One-time migration: old localStorage flag → server
  useEffect(() => {
    try {
      const legacy = localStorage.getItem("avalon-brand") === "1" || localStorage.getItem("avalon-unlocked") === "1";
      if (legacy && !initialPreferences.avalon_unlocked) {
        setAvalonUnlockedState(true);
        persistToServer(userId, { avalon_unlocked: true }, true);
      }
      localStorage.removeItem("avalon-brand");
      localStorage.removeItem("avalon-unlocked");
    } catch {}
  }, [userId, initialPreferences.avalon_unlocked]);

  useEffect(() => {
    const resolved = applyThemeToDOM(theme, accent, density);
    setResolvedTheme(resolved);
    try {
      localStorage.setItem("avalon-theme", JSON.stringify({ theme, accent, density }));
    } catch {}
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

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // Konami code listener — reveals the materia for 15s
  useEffect(() => {
    let buffer: string[] = [];
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      buffer.push(key);
      if (buffer.length > KONAMI.length) buffer = buffer.slice(-KONAMI.length);
      if (buffer.length === KONAMI.length && buffer.every((k, i) => k === KONAMI[i])) {
        buffer = [];
        setMateriaRevealed(true);
        if (hideMateriaTimer.current) clearTimeout(hideMateriaTimer.current);
        hideMateriaTimer.current = setTimeout(() => setMateriaRevealed(false), 15000);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (hideMateriaTimer.current) clearTimeout(hideMateriaTimer.current);
    };
  }, []);

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

  const setAvalonUnlocked = useCallback((u: boolean, opts?: { silent?: boolean }) => {
    setAvalonUnlockedState(u);
    persistToServer(userId, { avalon_unlocked: u }, true);
    if (u && !opts?.silent) {
      setToastMessage("You've unlocked the secret theme, go to appearances to check it out");
    }
  }, [userId]);

  return (
    <ThemeContext value={{
      theme, accent, density, resolvedTheme, avalonUnlocked, materiaRevealed,
      setTheme, setAccent, setDensity, setAvalonUnlocked,
    }}>
      {children}
      {toastMessage && <AvalonUnlockToast message={toastMessage} onDismiss={() => setToastMessage(null)} />}
    </ThemeContext>
  );
}

function AvalonUnlockToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);
  return (
    <div
      className="fixed bottom-4 right-4 z-[100] transition-all duration-200"
      style={{
        transform: visible ? "translateY(0)" : "translateY(8px)",
        opacity: visible ? 1 : 0,
      }}
    >
      <div
        className="flex items-center gap-3 px-4 py-3 rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] text-sm font-medium max-w-sm"
        style={{
          background: "linear-gradient(135deg, #3a0a08 0%, #8a1a18 45%, #e6a84a 110%)",
          color: "#fff8e1",
          border: "1px solid rgba(245, 194, 74, 0.6)",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
          <defs>
            <radialGradient id="toast-materia" cx="35%" cy="30%" r="75%">
              <stop offset="0%" stopColor="#ff9a8a" />
              <stop offset="45%" stopColor="#e34a3a" />
              <stop offset="100%" stopColor="#3a0a08" />
            </radialGradient>
          </defs>
          <circle cx="16" cy="16" r="14" fill="url(#toast-materia)" stroke="#f5c24a" strokeWidth="1" />
          <circle cx="12" cy="11" r="3.5" fill="#ffffff" opacity="0.75" />
        </svg>
        <span className="flex-1 leading-snug">{message}</span>
        <button onClick={onDismiss} aria-label="Dismiss" className="opacity-70 hover:opacity-100">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
