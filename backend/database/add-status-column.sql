
-- Add status column to pools table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'oracle' 
        AND table_name = 'pools' 
        AND column_name = 'status'
    ) THEN
        ALTER TABLE oracle.pools ADD COLUMN status VARCHAR(20) DEFAULT 'active';
    END IF;
END $$;

-- Update existing pools to have status based on settled field
UPDATE oracle.pools 
SET status = CASE 
    WHEN settled = true THEN 'settled'
    WHEN settled = false AND event_end_time > EXTRACT(EPOCH FROM NOW()) THEN 'active'
    ELSE 'closed'
END
WHERE status IS NULL;

-- Create index on status column
CREATE INDEX IF NOT EXISTS idx_pools_status ON oracle.pools(status);
