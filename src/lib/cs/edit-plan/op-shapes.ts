// src/lib/cs/edit-plan/op-shapes.ts
//
// Zod schemas + TypeScript types for each cs_edit_plan_items.op value's
// payload field. op values come from the CHECK constraint in migration
// 00101_cs_pass_2_intake_and_plans.sql:
//   'add_item' | 'remove_item' | 'qty_change' |
//   'address_shipping' | 'address_billing' | 'note'

import { z } from 'zod';

// ─── Per-op payload schemas ───────────────────────────────────────────────────

export const AddItemPayloadSchema = z.object({
  variant_id: z.string(),
  qty: z.number().int().positive(),
  unit_price: z.number().nonnegative(),
});

export const RemoveItemPayloadSchema = z.object({
  /** ID of the existing order_items row to remove. */
  line_item_id: z.string(),
});

export const QtyChangePayloadSchema = z.object({
  /** ID of the existing order_items row to adjust. */
  line_item_id: z.string(),
  /** New quantity. 0 is treated as "remove" in computePlanAnalysis. */
  new_qty: z.number().int().nonnegative(),
});

export const AddressPayloadSchema = z.object({
  street: z.string(),
  city: z.string(),
  province: z.string().optional(),
  country: z.string(),
  zip: z.string().optional(),
  phone: z.string().optional(),
  recipient_name: z.string().optional(),
  // Optional WHY for the address change. Captured at compose time, rendered
  // alongside the row in the audit timeline. No SQL column — payload-scoped.
  reason: z.string().optional(),
});

// Billing address shares the same shape as shipping.
export const AddressShippingPayloadSchema = AddressPayloadSchema;
export const AddressBillingPayloadSchema = AddressPayloadSchema;

// Free-text note (the original shape).
const FreeTextNotePayloadSchema = z.object({
  text: z.string().min(1),
});

// Manual-log capture: rep did an item change / cancel directly in Shopify
// admin (Phase B-Lite does not auto-write those paths). The audit row lives
// here as a structured note rather than a new op type, so no migration is
// needed against the cs_edit_plan_items op CHECK constraint.
//
// Filter for audit views:
//   WHERE op = 'note' AND payload->>'kind' = 'manual_shopify_edit'
const ManualShopifyEditNotePayloadSchema = z.object({
  kind: z.literal('manual_shopify_edit'),
  op_described: z.enum(['item_add', 'item_remove', 'qty_change', 'cancel']),
  summary: z.string().min(1),
  reason: z.string().optional(),
  shopify_link: z.string().url().optional(),
});

// Discriminated union: either a free-text note OR a manual-log entry.
// Existing consumers writing { text: "..." } continue to work unchanged.
export const NotePayloadSchema = z.union([
  FreeTextNotePayloadSchema,
  ManualShopifyEditNotePayloadSchema,
]);

export type ManualShopifyEditNotePayload = z.infer<
  typeof ManualShopifyEditNotePayloadSchema
>;

// ─── TypeScript types inferred from schemas ───────────────────────────────────

export type AddItemPayload = z.infer<typeof AddItemPayloadSchema>;
export type RemoveItemPayload = z.infer<typeof RemoveItemPayloadSchema>;
export type QtyChangePayload = z.infer<typeof QtyChangePayloadSchema>;
export type AddressPayload = z.infer<typeof AddressPayloadSchema>;
export type AddressShippingPayload = AddressPayload;
export type AddressBillingPayload = AddressPayload;
export type NotePayload = z.infer<typeof NotePayloadSchema>;

// ─── Op → schema map ─────────────────────────────────────────────────────────

const OP_SCHEMAS = {
  add_item: AddItemPayloadSchema,
  remove_item: RemoveItemPayloadSchema,
  qty_change: QtyChangePayloadSchema,
  address_shipping: AddressShippingPayloadSchema,
  address_billing: AddressBillingPayloadSchema,
  note: NotePayloadSchema,
} as const;

export type OpType = keyof typeof OP_SCHEMAS;

// ─── Discriminated union helper ───────────────────────────────────────────────

/**
 * Picks the Zod schema for the given op value and parses `payload` with it.
 *
 * Returns the strongly-typed parsed result on success.
 * Throws a ZodError if the payload is invalid.
 * Throws a plain Error if the op is not one of the 6 known values.
 */
export function parsePlanItemPayload(op: string, payload: unknown) {
  const schema = OP_SCHEMAS[op as OpType];
  if (!schema) {
    throw new Error(
      `Unknown op: "${op}". Must be one of: ${Object.keys(OP_SCHEMAS).join(', ')}.`,
    );
  }
  // .parse() throws ZodError on validation failure — callers catch that.
  return schema.parse(payload);
}
