# Create Order Page — Sales Agent

**Status:** 🟡 TO BE CONTINUED — awaiting full flow design from user
**Created:** 2026-04-22
**Owner:** Finn / Sales Agent team

---

## Goal

Rename `/sales-agent/confirmed-sales` → `/sales-agent/create-order`, convert the page into a real order-creation flow that:

1. Creates orders in Shopify (with option to reference existing Shopify orders)
2. Integrates with Operations' inventory system (read stock + decrement on order)
3. Preserves agent-specific metadata currently tracked in `sales_confirmed_sales`

---

## Done so far (2026-04-22)

### Nav restructure — already shipped in working tree
- New nav group **"Sales Agent"** in `src/lib/permissions/nav.ts` — visible to all users in `sales` department
- **"Sales Ops"** group gated to `minTier: 2` (managers + OPS only)
- Moved page folder: `src/app/(dashboard)/sales-ops/confirmed-sales/` → `src/app/(dashboard)/sales-agent/confirmed-sales/`
- Updated nav route and `sales-dashboard.tsx` tile link

### Remaining rename (not yet done — part of this plan)
- Rename folder: `sales-agent/confirmed-sales/` → `sales-agent/create-order/`
- Rename nav label: "Chat Sales" → "Create Order"
- Rename nav slug: `confirmed-sales` → `create-order`
- Route: `/sales-agent/confirmed-sales` → `/sales-agent/create-order`
- Rename the view file + component: `confirmed-sales-view.tsx` → `create-order-view.tsx`, `ConfirmedSalesView` → `CreateOrderView`
- Update `sales-dashboard.tsx` tile link

---

## Codebase inventory (verified by Explore agent, 2026-04-22)

### Shopify — what already exists
| Piece | Location | Purpose |
|---|---|---|
| REST API client | `src/lib/shopify/client.ts` | Read-only today: `fetchShopifyOrderByNumber()`, `fetchShopifyOrders()`, etc. Uses env vars `SHOPIFY_ACCESS_TOKEN`, `SHOPIFY_SHOP_DOMAIN`. REST Admin API 2024-01. |
| Order lookup route | `src/app/api/sales/shopify-order/route.ts` | GET `?order_number=X` — DB-first, falls back to live Shopify API. Returns normalized shape. |
| Sync route | `src/app/api/sales/shopify-sync/route.ts` | POST — pulls orders down from Shopify into `shopify_orders` table (25-hour window or backfill). |
| Stats route | `src/app/api/sales/shopify-stats/route.ts` | GET — aggregated sales stats for reporting. |
| Shopify page | `src/app/(dashboard)/sales-ops/shopify/page.tsx` | Reconciliation dashboard. |

**What's missing:** no `createShopifyOrder()` — client is read-only. Need to add POST to `/admin/api/2024-01/orders.json` (or `draft_orders.json`).

### Operations — what already exists
| Piece | Location | Purpose |
|---|---|---|
| Catalog API | `src/app/api/operations/catalog/route.ts` | GET/POST/PATCH/DELETE on `catalog_items`. Filters: search, family, active. |
| Inventory API | `src/app/api/operations/inventory/route.ts` | GET joins `inventory_records` + `catalog_items`. POST creates an adjustment with `adjustment_type: received\|dispatched\|returned\|damaged\|correction\|reserved\|released` — auto-updates `inventory_records` + logs to `inventory_movements`. |
| Orders API | `src/app/api/operations/orders/route.ts` | GET/POST/PATCH/DELETE on `ops_orders` + `ops_order_items`. Supports bulk line-item insert. |

### Database tables
```
shopify_orders       — synced from Shopify (00024_shopify.sql)
sales_confirmed_sales — agent-logged sales metadata (00006_sales.sql)
catalog_items        — SKU/product master (00049_operations_system.sql)
inventory_records    — available_qty, reserved_qty, damaged_qty per catalog_item
inventory_movements  — append-only audit trail
ops_orders           — operations-side order (linkable to shopify_orders via FK)
ops_order_items      — line items with catalog_item_id FK
dispatch_queue       — fulfillment pipeline
```

---

## Proposed build (DRAFT — awaiting user's full flow design)

### 1. Add Shopify order-creation capability
- Extend `src/lib/shopify/client.ts` with `createShopifyOrder(input)` or `createShopifyDraftOrder(input)` — **decision pending: full order vs draft order**
- New route `POST /api/sales/shopify-order` (currently GET-only)

### 2. New orchestration route
- `POST /api/sales/create-order` that chains: create in Shopify → mirror to `ops_orders` + `ops_order_items` → decrement inventory → (optionally) log to `sales_confirmed_sales`
- Needs rollback/compensation on partial failure (Shopify created but DB insert fails, etc.)

### 3. New Create Order page UI
- Form with: (a) optional existing-Shopify-order lookup, (b) product picker from catalog with live stock display, (c) customer + payment fields, (d) line items with qty, (e) submit
- Reuse existing `ShopifyOrder` auto-fill shape from `GET /api/sales/shopify-order`

### 4. What to do with `sales_confirmed_sales` table — **UNDECIDED**
User response: *"We'll modify it but first I need to explain the entire flow to you"* — so schema changes TBD.

Currently captures: `confirmed_date`, `hour_range`, `duration_text`, `order_id` (text), `agent_id`, `sale_type`, `design`, `quantity`, `net_value`, `discount_offered`, `abandoned_cart`, `ads_source`, `alex_assist`, `payment_mode`, `status`, `notes`, `source`.

Likely direction: keep as agent-activity log, link to `ops_orders` via FK or shared order_id, possibly drop redundant fields (design, quantity, net_value now come from line items).

---

## Open questions for user to answer when design session resumes

1. **Full order vs draft order?** Shopify Admin API supports both:
   - `POST /orders.json` — real order (requires customer, line items, and typically payment info; creates a finalized record)
   - `POST /draft_orders.json` — pending order (can be completed later; flexible for agent-assisted sales)

2. **Stock decrement timing:**
   - `reserved` at order creation → `dispatched` at actual ship, or
   - `dispatched` immediately at order creation?

3. **Customer data source:**
   - Agent fills every time, or
   - Lookup existing Shopify customers by phone/email?

4. **Payment handling:**
   - Mark as paid (COD / prepaid), or
   - Send invoice/checkout link to customer, or
   - Both, selectable?

5. **Relationship with existing `sales_confirmed_sales` records:**
   - Keep historical records as-is (read-only legacy), or
   - Migrate them into the new model?

6. **Failure handling:**
   - If Shopify create succeeds but DB mirror fails — retry, manual reconcile, or auto-compensate (delete Shopify order)?

7. **Authorization:**
   - Any Sales Agent can create? Or is there a tier/approval step?

8. **Pre-order support:**
   - `dispatch_queue.is_preorder` exists — should Create Order page expose this toggle?

9. **Multi-item orders vs single-item?** Current `sales_confirmed_sales.design` is a single text field; ops_order_items is multi-row.

10. **Order number generation:**
    - Use Shopify's auto-generated order number, or
    - Custom agent-side prefix (e.g. `AGT-2026-0001`) that maps to a Shopify order?

---

## Impact analysis (to run when ready to execute)

Symbols likely to be modified — MUST run `gitnexus_impact` before editing:
- `confirmed-sales-view.tsx` (full rewrite)
- `src/app/api/sales/confirmed-sales/route.ts` (may be deprecated or repurposed)
- `src/lib/shopify/client.ts` (extend with create functions)
- `src/lib/permissions/nav.ts` (slug/label/route update)
- `src/app/(dashboard)/sales-ops/sales-dashboard.tsx` (tile link)

---

## Next steps

1. **User walks through full intended UX flow** (pending)
2. Answer the 10 open questions above
3. Write a concrete migration plan for `sales_confirmed_sales` schema changes
4. Write the Shopify create-order client function with exact field mapping
5. Design the orchestration route's rollback behavior
6. Execute with TDD on the orchestration route (highest-risk piece)
