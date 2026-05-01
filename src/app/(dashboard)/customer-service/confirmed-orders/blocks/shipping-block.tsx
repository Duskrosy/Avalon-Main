"use client";

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

type Props = {
  customer: Customer | null;
};

export function ShippingBlock({ customer }: Props) {
  if (!customer) {
    return (
      <div className="text-sm text-[var(--color-text-tertiary)] italic">
        No customer record attached.
      </div>
    );
  }

  const addressParts = [
    customer.address_line_1,
    customer.address_line_2,
    customer.city_text,
    customer.region_text,
    customer.postal_code,
  ].filter(Boolean);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-[var(--color-text-tertiary)] w-16 shrink-0">Name</span>
        <span className="text-sm font-medium">{customer.full_name}</span>
      </div>
      {customer.phone && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[var(--color-text-tertiary)] w-16 shrink-0">Phone</span>
          <span className="text-sm">{customer.phone}</span>
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
            {customer.full_address ?? addressParts.join(", ")}
          </span>
        </div>
      )}
    </div>
  );
}
