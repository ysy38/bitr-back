-- Create core schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS core;

-- Create core.users table for reputation tracking
CREATE TABLE IF NOT EXISTS core.users (
    address TEXT PRIMARY KEY,
    reputation INTEGER DEFAULT 40,
    can_sell_predictions BOOLEAN DEFAULT FALSE,
    can_share_articles BOOLEAN DEFAULT FALSE,
    reputation_tier VARCHAR(20) DEFAULT 'NEWCOMER',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create core.reputation_actions table for tracking reputation history
CREATE TABLE IF NOT EXISTS core.reputation_actions (
    id BIGSERIAL PRIMARY KEY,
    user_address TEXT NOT NULL,
    action_type VARCHAR(50) NOT NULL,
    reputation_delta INTEGER NOT NULL,
    associated_value TEXT,
    pool_id TEXT,
    timestamp TIMESTAMP WITH TIME ZONE,
    block_number BIGINT,
    transaction_hash TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create core.user_badges table for badge tracking
CREATE TABLE IF NOT EXISTS core.user_badges (
    id BIGSERIAL PRIMARY KEY,
    user_address TEXT NOT NULL,
    badge_type VARCHAR(50) NOT NULL,
    badge_category VARCHAR(20) NOT NULL,
    title VARCHAR(100) NOT NULL,
    description TEXT,
    icon_name VARCHAR(50),
    rarity VARCHAR(20) DEFAULT 'COMMON',
    criteria_met JSONB,
    earned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create oracle.oddyssey_user_stats table for user statistics
CREATE TABLE IF NOT EXISTS oracle.oddyssey_user_stats (
    user_address TEXT PRIMARY KEY,
    total_slips BIGINT DEFAULT 0,
    total_wins BIGINT DEFAULT 0,
    best_score BIGINT DEFAULT 0,
    win_rate BIGINT DEFAULT 0,
    current_streak INTEGER DEFAULT 0,
    best_streak INTEGER DEFAULT 0,
    last_active_cycle BIGINT,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    block_number BIGINT,
    transaction_hash TEXT
);

-- Create oracle.oddyssey_prize_rollovers table for prize rollover tracking
CREATE TABLE IF NOT EXISTS oracle.oddyssey_prize_rollovers (
    id BIGSERIAL PRIMARY KEY,
    from_cycle_id BIGINT NOT NULL,
    to_cycle_id BIGINT NOT NULL,
    amount NUMERIC(78, 18) NOT NULL,
    rollover_at TIMESTAMP WITH TIME ZONE,
    tx_hash TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(from_cycle_id, to_cycle_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_core_users_reputation ON core.users(reputation);
CREATE INDEX IF NOT EXISTS idx_core_users_tier ON core.users(reputation_tier);
CREATE INDEX IF NOT EXISTS idx_core_reputation_actions_user ON core.reputation_actions(user_address);
CREATE INDEX IF NOT EXISTS idx_core_reputation_actions_type ON core.reputation_actions(action_type);
CREATE INDEX IF NOT EXISTS idx_core_reputation_actions_timestamp ON core.reputation_actions(timestamp);
CREATE INDEX IF NOT EXISTS idx_core_reputation_actions_tx_hash ON core.reputation_actions(transaction_hash);
CREATE INDEX IF NOT EXISTS idx_core_user_badges_user ON core.user_badges(user_address);
CREATE INDEX IF NOT EXISTS idx_core_user_badges_type ON core.user_badges(badge_type);
CREATE INDEX IF NOT EXISTS idx_oracle_oddyssey_user_stats_user ON oracle.oddyssey_user_stats(user_address);
CREATE INDEX IF NOT EXISTS idx_oracle_oddyssey_prize_rollovers_from ON oracle.oddyssey_prize_rollovers(from_cycle_id);
CREATE INDEX IF NOT EXISTS idx_oracle_oddyssey_prize_rollovers_to ON oracle.oddyssey_prize_rollovers(to_cycle_id);

-- Add unique constraints to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_core_reputation_actions_unique 
ON core.reputation_actions(transaction_hash, action_type);

-- Insert default user for the wallet that placed the slip
INSERT INTO core.users (address, reputation, reputation_tier) 
VALUES ('0xA336C7B8cBe75D5787F25A62FE282B83Ac0f3363', 40, 'NEWCOMER')
ON CONFLICT (address) DO NOTHING;
