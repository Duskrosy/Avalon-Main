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
    phone?: string;
  } | null;
  payment_gateway: string | null;
  tags: string;                            // comma-separated string
  note_attributes: { name: string; value: string }[];
  // Intake-lane classifier fields (added for CS Pass 2 Lane 2)
  source_name?: string | null;             // 'web' | 'pos' | 'shopify_draft_order' | ...
  app_id?: number | null;                  // 580111 = web checkout; others = admin/POS
};

// ─── Rate limiting ────────────────────────────────────────────────────────────
//
// Shopify Standard plan = 2 GraphQL requests/second per shop.
// Without throttling, concurrent callers (the conversion reconciler runs at
// concurrency=5; CS Pass 2 Phase B-Lite Apply fires 3 sequential mutations
// per click) can trip 429s. Two-layer defence: proactive token bucket +
// reactive retry-on-429.
//
//   client call
//      │
//      ▼
//   bucket.take()  ◄── waits if tokens < 1 (refills 1 token / 500ms = 2 req/s)
//      │
//      ▼
//   fetch()  ──────► 200/4xx (other) → return as-is
//      │
//      ▼
//      429 → sleep(retry-after || 1s) → bucket.take() → fetch() once more
//
// Per-process bucket. Across Vercel instances each process has its own
// bucket, but the retry-on-429 path catches what the bucket misses.

class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly capacity: number,
    private readonly refillIntervalMs: number,
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  async take(): Promise<void> {
    while (true) {
      const now = Date.now();
      const elapsed = now - this.lastRefill;
      if (elapsed > 0) {
        this.tokens = Math.min(
          this.capacity,
          this.tokens + elapsed / this.refillIntervalMs,
        );
        this.lastRefill = now;
      }
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      const waitMs = Math.ceil((1 - this.tokens) * this.refillIntervalMs);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

// Shopify Standard: 2 req/s → capacity=2, refill 1 token every 500ms.
const shopifyBucket = new TokenBucket(2, 500);

/**
 * Internal: every Shopify HTTP call goes through this. Applies the token
 * bucket, performs the fetch, and retries once on 429 (honouring the
 * `retry-after` header when present, defaulting to 1 second otherwise).
 *
 * Callers receive the final Response and handle status / body parsing.
 */
async function _shopifyRequest(url: string, init: RequestInit): Promise<Response> {
  await shopifyBucket.take();
  let res = await fetch(url, init);
  if (res.status === 429) {
    const retryAfterHeader = res.headers.get("retry-after");
    const retryAfterMs =
      retryAfterHeader && Number.isFinite(Number(retryAfterHeader))
        ? Number(retryAfterHeader) * 1000
        : 1000;
    await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
    await shopifyBucket.take();
    res = await fetch(url, init);
  }
  return res;
}

// Exposed for unit tests only — not part of the public API. Resets bucket
// state so tests can run with a clean slate.
export function __resetShopifyBucketForTests(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (shopifyBucket as any).tokens = 2;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (shopifyBucket as any).lastRefill = Date.now();
}

// ─── Base fetch ───────────────────────────────────────────────────────────────

async function shopifyGet<T>(path: string): Promise<T> {
  const token = await getShopifyToken();

  const res = await _shopifyRequest(`${BASE}${path}`, {
    headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Shopify API error ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

type ShopifyGraphQLResponse<T> = { data?: T; errors?: Array<{ message: string }> };

async function shopifyGraphQL<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const token = await getShopifyToken();
  const res = await _shopifyRequest(`${BASE}/graphql.json`, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as ShopifyGraphQLResponse<T>;
  if (!res.ok || json.errors?.length) {
    throw new Error(json.errors?.[0]?.message ?? `Shopify GraphQL ${res.status}`);
  }
  return json.data!;
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

// ─── Shipping address re-poll (for Phase B-Lite stuck-plan recovery) ────────
//
// Fetches just the current shipping address on a Shopify order. Used by the
// /full route's stuck-plan logic when a plan stalled in 'applying' with a
// calc_order_id but no commit_id — we need to know whether the Shopify side
// actually committed the address change or not.
//
// Returns null on any error (network, 404, parse). The caller treats null
// as "cannot disambiguate" and falls through to the existing revert path.

export interface ShopifyShippingAddress {
  first_name: string | null;
  last_name: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  province: string | null;
  province_code: string | null;
  country: string | null;
  country_code: string | null;
  zip: string | null;
  phone: string | null;
}

export async function fetchShopifyOrderShippingAddress(
  shopifyOrderId: string,
): Promise<ShopifyShippingAddress | null> {
  try {
    const json = await shopifyGet<{ order: { shipping_address: ShopifyShippingAddress | null } }>(
      `/orders/${shopifyOrderId}.json?fields=shipping_address`,
    );
    return json.order?.shipping_address ?? null;
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
  createdAtMax?: string;  // ISO timestamp (inclusive upper bound)
  status?: string;        // "any" | "open" | "closed" | "cancelled"
  limit?: number;         // max 250 per page
}): Promise<ShopifyOrder[]> {
  const token = await getShopifyToken();
  const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN;
  if (!shopDomain) throw new Error("SHOPIFY_SHOP_DOMAIN is not set");

  const fields =
    "id,order_number,name,created_at,financial_status,fulfillment_status," +
    "total_price,line_items,customer,payment_gateway,tags,note_attributes," +
    "source_name,app_id";

  const qs = new URLSearchParams({
    status:  params.status  ?? "any",
    limit:   String(params.limit ?? 250),
    fields,
  });
  if (params.createdAtMin) qs.set("created_at_min", params.createdAtMin);
  if (params.createdAtMax) qs.set("created_at_max", params.createdAtMax);

  let nextUrl: string | null =
    `https://${shopDomain}/admin/api/2024-01/orders.json?${qs}`;
  const allOrders: ShopifyOrder[] = [];

  while (nextUrl) {
    const pageUrl: string = nextUrl;
    const res: Response = await _shopifyRequest(pageUrl, {
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

// ─── Write helpers (Phase 1: Sales Tracker) ──────────────────────────────────
//
// Avalon owns the order draft lifecycle. These helpers are called from
// /api/sales/orders/[id]/confirm and adjacent routes when an Avalon-native
// order is being pushed to Shopify for the first time, retried after a failed
// sync, or cancelled.

async function shopifyPost<T>(path: string, body: unknown): Promise<T> {
  const token = await getShopifyToken();
  const res = await _shopifyRequest(`${BASE}${path}`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const responseBody = await res.text();
    throw new Error(`Shopify API error ${res.status}: ${responseBody}`);
  }
  return res.json() as Promise<T>;
}

async function shopifyPut<T>(path: string, body: unknown): Promise<T> {
  const token = await getShopifyToken();
  const res = await _shopifyRequest(`${BASE}${path}`, {
    method: "PUT",
    headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const responseBody = await res.text();
    throw new Error(`Shopify API error ${res.status}: ${responseBody}`);
  }
  return res.json() as Promise<T>;
}

// ─── Customer write methods ──────────────────────────────────────────────────

export type ShopifyCustomer = {
  id: number;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  /** Shopify's lifetime order count. Authoritative when present. */
  orders_count?: number;
  addresses?: Array<{
    address1?: string;
    address2?: string;
    city?: string;
    province?: string;
    zip?: string;
    country_code?: string;
  }>;
};

export type ShopifyCustomerInput = {
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  addresses?: Array<{
    address1?: string | null;
    address2?: string | null;
    city?: string | null;
    province?: string | null;
    zip?: string | null;
    country?: string;
  }>;
};

/**
 * Search Shopify customers by email, phone, or name. Returns the first 10
 * matches. Used as the email-pre-search dedup guard before customer create.
 */
export async function searchShopifyCustomers(
  query: string,
): Promise<ShopifyCustomer[]> {
  try {
    const q = encodeURIComponent(query.trim());
    if (!q) return [];
    const json = await shopifyGet<{ customers: ShopifyCustomer[] }>(
      `/customers/search.json?query=${q}&limit=10`,
    );
    return json.customers ?? [];
  } catch {
    return [];
  }
}

/**
 * Create a customer in Shopify. Caller is responsible for email-pre-search
 * dedup: invoke searchShopifyCustomers(email) first, and reuse the existing
 * Shopify customer id if a match is returned. This function does not dedup.
 *
 * Self-heals on `addresses.province: is invalid` (a Shopify 422) by
 * retrying once with province stripped — covers PSGC name drift Shopify
 * doesn't recognise (renames, splits, etc.) without a hard failure.
 */
export async function createShopifyCustomer(
  input: ShopifyCustomerInput,
): Promise<ShopifyCustomer> {
  try {
    const json = await shopifyPost<{ customer: ShopifyCustomer }>(
      `/customers.json`,
      { customer: input },
    );
    return json.customer;
  } catch (err) {
    if (isInvalidProvinceError(err) && input.addresses) {
      const stripped = input.addresses.map(({ province, ...rest }) => {
        void province;
        return rest;
      });
      const json = await shopifyPost<{ customer: ShopifyCustomer }>(
        `/customers.json`,
        { customer: { ...input, addresses: stripped } },
      );
      return json.customer;
    }
    throw err;
  }
}

/** True when a Shopify error mentions an invalid address.province. */
function isInvalidProvinceError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("addresses.province") &&
    msg.toLowerCase().includes("invalid")
  );
}

/**
 * Update an existing Shopify customer. Used by Avalon's customer-edit flow
 * so a fix made locally (wrong address, typo in name, new phone) immediately
 * propagates to Shopify — they share one source of truth.
 *
 * Address handling: when `addresses` is supplied with one entry, we use the
 * /customers/{id}/addresses endpoint for the customer's default address so
 * the edit becomes the address Shopify ships to. Other fields (name, email,
 * phone) go through the customer object directly.
 */
export async function updateShopifyCustomer(
  shopifyCustomerId: string | number,
  input: Partial<ShopifyCustomerInput>,
): Promise<ShopifyCustomer> {
  try {
    const json = await shopifyPut<{ customer: ShopifyCustomer }>(
      `/customers/${shopifyCustomerId}.json`,
      { customer: { id: Number(shopifyCustomerId), ...input } },
    );
    return json.customer;
  } catch (err) {
    if (isInvalidProvinceError(err) && input.addresses) {
      const stripped = input.addresses.map(({ province, ...rest }) => {
        void province;
        return rest;
      });
      const json = await shopifyPut<{ customer: ShopifyCustomer }>(
        `/customers/${shopifyCustomerId}.json`,
        {
          customer: {
            id: Number(shopifyCustomerId),
            ...input,
            addresses: stripped,
          },
        },
      );
      return json.customer;
    }
    throw err;
  }
}

// ─── Customer-address methods (multi-address book) ───────────────────────────

export type ShopifyCustomerAddress = {
  id: number;
  customer_id?: number;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  province?: string | null;
  province_code?: string | null;
  country?: string | null;
  country_code?: string | null;
  zip?: string | null;
  phone?: string | null;
  name?: string | null;
  default?: boolean;
};

export type ShopifyCustomerAddressInput = {
  first_name?: string | null;
  last_name?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  zip?: string | null;
  phone?: string | null;
  country?: string | null;
};

/**
 * Fetch every saved address for a Shopify customer. Older customers
 * accumulate multiple addresses (one per checkout session); the agent
 * needs to see them all to pick the right one for the current order.
 */
export async function listShopifyCustomerAddresses(
  shopifyCustomerId: string | number,
): Promise<ShopifyCustomerAddress[]> {
  const json = await shopifyGet<{ addresses: ShopifyCustomerAddress[] }>(
    `/customers/${shopifyCustomerId}/addresses.json?limit=50`,
  );
  return json.addresses ?? [];
}

/**
 * Update a single saved address on a Shopify customer.
 */
export async function updateShopifyCustomerAddress(
  shopifyCustomerId: string | number,
  addressId: string | number,
  input: ShopifyCustomerAddressInput,
): Promise<ShopifyCustomerAddress> {
  const json = await shopifyPut<{ customer_address: ShopifyCustomerAddress }>(
    `/customers/${shopifyCustomerId}/addresses/${addressId}.json`,
    { address: input },
  );
  return json.customer_address;
}

/**
 * Mark one of the customer's saved addresses as their Shopify default.
 * The endpoint takes no body; the address id in the path is the new default.
 */
export async function setDefaultShopifyCustomerAddress(
  shopifyCustomerId: string | number,
  addressId: string | number,
): Promise<ShopifyCustomerAddress> {
  const json = await shopifyPut<{ customer_address: ShopifyCustomerAddress }>(
    `/customers/${shopifyCustomerId}/addresses/${addressId}/default.json`,
    {},
  );
  return json.customer_address;
}

// ─── Order write methods ─────────────────────────────────────────────────────

export type ShopifyOrderLineItemInput = {
  variant_id?: number | string;       // Shopify variant id
  title?: string;                      // fallback when no variant_id
  quantity: number;
  price: string;                       // Shopify expects string, e.g. "3500.00"
  sku?: string;
};

export type ShopifyOrderInput = {
  customer?: { id: number } | ShopifyCustomerInput;
  line_items: ShopifyOrderLineItemInput[];
  discount_codes?: Array<{ code: string; amount: string; type: "percentage" | "fixed_amount" }>;
  shipping_lines?: Array<{ title: string; price: string; code?: string }>;
  shipping_address?: {
    first_name?: string;
    last_name?: string;
    address1?: string;
    address2?: string;
    city?: string;
    province?: string;
    zip?: string;
    phone?: string;
    country?: string;
  };
  note?: string;
  note_attributes?: Array<{ name: string; value: string }>;
  tags?: string;
  // CRITICAL — Avalon orders ALWAYS land as 'pending' regardless of MOP.
  // CS verifies receipts, courier remits cash, etc. — those flips happen
  // downstream, never on order create. Shopify's REST default when no
  // transactions[] is present has been observed to flip to 'paid' depending
  // on shop checkout settings; passing financial_status explicitly forces
  // the right state on every order.
  financial_status?: "pending" | "paid" | "authorized" | "partially_paid";
  // Inventory behavior bypass: Avalon's Inventory v1 already allocated stock,
  // we do not want Shopify to also decrement its placeholder 999.
  inventory_behavior?: "bypass" | "decrement_obeying_policy" | "decrement_ignoring_policy";
};

/**
 * Create a Shopify order from an Avalon-confirmed draft. The caller MUST have
 * inserted an `order_shopify_syncs` row with status='in_flight' before calling
 * this; on success/failure, update that row in the same transaction context.
 *
 * Defaults baked in:
 *   • inventory_behavior = 'bypass' (Inventory v1 owns stock; Shopify is 999)
 *   • no transactions[] → financial_status = 'pending' (COD payment-due-later)
 */
export async function createShopifyOrder(
  input: ShopifyOrderInput,
): Promise<ShopifyOrder> {
  const payload = {
    order: {
      ...input,
      // Explicitly pin financial_status='pending' unless the caller overrode.
      // Avalon's create-order flow never records a paid transaction at create
      // time; payment is verified later by CS or remittance.
      financial_status: input.financial_status ?? "pending",
      inventory_behavior: input.inventory_behavior ?? "bypass",
    },
  };
  try {
    const json = await shopifyPost<{ order: ShopifyOrder }>(
      `/orders.json`,
      payload,
    );
    return json.order;
  } catch (err) {
    // Self-heal on `addresses.province: invalid` — strip province from
    // shipping_address and retry once. Same drift defence we use on
    // customer create/update; covers PSGC name renames Shopify hasn't
    // caught up with.
    if (isInvalidProvinceError(err) && input.shipping_address?.province) {
      const stripped = { ...input.shipping_address };
      delete (stripped as { province?: string }).province;
      const retryPayload = {
        order: {
          ...input,
          shipping_address: stripped,
          financial_status: input.financial_status ?? "pending",
          inventory_behavior: input.inventory_behavior ?? "bypass",
        },
      };
      const json = await shopifyPost<{ order: ShopifyOrder }>(
        `/orders.json`,
        retryPayload,
      );
      return json.order;
    }
    throw err;
  }
}

/**
 * Idempotency guard for Shopify order creation. Searches recent orders by
 * note_attributes.avalon_order_number to detect "POST succeeded but response
 * was lost" scenarios, so the retry path can recover instead of duplicating.
 *
 * Shopify's REST API does not natively filter on note_attributes, so we
 * narrow with `created_at_min` and scan client-side. windowHours=1 keeps the
 * scan cheap; bump if confirm-retry windows ever exceed an hour in practice.
 */
export async function fetchShopifyOrderByNoteAttribute(
  name: string,
  value: string,
  windowHours = 1,
): Promise<ShopifyOrder | null> {
  try {
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
    const fields =
      "id,order_number,name,created_at,financial_status,fulfillment_status," +
      "total_price,line_items,customer,payment_gateway,tags,note_attributes";
    const params = new URLSearchParams({
      status: "any",
      created_at_min: since,
      fields,
      limit: "100",
    });
    const json = await shopifyGet<{ orders: ShopifyOrder[] }>(
      `/orders.json?${params.toString()}`,
    );
    for (const o of json.orders ?? []) {
      const match = (o.note_attributes ?? []).find(
        (a) => a.name === name && a.value === value,
      );
      if (match) return o;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Cancel a Shopify order. Used by both /api/sales/orders/[id]/cancel and
 * /api/sales/orders/[id]/revert-to-draft when the order has previously
 * synced (sync_status='synced'). Failures bubble up — caller decides whether
 * to retry or surface to the agent.
 */
export async function cancelShopifyOrder(
  shopifyOrderId: string | number,
  reason: "customer" | "inventory" | "fraud" | "declined" | "other" = "other",
): Promise<ShopifyOrder> {
  const json = await shopifyPost<{ order: ShopifyOrder }>(
    `/orders/${shopifyOrderId}/cancel.json`,
    { reason },
  );
  return json.order;
}

// ─── Update existing Shopify order ──────────────────────────────────────────

export type ShopifyOrderUpdateInput = {
  note?: string;
  tags?: string;
  email?: string;
  phone?: string;
  shipping_address?: Record<string, unknown>;
  billing_address?: Record<string, unknown>;
  note_attributes?: Array<{ name: string; value: string }>;
  // line_items can only be edited via the Order Edit API for non-fulfilled
  // items; PUT /orders accepts the field but Shopify silently ignores
  // changes to fulfilled lines. Caller checks fulfillment_status first.
  line_items?: Array<Record<string, unknown>>;
};

/**
 * Update a Shopify order via PUT /orders/{id}.json. Used by the post-confirm
 * 15-min in-place edit window: small fixes that Shopify accepts in place
 * (note text, shipping address, tags) skip the full revert-to-draft cycle.
 *
 * The caller MUST verify fulfillment_status !== 'fulfilled' and
 * financial_status !== 'refunded' before calling — Shopify will accept
 * the PUT but silently ignore disallowed field changes on fulfilled or
 * refunded orders, leaving Avalon and Shopify out of sync.
 */
export async function updateShopifyOrder(
  shopifyOrderId: string | number,
  input: ShopifyOrderUpdateInput,
): Promise<ShopifyOrder> {
  const json = await shopifyPut<{ order: ShopifyOrder }>(
    `/orders/${shopifyOrderId}.json`,
    { order: input },
  );
  return json.order;
}

// ─── Order transactions (for marking COD orders paid) ───────────────────────

export type ShopifyOrderTransaction = {
  id: number;
  order_id: number;
  amount: string;
  kind: string; // "sale" | "capture" | "authorization" | "void" | "refund"
  status: string; // "success" | "pending" | "failure" | "error"
  gateway: string | null;
  created_at: string;
  authorization?: string | null;
};

/**
 * List the transactions on a Shopify order. Used as an idempotency guard
 * before posting a sale transaction — if a successful sale already exists,
 * we skip the post so retrying the complete-flow doesn't double-charge.
 */
export async function listShopifyOrderTransactions(
  shopifyOrderId: string | number,
): Promise<ShopifyOrderTransaction[]> {
  const json = await shopifyGet<{ transactions: ShopifyOrderTransaction[] }>(
    `/orders/${shopifyOrderId}/transactions.json`,
  );
  return json.transactions ?? [];
}

/**
 * Post a sale transaction to flip a COD order's financial_status from
 * pending → paid (or partially_paid for partial collection). Avalon
 * uses gateway="cash" since collection happens at delivery and Shopify
 * is being told after the fact.
 *
 * Idempotency: caller is responsible for not double-posting. The
 * complete-order route guards against re-posts via
 * listShopifyOrderTransactions().
 */
export async function createShopifyOrderTransaction(
  shopifyOrderId: string | number,
  input: {
    kind: "sale" | "capture" | "void" | "refund";
    amount: string;
    gateway?: string;
    status?: "success" | "pending";
    /** Free-text dedup hint; we use "avalon-complete-<orderId>" so the
     * post is identifiable in Shopify's transaction list. */
    authorization?: string;
  },
): Promise<ShopifyOrderTransaction> {
  const json = await shopifyPost<{ transaction: ShopifyOrderTransaction }>(
    `/orders/${shopifyOrderId}/transactions.json`,
    {
      transaction: {
        kind: input.kind,
        amount: input.amount,
        gateway: input.gateway ?? "cash",
        status: input.status ?? "success",
        authorization: input.authorization,
      },
    },
  );
  return json.transaction;
}

// ─── Discount / voucher list ─────────────────────────────────────────────────

export type ShopifyDiscountCode = {
  id: number;
  price_rule_id: number;
  code: string;
  usage_count: number;
  created_at: string;
  updated_at: string;
};

// Module-scoped cache (60s TTL). Voucher lists don't change minute-to-minute;
// caching saves ~300 calls/agent/day on the drawer mount. Cache is per-process,
// so Vercel Functions get a cold cache on each new instance — that's fine.
let _voucherCache: { at: number; codes: ShopifyDiscountCode[] } | null = null;
const VOUCHER_CACHE_MS = 60_000;

/**
 * List active Shopify discount codes for the voucher dropdown on the Payment
 * step of the Create Order drawer. Cached for 60 seconds.
 */
export async function listShopifyVouchers(
  options: { force?: boolean } = {},
): Promise<ShopifyDiscountCode[]> {
  const now = Date.now();
  if (
    !options.force &&
    _voucherCache &&
    now - _voucherCache.at < VOUCHER_CACHE_MS
  ) {
    return _voucherCache.codes;
  }
  // Primary: GraphQL discountNodes. Returns everything in one request, including
  // discounts created via the new admin UI that the REST /price_rules endpoint
  // doesn't expose. Avoids the N+1 + rate-limit issues of the REST path.
  type GqlResp = {
    discountNodes: {
      edges: Array<{
        node: {
          id: string;
          discount: {
            __typename: string;
            codes?: { edges: Array<{ node: { id: string; code: string } }> };
          };
        };
      }>;
    };
  };

  // Includes DiscountCodeApp so 3rd-party app-managed code discounts surface.
  const QUERY = `
    query ActiveDiscountCodes {
      discountNodes(first: 250) {
        edges {
          node {
            id
            discount {
              __typename
              ... on DiscountCodeBasic        { codes(first: 5) { edges { node { id code } } } status }
              ... on DiscountCodeBxgy         { codes(first: 5) { edges { node { id code } } } status }
              ... on DiscountCodeFreeShipping { codes(first: 5) { edges { node { id code } } } status }
              ... on DiscountCodeApp          { codes(first: 5) { edges { node { id code } } } status }
            }
          }
        }
      }
    }`;

  const all: ShopifyDiscountCode[] = [];
  try {
    const data = await shopifyGraphQL<GqlResp>(QUERY);
    for (const e of data.discountNodes.edges) {
      const codeEdges =
        (e.node.discount as { codes?: { edges: Array<{ node: { id: string; code: string } }> } }).codes
          ?.edges ?? [];
      for (const ce of codeEdges) {
        // Strip the gid:// prefix and trailing path to get a numeric id.
        const numericId = Number(ce.node.id.replace(/[^0-9]/g, "").slice(-15)) || 0;
        all.push({
          id: numericId,
          price_rule_id: 0,
          code: ce.node.code,
          usage_count: 0,
          created_at: "",
          updated_at: "",
        });
      }
    }
  } catch (err) {
    // GraphQL failed — fall back to a CAPPED REST scan (max 50 rules to stay
    // under the rate limit). This catches any classic price-rule discounts the
    // GraphQL query somehow missed, and keeps the function alive if the GraphQL
    // endpoint itself errors.
    const rulesJson = await shopifyGet<{ price_rules: Array<{ id: number; ends_at: string | null }> }>(
      `/price_rules.json?limit=50`,
    );
    const activeRules = (rulesJson.price_rules ?? []).filter((r) => {
      if (!r.ends_at) return true;
      return new Date(r.ends_at).getTime() > now;
    });
    for (const rule of activeRules) {
      try {
        const dcJson = await shopifyGet<{ discount_codes: ShopifyDiscountCode[] }>(
          `/price_rules/${rule.id}/discount_codes.json`,
        );
        all.push(...(dcJson.discount_codes ?? []));
      } catch {
        continue;
      }
    }
    // If REST also failed entirely (no rules fetched), rethrow the original GraphQL error.
    if (all.length === 0) throw err;
  }

  const seen = new Set<string>();
  const unique = all.filter((c) => {
    if (seen.has(c.code)) return false;
    seen.add(c.code);
    return true;
  });
  _voucherCache = { at: now, codes: unique };
  return unique;
}

export type AutoDiscountApplied = {
  title: string;
  type: string;
  description: string;
  amount: number;
};

/**
 * Use Shopify's draftOrderCalculate to ask "what auto-discounts would
 * apply to this cart?" without persisting a draft. Read-only call.
 */
export async function calculateDraftOrderDiscount(input: {
  customer_id: string | null;
  line_items: Array<{
    variant_id: string | null;
    quantity: number;
    title: string;
    price: string;
  }>;
}): Promise<{ applied: AutoDiscountApplied[]; applied_total: number }> {
  type Resp = {
    draftOrderCalculate: {
      calculatedDraftOrder: {
        platformDiscounts: Array<{
          title: string | null;
          summary: string | null;
          totalAmount: { amount: string; currencyCode: string } | null;
          automaticDiscount: boolean;
          code: string | null;
        }> | null;
      } | null;
      userErrors: Array<{ field: string[]; message: string }>;
    };
  };

  // Automatic discounts surface in `platformDiscounts` (array) — the
  // top-level `appliedDiscount` field is for *manual* order-level discounts
  // passed via input.appliedDiscount and does NOT carry automatic ones.
  // `acceptAutomaticDiscounts: true` opts the calculate call into evaluating
  // them. (Function-based automatics still won't preview here — that's a
  // platform limitation, not a query bug.)
  const MUTATION = `
    mutation Calc($input: DraftOrderInput!) {
      draftOrderCalculate(input: $input) {
        calculatedDraftOrder {
          platformDiscounts {
            title
            summary
            totalAmount { amount currencyCode }
            automaticDiscount
            code
          }
        }
        userErrors { field message }
      }
    }`;

  const buildVars = (includeCustomer: boolean) => ({
    input: {
      customerId:
        includeCustomer && input.customer_id
          ? `gid://shopify/Customer/${input.customer_id}`
          : null,
      lineItems: input.line_items.map((it) => ({
        variantId: it.variant_id ? `gid://shopify/ProductVariant/${it.variant_id}` : null,
        quantity: it.quantity,
        title: it.title,
        originalUnitPrice: it.price,
      })),
      useCustomerDefaultAddress: false,
      acceptAutomaticDiscounts: true,
    },
  });

  // Diagnostic: log the input shape so we can see in Vercel logs whether
  // variantIds are populated. Auto-discounts on Shopify often target
  // specific variants/products/collections; if our cart's items have
  // variantId=null (legacy bundle-split carts, custom line items), no
  // product-targeted auto-discount can match.
  const lineItemsForLog = buildVars(true).input.lineItems.map((li) => ({
    variantId: li.variantId,
    quantity: li.quantity,
    title: li.title,
  }));
  console.log("[draftOrderCalculate] input lineItems:", JSON.stringify(lineItemsForLog));

  // Try with customer first; fall back to no customer if Shopify can't find them.
  // The customer's shopify_customer_id may be stale (deleted on Shopify side)
  // or not yet synced. Customer-segment automatic discounts won't preview
  // without it, but catalog/cart-level discounts still resolve.
  let data: Resp;
  try {
    data = await shopifyGraphQL<Resp>(MUTATION, buildVars(true));
    if (data.draftOrderCalculate.userErrors?.length) {
      throw new Error(data.draftOrderCalculate.userErrors[0].message);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (input.customer_id && /customer.*not\s*found/i.test(msg)) {
      data = await shopifyGraphQL<Resp>(MUTATION, buildVars(false));
      if (data.draftOrderCalculate.userErrors?.length) {
        throw new Error(data.draftOrderCalculate.userErrors[0].message);
      }
    } else {
      throw err;
    }
  }
  const platformDiscounts =
    data.draftOrderCalculate.calculatedDraftOrder?.platformDiscounts ?? [];
  console.log(
    "[draftOrderCalculate] platformDiscounts:",
    JSON.stringify(platformDiscounts),
  );
  const applied: AutoDiscountApplied[] = [];
  let applied_total = 0;
  for (const pd of platformDiscounts) {
    const amount = parseFloat(pd.totalAmount?.amount ?? "0");
    if (!Number.isFinite(amount) || amount <= 0) continue;
    applied.push({
      title: pd.title ?? "Discount",
      type: pd.automaticDiscount ? "Automatic" : pd.code ? "Code" : "Discount",
      description: pd.summary ?? "",
      amount,
    });
    applied_total += amount;
  }
  return { applied, applied_total };
}

// ─── Product / variant search (Phase 1.5 hotfix — empty Inventory v1) ───────
//
// Used when Avalon's Inventory v1 catalog is unpopulated. We fetch from
// Shopify's products.json directly so agents can pick items today, and
// overlay Inventory v1 stock per variant when a row exists. See the products
// API route for the join logic.
//
// Implementation note: Shopify REST products.json filters by exact title only
// — it doesn't support substring search. We pull the first page (up to 250)
// and filter server-side. For catalogs above ~500 products, paginate.

export type ShopifyProductVariant = {
  id: number;
  product_id: number;
  title: string;
  sku: string | null;
  price: string;
  inventory_quantity: number;
  option1: string | null;
  option2: string | null;
  option3: string | null;
};

export type ShopifyProduct = {
  id: number;
  title: string;
  handle: string;
  status: string;
  variants: ShopifyProductVariant[];
  image: { src: string } | null;
  product_type: string | null;
};

let _productCache: { at: number; products: ShopifyProduct[] } | null = null;
const PRODUCT_CACHE_MS = 5 * 60_000;

/**
 * Fetch active Shopify products. 5-min in-memory cache (per Vercel Function
 * instance) keeps the search step responsive without hammering the API.
 *
 * Note: this returns ACTIVE products only (status=active), and excludes
 * archived/draft products that agents shouldn't be able to sell.
 */
export async function listShopifyProducts(
  options: { force?: boolean } = {},
): Promise<ShopifyProduct[]> {
  const now = Date.now();
  if (
    !options.force &&
    _productCache &&
    now - _productCache.at < PRODUCT_CACHE_MS
  ) {
    return _productCache.products;
  }
  try {
    const fields =
      "id,title,handle,status,variants,image,product_type";
    const json = await shopifyGet<{ products: ShopifyProduct[] }>(
      `/products.json?status=active&limit=250&fields=${fields}`,
    );
    const products = json.products ?? [];
    _productCache = { at: now, products };
    return products;
  } catch {
    return _productCache?.products ?? [];
  }
}

/**
 * Search active Shopify products by case-insensitive substring match on
 * title, variant title, or variant SKU. Returns flat variant rows
 * (one per variant) so the UI can render them as line-item picker rows.
 */
export async function searchShopifyVariants(
  query: string,
  limit = 30,
): Promise<
  Array<{
    shopify_product_id: string;
    shopify_variant_id: string;
    product_title: string;
    variant_title: string;
    sku: string | null;
    price: string;
    image_url: string | null;
    options: { option1: string | null; option2: string | null; option3: string | null };
  }>
> {
  const raw = query.trim().toLowerCase();
  if (raw.length < 2) return [];

  // Tokenize so multi-word queries narrow down: "altitude 36" → only
  // Altitude variants in size 36; "altitude black 36" → only Altitude
  // variants whose color is black AND size is 36. Each token must hit
  // somewhere in the variant's searchable haystack (product title,
  // variant title, SKU, options). Empty tokens are dropped.
  const tokens = raw.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  const products = await listShopifyProducts();
  const out: Array<{
    shopify_product_id: string;
    shopify_variant_id: string;
    product_title: string;
    variant_title: string;
    sku: string | null;
    price: string;
    image_url: string | null;
    options: { option1: string | null; option2: string | null; option3: string | null };
  }> = [];

  for (const p of products) {
    for (const v of p.variants ?? []) {
      // Build a single haystack per variant. Including the product title
      // means a token like "altitude" matches every variant of every
      // Altitude product, while a token like "36" or "black" then narrows
      // it to the right size/color.
      const haystack = [
        p.title,
        v.title,
        v.sku ?? "",
        v.option1 ?? "",
        v.option2 ?? "",
        v.option3 ?? "",
      ]
        .join(" ")
        .toLowerCase();
      const allMatch = tokens.every((t) => haystack.includes(t));
      if (!allMatch) continue;
      out.push({
        shopify_product_id: String(p.id),
        shopify_variant_id: String(v.id),
        product_title: p.title,
        variant_title: v.title,
        sku: v.sku,
        price: v.price,
        image_url: p.image?.src ?? null,
        options: {
          option1: v.option1,
          option2: v.option2,
          option3: v.option3,
        },
      });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

// ─── Order edit (GraphQL Admin API) ──────────────────────────────────────────
//
// Two-mutation flow with an intermediate calculatedOrder. CS Pass 2 Phase
// B-Lite uses this for address auto-write only; item changes and cancels
// stay manual in Shopify admin (and are captured via the manual_log note
// payload variant).
//
//   orderEditBegin(orderId)
//      → returns calculatedOrder.id (intermediate session id, in-flight)
//   orderEditUpdateShippingAddress(calculatedOrderId, address)
//      → stages the address change inside the calc order
//   orderEditCommit(calculatedOrderId)
//      → returns the post-write order id (the idempotency anchor —
//        cs_edit_plans.shopify_commit_id is unique on this value)
//
// Idempotency: cross-model verified — anchor on commit_id, not calc id.
// See learning [shopify-orderedit-two-mutation].

export interface ShopifyMailingAddressInput {
  address1?: string;
  address2?: string;
  city?: string;
  company?: string;
  country?: string;
  countryCode?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  province?: string;
  provinceCode?: string;
  zip?: string;
}

export interface OrderEditBeginResult {
  calculatedOrderId: string;
}

export interface OrderEditCommitResult {
  committedOrderId: string;
}

interface UserError {
  field: string[] | null;
  message: string;
}

function throwOnUserErrors(label: string, errors: UserError[] | undefined): void {
  if (errors && errors.length > 0) {
    const first = errors[0];
    const path = first.field?.join('.') ?? '';
    throw new Error(`${label}${path ? ` [${path}]` : ''}: ${first.message}`);
  }
}

/**
 * Begin an order edit session for the given Shopify order id (numeric, REST id).
 * Returns the calculated-order id used by subsequent edit mutations.
 */
export async function orderEditBegin(
  shopifyOrderId: string | number,
): Promise<OrderEditBeginResult> {
  const gid = `gid://shopify/Order/${shopifyOrderId}`;
  const MUTATION = `
    mutation OrderEditBegin($id: ID!) {
      orderEditBegin(id: $id) {
        calculatedOrder { id }
        userErrors { field message }
      }
    }`;
  type Resp = {
    orderEditBegin: {
      calculatedOrder: { id: string } | null;
      userErrors: UserError[];
    };
  };
  const data = await shopifyGraphQL<Resp>(MUTATION, { id: gid });
  throwOnUserErrors('orderEditBegin', data.orderEditBegin.userErrors);
  const calcId = data.orderEditBegin.calculatedOrder?.id;
  if (!calcId) throw new Error('orderEditBegin: no calculatedOrder returned');
  return { calculatedOrderId: calcId };
}

/**
 * Update the shipping address on an in-progress calculated order. Must follow
 * orderEditBegin and precede orderEditCommit.
 */
export async function orderEditUpdateShippingAddress(
  calculatedOrderId: string,
  address: ShopifyMailingAddressInput,
): Promise<void> {
  const MUTATION = `
    mutation OrderEditUpdateShippingAddress(
      $id: ID!, $address: MailingAddressInput!
    ) {
      orderEditUpdateShippingAddress(id: $id, shippingAddress: $address) {
        calculatedOrder { id }
        userErrors { field message }
      }
    }`;
  type Resp = {
    orderEditUpdateShippingAddress: {
      calculatedOrder: { id: string } | null;
      userErrors: UserError[];
    };
  };
  const data = await shopifyGraphQL<Resp>(MUTATION, {
    id: calculatedOrderId,
    address,
  });
  throwOnUserErrors(
    'orderEditUpdateShippingAddress',
    data.orderEditUpdateShippingAddress.userErrors,
  );
}

/**
 * Commit the calculated order. Returns the post-write Shopify order id used
 * as the idempotency anchor in cs_edit_plans.shopify_commit_id.
 */
export async function orderEditCommit(
  calculatedOrderId: string,
): Promise<OrderEditCommitResult> {
  const MUTATION = `
    mutation OrderEditCommit($id: ID!) {
      orderEditCommit(id: $id, notifyCustomer: false, staffNote: null) {
        order { id }
        userErrors { field message }
      }
    }`;
  type Resp = {
    orderEditCommit: {
      order: { id: string } | null;
      userErrors: UserError[];
    };
  };
  const data = await shopifyGraphQL<Resp>(MUTATION, { id: calculatedOrderId });
  throwOnUserErrors('orderEditCommit', data.orderEditCommit.userErrors);
  const orderId = data.orderEditCommit.order?.id;
  if (!orderId) throw new Error('orderEditCommit: no order returned');
  return { committedOrderId: orderId };
}
