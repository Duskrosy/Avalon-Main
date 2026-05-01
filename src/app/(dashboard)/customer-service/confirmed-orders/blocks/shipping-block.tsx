"use client";

import { useState } from "react";
import { Pencil, Check, X } from "lucide-react";

type Customer = {
  full_name: string;
  phone: string | null;
  email: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city_text: string | null;
  region_text: string | null;
  postal_code: string | null;
  full_address: string | null;
};

export type AddressShippingStagedOp = {
  op: "address_shipping";
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
  customer: Customer | null;
  onStagedOpsChange?: (ops: AddressShippingStagedOp[]) => void;
  readOnly?: boolean;
};

function customerToForm(customer: Customer): AddressFormState {
  const street = [customer.address_line_1, customer.address_line_2]
    .filter(Boolean)
    .join(", ");
  return {
    recipient_name: customer.full_name ?? "",
    street,
    city: customer.city_text ?? "",
    province: customer.region_text ?? "",
    country: "Philippines",
    zip: customer.postal_code ?? "",
    phone: customer.phone ?? "",
  };
}

export function ShippingBlock({ customer, onStagedOpsChange, readOnly }: Props) {
  const [editing, setEditing] = useState(false);
  const [proposed, setProposed] = useState<AddressShippingStagedOp["payload"] | null>(null);
  const [form, setForm] = useState<AddressFormState>(() =>
    customer ? customerToForm(customer) : {
      recipient_name: "", street: "", city: "", province: "", country: "Philippines", zip: "", phone: "",
    }
  );

  if (!customer) {
    return (
      <div className="text-sm text-[var(--color-text-tertiary)] italic">
        No customer record attached.
      </div>
    );
  }

  function set(key: keyof AddressFormState) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  function handleSave() {
    if (!form.street.trim() || !form.city.trim() || !form.country.trim()) return;
    const payload: AddressShippingStagedOp["payload"] = {
      street: form.street.trim(),
      city: form.city.trim(),
      country: form.country.trim(),
    };
    if (form.province.trim()) payload.province = form.province.trim();
    if (form.zip.trim()) payload.zip = form.zip.trim();
    if (form.phone.trim()) payload.phone = form.phone.trim();
    if (form.recipient_name.trim()) payload.recipient_name = form.recipient_name.trim();
    setProposed(payload);
    onStagedOpsChange?.([{ op: "address_shipping", payload }]);
    setEditing(false);
  }

  function handleCancel() {
    // Reset form back to original customer data
    setForm(customerToForm(customer!));
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-1 gap-1.5">
          {(
            [
              { key: "recipient_name", label: "Recipient name", placeholder: "Full name" },
              { key: "street", label: "Street *", placeholder: "Street address" },
              { key: "city", label: "City *", placeholder: "City" },
              { key: "province", label: "Province", placeholder: "Province / region" },
              { key: "country", label: "Country *", placeholder: "Country" },
              { key: "zip", label: "ZIP", placeholder: "Postal code" },
              { key: "phone", label: "Phone", placeholder: "Phone number" },
            ] as { key: keyof AddressFormState; label: string; placeholder: string }[]
          ).map(({ key, label, placeholder }) => (
            <div key={key} className="flex items-center gap-2">
              <span className="text-[11px] text-[var(--color-text-tertiary)] w-24 shrink-0">{label}</span>
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
            aria-label="Save address"
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
    );
  }

  // Display mode — show proposed or original values
  const displayName = proposed?.recipient_name ?? customer.full_name;
  const displayStreet = proposed?.street ?? customer.address_line_1 ?? null;
  const displayCity = proposed?.city ?? customer.city_text ?? null;
  const displayProvince = proposed?.province ?? customer.region_text ?? null;
  const displayZip = proposed?.zip ?? customer.postal_code ?? null;
  const displayPhone = proposed?.phone ?? customer.phone ?? null;
  const displayCountry = proposed?.country ?? null;

  const addressParts = proposed
    ? [displayStreet, displayCity, displayProvince, displayZip, displayCountry].filter(Boolean)
    : [customer.address_line_1, customer.address_line_2, customer.city_text, customer.region_text, customer.postal_code].filter(Boolean);

  return (
    <div className="space-y-1.5">
      {proposed && (
        <div
          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border"
          style={{ color: "var(--color-warning)", borderColor: "var(--color-warning)", backgroundColor: "var(--color-warning-light)" }}
        >
          unsaved
        </div>
      )}
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-[var(--color-text-tertiary)] w-16 shrink-0">Name</span>
        <span className="text-sm font-medium flex items-center gap-1">
          {displayName}
          {!readOnly && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label="Edit address"
              title="Edit address"
              className="p-0.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
            >
              <Pencil size={11} />
            </button>
          )}
        </span>
      </div>
      {displayPhone && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[var(--color-text-tertiary)] w-16 shrink-0">Phone</span>
          <span className="text-sm">{displayPhone}</span>
        </div>
      )}
      {customer.email && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[var(--color-text-tertiary)] w-16 shrink-0">Email</span>
          <span className="text-sm truncate">{customer.email}</span>
        </div>
      )}
      {addressParts.length > 0 && (
        <div className="flex items-start gap-2">
          <span className="text-[11px] text-[var(--color-text-tertiary)] w-16 shrink-0 pt-0.5">
            Address
          </span>
          <span className="text-sm text-[var(--color-text-secondary)]">
            {proposed ? addressParts.join(", ") : (customer.full_address ?? addressParts.join(", "))}
          </span>
        </div>
      )}
    </div>
  );
}
