-- Fix missing unique constraint on core.reputation_actions.transaction_hash
-- This prevents "ON CONFLICT (transaction_hash) DO NOTHING" errors

-- Add unique constraint to reputation_actions to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_core_reputation_actions_unique 
ON core.reputation_actions(transaction_hash, action_type);

-- Also add the missing 'points' column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'core' 
        AND table_name = 'reputation_actions' 
        AND column_name = 'points'
    ) THEN
        ALTER TABLE core.reputation_actions ADD COLUMN points INTEGER DEFAULT 0;
        COMMENT ON COLUMN core.reputation_actions.points IS 'Reputation points earned from this action';
    END IF;
END $$;

-- Display confirmation
DO $$
BEGIN
    RAISE NOTICE '✅ Unique constraint added to core.reputation_actions';
    RAISE NOTICE '✅ Points column ensured in core.reputation_actions';
END $$;

