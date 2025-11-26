-- Fix missing tables for pool refunds and prize rollovers
-- This script adds the missing database tables that the indexers are trying to use

-- 1. Create pool_refunds table to track when pools are refunded
CREATE TABLE IF NOT EXISTS oracle.pool_refunds (
    id SERIAL PRIMARY KEY,
    pool_id BIGINT NOT NULL,
    reason TEXT NOT NULL,
    refunded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    block_number BIGINT,
    transaction_hash TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_pool_refunds_pool_id ON oracle.pool_refunds(pool_id);
CREATE INDEX IF NOT EXISTS idx_pool_refunds_created_at ON oracle.pool_refunds(created_at);

-- 2. Create oddyssey_prize_rollovers table to track prize rollovers
CREATE TABLE IF NOT EXISTS oracle.oddyssey_prize_rollovers (
    id SERIAL PRIMARY KEY,
    from_cycle_id BIGINT NOT NULL,
    to_cycle_id BIGINT NOT NULL,
    amount NUMERIC NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(from_cycle_id, to_cycle_id)
);

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_oddyssey_prize_rollovers_from_cycle ON oracle.oddyssey_prize_rollovers(from_cycle_id);
CREATE INDEX IF NOT EXISTS idx_oddyssey_prize_rollovers_to_cycle ON oracle.oddyssey_prize_rollovers(to_cycle_id);

-- 3. Add missing columns to pools table if they don't exist
DO $$
BEGIN
    -- Add total_creator_side_stake column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'oracle' AND table_name = 'pools' 
                   AND column_name = 'total_creator_side_stake') THEN
        ALTER TABLE oracle.pools ADD COLUMN total_creator_side_stake BIGINT;
    END IF;

    -- Add max_bettor_stake column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'oracle' AND table_name = 'pools' 
                   AND column_name = 'max_bettor_stake') THEN
        ALTER TABLE oracle.pools ADD COLUMN max_bettor_stake BIGINT;
    END IF;

    -- Add total_bettor_stake column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'oracle' AND table_name = 'pools' 
                   AND column_name = 'total_bettor_stake') THEN
        ALTER TABLE oracle.pools ADD COLUMN total_bettor_stake BIGINT DEFAULT 0;
    END IF;

    -- Add creator_side_won column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'oracle' AND table_name = 'pools' 
                   AND column_name = 'creator_side_won') THEN
        ALTER TABLE oracle.pools ADD COLUMN creator_side_won BOOLEAN;
    END IF;

    -- Add betting_end_time column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'oracle' AND table_name = 'pools' 
                   AND column_name = 'betting_end_time') THEN
        ALTER TABLE oracle.pools ADD COLUMN betting_end_time BIGINT;
    END IF;

    -- Add arbitration_deadline column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'oracle' AND table_name = 'pools' 
                   AND column_name = 'arbitration_deadline') THEN
        ALTER TABLE oracle.pools ADD COLUMN arbitration_deadline BIGINT;
    END IF;

    -- Add filled_above_60 column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'oracle' AND table_name = 'pools' 
                   AND column_name = 'filled_above_60') THEN
        ALTER TABLE oracle.pools ADD COLUMN filled_above_60 BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- 4. Create combo_pools table for combo pool tracking
CREATE TABLE IF NOT EXISTS oracle.combo_pools (
    combo_pool_id BIGINT PRIMARY KEY,
    creator_address TEXT NOT NULL,
    creator_stake BIGINT NOT NULL,
    total_creator_side_stake BIGINT NOT NULL,
    max_bettor_stake BIGINT NOT NULL,
    total_bettor_stake BIGINT DEFAULT 0,
    total_odds INTEGER NOT NULL,
    settled BOOLEAN DEFAULT FALSE,
    creator_side_won BOOLEAN,
    uses_bitr BOOLEAN NOT NULL,
    event_start_time BIGINT NOT NULL,
    event_end_time BIGINT NOT NULL,
    betting_end_time BIGINT NOT NULL,
    result_timestamp BIGINT,
    category TEXT,
    max_bet_per_user BIGINT,
    tx_hash TEXT,
    block_number BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    settled_at TIMESTAMP WITH TIME ZONE
);

-- Add indexes for combo_pools
CREATE INDEX IF NOT EXISTS idx_combo_pools_creator ON oracle.combo_pools(creator_address);
CREATE INDEX IF NOT EXISTS idx_combo_pools_settled ON oracle.combo_pools(settled);
CREATE INDEX IF NOT EXISTS idx_combo_pools_category ON oracle.combo_pools(category);

-- 5. Create combo_pool_conditions table for combo pool conditions
CREATE TABLE IF NOT EXISTS oracle.combo_pool_conditions (
    id SERIAL PRIMARY KEY,
    combo_pool_id BIGINT NOT NULL REFERENCES oracle.combo_pools(combo_pool_id),
    market_id TEXT NOT NULL,
    expected_outcome TEXT NOT NULL,
    resolved BOOLEAN DEFAULT FALSE,
    actual_outcome TEXT,
    condition_index INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for combo_pool_conditions
CREATE INDEX IF NOT EXISTS idx_combo_pool_conditions_pool_id ON oracle.combo_pool_conditions(combo_pool_id);
CREATE INDEX IF NOT EXISTS idx_combo_pool_conditions_market_id ON oracle.combo_pool_conditions(market_id);

-- 6. Create combo_pool_bets table for combo pool bets
CREATE TABLE IF NOT EXISTS oracle.combo_pool_bets (
    id SERIAL PRIMARY KEY,
    combo_pool_id BIGINT NOT NULL REFERENCES oracle.combo_pools(combo_pool_id),
    bettor_address TEXT NOT NULL,
    amount BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    block_number BIGINT,
    transaction_hash TEXT
);

-- Add indexes for combo_pool_bets
CREATE INDEX IF NOT EXISTS idx_combo_pool_bets_pool_id ON oracle.combo_pool_bets(combo_pool_id);
CREATE INDEX IF NOT EXISTS idx_combo_pool_bets_bettor ON oracle.combo_pool_bets(bettor_address);

-- 7. Create combo_pool_lps table for combo pool liquidity providers
CREATE TABLE IF NOT EXISTS oracle.combo_pool_lps (
    id SERIAL PRIMARY KEY,
    combo_pool_id BIGINT NOT NULL REFERENCES oracle.combo_pools(combo_pool_id),
    lp_address TEXT NOT NULL,
    stake BIGINT NOT NULL,
    claimed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for combo_pool_lps
CREATE INDEX IF NOT EXISTS idx_combo_pool_lps_pool_id ON oracle.combo_pool_lps(combo_pool_id);
CREATE INDEX IF NOT EXISTS idx_combo_pool_lps_address ON oracle.combo_pool_lps(lp_address);

-- 8. Create boost_tiers table for pool boost tracking
CREATE TABLE IF NOT EXISTS oracle.pool_boost_tiers (
    id SERIAL PRIMARY KEY,
    pool_id BIGINT NOT NULL,
    tier INTEGER NOT NULL, -- 0=NONE, 1=BRONZE, 2=SILVER, 3=GOLD
    expiry BIGINT NOT NULL,
    fee BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for boost_tiers
CREATE INDEX IF NOT EXISTS idx_pool_boost_tiers_pool_id ON oracle.pool_boost_tiers(pool_id);
CREATE INDEX IF NOT EXISTS idx_pool_boost_tiers_expiry ON oracle.pool_boost_tiers(expiry);

-- 9. Create pool_claims table for tracking who has claimed rewards
CREATE TABLE IF NOT EXISTS oracle.pool_claims (
    id SERIAL PRIMARY KEY,
    pool_id BIGINT NOT NULL,
    user_address TEXT NOT NULL,
    amount BIGINT NOT NULL,
    claimed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    block_number BIGINT,
    transaction_hash TEXT,
    UNIQUE(pool_id, user_address)
);

-- Add indexes for pool_claims
CREATE INDEX IF NOT EXISTS idx_pool_claims_pool_id ON oracle.pool_claims(pool_id);
CREATE INDEX IF NOT EXISTS idx_pool_claims_user ON oracle.pool_claims(user_address);

-- 10. Create pool_liquidity_providers table for LP tracking
CREATE TABLE IF NOT EXISTS oracle.pool_liquidity_providers (
    id SERIAL PRIMARY KEY,
    pool_id BIGINT NOT NULL,
    lp_address TEXT NOT NULL,
    stake BIGINT NOT NULL,
    claimed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(pool_id, lp_address)
);

-- Add indexes for pool_liquidity_providers
CREATE INDEX IF NOT EXISTS idx_pool_liquidity_providers_pool_id ON oracle.pool_liquidity_providers(pool_id);
CREATE INDEX IF NOT EXISTS idx_pool_liquidity_providers_address ON oracle.pool_liquidity_providers(lp_address);

-- 11. Create pool_whitelist table for private pools
CREATE TABLE IF NOT EXISTS oracle.pool_whitelist (
    id SERIAL PRIMARY KEY,
    pool_id BIGINT NOT NULL,
    user_address TEXT NOT NULL,
    whitelisted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(pool_id, user_address)
);

-- Add indexes for pool_whitelist
CREATE INDEX IF NOT EXISTS idx_pool_whitelist_pool_id ON oracle.pool_whitelist(pool_id);
CREATE INDEX IF NOT EXISTS idx_pool_whitelist_user ON oracle.pool_whitelist(user_address);

COMMENT ON TABLE oracle.pool_refunds IS 'Tracks when pools are refunded due to no bets or arbitration timeout';
COMMENT ON TABLE oracle.oddyssey_prize_rollovers IS 'Tracks prize rollovers from one cycle to the next when no one meets minimum requirements';
COMMENT ON TABLE oracle.combo_pools IS 'Tracks combo pools (multiple conditions)';
COMMENT ON TABLE oracle.combo_pool_conditions IS 'Tracks individual conditions within combo pools';
COMMENT ON TABLE oracle.combo_pool_bets IS 'Tracks bets placed on combo pools';
COMMENT ON TABLE oracle.combo_pool_lps IS 'Tracks liquidity providers for combo pools';
COMMENT ON TABLE oracle.pool_boost_tiers IS 'Tracks pool boost tiers and expiry times';
COMMENT ON TABLE oracle.pool_claims IS 'Tracks who has claimed rewards from pools';
COMMENT ON TABLE oracle.pool_liquidity_providers IS 'Tracks liquidity providers for regular pools';
COMMENT ON TABLE oracle.pool_whitelist IS 'Tracks whitelisted users for private pools';
