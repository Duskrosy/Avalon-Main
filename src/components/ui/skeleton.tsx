"use client";

import { cn } from "@/lib/utils";

// Base skeleton block
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-gray-200", className)} />;
}

// Text line placeholder (variable width for realistic look)
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  const widths = ["w-full", "w-5/6", "w-4/6", "w-3/4", "w-2/3"];
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className={cn("h-4 animate-pulse rounded bg-gray-200", widths[i % widths.length])} />
      ))}
    </div>
  );
}

// Stat card placeholder
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-xl border border-gray-200 bg-white p-5 space-y-3", className)}>
      <div className="h-3 w-24 animate-pulse rounded bg-gray-200" />
      <div className="h-7 w-16 animate-pulse rounded bg-gray-200" />
      <div className="h-3 w-32 animate-pulse rounded bg-gray-100" />
    </div>
  );
}

// Table placeholder with header + N rows
export function SkeletonTable({ rows = 8, cols = 5, className }: { rows?: number; cols?: number; className?: string }) {
  const colWidths = [80, 120, 100, 90, 110]; // px widths for header columns
  const rowColWidths = [70, 100, 85, 95, 75]; // px widths for row cells
  return (
    <div className={cn("rounded-xl border border-gray-200 bg-white overflow-hidden", className)}>
      {/* Header */}
      <div className="flex gap-4 px-4 py-3 bg-gray-50 border-b border-gray-100">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="h-3 animate-pulse rounded bg-gray-200" style={{ width: `${colWidths[i % colWidths.length]}px` }} />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 px-4 py-3 border-b border-gray-50 last:border-0">
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className="h-4 animate-pulse rounded bg-gray-100" style={{ width: `${rowColWidths[c % rowColWidths.length]}px` }} />
          ))}
        </div>
      ))}
    </div>
  );
}

// Chart area placeholder
export function SkeletonChart({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-xl border border-gray-200 bg-white p-6", className)}>
      <div className="h-4 w-32 animate-pulse rounded bg-gray-200 mb-4" />
      <div className="h-48 animate-pulse rounded bg-gray-100" />
    </div>
  );
}

// Circular avatar placeholder
export function SkeletonAvatar({ size = "md", className }: { size?: "xs" | "sm" | "md" | "lg" | "xl"; className?: string }) {
  const sizeMap = { xs: "w-6 h-6", sm: "w-8 h-8", md: "w-10 h-10", lg: "w-12 h-12", xl: "w-16 h-16" };
  return <div className={cn("animate-pulse rounded-full bg-gray-200", sizeMap[size], className)} />;
}

// Full page skeleton: heading + description + content
export function SkeletonPage({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-6", className)}>
      {/* Page heading */}
      <div className="space-y-2">
        <div className="h-7 w-48 animate-pulse rounded bg-gray-200" />
        <div className="h-4 w-72 animate-pulse rounded bg-gray-100" />
      </div>
      {/* Content area */}
      {children}
    </div>
  );
}
