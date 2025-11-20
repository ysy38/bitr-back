-- Comprehensive Slip Data Fix
-- This script ensures all required slip data is properly structured and available

-- 1. First, let's check what we have in the current oracle.oddyssey_slips table
SELECT 'Current oracle.oddyssey_slips structure:' as info;
\d oracle.oddyssey_slips;

-- 2. Add missing columns to oracle.oddyssey_slips if they don't exist
DO $$ 
BEGIN
    -- Add transaction_hash column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'oracle' 
                   AND table_name = 'oddyssey_slips' 
                   AND column_name = 'transaction_hash') THEN
        ALTER TABLE oracle.oddyssey_slips ADD COLUMN transaction_hash TEXT;
    END IF;

    -- Add creator_address column if it doesn't exist (should be same as player_address)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'oracle' 
                   AND table_name = 'oddyssey_slips' 
                   AND column_name = 'creator_address') THEN
        ALTER TABLE oracle.oddyssey_slips ADD COLUMN creator_address TEXT;
    END IF;

    -- Add category column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'oracle' 
                   AND table_name = 'oddyssey_slips' 
                   AND column_name = 'category') THEN
        ALTER TABLE oracle.oddyssey_slips ADD COLUMN category TEXT DEFAULT 'oddyssey';
    END IF;

    -- Add uses_bitr column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'oracle' 
                   AND table_name = 'oddyssey_slips' 
                   AND column_name = 'uses_bitr') THEN
        ALTER TABLE oracle.oddyssey_slips ADD COLUMN uses_bitr BOOLEAN DEFAULT false;
    END IF;

    -- Add creator_stake column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'oracle' 
                   AND table_name = 'oddyssey_slips' 
                   AND column_name = 'creator_stake') THEN
        ALTER TABLE oracle.oddyssey_slips ADD COLUMN creator_stake NUMERIC(18, 6) DEFAULT 0;
    END IF;

    -- Add odds column if it doesn't exist (total odds for the slip)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'oracle' 
                   AND table_name = 'oddyssey_slips' 
                   AND column_name = 'odds') THEN
        ALTER TABLE oracle.oddyssey_slips ADD COLUMN odds NUMERIC(10, 6) DEFAULT 1;
    END IF;

    -- Add pool_id column if it doesn't exist (for compatibility with other slip types)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'oracle' 
                   AND table_name = 'oddyssey_slips' 
                   AND column_name = 'pool_id') THEN
        ALTER TABLE oracle.oddyssey_slips ADD COLUMN pool_id BIGINT;
    END IF;

    -- Add notification_type column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'oracle' 
                   AND table_name = 'oddyssey_slips' 
                   AND column_name = 'notification_type') THEN
        ALTER TABLE oracle.oddyssey_slips ADD COLUMN notification_type TEXT DEFAULT 'slip_placed';
    END IF;

    -- Add message column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'oracle' 
                   AND table_name = 'oddyssey_slips' 
                   AND column_name = 'message') THEN
        ALTER TABLE oracle.oddyssey_slips ADD COLUMN message TEXT DEFAULT 'Your Oddyssey slip has been placed successfully';
    END IF;

    -- Add is_read column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'oracle' 
                   AND table_name = 'oddyssey_slips' 
                   AND column_name = 'is_read') THEN
        ALTER TABLE oracle.oddyssey_slips ADD COLUMN is_read BOOLEAN DEFAULT false;
    END IF;

END $$;

-- 3. Update existing records to populate new columns
UPDATE oracle.oddyssey_slips 
SET 
    creator_address = player_address,
    transaction_hash = tx_hash,
    odds = 1.0, -- Default odds, will be calculated from predictions
    creator_stake = 0.5, -- Default entry fee
    category = 'oddyssey',
    uses_bitr = false,
    pool_id = slip_id, -- Use slip_id as pool_id for compatibility
    notification_type = 'slip_placed',
    message = 'Your Oddyssey slip has been placed successfully',
    is_read = false
WHERE creator_address IS NULL;

-- 4. Create a view that combines all slip data for easy querying
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

-- 5. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_oddyssey_slips_creator_address ON oracle.oddyssey_slips(creator_address);
CREATE INDEX IF NOT EXISTS idx_oddyssey_slips_transaction_hash ON oracle.oddyssey_slips(transaction_hash);
CREATE INDEX IF NOT EXISTS idx_oddyssey_slips_category ON oracle.oddyssey_slips(category);
CREATE INDEX IF NOT EXISTS idx_oddyssey_slips_created_at ON oracle.oddyssey_slips(placed_at);

-- 6. Show the final structure
SELECT 'Updated oracle.oddyssey_slips structure:' as info;
\d oracle.oddyssey_slips;

-- 7. Show sample data
SELECT 'Sample comprehensive slip data:' as info;
SELECT 
    slip_id,
    cycle_id,
    player_address,
    creator_address,
    transaction_hash,
    category,
    creator_stake,
    odds,
    placed_at,
    is_evaluated,
    final_score
FROM oracle.oddyssey_slips 
LIMIT 5;

-- 8. Verify the comprehensive view
SELECT 'Comprehensive view sample:' as info;
SELECT 
    slip_id,
    cycle_id,
    player_address,
    creator_address,
    transaction_hash,
    category,
    creator_stake,
    odds,
    created_at,
    is_evaluated,
    final_score,
    cycle_resolved
FROM oracle.comprehensive_slips 
LIMIT 5;
