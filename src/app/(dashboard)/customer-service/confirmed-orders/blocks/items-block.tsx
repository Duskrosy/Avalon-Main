"use client";

type OrderItem = {
  id: string;
  product_name: string;
  variant_name: string | null;
  quantity: number;
  unit_price_amount: number;
  line_total_amount: number;
  size: string | null;
  color: string | null;
};

type Props = {
  items: OrderItem[];
  finalTotal: number;
};

export function ItemsBlock({ items, finalTotal }: Props) {
  if (items.length === 0) {
    return (
      <div className="text-sm text-[var(--color-text-tertiary)] italic">No line items.</div>
    );
  }

  return (
    <div className="rounded border border-[var(--color-border-primary)] overflow-hidden text-sm">
      <table className="w-full">
        <thead className="bg-[var(--color-bg-secondary)] text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)]">
          <tr>
            <th className="text-left px-3 py-1.5">Item</th>
            <th className="text-right px-3 py-1.5">Qty</th>
            <th className="text-right px-3 py-1.5">Unit</th>
            <th className="text-right px-3 py-1.5">Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const label = [
              item.product_name,
              item.variant_name,
              item.size,
              item.color,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <tr
                key={item.id}
                className="border-t border-[var(--color-border-secondary)]"
              >
                <td className="px-3 py-1.5 text-[var(--color-text-primary)]">{label}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-[var(--color-text-secondary)]">
                  {item.quantity}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-[var(--color-text-secondary)]">
                  ₱{item.unit_price_amount.toFixed(2)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                  ₱{item.line_total_amount.toFixed(2)}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="border-t border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
          <tr>
            <td colSpan={3} className="px-3 py-1.5 text-right text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)]">
              Order total
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums font-semibold">
              ₱{finalTotal.toFixed(2)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
