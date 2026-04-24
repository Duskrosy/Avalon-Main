"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { ButtonSpinner } from "./button-spinner";

type CenterSpinnerProps = {
  label?: string;
  size?: number;
  delayMs?: number;
  className?: string;
};

export function CenterSpinner({
  label = "Loading…",
  size = 20,
  delayMs = 300,
  className,
}: CenterSpinnerProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShow(true), delayMs);
    return () => clearTimeout(t);
  }, [delayMs]);

  if (!show) return null;

  return (
    <div
      className={cn(
        "flex items-center justify-center gap-2.5 py-16 text-sm text-[var(--color-text-tertiary)]",
        className
      )}
      role="status"
      aria-live="polite"
    >
      <ButtonSpinner size={size} />
      {label && <span>{label}</span>}
    </div>
  );
}
