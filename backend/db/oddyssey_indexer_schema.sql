-- Oddyssey Indexer Database Schema
-- Tables for storing indexed Oddyssey contract events

-- User preferences table
CREATE TABLE IF NOT EXISTS oracle.oddyssey_user_preferences (
    user_address TEXT PRIMARY KEY,
    auto_evaluate BOOLEAN DEFAULT FALSE,
    auto_claim BOOLEAN DEFAULT FALSE,
    notifications BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User statistics table
CREATE TABLE IF NOT EXISTS oracle.oddyssey_user_stats (
    user_address TEXT PRIMARY KEY,
    total_slips BIGINT DEFAULT 0,
    total_wins BIGINT DEFAULT 0,
    best_score BIGINT DEFAULT 0,
    average_score BIGINT DEFAULT 0,
    win_rate BIGINT DEFAULT 0, -- Scaled by 10000, e.g., 5000 = 50%
    current_streak BIGINT DEFAULT 0,
    best_streak BIGINT DEFAULT 0,
    last_active_cycle BIGINT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Prize claims table
CREATE TABLE IF NOT EXISTS oracle.oddyssey_prize_claims (
    cycle_id BIGINT,
    player_address TEXT,
    rank INTEGER,
    amount BIGINT,
    claimed_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (cycle_id, player_address)
);

-- Note: oracle.oddyssey_cycles and oracle.oddyssey_slips tables are already created in oddyssey_schema.sql
-- These duplicate definitions are removed to prevent conflicts

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_oddyssey_user_preferences_user ON oracle.oddyssey_user_preferences(user_address);
CREATE INDEX IF NOT EXISTS idx_oddyssey_user_stats_user ON oracle.oddyssey_user_stats(user_address);
CREATE INDEX IF NOT EXISTS idx_oddyssey_prize_claims_cycle ON oracle.oddyssey_prize_claims(cycle_id);
CREATE INDEX IF NOT EXISTS idx_oddyssey_prize_claims_player ON oracle.oddyssey_prize_claims(player_address);
-- Note: Indexes for oracle.oddyssey_cycles and oracle.oddyssey_slips are already created in oddyssey_schema.sql

-- Views for easy querying
-- Note: oracle.oddyssey_leaderboard view is already created in oddyssey_schema.sql
-- This view was causing conflicts, so it's removed from this file

-- View for user performance analytics
CREATE OR REPLACE VIEW oracle.oddyssey_user_analytics AS
SELECT 
    us.user_address,
    us.total_slips,
    us.total_wins,
    us.best_score,
    us.win_rate,
    us.current_streak,
    us.best_streak,
    up.auto_evaluate,
    up.auto_claim,
    up.notifications,
    us.updated_at as last_updated
FROM oracle.oddyssey_user_stats us
LEFT JOIN oracle.oddyssey_user_preferences up ON us.user_address = up.user_address;

-- View for cycle statistics
CREATE OR REPLACE VIEW oracle.oddyssey_cycle_stats AS
SELECT 
    c.cycle_id,
    c.created_at,
    c.updated_at,
    c.matches_count,
    c.is_resolved,
    c.resolved_at,
    COUNT(s.slip_id) as total_slips,
    COUNT(CASE WHEN s.is_evaluated THEN 1 END) as evaluated_slips,
    COUNT(CASE WHEN s.correct_count >= 7 THEN 1 END) as qualifying_slips,
    AVG(s.final_score) as average_score,
    MAX(s.final_score) as highest_score
FROM oracle.oddyssey_cycles c
LEFT JOIN oracle.oddyssey_slips s ON c.cycle_id = s.cycle_id
GROUP BY c.cycle_id, c.created_at, c.updated_at, c.matches_count, c.is_resolved, c.resolved_at
ORDER BY c.cycle_id DESC; 