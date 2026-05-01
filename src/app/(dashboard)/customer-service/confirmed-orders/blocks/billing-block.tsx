"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Check, X } from "lucide-react";

type BillingAddress = {
  address_line_1: string | null;
  address_line_2: string | null;
  city_text: string | null;
  region_text: string | null;
  postal_code: string | null;
  full_address: string | null;
};

export type AddressBillingStagedOp = {
  op: "address_billing";
  payload: {
    street: string;
    city: string;
    province?: string;
    country: string;
    zip?: string;
    phone?: string;
    recipient_name?: string;
  };
};

type AddressFormState = {
  recipient_name: string;
  street: string;
  city: string;
  province: string;
  country: string;
  zip: string;
  phone: string;
};

type Props = {
  billing: BillingAddress | null;
  onStagedOpsChange?: (ops: AddressBillingStagedOp[]) => void;
  readOnly?: boolean;
};

function billingToForm(billing: BillingAddress): AddressFormState {
  const street = [billing.address_line_1, billing.address_line_2]
    .filter(Boolean)
    .join(", ");
  return {
    recipient_name: "",
    street,
    city: billing.city_text ?? "",
    province: billing.region_text ?? "",
    country: "Philippines",
    zip: billing.postal_code ?? "",
    phone: "",
  };
}

const EMPTY_FORM: AddressFormState = {
  recipient_name: "", street: "", city: "", province: "", country: "Philippines", zip: "", phone: "",
};

export function BillingBlock({ billing, onStagedOpsChange, readOnly }: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [proposed, setProposed] = useState<AddressBillingStagedOp["payload"] | null>(null);
  const [form, setForm] = useState<AddressFormState>(() =>
    billing ? billingToForm(billing) : EMPTY_FORM
  );

  const hasData = billing && (
    billing.address_line_1 || billing.city_text || billing.full_address
  );

  function set(key: keyof AddressFormState) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  function handleSave() {
    if (!form.street.trim() || !form.city.trim() || !form.country.trim()) return;
    const payload: AddressBillingStagedOp["payload"] = {
      street: form.street.trim(),
      city: form.city.trim(),
      country: form.country.trim(),
    };
    if (form.province.trim()) payload.province = form.province.trim();
    if (form.zip.trim()) payload.zip = form.zip.trim();
    if (form.phone.trim()) payload.phone = form.phone.trim();
    if (form.recipient_name.trim()) payload.recipient_name = form.recipient_name.trim();
    setProposed(payload);
    onStagedOpsChange?.([{ op: "address_billing", payload }]);
    setEditing(false);
  }

  function handleCancel() {
    setForm(billing ? billingToForm(billing) : EMPTY_FORM);
    setEditing(false);
  }

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
        <div className="mt-2 pl-1">
          {!hasData && !proposed ? (
            <div className="text-sm text-[var(--color-text-tertiary)] italic">
              No billing address on record.
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  aria-label="Add billing address"
                  title="Edit address"
                  className="ml-2 p-0.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] inline-flex items-center"
                >
                  <Pencil size={11} />
                </button>
              )}
            </div>
          ) : editing ? (
            <div className="space-y-2">
              <div className="grid grid-cols-1 gap-1.5">
                {(
                  [
                    { key: "recipient_name", label: "Recipient", placeholder: "Full name" },
                    { key: "street", label: "Street *", placeholder: "Street address" },
                    { key: "city", label: "City *", placeholder: "City" },
                    { key: "province", label: "Province", placeholder: "Province / region" },
                    { key: "country", label: "Country *", placeholder: "Country" },
                    { key: "zip", label: "ZIP", placeholder: "Postal code" },
                    { key: "phone", label: "Phone", placeholder: "Phone number" },
                  ] as { key: keyof AddressFormState; label: string; placeholder: string }[]
                ).map(({ key, label, placeholder }) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-[11px] text-[var(--color-text-tertiary)] w-20 shrink-0">{label}</span>
                    <input
                      className="flex-1 px-2 py-1 text-sm border border-[var(--color-border-primary)] rounded bg-[var(--color-bg-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                      placeholder={placeholder}
                      value={form[key]}
                      onChange={set(key)}
                    />
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!form.street.trim() || !form.city.trim() || !form.country.trim()}
                  aria-label="Save billing address"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[var(--color-accent)] text-white text-xs hover:opacity-90 disabled:opacity-40"
                >
                  <Check size={12} /> Save
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  aria-label="Cancel edit"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-[var(--color-border-primary)] text-[var(--color-text-secondary)] text-xs hover:bg-[var(--color-bg-secondary)]"
                >
                  <X size={12} /> Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              {proposed && (
                <div
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border"
                  style={{ color: "var(--color-warning)", borderColor: "var(--color-warning)", backgroundColor: "var(--color-warning-light)" }}
                >
                  unsaved
                </div>
              )}
              {/* Display: proposed values override original */}
              {(proposed?.street ?? billing?.address_line_1) && (
                <div className="flex items-start gap-2">
                  <span className="text-[11px] text-[var(--color-text-tertiary)] w-16 shrink-0 pt-0.5">
                    Street
                  </span>
                  <span className="text-sm">{proposed?.street ?? billing!.address_line_1}</span>
                </div>
              )}
              {!proposed && billing?.address_line_2 && (
                <div className="flex items-start gap-2">
                  <span className="text-[11px] text-[var(--color-text-tertiary)] w-16 shrink-0 pt-0.5">
                    Line 2
                  </span>
                  <span className="text-sm">{billing!.address_line_2}</span>
                </div>
              )}
              {(proposed?.city ?? billing?.city_text) && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[var(--color-text-tertiary)] w-16 shrink-0">
                    City
                  </span>
                  <span className="text-sm">{proposed?.city ?? billing!.city_text}</span>
                </div>
              )}
              {(proposed?.province ?? billing?.region_text) && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[var(--color-text-tertiary)] w-16 shrink-0">
                    Region
                  </span>
                  <span className="text-sm">{proposed?.province ?? billing!.region_text}</span>
                </div>
              )}
              {(proposed?.zip ?? billing?.postal_code) && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[var(--color-text-tertiary)] w-16 shrink-0">
                    ZIP
                  </span>
                  <span className="text-sm">{proposed?.zip ?? billing!.postal_code}</span>
                </div>
              )}
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  aria-label="Edit billing address"
                  title="Edit address"
                  className="inline-flex items-center gap-1 text-[11px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] mt-0.5"
                >
                  <Pencil size={11} /> Edit
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
