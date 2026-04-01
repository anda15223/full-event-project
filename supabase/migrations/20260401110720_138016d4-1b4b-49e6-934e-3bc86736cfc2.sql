
-- Create a database function to recalculate invoice statuses based on due_date
CREATE OR REPLACE FUNCTION public.recalculate_invoice_statuses()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE invoices
  SET 
    status = CASE
      WHEN status = 'paid' THEN 'paid'
      WHEN status = 'credit' THEN 'credit'
      WHEN due_date IS NULL THEN 'pending'
      WHEN due_date < CURRENT_DATE THEN 'overdue'
      WHEN due_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'due_soon'
      ELSE 'pending'
    END,
    overdue_flag = CASE
      WHEN status = 'paid' OR status = 'credit' THEN false
      WHEN due_date IS NULL THEN false
      WHEN due_date < CURRENT_DATE THEN true
      ELSE false
    END
  WHERE status NOT IN ('paid', 'credit');
END;
$$;
