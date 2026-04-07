// Shopify Admin API client (REST Admin API 2024-01)
// Server-side only — never import from client components.
//
// Auth model: Custom App Admin API access token (shpat_...).
// Custom apps (created in Shopify Admin → Settings → Apps → Develop apps)
// generate a permanent access token when you click "Install app".
// That token is stored in SHOPIFY_ACCESS_TOKEN.
// The shpss_ client secret you also received is only for webhook HMAC
// verification — it is NOT used for API calls.

const BASE = `https://${process.env.SHOPIFY_SHOP_DOMAIN}/admin/api/2024-01`;

function getShopifyToken(): string {
  const token = process.env.SHOPIFY_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      "SHOPIFY_ACCESS_TOKEN is not set. " +
      "In Shopify Admin → Settings → Apps → Develop apps → your app → " +
      "API credentials → click 'Install app' to generate the shpat_ token.",
    );
  }
  return token;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type ShopifyLineItem = {
  id: number;
  name: string;
  title: string;
  quantity: number;
  price: string;
  sku: string | null;
};

export type ShopifyOrder = {
  id: number;                              // Large numeric Shopify ID
  order_number: number;                    // Small sequential number (e.g. 1234)
  name: string;                            // "#1234" display name
  created_at: string;                      // ISO timestamp
  financial_status: string | null;         // paid | pending | refunded | voided
  fulfillment_status: string | null;       // fulfilled | null | partial | restocked
  total_price: string;                     // Shopify returns as string "1500.00"
  line_items: ShopifyLineItem[];
  customer: {
    id: number;
    first_name?: string;
    last_name?: string;
    email?: string;
  } | null;
  payment_gateway: string | null;
  tags: string;                            // comma-separated string
  note_attributes: { name: string; value: string }[];
};

// ─── Base fetch ───────────────────────────────────────────────────────────────

async function shopifyGet<T>(path: string): Promise<T> {
  const token = await getShopifyToken();

  const res = await fetch(`${BASE}${path}`, {
    headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Shopify API error ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

// ─── Single-order lookup (for auto-fill) ─────────────────────────────────────

/**
 * Fetch a single Shopify order by its human-readable order_number (e.g. 1234).
 * Uses the `name` param with %23 prefix ("#1234") which is Shopify's canonical format.
 */
export async function fetchShopifyOrderByNumber(
  orderNumber: string | number,
): Promise<ShopifyOrder | null> {
  try {
    const name = encodeURIComponent(`#${orderNumber}`);
    const fields =
      "id,order_number,name,created_at,financial_status,fulfillment_status," +
      "total_price,line_items,customer,payment_gateway,tags,note_attributes";
    const json = await shopifyGet<{ orders: ShopifyOrder[] }>(
      `/orders.json?status=any&name=${name}&fields=${fields}&limit=1`,
    );
    return json.orders?.[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch a single Shopify order by its large numeric Shopify ID.
 */
export async function fetchShopifyOrderById(
  shopifyOrderId: string,
): Promise<ShopifyOrder | null> {
  try {
    const fields =
      "id,order_number,name,created_at,financial_status,fulfillment_status," +
      "total_price,line_items,customer,payment_gateway,tags,note_attributes";
    const json = await shopifyGet<{ order: ShopifyOrder }>(
      `/orders/${shopifyOrderId}.json?fields=${fields}`,
    );
    return json.order ?? null;
  } catch {
    return null;
  }
}

// ─── Bulk fetch with pagination (for sync) ───────────────────────────────────

/**
 * Fetch all orders created on or after `createdAtMin`.
 * Handles Shopify cursor-based pagination via the `Link: rel="next"` header.
 * Returns all matching orders (not just the first page).
 */
export async function fetchShopifyOrders(params: {
  createdAtMin?: string;  // ISO timestamp
  status?: string;        // "any" | "open" | "closed" | "cancelled"
  limit?: number;         // max 250 per page
}): Promise<ShopifyOrder[]> {
  const token = await getShopifyToken();
  const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN;
  if (!shopDomain) throw new Error("SHOPIFY_SHOP_DOMAIN is not set");

  const fields =
    "id,order_number,name,created_at,financial_status,fulfillment_status," +
    "total_price,line_items,customer,payment_gateway,tags,note_attributes";

  const qs = new URLSearchParams({
    status:  params.status  ?? "any",
    limit:   String(params.limit ?? 250),
    fields,
  });
  if (params.createdAtMin) qs.set("created_at_min", params.createdAtMin);

  let nextUrl: string | null =
    `https://${shopDomain}/admin/api/2024-01/orders.json?${qs}`;
  const allOrders: ShopifyOrder[] = [];

  while (nextUrl) {
    const pageUrl: string = nextUrl;
    const res: Response = await fetch(pageUrl, {
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Shopify API error ${res.status}: ${body}`);
    }

    const json = await res.json() as { orders: ShopifyOrder[] };
    allOrders.push(...(json.orders ?? []));

    // Follow cursor-based pagination via the Link response header
    const linkHeader = res.headers.get("Link") ?? "";
    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    nextUrl = nextMatch ? nextMatch[1] : null;
  }

  return allOrders;
}

// ─── Agent attribution ────────────────────────────────────────────────────────

/**
 * Extract an agent handle from a Shopify order.
 * Strategy:
 *   1. Check note_attributes for { name: "agent", value: "..." }
 *   2. Fall back to tags string for "agent:john" format
 * Returns a lowercased handle string, or null if not found.
 */
export function extractAgentHandle(order: ShopifyOrder): string | null {
  // 1. Note attributes (most structured)
  const attr = order.note_attributes.find(
    (a) => a.name.toLowerCase() === "agent",
  );
  if (attr?.value?.trim()) return attr.value.trim().toLowerCase();

  // 2. Tags ("agent:john" or "agent: john")
  const tags = order.tags.split(",").map((t) => t.trim());
  const agentTag = tags.find((t) => t.toLowerCase().startsWith("agent:"));
  if (agentTag) {
    const handle = agentTag.split(":")[1]?.trim().toLowerCase();
    if (handle) return handle;
  }

  return null;
}

// ─── DB row builder ───────────────────────────────────────────────────────────

/**
 * Map a ShopifyOrder to the row shape expected by the shopify_orders table.
 * Pass `resolvedAgentId` if the agent handle was matched to a profile UUID.
 */
export function buildOrderRow(
  order: ShopifyOrder,
  resolvedAgentId: string | null,
) {
  const totalQty = order.line_items.reduce((s, li) => s + li.quantity, 0);
  const firstName = order.customer?.first_name ?? "";
  const lastName  = order.customer?.last_name  ?? "";
  const customerName = [firstName, lastName].filter(Boolean).join(" ") || null;

  return {
    shopify_order_id:        String(order.id),
    order_number:            order.order_number,
    created_at_shopify:      order.created_at,
    financial_status:        order.financial_status ?? null,
    fulfillment_status:      order.fulfillment_status ?? null,
    total_price:             parseFloat(order.total_price ?? "0"),
    line_items:              order.line_items,
    first_line_item_name:    order.line_items[0]?.name ?? null,
    total_quantity:          totalQty,
    payment_gateway:         order.payment_gateway ?? null,
    customer_name:           customerName,
    customer_email:          order.customer?.email ?? null,
    tags:                    order.tags ?? "",
    note_attributes:         order.note_attributes ?? [],
    attributed_agent_handle: extractAgentHandle(order),
    attributed_agent_id:     resolvedAgentId,
    raw_payload:             order,
    last_synced_at:          new Date().toISOString(),
  };
}
