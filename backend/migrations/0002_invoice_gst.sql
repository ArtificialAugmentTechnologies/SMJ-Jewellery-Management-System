-- Migration 0002: optional GST on invoices.
-- gst_rate is the total GST percentage (e.g. 3.00 = 1.5% CGST + 1.5% SGST); 0 = no GST.
-- GST is charged on the taxable value (subtotal - discount), so the total rule becomes:
--   grand_total = subtotal - discount + gst_amount
-- Existing invoices get gst_rate = 0 and gst_amount = 0, so their totals are unchanged.

ALTER TABLE invoices
    ADD COLUMN gst_rate   NUMERIC(5, 2)  NOT NULL DEFAULT 0,
    ADD COLUMN gst_amount NUMERIC(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE invoices
    ADD CONSTRAINT invoices_gst_chk CHECK (gst_rate >= 0 AND gst_rate <= 28 AND gst_amount >= 0);

ALTER TABLE invoices DROP CONSTRAINT invoices_total_chk;
ALTER TABLE invoices
    ADD CONSTRAINT invoices_total_chk CHECK (grand_total = subtotal - discount + gst_amount);
