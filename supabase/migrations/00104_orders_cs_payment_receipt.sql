-- supabase/migrations/00104_orders_cs_payment_receipt.sql
-- Adds a separate CS-uploaded receipt slot on orders so CS can attach
-- supplementary proof of payment without overwriting the sales-uploaded
-- one. Both columns point at paths in the same `order-receipts` storage
-- bucket; the path prefix distinguishes them ("orders/<id>/receipt-..."
-- vs "orders/<id>/cs-receipt-...").

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cs_payment_receipt_path text;

-- DOWN:
-- ALTER TABLE public.orders DROP COLUMN IF EXISTS cs_payment_receipt_path;
