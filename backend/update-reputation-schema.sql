-- Add missing columns to existing reputation tables

-- Add missing columns to oracle.oddyssey_user_stats
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'oracle' AND table_name = 'oddyssey_user_stats' AND column_name = 'current_streak') THEN
        ALTER TABLE oracle.oddyssey_user_stats ADD COLUMN current_streak INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'oracle' AND table_name = 'oddyssey_user_stats' AND column_name = 'best_streak') THEN
        ALTER TABLE oracle.oddyssey_user_stats ADD COLUMN best_streak INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'oracle' AND table_name = 'oddyssey_user_stats' AND column_name = 'last_active_cycle') THEN
        ALTER TABLE oracle.oddyssey_user_stats ADD COLUMN last_active_cycle BIGINT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'oracle' AND table_name = 'oddyssey_user_stats' AND column_name = 'block_number') THEN
        ALTER TABLE oracle.oddyssey_user_stats ADD COLUMN block_number BIGINT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'oracle' AND table_name = 'oddyssey_user_stats' AND column_name = 'transaction_hash') THEN
        ALTER TABLE oracle.oddyssey_user_stats ADD COLUMN transaction_hash TEXT;
    END IF;
END $$;

-- Add missing columns to oracle.oddyssey_prize_rollovers
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'oracle' AND table_name = 'oddyssey_prize_rollovers' AND column_name = 'rollover_at') THEN
        ALTER TABLE oracle.oddyssey_prize_rollovers ADD COLUMN rollover_at TIMESTAMP WITH TIME ZONE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'oracle' AND table_name = 'oddyssey_prize_rollovers' AND column_name = 'tx_hash') THEN
        ALTER TABLE oracle.oddyssey_prize_rollovers ADD COLUMN tx_hash TEXT;
    END IF;
END $$;

-- Add unique constraint to prevent duplicate rollovers
ALTER TABLE oracle.oddyssey_prize_rollovers 
ADD CONSTRAINT IF NOT EXISTS unique_rollover UNIQUE(from_cycle_id, to_cycle_id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_oracle_oddyssey_user_stats_user ON oracle.oddyssey_user_stats(user_address);
CREATE INDEX IF NOT EXISTS idx_oracle_oddyssey_prize_rollovers_from ON oracle.oddyssey_prize_rollovers(from_cycle_id);
CREATE INDEX IF NOT EXISTS idx_oracle_oddyssey_prize_rollovers_to ON oracle.oddyssey_prize_rollovers(to_cycle_id);

-- Add unique constraint to reputation_actions to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_core_reputation_actions_unique 
ON core.reputation_actions(transaction_hash, action_type);
