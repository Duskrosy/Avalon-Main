"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

type BillingAddress = {
  address_line_1: string | null;
  address_line_2: string | null;
  city_text: string | null;
  region_text: string | null;
  postal_code: string | null;
  full_address: string | null;
};

type Props = {
  billing: BillingAddress | null;
};

export function BillingBlock({ billing }: Props) {
  const [open, setOpen] = useState(false);

  const hasData = billing && (
    billing.address_line_1 || billing.city_text || billing.full_address
  );

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {open ? "Hide billing" : "Show billing"}
      </button>
      {open && (
        <div className="mt-2 pl-1 space-y-1.5">
          {!hasData ? (
            <div className="text-sm text-[var(--color-text-tertiary)] italic">
              No billing address on record.
            </div>
          ) : (
            <>
              {billing!.address_line_1 && (
                <div className="flex items-start gap-2">
                  <span className="text-[11px] text-[var(--color-text-tertiary)] w-16 shrink-0 pt-0.5">
                    Line 1
                  </span>
                  <span className="text-sm">{billing!.address_line_1}</span>
                </div>
              )}
              {billing!.address_line_2 && (
                <div className="flex items-start gap-2">
                  <span className="text-[11px] text-[var(--color-text-tertiary)] w-16 shrink-0 pt-0.5">
                    Line 2
                  </span>
                  <span className="text-sm">{billing!.address_line_2}</span>
                </div>
              )}
              {billing!.city_text && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[var(--color-text-tertiary)] w-16 shrink-0">
                    City
                  </span>
                  <span className="text-sm">{billing!.city_text}</span>
                </div>
              )}
              {billing!.region_text && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[var(--color-text-tertiary)] w-16 shrink-0">
                    Region
                  </span>
                  <span className="text-sm">{billing!.region_text}</span>
                </div>
              )}
              {billing!.postal_code && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[var(--color-text-tertiary)] w-16 shrink-0">
                    ZIP
                  </span>
                  <span className="text-sm">{billing!.postal_code}</span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
