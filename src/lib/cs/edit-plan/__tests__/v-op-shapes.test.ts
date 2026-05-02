// @ts-nocheck — vitest is not yet a devDependency in this project.
//
// Run: npx vitest run src/lib/cs/edit-plan/__tests__/v-op-shapes.test.ts
//
// Tests for the Phase B-Lite extensions to op-shapes:
//   - AddressPayloadSchema: optional `reason` field on the same row
//   - NotePayloadSchema: discriminated union of free-text OR manual_shopify_edit
//
// Existing free-text and address tests live alongside the route tests in
// src/app/api/customer-service/orders/[id]/edit-plan/__tests__/v-route.test.ts;
// this file covers ONLY the new variants so the older tests remain the
// regression baseline for the unchanged surface.

import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';

import {
  AddressShippingPayloadSchema,
  AddressBillingPayloadSchema,
  NotePayloadSchema,
  parsePlanItemPayload,
} from '../op-shapes';

// ─── AddressPayloadSchema — optional reason field ────────────────────────────

describe('AddressPayloadSchema — optional reason', () => {
  it('accepts an address with reason', () => {
    const result = parsePlanItemPayload('address_shipping', {
      street: '1 Main St',
      city: 'Manila',
      country: 'PH',
      reason: 'customer moved',
    });
    expect(result.reason).toBe('customer moved');
  });

  it('accepts an address WITHOUT reason (existing shape stays valid)', () => {
    const result = parsePlanItemPayload('address_shipping', {
      street: '1 Main St',
      city: 'Manila',
      country: 'PH',
    });
    expect(result.reason).toBeUndefined();
  });

  it('reason of empty string is accepted (z.string().optional() with no min)', () => {
    // Documentation test: confirm the spec — empty string is a valid optional.
    // Callers that want non-empty enforcement should validate at the UI layer.
    const result = AddressShippingPayloadSchema.safeParse({
      street: '1 Main St',
      city: 'Manila',
      country: 'PH',
      reason: '',
    });
    expect(result.success).toBe(true);
  });

  it('billing address shares the same shape and accepts reason', () => {
    const result = AddressBillingPayloadSchema.parse({
      street: '2 Side St',
      city: 'Cebu',
      country: 'PH',
      reason: 'fraud check',
    });
    expect(result.reason).toBe('fraud check');
  });
});

// ─── NotePayloadSchema — discriminated union ────────────────────────────────

describe('NotePayloadSchema — free-text variant (regression)', () => {
  it('still accepts the original { text: string } shape', () => {
    const result = parsePlanItemPayload('note', { text: 'Gift wrap please' });
    expect((result as { text: string }).text).toBe('Gift wrap please');
  });

  it('still rejects empty text (free-text variant requires min(1))', () => {
    expect(() => parsePlanItemPayload('note', { text: '' })).toThrow(ZodError);
  });
});

describe('NotePayloadSchema — manual_shopify_edit variant', () => {
  const minimalValid = {
    kind: 'manual_shopify_edit' as const,
    op_described: 'item_add' as const,
    summary: 'Added 1x Bottle B',
  };

  it('accepts minimal valid manual-log payload', () => {
    const result = parsePlanItemPayload('note', minimalValid);
    expect(result).toMatchObject(minimalValid);
  });

  it('accepts manual-log with optional reason and shopify_link', () => {
    const result = NotePayloadSchema.parse({
      ...minimalValid,
      reason: 'customer added a bottle on the call',
      shopify_link: 'https://test-shop.myshopify.com/admin/orders/12345',
    });
    expect(result).toMatchObject({
      kind: 'manual_shopify_edit',
      reason: 'customer added a bottle on the call',
    });
  });

  it.each(['item_add', 'item_remove', 'qty_change', 'cancel'] as const)(
    'accepts op_described = %s',
    (op_described) => {
      const result = NotePayloadSchema.parse({ ...minimalValid, op_described });
      expect(result.op_described).toBe(op_described);
    },
  );

  it('rejects unknown op_described value', () => {
    expect(() =>
      NotePayloadSchema.parse({ ...minimalValid, op_described: 'refund' }),
    ).toThrow(ZodError);
  });

  it('rejects empty summary', () => {
    expect(() =>
      NotePayloadSchema.parse({ ...minimalValid, summary: '' }),
    ).toThrow(ZodError);
  });

  it('rejects malformed shopify_link', () => {
    expect(() =>
      NotePayloadSchema.parse({ ...minimalValid, shopify_link: 'not a url' }),
    ).toThrow(ZodError);
  });

  it('rejects missing kind discriminator if other fields are manual-log shaped', () => {
    // Without kind, the union falls through to FreeTextNotePayloadSchema
    // which requires `text`. Both variants fail; ZodError is thrown.
    expect(() =>
      NotePayloadSchema.parse({
        op_described: 'item_add',
        summary: 'whatever',
      }),
    ).toThrow(ZodError);
  });

  it('audit-view filter sees manual-log payloads via payload->>kind', () => {
    // Sanity check that the discriminator is present in the parsed result,
    // mirroring how the SQL audit view will filter:
    //   WHERE op = 'note' AND payload->>'kind' = 'manual_shopify_edit'
    const result = NotePayloadSchema.parse(minimalValid);
    expect((result as { kind: string }).kind).toBe('manual_shopify_edit');
  });
});

// ─── Defensive: payload mismatch across op types ────────────────────────────

describe('parsePlanItemPayload — cross-shape rejection', () => {
  it('rejects a manual-log payload posted under op=address_shipping', () => {
    expect(() =>
      parsePlanItemPayload('address_shipping', {
        kind: 'manual_shopify_edit',
        op_described: 'item_add',
        summary: 'wrong op type',
      }),
    ).toThrow(ZodError);
  });

  it('rejects an address payload posted under op=note', () => {
    expect(() =>
      parsePlanItemPayload('note', {
        street: '1 Main St',
        city: 'Manila',
        country: 'PH',
      }),
    ).toThrow(ZodError);
  });
});
