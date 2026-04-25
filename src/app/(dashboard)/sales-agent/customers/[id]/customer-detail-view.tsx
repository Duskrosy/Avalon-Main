"use client";

import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import Link from "next/link";
import {
  ArrowLeft,
  ExternalLink,
  Mail,
  MapPin,
  Phone,
  ShoppingBag,
  TrendingUp,
} from "lucide-react";
import { SyncStatusBadge } from "../../confirmed-sales/shared/sync-status-badge";
import { AddressBookModal } from "../../confirmed-sales/create-order-drawer/address-book-modal";

// Per-customer detail page. Shows lifetime stats, top items, recent
// orders, and the customer's contact / address. Designed for the
// agent to glance before pitching a repeat buyer.

type Customer = {
  id: string;
  shopify_customer_id: string | null;
  full_name: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  full_address: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city_text: string | null;
  region_text: string | null;
  postal_code: string | null;
  shopify_region: string | null;
  total_orders_cached: number | null;
  created_at: string;
};

type Stats = {
  order_count: number;
  completed_count: number;
  confirmed_count: number;
  cancelled_count: number;
  draft_count: number;
  total_gross: number;
  total_net: number;
  avg_order_value: number;
  first_order_at: string | null;
  last_order_at: string | null;
};

type RecentOrder = {
  id: string;
  avalon_order_number: string | null;
  shopify_order_name: string | null;
  shopify_order_number: number | null;
  status: string;
  sync_status: string;
  completion_status: string;
  final_total_amount: number;
  net_value_amount: number | null;
  delivery_status: string | null;
  created_at: string;
  completed_at: string | null;
  item_count: number;
};

type TopItem = {
  product_name: string;
  quantity: number;
  image_url: string | null;
};

type Bundle = {
  customer: Customer;
  stats: Stats;
  recent_orders: RecentOrder[];
  top_items: TopItem[];
};

export function CustomerDetailView({ customerId }: { customerId: string }) {
  const [data, setData] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addressBookOpen, setAddressBookOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/sales/customers/${customerId}`)
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json();
          setError(j.error ?? "Failed to load customer");
          return;
        }
        const j = (await r.json()) as Bundle;
        setData(j);
      })
      .finally(() => setLoading(false));
  }, [customerId]);

  if (loading) {
    return (
      <div className="p-6 max-w-6xl mx-auto text-sm text-gray-500">
        Loading customer…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <Link
          href="/sales-agent/confirmed-sales"
          className="text-xs text-gray-500 hover:text-gray-900 inline-flex items-center gap-1 mb-3"
        >
          <ArrowLeft size={12} /> Back to orders
        </Link>
        <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded p-3">
          {error ?? "Customer not found"}
        </div>
      </div>
    );
  }

  const { customer, stats, recent_orders, top_items } = data;
  const shopifyAdminUrl = customer.shopify_customer_id
    ? `https://admin.shopify.com/store/${
        process.env.NEXT_PUBLIC_SHOPIFY_STORE_HANDLE ?? ""
      }/customers/${customer.shopify_customer_id}`
    : null;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <Link
        href="/sales-agent/confirmed-sales"
        className="text-xs text-gray-500 hover:text-gray-900 inline-flex items-center gap-1 mb-3"
      >
        <ArrowLeft size={12} /> Back to orders
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">
            {customer.full_name || "(unnamed customer)"}
          </h1>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-600">
            {customer.phone && (
              <span className="inline-flex items-center gap-1">
                <Phone size={11} />
                {customer.phone}
              </span>
            )}
            {customer.email && (
              <span className="inline-flex items-center gap-1">
                <Mail size={11} />
                {customer.email}
              </span>
            )}
            {customer.full_address && (
              <span className="inline-flex items-center gap-1">
                <MapPin size={11} />
                {customer.full_address}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {customer.shopify_customer_id && (
            <button
              type="button"
              onClick={() => setAddressBookOpen(true)}
              className="text-xs px-3 py-1.5 border border-gray-200 rounded text-gray-700 hover:bg-gray-50 inline-flex items-center gap-1"
            >
              <MapPin size={11} /> Saved addresses
            </button>
          )}
          {shopifyAdminUrl && (
            <a
              href={shopifyAdminUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs px-3 py-1.5 border border-gray-200 rounded text-gray-700 hover:bg-gray-50 inline-flex items-center gap-1"
            >
              <ExternalLink size={11} /> Open on Shopify
            </a>
          )}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <StatCard
          label="Lifetime orders"
          value={stats.order_count.toString()}
          hint={
            stats.completed_count > 0
              ? `${stats.completed_count} completed`
              : undefined
          }
        />
        <StatCard
          label="Gross sold"
          value={`₱${stats.total_gross.toLocaleString(undefined, {
            maximumFractionDigits: 0,
          })}`}
        />
        <StatCard
          label="Net collected"
          value={`₱${stats.total_net.toLocaleString(undefined, {
            maximumFractionDigits: 0,
          })}`}
          hint={
            stats.total_gross > 0 && stats.total_net > 0
              ? `${Math.round((stats.total_net / stats.total_gross) * 100)}% of gross`
              : undefined
          }
        />
        <StatCard
          label="Avg order value"
          value={`₱${stats.avg_order_value.toLocaleString(undefined, {
            maximumFractionDigits: 0,
          })}`}
        />
        <StatCard
          label="Last order"
          value={
            stats.last_order_at
              ? format(parseISO(stats.last_order_at), "MMM d, yyyy")
              : "—"
          }
          hint={
            stats.first_order_at && stats.first_order_at !== stats.last_order_at
              ? `First: ${format(parseISO(stats.first_order_at), "MMM d, yyyy")}`
              : undefined
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent orders */}
        <div className="lg:col-span-2">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-gray-500 font-medium mb-2 pb-1 border-b border-gray-200">
            <ShoppingBag size={10} />
            Recent orders
            <span className="ml-auto normal-case tracking-normal text-gray-400">
              {recent_orders.length} of {stats.order_count}
            </span>
          </div>
          {recent_orders.length === 0 ? (
            <div className="text-xs text-gray-400 text-center py-6">
              No orders yet.
            </div>
          ) : (
            <div className="border border-gray-200 rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-600">
                  <tr>
                    <th className="px-3 py-2 text-left">Order</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2 text-right">Net</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {recent_orders.map((o) => (
                    <tr key={o.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-mono text-xs">
                        {o.shopify_order_name ??
                          (o.status === "draft" ? null : o.avalon_order_number) ?? (
                            <span className="text-gray-400">— draft —</span>
                          )}
                        <span className="ml-2 text-[10px] text-gray-400">
                          {o.item_count}{" "}
                          {o.item_count === 1 ? "item" : "items"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        ₱{o.final_total_amount.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                        {o.net_value_amount != null
                          ? `₱${o.net_value_amount.toLocaleString()}`
                          : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <SyncStatusBadge
                          status={o.status}
                          syncStatus={o.sync_status}
                        />
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500">
                        {format(parseISO(o.created_at), "MMM d, HH:mm")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Top items */}
        <div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-gray-500 font-medium mb-2 pb-1 border-b border-gray-200">
            <TrendingUp size={10} />
            Top items
          </div>
          {top_items.length === 0 ? (
            <div className="text-xs text-gray-400 py-6 text-center">
              No purchase history.
            </div>
          ) : (
            <ul className="divide-y divide-gray-100 border border-gray-200 rounded-md">
              {top_items.map((it, i) => (
                <li
                  key={it.product_name}
                  className="flex items-center gap-3 px-3 py-2"
                >
                  <span className="text-xs text-gray-400 w-4 tabular-nums">
                    {i + 1}.
                  </span>
                  <div className="w-9 h-9 rounded bg-gray-100 border border-gray-200 overflow-hidden shrink-0">
                    {it.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={it.image_url}
                        alt={it.product_name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-[repeating-linear-gradient(135deg,_#f3f4f6_0_4px,_#e5e7eb_4px_8px)]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{it.product_name}</div>
                    <div className="text-[11px] text-gray-500">
                      {it.quantity} bought
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {customer.shopify_customer_id && (
        <AddressBookModal
          open={addressBookOpen}
          onClose={() => setAddressBookOpen(false)}
          customerId={customer.id}
          onSelect={() => {
            // Picking an address from this page doesn't do anything in
            // particular — it's read-only context. Future: could open a
            // "Create order" drawer pre-filled with this customer + the
            // chosen address.
            setAddressBookOpen(false);
          }}
        />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="border border-gray-200 rounded-md px-3 py-2.5 bg-white">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 font-medium mb-0.5">
        {label}
      </div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-[10px] text-gray-400 mt-0.5">{hint}</div>}
    </div>
  );
}
