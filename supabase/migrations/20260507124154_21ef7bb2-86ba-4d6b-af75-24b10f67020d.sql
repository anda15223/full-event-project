DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'suppliers' 
        AND column_name = 'country'
    ) THEN
        ALTER TABLE suppliers ADD COLUMN country TEXT DEFAULT 'DK';
        
        UPDATE suppliers SET country = 'GR' WHERE slug = 'bikre';
    END IF;
END $$;