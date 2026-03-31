-- Fix JEKA FISH A/S at Aarhus → The Fish Project ApS
UPDATE invoices SET company = 'The Fish Project ApS' WHERE location ILIKE '%aarhus%' AND (company IS NULL OR company = 'Unknown');

-- Fix Reffen → Blue Fish ApS  
UPDATE invoices SET company = 'Blue Fish ApS' WHERE location ILIKE '%reffen%' AND (company IS NULL OR company = 'Unknown' OR company = 'MCA Trading ApS');

-- Fix Lebara → operating_expense category
UPDATE invoices SET category = 'operating_expense' WHERE supplier_name ILIKE '%lebara%';

-- Fix any Unknown company for Gentofte → Aegean ApS
UPDATE invoices SET company = 'Aegean ApS' WHERE location ILIKE '%gentofte%' AND (company IS NULL OR company = 'Unknown');

-- Fix Søborg → The Fish Project ApS
UPDATE invoices SET company = 'The Fish Project ApS' WHERE location ILIKE '%søborg%' AND (company IS NULL OR company = 'Unknown');