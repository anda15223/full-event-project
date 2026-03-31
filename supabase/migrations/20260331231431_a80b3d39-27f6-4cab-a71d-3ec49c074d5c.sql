UPDATE invoices SET location = 'The Fish Project Aarhus', company = 'MCA Trading ApS' WHERE supplier_name ILIKE '%jeka%' AND (location ILIKE '%aarhus%' OR location = 'Aarhus Storage');

UPDATE invoices SET company = 'MCA Trading ApS' WHERE supplier_name ILIKE '%jeka%' AND company != 'MCA Trading ApS';

UPDATE cashflow_entries SET location = 'The Fish Project Aarhus' WHERE supplier_name ILIKE '%jeka%' AND (location ILIKE '%aarhus%' OR location = 'Aarhus Storage');

UPDATE cashflow_entries SET company = 'MCA Trading ApS' WHERE supplier_name ILIKE '%jeka%';

UPDATE ledger SET location = 'The Fish Project Aarhus', company = 'MCA Trading ApS' WHERE supplier_name ILIKE '%jeka%' AND (location ILIKE '%aarhus%' OR location = 'Aarhus Storage');