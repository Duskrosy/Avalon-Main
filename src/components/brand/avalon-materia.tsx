"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "@/components/providers/theme-provider";
import { MateriaCursorHint, SummonSequence } from "@/components/brand/summon-sequence";

const REQUIRED_CLICKS = 7;
const RESET_WINDOW_MS = 2000;
const CURSOR_SFX = "/easter-egg/sfx-cursor.wav";
const ACTIVATION_SFX = "/easter-egg/sfx-activation.wav";

function playSfx(src: string, volume: number) {
  try {
    const audio = new Audio(src);
    audio.volume = volume;
    void audio.play().catch(() => {});
  } catch {
    /* noop */
  }
}

export function AvalonMateria({ size = 14 }: { size?: number }) {
  const { theme, avalonUnlocked, materiaRevealed, setTheme, setAvalonUnlocked } = useTheme();
  const [count, setCount] = useState(0);
  const [flash, setFlash] = useState(false);
  const [summoning, setSummoning] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Hint only shows on the Konami-triggered reveal, for users who haven't unlocked yet.
  const showHint = materiaRevealed && !avalonUnlocked && count === 0 && !summoning;

  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, []);

  const handleClick = useCallback(() => {
    if (summoning) return;
    if (resetTimer.current) clearTimeout(resetTimer.current);
    setCount((prev) => {
      const nextCount = prev + 1;
      if (nextCount >= REQUIRED_CLICKS) {
        playSfx(ACTIVATION_SFX, 0.7);
        if (!avalonUnlocked) {
          // First-time unlock — play the full summon sequence; congrats modal
          // announces the unlock, so suppress the default toast.
          setAvalonUnlocked(true, { silent: true });
          setSummoning(true);
        } else {
          // Already unlocked — preserve original toggle behavior.
          setTheme(theme === "avalon" ? "light" : "avalon");
          setFlash(true);
          setTimeout(() => setFlash(false), 1200);
        }
        return 0;
      }
      playSfx(CURSOR_SFX, 0.5);
      return nextCount;
    });
    resetTimer.current = setTimeout(() => setCount(0), RESET_WINDOW_MS);
  }, [avalonUnlocked, setAvalonUnlocked, setTheme, summoning, theme]);

  const handleSummonDismiss = useCallback(() => {
    setSummoning(false);
    // Apply the Avalon theme now that the user has confirmed.
    setTheme("avalon");
    setFlash(true);
    setTimeout(() => setFlash(false), 1200);
  }, [setTheme]);

  const progress = count / REQUIRED_CLICKS;
  const active = theme === "avalon";
  const label = active
    ? "Knights of Round — active. Click 7× to seal."
    : "Hidden materia. Click 7× in quick succession to summon.";

  return (
    <>
    <button
      type="button"
      onClick={handleClick}
      aria-label={label}
      title={label}
      className="group relative inline-flex items-center justify-center rounded-full transition-transform active:scale-90"
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 32 32"
        width={size}
        height={size}
        aria-hidden="true"
        style={{
          animation:
            flash
              ? "materia-pulse 0.6s ease-in-out 2"
              : count > 0
                ? "materia-pulse 1.2s ease-in-out infinite"
                : undefined,
          borderRadius: "50%",
          filter:
            count > 0 || flash
              ? "drop-shadow(0 0 4px rgba(220, 60, 60, 0.55))"
              : "drop-shadow(0 1px 1px rgba(0,0,0,0.35))",
          transition: "filter 180ms ease",
        }}
      >
        <defs>
          <radialGradient id="materia-body" cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#ff9a8a" />
            <stop offset="35%" stopColor="#e34a3a" />
            <stop offset="70%" stopColor="#9b1a18" />
            <stop offset="100%" stopColor="#3a0a08" />
          </radialGradient>
          <radialGradient id="materia-core" cx="50%" cy="50%" r="40%">
            <stop offset="0%" stopColor="#ffd0b0" stopOpacity="0.9" />
            <stop offset="60%" stopColor="#e34a3a" stopOpacity="0.0" />
          </radialGradient>
          <radialGradient id="materia-highlight" cx="32%" cy="25%" r="22%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="16" cy="16" r="14" fill="url(#materia-body)" stroke="#2a0605" strokeWidth="0.75" />
        <circle cx="16" cy="16" r="11" fill="url(#materia-core)" />
        <circle cx="12" cy="11" r="3.2" fill="url(#materia-highlight)" />
        <circle cx="20" cy="22" r="1.2" fill="#ffffff" opacity="0.18" />
        {active && (
          <circle cx="16" cy="16" r="15" fill="none" stroke="#f5c24a" strokeWidth="0.8" opacity="0.7" />
        )}
      </svg>

      {count > 0 && count < REQUIRED_CLICKS && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -inset-1 rounded-full"
          style={{
            background: `conic-gradient(rgba(220, 60, 60, 0.7) ${progress * 360}deg, transparent ${progress * 360}deg)`,
            mask: "radial-gradient(circle, transparent 58%, black 60%)",
            WebkitMask: "radial-gradient(circle, transparent 58%, black 60%)",
          }}
        />
      )}
      {showHint && <MateriaCursorHint />}
    </button>
    {summoning && <SummonSequence onDismiss={handleSummonDismiss} />}
    </>
  );
}
