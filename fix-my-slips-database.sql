-- Migration to enhance oddyssey_slips table for better My Slips display
-- This migration adds missing columns and improves data structure

-- 1. Add missing columns if they don't exist
DO $$ 
BEGIN
    -- Add creator_stake column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'oddyssey_slips' 
                   AND column_name = 'creator_stake' 
                   AND table_schema = 'oracle') THEN
        ALTER TABLE oracle.oddyssey_slips ADD COLUMN creator_stake DECIMAL(18, 6) DEFAULT 0.5;
    END IF;
    
    -- Add odds column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'oddyssey_slips' 
                   AND column_name = 'odds' 
                   AND table_schema = 'oracle') THEN
        ALTER TABLE oracle.oddyssey_slips ADD COLUMN odds DECIMAL(10, 6) DEFAULT 1;
    END IF;
    
    -- Add transaction_hash column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'oddyssey_slips' 
                   AND column_name = 'transaction_hash' 
                   AND table_schema = 'oracle') THEN
        ALTER TABLE oracle.oddyssey_slips ADD COLUMN transaction_hash VARCHAR(66);
    END IF;
    
    -- Add creator_address column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'oddyssey_slips' 
                   AND column_name = 'creator_address' 
                   AND table_schema = 'oracle') THEN
        ALTER TABLE oracle.oddyssey_slips ADD COLUMN creator_address VARCHAR(42);
    END IF;
    
    -- Add category column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'oddyssey_slips' 
                   AND column_name = 'category' 
                   AND table_schema = 'oracle') THEN
        ALTER TABLE oracle.oddyssey_slips ADD COLUMN category VARCHAR(50) DEFAULT 'oddyssey';
    END IF;
    
    -- Add uses_bitr column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'oddyssey_slips' 
                   AND column_name = 'uses_bitr' 
                   AND table_schema = 'oracle') THEN
        ALTER TABLE oracle.oddyssey_slips ADD COLUMN uses_bitr BOOLEAN DEFAULT FALSE;
    END IF;
    
    -- Add pool_id column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'oddyssey_slips' 
                   AND column_name = 'pool_id' 
                   AND table_schema = 'oracle') THEN
        ALTER TABLE oracle.oddyssey_slips ADD COLUMN pool_id BIGINT;
    END IF;
    
    -- Add notification_type column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'oddyssey_slips' 
                   AND column_name = 'notification_type' 
                   AND table_schema = 'oracle') THEN
        ALTER TABLE oracle.oddyssey_slips ADD COLUMN notification_type VARCHAR(50) DEFAULT 'slip_placed';
    END IF;
    
    -- Add message column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'oddyssey_slips' 
                   AND column_name = 'message' 
                   AND table_schema = 'oracle') THEN
        ALTER TABLE oracle.oddyssey_slips ADD COLUMN message TEXT DEFAULT 'Your Oddyssey slip has been placed successfully';
    END IF;
    
    -- Add is_read column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'oddyssey_slips' 
                   AND column_name = 'is_read' 
                   AND table_schema = 'oracle') THEN
        ALTER TABLE oracle.oddyssey_slips ADD COLUMN is_read BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- 2. Update existing slips with proper data
UPDATE oracle.oddyssey_slips 
SET 
    creator_stake = 0.5,
    creator_address = player_address,
    category = 'oddyssey',
    uses_bitr = FALSE,
    notification_type = 'slip_placed',
    message = 'Your Oddyssey slip has been placed successfully',
    is_read = FALSE
WHERE creator_stake IS NULL OR creator_address IS NULL;

-- 3. Create comprehensive view for easy querying
CREATE OR REPLACE VIEW oracle.comprehensive_slips AS
SELECT 
    s.slip_id,
    s.cycle_id,
    s.player_address,
    s.creator_address,
    s.pool_id,
    s.transaction_hash,
    s.category,
    s.uses_bitr,
    s.creator_stake,
    s.odds,
    s.notification_type,
    s.message,
    s.is_read,
    s.placed_at as created_at,
    s.predictions,
    s.final_score,
    s.correct_count,
    s.is_evaluated,
    s.leaderboard_rank,
    s.prize_claimed,
    s.tx_hash,
    c.is_resolved as cycle_resolved,
    c.prize_pool,
    c.resolved_at,
    c.cycle_start_time,
    c.cycle_end_time
FROM oracle.oddyssey_slips s
LEFT JOIN oracle.oddyssey_cycles c ON s.cycle_id = c.cycle_id;

-- 4. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_oddyssey_slips_player_placed 
ON oracle.oddyssey_slips(player_address, placed_at DESC);

CREATE INDEX IF NOT EXISTS idx_oddyssey_slips_cycle_player 
ON oracle.oddyssey_slips(cycle_id, player_address);

CREATE INDEX IF NOT EXISTS idx_oddyssey_slips_evaluated 
ON oracle.oddyssey_slips(is_evaluated) WHERE is_evaluated = TRUE;

-- 5. Add comments for documentation
COMMENT ON TABLE oracle.oddyssey_slips IS 'Enhanced Oddyssey slips table with complete metadata for My Slips display';
COMMENT ON COLUMN oracle.oddyssey_slips.creator_stake IS 'Entry fee amount in STT tokens';
COMMENT ON COLUMN oracle.oddyssey_slips.odds IS 'Total calculated odds for the slip';
COMMENT ON COLUMN oracle.oddyssey_slips.transaction_hash IS 'Blockchain transaction hash for slip placement';
COMMENT ON COLUMN oracle.oddyssey_slips.creator_address IS 'Address of slip creator (same as player_address)';
COMMENT ON COLUMN oracle.oddyssey_slips.category IS 'Slip category (default: oddyssey)';
COMMENT ON COLUMN oracle.oddyssey_slips.uses_bitr IS 'Whether slip uses BITR token for fees';
COMMENT ON COLUMN oracle.oddyssey_slips.notification_type IS 'Type of notification for this slip';
COMMENT ON COLUMN oracle.oddyssey_slips.message IS 'Notification message for this slip';
COMMENT ON COLUMN oracle.oddyssey_slips.is_read IS 'Whether notification has been read by user';

-- 6. Verify the migration
SELECT 
    'Migration completed successfully' as status,
    COUNT(*) as total_slips,
    COUNT(CASE WHEN creator_stake IS NOT NULL THEN 1 END) as slips_with_stake,
    COUNT(CASE WHEN creator_address IS NOT NULL THEN 1 END) as slips_with_creator
FROM oracle.oddyssey_slips;
