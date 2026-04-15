import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { redirect } from "next/navigation";
import Link from "next/link";

const NAV_ITEMS = [
  { href: "/operations/catalog",    label: "Catalog" },
  { href: "/operations/inventory",  label: "Inventory" },
  { href: "/operations/orders",     label: "Orders" },
  { href: "/operations/dispatch",   label: "Dispatch" },
  { href: "/operations/issues",     label: "Issues / Recovery" },
  { href: "/operations/distressed", label: "Distressed Parcels" },
  { href: "/operations/courier",    label: "Courier Tracking" },
  { href: "/operations/remittance", label: "Remittance" },
];

const ALLOWED_SLUGS = ["fulfillment", "inventory", "customer-service", "sales"];

export default async function OperationsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) redirect("/login");

  const deptSlug = user.department?.slug ?? "";
  if (!isOps(user) && !ALLOWED_SLUGS.includes(deptSlug)) redirect("/");

  return (
    <div className="flex gap-6">
      {/* Sidebar */}
      <nav className="hidden lg:block w-52 shrink-0">
        <div className="sticky top-6 space-y-1">
          <p className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-3 px-3">
            Operations
          </p>
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block px-3 py-2 text-sm text-[var(--color-text-secondary)] rounded-lg hover:bg-[var(--color-surface-active)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>

      {/* Content */}
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
