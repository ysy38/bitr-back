-- =====================================================
-- DAILY STATS SCHEMA - Platform and User Analytics
-- =====================================================
-- This schema provides comprehensive daily statistics
-- for platform analytics and user performance tracking
-- =====================================================

-- Daily platform statistics
CREATE TABLE IF NOT EXISTS analytics.daily_platform_stats (
    id BIGSERIAL PRIMARY KEY,
    date DATE NOT NULL UNIQUE,
    
    -- Pool statistics
    pools_created INTEGER DEFAULT 0,
    pools_settled INTEGER DEFAULT 0,
    pools_active INTEGER DEFAULT 0,
    
    -- Volume statistics (STT and BITR)
    volume_stt NUMERIC(78, 18) DEFAULT 0,
    volume_bitr NUMERIC(78, 18) DEFAULT 0,
    total_volume NUMERIC(78, 18) DEFAULT 0,
    
    -- Betting statistics
    bets_placed INTEGER DEFAULT 0,
    bets_won INTEGER DEFAULT 0,
    bets_lost INTEGER DEFAULT 0,
    win_rate NUMERIC(5, 2) DEFAULT 0,
    
    -- User statistics
    active_users INTEGER DEFAULT 0,
    new_users INTEGER DEFAULT 0,
    returning_users INTEGER DEFAULT 0,
    
    -- Oracle type breakdown
    guided_pools INTEGER DEFAULT 0,
    open_pools INTEGER DEFAULT 0,
    guided_volume NUMERIC(78, 18) DEFAULT 0,
    open_volume NUMERIC(78, 18) DEFAULT 0,
    
    -- Category breakdown
    football_pools INTEGER DEFAULT 0,
    crypto_pools INTEGER DEFAULT 0,
    football_volume NUMERIC(78, 18) DEFAULT 0,
    crypto_volume NUMERIC(78, 18) DEFAULT 0,
    
    -- Oddyssey statistics
    oddyssey_slips INTEGER DEFAULT 0,
    oddyssey_players INTEGER DEFAULT 0,
    oddyssey_prizes_claimed NUMERIC(78, 18) DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Daily user statistics
CREATE TABLE IF NOT EXISTS analytics.daily_user_stats (
    id BIGSERIAL PRIMARY KEY,
    date DATE NOT NULL,
    user_address VARCHAR(42) NOT NULL,
    
    -- Pool creation stats
    pools_created INTEGER DEFAULT 0,
    pools_won INTEGER DEFAULT 0,
    pools_lost INTEGER DEFAULT 0,
    pool_win_rate NUMERIC(5, 2) DEFAULT 0,
    
    -- Betting stats
    bets_placed INTEGER DEFAULT 0,
    bets_won INTEGER DEFAULT 0,
    bets_lost INTEGER DEFAULT 0,
    bet_win_rate NUMERIC(5, 2) DEFAULT 0,
    
    -- Volume stats
    volume_stt NUMERIC(78, 18) DEFAULT 0,
    volume_bitr NUMERIC(78, 18) DEFAULT 0,
    total_volume NUMERIC(78, 18) DEFAULT 0,
    
    -- Profit/Loss
    profit_stt NUMERIC(78, 18) DEFAULT 0,
    profit_bitr NUMERIC(78, 18) DEFAULT 0,
    net_profit NUMERIC(78, 18) DEFAULT 0,
    
    -- Activity stats
    login_count INTEGER DEFAULT 0,
    session_duration_minutes INTEGER DEFAULT 0,
    last_activity TIMESTAMP WITH TIME ZONE,
    
    -- Oracle type usage
    guided_pools_created INTEGER DEFAULT 0,
    open_pools_created INTEGER DEFAULT 0,
    guided_bets INTEGER DEFAULT 0,
    open_bets INTEGER DEFAULT 0,
    
    -- Category usage
    football_activity INTEGER DEFAULT 0,
    crypto_activity INTEGER DEFAULT 0,
    
    -- Oddyssey participation
    oddyssey_slips INTEGER DEFAULT 0,
    oddyssey_wins INTEGER DEFAULT 0,
    oddyssey_prizes NUMERIC(78, 18) DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Composite unique constraint
    UNIQUE(date, user_address)
);

-- Daily category statistics
CREATE TABLE IF NOT EXISTS analytics.daily_category_stats (
    id BIGSERIAL PRIMARY KEY,
    date DATE NOT NULL,
    category VARCHAR(100) NOT NULL,
    
    -- Pool stats
    pools_created INTEGER DEFAULT 0,
    pools_settled INTEGER DEFAULT 0,
    pools_won INTEGER DEFAULT 0,
    pools_lost INTEGER DEFAULT 0,
    win_rate NUMERIC(5, 2) DEFAULT 0,
    
    -- Volume stats
    volume_stt NUMERIC(78, 18) DEFAULT 0,
    volume_bitr NUMERIC(78, 18) DEFAULT 0,
    total_volume NUMERIC(78, 18) DEFAULT 0,
    
    -- Betting stats
    bets_placed INTEGER DEFAULT 0,
    bets_won INTEGER DEFAULT 0,
    bets_lost INTEGER DEFAULT 0,
    bet_win_rate NUMERIC(5, 2) DEFAULT 0,
    
    -- User engagement
    unique_users INTEGER DEFAULT 0,
    active_users INTEGER DEFAULT 0,
    
    -- Average metrics
    avg_pool_size NUMERIC(78, 18) DEFAULT 0,
    avg_bet_size NUMERIC(78, 18) DEFAULT 0,
    avg_odds NUMERIC(10, 6) DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Composite unique constraint
    UNIQUE(date, category)
);

-- Daily oracle statistics
CREATE TABLE IF NOT EXISTS analytics.daily_oracle_stats (
    id BIGSERIAL PRIMARY KEY,
    date DATE NOT NULL,
    oracle_type VARCHAR(20) NOT NULL, -- 'GUIDED' or 'OPEN'
    
    -- Pool stats
    pools_created INTEGER DEFAULT 0,
    pools_settled INTEGER DEFAULT 0,
    pools_won INTEGER DEFAULT 0,
    pools_lost INTEGER DEFAULT 0,
    win_rate NUMERIC(5, 2) DEFAULT 0,
    
    -- Volume stats
    volume_stt NUMERIC(78, 18) DEFAULT 0,
    volume_bitr NUMERIC(78, 18) DEFAULT 0,
    total_volume NUMERIC(78, 18) DEFAULT 0,
    
    -- Betting stats
    bets_placed INTEGER DEFAULT 0,
    bets_won INTEGER DEFAULT 0,
    bets_lost INTEGER DEFAULT 0,
    bet_win_rate NUMERIC(5, 2) DEFAULT 0,
    
    -- User engagement
    unique_users INTEGER DEFAULT 0,
    active_users INTEGER DEFAULT 0,
    
    -- Average metrics
    avg_pool_size NUMERIC(78, 18) DEFAULT 0,
    avg_bet_size NUMERIC(78, 18) DEFAULT 0,
    avg_odds NUMERIC(10, 6) DEFAULT 0,
    
    -- Settlement metrics
    avg_settlement_time_hours NUMERIC(10, 2) DEFAULT 0,
    disputes_count INTEGER DEFAULT 0,
    resolution_success_rate NUMERIC(5, 2) DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Composite unique constraint
    UNIQUE(date, oracle_type)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_daily_platform_stats_date ON analytics.daily_platform_stats(date);
CREATE INDEX IF NOT EXISTS idx_daily_platform_stats_created_at ON analytics.daily_platform_stats(created_at);

CREATE INDEX IF NOT EXISTS idx_daily_user_stats_date ON analytics.daily_user_stats(date);
CREATE INDEX IF NOT EXISTS idx_daily_user_stats_user ON analytics.daily_user_stats(user_address);
CREATE INDEX IF NOT EXISTS idx_daily_user_stats_date_user ON analytics.daily_user_stats(date, user_address);
CREATE INDEX IF NOT EXISTS idx_daily_user_stats_created_at ON analytics.daily_user_stats(created_at);

CREATE INDEX IF NOT EXISTS idx_daily_category_stats_date ON analytics.daily_category_stats(date);
CREATE INDEX IF NOT EXISTS idx_daily_category_stats_category ON analytics.daily_category_stats(category);
CREATE INDEX IF NOT EXISTS idx_daily_category_stats_date_category ON analytics.daily_category_stats(date, category);

CREATE INDEX IF NOT EXISTS idx_daily_oracle_stats_date ON analytics.daily_oracle_stats(date);
CREATE INDEX IF NOT EXISTS idx_daily_oracle_stats_oracle_type ON analytics.daily_oracle_stats(oracle_type);
CREATE INDEX IF NOT EXISTS idx_daily_oracle_stats_date_oracle ON analytics.daily_oracle_stats(date, oracle_type);

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to get daily platform stats for a date range
CREATE OR REPLACE FUNCTION analytics.get_daily_platform_stats(
    start_date DATE,
    end_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    date DATE,
    pools_created INTEGER,
    total_volume NUMERIC,
    active_users INTEGER,
    win_rate NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        dps.date,
        dps.pools_created,
        dps.total_volume,
        dps.active_users,
        CASE 
            WHEN dps.bets_placed > 0 THEN (dps.bets_won::NUMERIC / dps.bets_placed::NUMERIC) * 100
            ELSE 0
        END as win_rate
    FROM analytics.daily_platform_stats dps
    WHERE dps.date BETWEEN start_date AND end_date
    ORDER BY dps.date DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get daily user stats for a specific user
CREATE OR REPLACE FUNCTION analytics.get_daily_user_stats(
    user_addr VARCHAR(42),
    start_date DATE,
    end_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    date DATE,
    pools_created INTEGER,
    bets_placed INTEGER,
    total_volume NUMERIC,
    net_profit NUMERIC,
    win_rate NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        dus.date,
        dus.pools_created,
        dus.bets_placed,
        dus.total_volume,
        dus.net_profit,
        CASE 
            WHEN dus.bets_placed > 0 THEN (dus.bets_won::NUMERIC / dus.bets_placed::NUMERIC) * 100
            ELSE 0
        END as win_rate
    FROM analytics.daily_user_stats dus
    WHERE dus.user_address = user_addr
    AND dus.date BETWEEN start_date AND end_date
    ORDER BY dus.date DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get category performance
CREATE OR REPLACE FUNCTION analytics.get_category_performance(
    start_date DATE,
    end_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    category VARCHAR(100),
    total_pools INTEGER,
    total_volume NUMERIC,
    win_rate NUMERIC,
    active_users INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        dcs.category,
        SUM(dcs.pools_created) as total_pools,
        SUM(dcs.total_volume) as total_volume,
        AVG(dcs.win_rate) as win_rate,
        SUM(dcs.active_users) as active_users
    FROM analytics.daily_category_stats dcs
    WHERE dcs.date BETWEEN start_date AND end_date
    GROUP BY dcs.category
    ORDER BY total_volume DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get oracle performance comparison
CREATE OR REPLACE FUNCTION analytics.get_oracle_performance(
    start_date DATE,
    end_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    oracle_type VARCHAR(20),
    total_pools INTEGER,
    total_volume NUMERIC,
    win_rate NUMERIC,
    avg_settlement_time NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        dos.oracle_type,
        SUM(dos.pools_created) as total_pools,
        SUM(dos.total_volume) as total_volume,
        AVG(dos.win_rate) as win_rate,
        AVG(dos.avg_settlement_time_hours) as avg_settlement_time
    FROM analytics.daily_oracle_stats dos
    WHERE dos.date BETWEEN start_date AND end_date
    GROUP BY dos.oracle_type
    ORDER BY total_volume DESC;
END;
$$ LANGUAGE plpgsql;
