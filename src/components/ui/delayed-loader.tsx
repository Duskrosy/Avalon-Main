"use client";

import { useEffect, useState } from "react";

type DelayedLoaderProps = {
  loading: boolean;
  delayMs?: number;
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

/**
 * Gates a loader so nothing renders for the first `delayMs` of a load.
 * UX rule: if the route/action finishes under 300ms, we never show a spinner.
 */
export function DelayedLoader({
  loading,
  delayMs = 300,
  children,
  fallback = null,
}: DelayedLoaderProps) {
  const [showLoader, setShowLoader] = useState(false);

  useEffect(() => {
    if (!loading) {
      setShowLoader(false);
      return;
    }
    const t = setTimeout(() => setShowLoader(true), delayMs);
    return () => clearTimeout(t);
  }, [loading, delayMs]);

  if (!loading) return <>{children}</>;
  if (!showLoader) return <>{fallback}</>;
  return <>{children}</>;
}

type SlowActionSpinnerProps = {
  loading: boolean;
  afterMs?: number;
  children: React.ReactNode;
};

/**
 * Shows its children (intended: a spinner) only after `afterMs` of waiting.
 * UX rule: button actions show a spinner only once they've been pending >3s.
 */
export function SlowActionSpinner({
  loading,
  afterMs = 3000,
  children,
}: SlowActionSpinnerProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!loading) {
      setShow(false);
      return;
    }
    const t = setTimeout(() => setShow(true), afterMs);
    return () => clearTimeout(t);
  }, [loading, afterMs]);

  return show ? <>{children}</> : null;
}
