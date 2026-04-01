
-- Add unique constraint to prevent duplicate invoices per email
-- Using a partial unique index since invoice_number can be NULL
CREATE UNIQUE INDEX IF NOT EXISTS invoices_unique_email_invoice_number 
ON invoices (email_id, invoice_number) 
WHERE email_id IS NOT NULL AND invoice_number IS NOT NULL;

-- Fallback dedup: same email + supplier + amount + date
CREATE UNIQUE INDEX IF NOT EXISTS invoices_unique_email_supplier_amount 
ON invoices (email_id, supplier_name, amount, invoice_date) 
WHERE email_id IS NOT NULL AND supplier_name IS NOT NULL;
