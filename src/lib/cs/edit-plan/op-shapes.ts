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
});

// Billing address shares the same shape as shipping.
export const AddressShippingPayloadSchema = AddressPayloadSchema;
export const AddressBillingPayloadSchema = AddressPayloadSchema;

export const NotePayloadSchema = z.object({
  text: z.string().min(1),
});

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
