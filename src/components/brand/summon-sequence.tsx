"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const CURSOR_SFX = "/easter-egg/sfx-cursor.wav";
const CONFIRM_SFX = "/easter-egg/sfx-confirm.wav";
const CURSOR_IMG = "/easter-egg/ff7-cursor.webp";

type WeaponKind =
  | "sword"
  | "lance"
  | "rod"
  | "mace"
  | "hammer"
  | "wand"
  | "trident"
  | "staff"
  | "naginata"
  | "axe"
  | "excalibur";

type Knight = {
  kind: WeaponKind;
  color: string;
};

const KNIGHTS: Knight[] = [
  { kind: "sword", color: "#d8d4c8" },
  { kind: "lance", color: "#c0c4cc" },
  { kind: "rod", color: "#ff6a3a" },
  { kind: "mace", color: "#b0a890" },
  { kind: "sword", color: "#e0dccf" },
  { kind: "hammer", color: "#8a8070" },
  { kind: "wand", color: "#9ccfff" },
  { kind: "trident", color: "#b8b8d0" },
  { kind: "staff", color: "#d6a8ff" },
  { kind: "naginata", color: "#c8c0a8" },
  { kind: "axe", color: "#a89880" },
  { kind: "sword", color: "#cfc8b8" },
  { kind: "excalibur", color: "#ffe08a" },
];

function WeaponIcon({ kind, color, size = 60 }: { kind: WeaponKind; color: string; size?: number }) {
  const common = { fill: color, stroke: "#2a2418", strokeWidth: 0.5 };
  switch (kind) {
    case "sword":
      return (
        <svg viewBox="0 0 16 60" width={size * 0.35} height={size}>
          <path d="M 7 1 L 9 1 L 9 42 L 8 48 L 7 42 Z" {...common} />
          <rect x="3" y="40" width="10" height="2" {...common} />
          <rect x="6" y="42" width="4" height="7" fill="#4a3820" />
          <circle cx="8" cy="51" r="2" fill={color} />
        </svg>
      );
    case "lance":
      return (
        <svg viewBox="0 0 16 80" width={size * 0.28} height={size * 1.2}>
          <path d="M 8 1 L 11 10 L 8 14 L 5 10 Z" {...common} />
          <rect x="7" y="14" width="2" height="56" fill="#6a4a28" />
          <rect x="6" y="70" width="4" height="5" {...common} />
        </svg>
      );
    case "rod":
      return (
        <svg viewBox="0 0 20 60" width={size * 0.4} height={size}>
          <rect x="9" y="18" width="2" height="40" fill="#6a4a28" />
          <circle cx="10" cy="12" r="7" {...common} />
          <circle cx="10" cy="12" r="4" fill="#fff3b0" opacity="0.7" />
        </svg>
      );
    case "mace":
      return (
        <svg viewBox="0 0 24 64" width={size * 0.45} height={size}>
          <rect x="11" y="20" width="2" height="42" fill="#6a4a28" />
          <circle cx="12" cy="12" r="10" {...common} />
          {[0, 72, 144, 216, 288].map((a) => {
            const rad = (a * Math.PI) / 180;
            return <circle key={a} cx={12 + Math.cos(rad) * 10} cy={12 + Math.sin(rad) * 10} r="2.5" {...common} />;
          })}
        </svg>
      );
    case "hammer":
      return (
        <svg viewBox="0 0 28 64" width={size * 0.5} height={size}>
          <rect x="13" y="22" width="2" height="40" fill="#6a4a28" />
          <rect x="2" y="4" width="24" height="18" rx="2" {...common} />
        </svg>
      );
    case "wand":
      return (
        <svg viewBox="0 0 20 60" width={size * 0.4} height={size}>
          <rect x="9" y="14" width="2" height="44" fill="#4a4a6a" />
          <path d="M 10 2 L 14 10 L 10 14 L 6 10 Z" {...common} />
        </svg>
      );
    case "trident":
      return (
        <svg viewBox="0 0 24 80" width={size * 0.4} height={size * 1.15}>
          <rect x="11" y="20" width="2" height="58" fill="#6a4a28" />
          <path d="M 12 0 L 14 18 L 10 18 Z" {...common} />
          <path d="M 4 4 L 6 20 L 3 20 Z" {...common} />
          <path d="M 20 4 L 18 20 L 21 20 Z" {...common} />
          <rect x="3" y="18" width="18" height="2" {...common} />
        </svg>
      );
    case "staff":
      return (
        <svg viewBox="0 0 20 64" width={size * 0.4} height={size}>
          <rect x="9" y="18" width="2" height="44" fill="#5a3a28" />
          <circle cx="10" cy="10" r="6" {...common} />
          <circle cx="10" cy="10" r="3" fill="#fff" opacity="0.4" />
        </svg>
      );
    case "naginata":
      return (
        <svg viewBox="0 0 20 80" width={size * 0.3} height={size * 1.25}>
          <path d="M 8 2 Q 14 10 10 18 L 8 18 L 7 16 Z" {...common} />
          <rect x="7" y="18" width="2" height="58" fill="#4a2818" />
        </svg>
      );
    case "axe":
      return (
        <svg viewBox="0 0 32 64" width={size * 0.55} height={size}>
          <rect x="15" y="22" width="2" height="40" fill="#6a4a28" />
          <path d="M 16 4 Q 28 8 30 20 Q 28 22 16 22 Q 4 22 2 20 Q 4 8 16 4 Z" {...common} />
        </svg>
      );
    case "excalibur":
      return (
        <svg viewBox="0 0 20 80" width={size * 0.38} height={size * 1.25}>
          <defs>
            <linearGradient id="exc-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fff4c0" />
              <stop offset="100%" stopColor={color} />
            </linearGradient>
          </defs>
          <path d="M 9 1 L 11 1 L 11 54 L 10 62 L 9 54 Z" fill="url(#exc-grad)" stroke="#7a5a1e" strokeWidth="0.4" />
          <rect x="3" y="52" width="14" height="2.5" fill="#d4a84a" />
          <rect x="7.5" y="55" width="5" height="10" fill="#3a2818" />
          <circle cx="10" cy="67" r="3" fill="#d4a84a" />
          <circle cx="10" cy="67" r="1.5" fill="#ff5555" />
        </svg>
      );
    default:
      return null;
  }
}

function Materia({ size = 96, active = false, intense = false }: { size?: number; active?: boolean; intense?: boolean }) {
  const gid = `m-${size}`;
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      style={{
        animation: intense ? "summon-breath 0.6s ease-in-out infinite" : "summon-breath 2.2s ease-in-out infinite",
        borderRadius: "50%",
      }}
    >
      <defs>
        <radialGradient id={`${gid}-body`} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#ff9a8a" />
          <stop offset="35%" stopColor="#e34a3a" />
          <stop offset="70%" stopColor="#9b1a18" />
          <stop offset="100%" stopColor="#3a0a08" />
        </radialGradient>
        <radialGradient id={`${gid}-core`} cx="50%" cy="50%" r="40%">
          <stop offset="0%" stopColor="#ffd0b0" stopOpacity="0.9" />
          <stop offset="60%" stopColor="#e34a3a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${gid}-hl`} cx="32%" cy="25%" r="22%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="14" fill={`url(#${gid}-body)`} stroke="#2a0605" strokeWidth="0.75" />
      <circle cx="16" cy="16" r="11" fill={`url(#${gid}-core)`} />
      <circle cx="12" cy="11" r="3.2" fill={`url(#${gid}-hl)`} />
      <circle cx="20" cy="22" r="1.2" fill="#ffffff" opacity="0.18" />
      {active && <circle cx="16" cy="16" r="15" fill="none" stroke="#f5c24a" strokeWidth="0.8" opacity="0.7" />}
    </svg>
  );
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Fullscreen animated overlay. Ends with a "Congratulations!" modal.
 * `onDismiss` is called after the user clicks Okay; parent should call
 * setAvalonUnlocked(true, { silent: true }) before mounting this (or in onDismiss).
 */
export function SummonSequence({ onDismiss }: { onDismiss: () => void }) {
  // stage: 0 idle, 1 shake, 2 flash+rings, 3 banner, 4 knights surround,
  // 5 strike (weapons plunge), 6 beam + screen white, 7 congrats modal
  const [stage, setStage] = useState(0);
  const [showCongrats, setShowCongrats] = useState(false);
  const [buttonHover, setButtonHover] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const reduced = useMemo(() => prefersReducedMotion(), []);

  useEffect(() => {
    if (reduced) {
      setStage(7);
      setShowCongrats(true);
      return;
    }
    const schedule = (ms: number, fn: () => void) => {
      timers.current.push(setTimeout(fn, ms));
    };
    schedule(150, () => setStage(1));
    schedule(700, () => setStage(2));
    schedule(1200, () => setStage(3));
    schedule(2000, () => setStage(4));
    schedule(4200, () => setStage(5));
    schedule(5000, () => setStage(6));
    schedule(6100, () => {
      setStage(7);
      setShowCongrats(true);
    });
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [reduced]);

  const playSound = useCallback((src: string, volume = 0.7) => {
    try {
      const audio = new Audio(src);
      audio.volume = volume;
      void audio.play().catch(() => {});
    } catch {
      /* noop */
    }
  }, []);

  const handleOkayHover = useCallback(() => {
    if (buttonHover) return;
    setButtonHover(true);
    playSound(CURSOR_SFX, 0.55);
  }, [buttonHover, playSound]);

  const handleOkayClick = useCallback(() => {
    playSound(CONFIRM_SFX, 0.75);
    // brief fade delay so the click sound isn't cut off on unmount
    setTimeout(onDismiss, 120);
  }, [onDismiss, playSound]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Summon: Ultimate End"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "radial-gradient(ellipse at center 55%, rgba(26,42,90,0.92) 0%, rgba(10,15,46,0.97) 45%, rgba(0,0,0,0.98) 90%)",
        backdropFilter: "blur(2px)",
        overflow: "hidden",
        color: "#ece8dc",
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {/* Summon banner */}
      {stage >= 3 && !showCongrats && (
        <div
          style={{
            position: "absolute",
            top: "10%",
            left: "50%",
            transform: "translateX(-50%)",
            animation: "summon-fade-up 0.5s ease forwards",
            zIndex: 10,
          }}
        >
          <div
            style={{
              background: "linear-gradient(180deg, #2e4680 0%, #1a2a5a 50%, #0f1a3e 100%)",
              border: "2px solid #c4c4c4",
              borderRadius: 6,
              boxShadow: "0 0 0 2px #555, 0 4px 20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.2)",
              padding: "18px 36px",
              minWidth: 560,
              textAlign: "center",
              fontFamily: '"Times New Roman", serif',
              fontWeight: 700,
              fontSize: 30,
              letterSpacing: "0.02em",
              textShadow: "2px 2px 0 #000, 1px 1px 0 #000",
              color: "#fff",
            }}
          >
            Summon: <span style={{ color: "#ffd88a" }}>Ultimate End</span>
          </div>
        </div>
      )}

      {/* Center stage */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Expanding rings */}
        {stage >= 2 && stage < 4 && [0, 0.2, 0.4].map((d) => (
          <div
            key={d}
            style={{
              position: "absolute",
              width: 80,
              height: 80,
              borderRadius: "50%",
              border: "2px solid #e34a3a",
              animation: `summon-ring 1.8s cubic-bezier(.2,.6,.3,1) ${d}s infinite`,
            }}
          />
        ))}

        {/* Initial flash */}
        {stage === 2 && (
          <div
            style={{
              position: "absolute",
              width: 160,
              height: 160,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(255,230,180,0.9), rgba(227,74,58,0.4) 40%, transparent 70%)",
              animation: "summon-flash 1.4s cubic-bezier(.3,.6,.4,1) forwards",
            }}
          />
        )}

        {/* Materia — shakes at stage 1, charges at stage 5, gone after beam */}
        {!showCongrats && stage < 6 && (
          <div
            style={{
              animation:
                stage === 5
                  ? "summon-charge 0.9s cubic-bezier(.4,.1,.2,1) forwards"
                  : stage === 1
                    ? "summon-shake 0.4s ease-in-out infinite"
                    : "none",
              zIndex: 5,
              position: "relative",
            }}
          >
            <Materia size={stage >= 1 ? 96 : 64} active={stage >= 2} intense={stage >= 1} />
          </div>
        )}

        {/* Slash-trails during strike */}
        {stage === 5 &&
          KNIGHTS.map((k, i) => {
            const angle = i * (360 / 13) - 90;
            const rad = (angle * Math.PI) / 180;
            const radius = 180;
            const x = Math.cos(rad) * radius;
            const y = Math.sin(rad) * radius;
            const volley = i % 2 === 0 ? i / 2 : 6 + (i - 1) / 2;
            const delay = volley * 0.05;
            return (
              <div
                key={`streak-${i}`}
                style={{
                  position: "absolute",
                  left: `calc(50% + ${x}px)`,
                  top: `calc(50% + ${y}px)`,
                  width: radius,
                  height: 2,
                  transformOrigin: "right center",
                  transform: `translateY(-1px) rotate(${angle + 180}deg)`,
                  background: `linear-gradient(to left, transparent 0%, ${k.color} 30%, #fff 85%, transparent 100%)`,
                  boxShadow: `0 0 6px ${k.color}, 0 0 12px rgba(255,240,200,0.6)`,
                  animation: `summon-streak-slash 0.45s cubic-bezier(.2,.7,.3,1) ${delay}s backwards`,
                  zIndex: 7,
                  mixBlendMode: "screen",
                }}
              />
            );
          })}

        {/* Beam payoff */}
        {stage === 6 && (
          <>
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: 1400,
                height: 1400,
                background:
                  "conic-gradient(from 0deg, transparent 0deg, rgba(255,245,200,0.55) 4deg, transparent 8deg, transparent 56deg, rgba(255,230,160,0.5) 60deg, transparent 64deg, transparent 116deg, rgba(255,245,200,0.55) 120deg, transparent 124deg, transparent 176deg, rgba(255,230,160,0.5) 180deg, transparent 184deg, transparent 236deg, rgba(255,245,200,0.55) 240deg, transparent 244deg, transparent 296deg, rgba(255,230,160,0.5) 300deg, transparent 304deg, transparent 356deg, rgba(255,245,200,0.55) 360deg)",
                animation: "summon-godrays 1.1s cubic-bezier(.3,.7,.3,1) forwards",
                zIndex: 7,
                pointerEvents: "none",
                mixBlendMode: "screen",
                filter: "blur(0.5px)",
                transform: "translate(-50%, -50%)",
              }}
            />
            <div
              style={{
                position: "fixed",
                inset: 0,
                background:
                  "linear-gradient(to right, transparent 0%, transparent 42%, rgba(255,220,140,0.6) 46%, rgba(255,240,200,1) 50%, rgba(255,220,140,0.6) 54%, transparent 58%, transparent 100%)",
                animation: "summon-pillar-ignite 0.45s cubic-bezier(.2,.9,.3,1) forwards, summon-pillar-fade 0.6s 0.8s ease forwards",
                filter: "blur(1px)",
                zIndex: 8,
                pointerEvents: "none",
                mixBlendMode: "screen",
              }}
            />
            <div
              style={{
                position: "fixed",
                inset: 0,
                background:
                  "linear-gradient(to right, transparent 0%, transparent 47%, rgba(255,255,255,1) 50%, transparent 53%, transparent 100%)",
                animation: "summon-pillar-ignite 0.35s 0.05s cubic-bezier(.2,.9,.3,1) forwards, summon-pillar-fade 0.6s 0.8s ease forwards",
                zIndex: 9,
                pointerEvents: "none",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: 900,
                height: 10,
                borderRadius: "50%",
                background:
                  "linear-gradient(to right, transparent 0%, rgba(255,240,200,0.5) 20%, rgba(255,255,255,1) 50%, rgba(255,240,200,0.5) 80%, transparent 100%)",
                boxShadow: "0 0 20px rgba(255,240,200,0.8)",
                animation: "summon-flare-h 1.1s cubic-bezier(.2,.8,.3,1) forwards",
                zIndex: 10,
                pointerEvents: "none",
                mixBlendMode: "screen",
                filter: "blur(1px)",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: 8,
                height: 700,
                borderRadius: "50%",
                background:
                  "linear-gradient(to bottom, transparent 0%, rgba(255,240,200,0.4) 20%, rgba(255,255,255,1) 50%, rgba(255,240,200,0.4) 80%, transparent 100%)",
                boxShadow: "0 0 16px rgba(255,240,200,0.7)",
                animation: "summon-flare-v 1.1s cubic-bezier(.2,.8,.3,1) forwards",
                zIndex: 10,
                pointerEvents: "none",
                mixBlendMode: "screen",
                filter: "blur(0.5px)",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: 260,
                height: 260,
                borderRadius: "50%",
                background:
                  "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(255,248,220,0.95) 15%, rgba(255,220,140,0.6) 40%, rgba(255,180,80,0.25) 65%, transparent 80%)",
                animation: "summon-flare-burst 1.1s cubic-bezier(.2,.8,.3,1) forwards",
                zIndex: 11,
                pointerEvents: "none",
                mixBlendMode: "screen",
              }}
            />
          </>
        )}

        {/* 13 knights surrounding the materia */}
        {stage >= 4 && stage < 6 && !showCongrats &&
          KNIGHTS.map((k, i) => {
            const angle = i * (360 / 13) - 90;
            const rad = (angle * Math.PI) / 180;
            const radius = 180;
            const x = Math.cos(rad) * radius;
            const y = Math.sin(rad) * radius;
            const rotation = angle - 90;
            const striking = stage === 5;
            const fromX = Math.cos(rad) * (radius * 5);
            const fromY = Math.sin(rad) * (radius * 5);
            const volley = i % 2 === 0 ? i / 2 : 6 + (i - 1) / 2;
            const portalDelay = i * 0.05;
            const strikeDelay = volley * 0.05;
            const portalDur = 0.55;
            const anim = striking
              ? `summon-knight-strike 0.55s cubic-bezier(.6,.0,.7,1) ${strikeDelay}s forwards`
              : `summon-knight-portal ${portalDur}s cubic-bezier(.2,.7,.3,1) ${portalDelay}s backwards, summon-knight-hover 0.9s ease-in-out ${portalDelay + portalDur}s infinite`;
            const style: React.CSSProperties & Record<string, string | number> = {
              position: "absolute",
              left: `calc(50% + ${x}px)`,
              top: `calc(50% + ${y}px)`,
              "--ro": `${rotation}deg`,
              "--suckX": `${x}px`,
              "--suckY": `${y}px`,
              "--fromX": `${fromX}px`,
              "--fromY": `${fromY}px`,
              animation: anim,
              transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
              zIndex: 6,
              filter: striking
                ? `drop-shadow(0 0 6px ${k.color}) drop-shadow(0 0 14px rgba(255,240,200,0.6))`
                : "none",
            };
            return (
              <div key={`k-${i}`} style={style}>
                <WeaponIcon kind={k.kind} color={k.color} size={60} />
              </div>
            );
          })}
      </div>

      {/* Screen-white punch on beam */}
      {stage === 6 && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "#fff",
            animation: "summon-screen-white 1.1s cubic-bezier(.2,.6,.4,1) forwards",
            zIndex: 20,
            pointerEvents: "none",
            mixBlendMode: "screen",
          }}
        />
      )}

      {/* Congrats modal */}
      {showCongrats && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            animation: "summon-fade-up 0.6s ease forwards",
            zIndex: 30,
          }}
        >
          <div
            style={{
              background: "linear-gradient(180deg, #2e4680 0%, #1a2a5a 50%, #0f1a3e 100%)",
              border: "2px solid #c4c4c4",
              borderRadius: 6,
              boxShadow: "0 0 0 2px #555, 0 4px 20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.2)",
              padding: "32px 40px 28px",
              width: 560,
              maxWidth: "calc(100vw - 48px)",
              color: "#fff",
              fontFamily: '"Times New Roman", serif',
            }}
          >
            <div
              style={{
                fontSize: 22,
                textAlign: "center",
                marginBottom: 18,
                color: "#ffd88a",
                fontWeight: 700,
                textShadow: "2px 2px 0 #000, 1px 1px 0 #000",
              }}
            >
              Congratulations!
            </div>
            <div
              style={{
                fontSize: 17,
                textAlign: "center",
                lineHeight: 1.55,
                fontWeight: 500,
                textShadow: "2px 2px 0 #000",
              }}
            >
              You&apos;ve found the easter egg!
              <br />
              You&apos;ve unlocked the secret
              <br />
              <span style={{ color: "#ffd88a" }}>Avalon</span> theme on the Appearance page!
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "center",
                marginTop: 28,
                gap: 12,
              }}
            >
              <button
                type="button"
                autoFocus
                onMouseEnter={handleOkayHover}
                onMouseLeave={() => setButtonHover(false)}
                onFocus={handleOkayHover}
                onClick={handleOkayClick}
                style={{
                  position: "relative",
                  background: buttonHover
                    ? "linear-gradient(180deg, #4e66a0 0%, #2a3a7a 100%)"
                    : "linear-gradient(180deg, #3a528a 0%, #1a2a5a 100%)",
                  border: "2px solid #c4c4c4",
                  boxShadow: "0 0 0 2px #555, inset 0 1px 0 rgba(255,255,255,0.25)",
                  padding: "10px 44px",
                  color: "#fff",
                  fontFamily: '"Times New Roman", serif',
                  fontWeight: 700,
                  fontSize: 20,
                  textShadow: "2px 2px 0 #000",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  borderRadius: 4,
                  transition: "all 0.12s ease",
                }}
              >
                {buttonHover && (
                  <img
                    src={CURSOR_IMG}
                    width={22}
                    height={16}
                    alt=""
                    aria-hidden="true"
                    style={{
                      imageRendering: "pixelated",
                      filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.7))",
                      animation: "summon-cursor-float-r 1.1s ease-in-out infinite",
                    }}
                  />
                )}
                Okay.
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Small cursor hint that floats next to the materia in the sidebar after the
 * Konami code reveals it. Shown briefly to guide the user to click.
 */
export function MateriaCursorHint() {
  return (
    <span
      aria-hidden="true"
      style={{
        position: "absolute",
        left: "calc(100% + 6px)",
        top: "50%",
        transform: "translateY(-50%)",
        pointerEvents: "none",
        whiteSpace: "nowrap",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <img
        src={CURSOR_IMG}
        width={22}
        height={16}
        alt=""
        style={{
          imageRendering: "pixelated",
          filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.7))",
          animation: "summon-cursor-poke 1.1s ease-in-out infinite",
          transform: "scaleX(-1)",
        }}
      />
      <span
        style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontStyle: "italic",
          fontSize: 13,
          color: "#b8903a",
          opacity: 0.9,
          animation: "summon-text-glow-in 0.6s ease forwards",
        }}
      >
        …click me.
      </span>
    </span>
  );
}
