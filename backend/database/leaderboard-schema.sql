-- =====================================================
-- LEADERBOARD SYSTEM DATABASE SCHEMA
-- =====================================================
-- This schema implements the leaderboard system as outlined
-- in FRONTEND_OPTIMIZATION_RECOMMENDATIONS.md
-- =====================================================

-- Ensure analytics schema exists
CREATE SCHEMA IF NOT EXISTS analytics;

-- =====================================================
-- LEADERBOARD CACHE TABLE
-- =====================================================
-- Caches leaderboard data for performance optimization
CREATE TABLE IF NOT EXISTS analytics.leaderboard_cache (
    id SERIAL PRIMARY KEY,
    leaderboard_type VARCHAR(50) NOT NULL, -- 'guided_markets' or 'reputation'
    metric VARCHAR(50) NOT NULL,           -- 'total_staked', 'reputation', etc.
    user_address TEXT NOT NULL,
    rank INTEGER NOT NULL,
    score DECIMAL(78,0) NOT NULL,
    additional_data JSONB,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(leaderboard_type, metric, user_address)
);

-- Index for fast leaderboard queries
CREATE INDEX IF NOT EXISTS idx_leaderboard_cache_type_metric_rank 
ON analytics.leaderboard_cache(leaderboard_type, metric, rank);

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_leaderboard_cache_user_address 
ON analytics.leaderboard_cache(user_address);

-- =====================================================
-- USER STATISTICS AGGREGATION TABLE
-- =====================================================
-- Pre-aggregated user statistics for leaderboard calculations
CREATE TABLE IF NOT EXISTS analytics.user_stats_aggregated (
    user_address TEXT PRIMARY KEY,
    total_pools_created BIGINT DEFAULT 0,
    total_bets_placed BIGINT DEFAULT 0,
    total_staked_amount DECIMAL(78,0) DEFAULT 0,
    total_won_amount DECIMAL(78,0) DEFAULT 0,
    success_rate DECIMAL(5,4) DEFAULT 0,
    total_volume_generated DECIMAL(78,0) DEFAULT 0,
    reputation_score INTEGER DEFAULT 0,
    influence_score INTEGER DEFAULT 0,
    prediction_streak INTEGER DEFAULT 0,
    is_verified_creator BOOLEAN DEFAULT FALSE,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_user_stats_reputation 
ON analytics.user_stats_aggregated(reputation_score DESC);

CREATE INDEX IF NOT EXISTS idx_user_stats_total_staked 
ON analytics.user_stats_aggregated(total_staked_amount DESC);

CREATE INDEX IF NOT EXISTS idx_user_stats_success_rate 
ON analytics.user_stats_aggregated(success_rate DESC);

-- =====================================================
-- LEADERBOARD METRICS VIEWS
-- =====================================================

-- Guided Markets Leaderboard View
CREATE OR REPLACE VIEW analytics.guided_markets_leaderboard AS
SELECT 
    u.address,
    u.reputation,
    COALESCE(stats.total_pools_created, 0) as pools_created,
    COALESCE(stats.total_staked_amount, 0) as total_staked,
    COALESCE(stats.total_won_amount, 0) as total_won,
    COALESCE(stats.success_rate, 0) as success_rate,
    COALESCE(stats.total_volume_generated, 0) as volume_generated,
    COALESCE(stats.total_bets_placed, 0) as bets_placed,
    COALESCE(stats.prediction_streak, 0) as prediction_streak,
    COALESCE(stats.is_verified_creator, false) as is_verified
FROM core.users u
LEFT JOIN analytics.user_stats_aggregated stats ON u.address = stats.user_address
WHERE u.reputation > 0
ORDER BY stats.total_staked_amount DESC NULLS LAST;

-- Reputation Leaderboard View
CREATE OR REPLACE VIEW analytics.reputation_leaderboard AS
SELECT 
    u.address,
    u.reputation,
    u.joined_at,
    COALESCE(stats.total_pools_created, 0) as total_actions,
    COALESCE(stats.influence_score, 0) as influence_score,
    COALESCE(stats.prediction_streak, 0) as prediction_streak,
    COALESCE(stats.is_verified_creator, false) as is_verified,
    COALESCE(stats.success_rate, 0) as success_rate
FROM core.users u
LEFT JOIN analytics.user_stats_aggregated stats ON u.address = stats.user_address
WHERE u.reputation > 0
ORDER BY u.reputation DESC, stats.influence_score DESC NULLS LAST;

-- =====================================================
-- LEADERBOARD REFRESH FUNCTIONS
-- =====================================================

-- Function to refresh user statistics aggregation
CREATE OR REPLACE FUNCTION analytics.refresh_user_stats()
RETURNS void AS $$
BEGIN
    -- Clear existing aggregated data
    TRUNCATE analytics.user_stats_aggregated;
    
    -- Recalculate user statistics
    INSERT INTO analytics.user_stats_aggregated (
        user_address,
        total_pools_created,
        total_bets_placed,
        total_staked_amount,
        total_won_amount,
        success_rate,
        total_volume_generated,
        reputation_score,
        influence_score,
        prediction_streak,
        is_verified_creator,
        last_updated
    )
    SELECT 
        u.address,
        COALESCE(pool_stats.total_created, 0) as total_pools_created,
        0 as total_bets_placed, -- Placeholder until bet tracking is implemented
        COALESCE(pool_stats.total_staked, 0) as total_staked_amount,
        COALESCE(pool_stats.total_won, 0) as total_won_amount,
        CASE 
            WHEN COALESCE(pool_stats.total_created, 0) > 0 
            THEN COALESCE(pool_stats.won_pools, 0)::DECIMAL / pool_stats.total_created::DECIMAL
            ELSE 0 
        END as success_rate,
        COALESCE(pool_stats.total_volume, 0) as total_volume_generated,
        u.reputation as reputation_score,
        COALESCE(rep_stats.influence_score, 0) as influence_score,
        COALESCE(rep_stats.prediction_streak, 0) as prediction_streak,
        COALESCE(rep_stats.is_verified, false) as is_verified_creator,
        NOW() as last_updated
    FROM core.users u
    LEFT JOIN (
        -- Pool statistics
        SELECT 
            creator_address as user_address,
            COUNT(*) as total_created,
            SUM(creator_stake + total_bettor_stake) as total_staked,
            SUM(CASE WHEN creator_side_won THEN creator_stake + total_bettor_stake ELSE 0 END) as total_won,
            SUM(CASE WHEN creator_side_won THEN 1 ELSE 0 END) as won_pools,
            SUM(creator_stake + total_bettor_stake) as total_volume
        FROM analytics.pools 
        WHERE is_settled = true
        GROUP BY creator_address
    ) pool_stats ON u.address = pool_stats.user_address
    -- Note: Bet statistics would be added here if a user_bets table exists
    LEFT JOIN (
        -- Reputation statistics (simplified)
        SELECT 
            user_address,
            0 as influence_score, -- Placeholder until advanced metrics are implemented
            0 as prediction_streak, -- Placeholder until streak tracking is implemented
            false as is_verified -- Placeholder until verification system is implemented
        FROM core.reputation_actions ra
        GROUP BY user_address
    ) rep_stats ON u.address = rep_stats.user_address;
END;
$$ LANGUAGE plpgsql;

-- Function to refresh leaderboard cache
CREATE OR REPLACE FUNCTION analytics.refresh_leaderboard_cache(
    p_leaderboard_type VARCHAR(50),
    p_metric VARCHAR(50),
    p_limit INTEGER DEFAULT 100
)
RETURNS void AS $$
DECLARE
    rank_counter INTEGER := 1;
    user_record RECORD;
BEGIN
    -- Clear existing cache for this leaderboard type and metric
    DELETE FROM analytics.leaderboard_cache 
    WHERE leaderboard_type = p_leaderboard_type AND metric = p_metric;
    
    -- Get ordered users based on metric
    IF p_leaderboard_type = 'guided_markets' THEN
        IF p_metric = 'total_staked' THEN
            FOR user_record IN
                SELECT address, total_staked as score, 
                       json_build_object(
                           'pools_created', pools_created,
                           'total_won', total_won,
                           'success_rate', success_rate,
                           'volume_generated', volume_generated
                       ) as additional_data
                FROM analytics.guided_markets_leaderboard
                ORDER BY total_staked DESC
                LIMIT p_limit
            LOOP
                INSERT INTO analytics.leaderboard_cache (
                    leaderboard_type, metric, user_address, rank, score, additional_data, updated_at
                ) VALUES (
                    p_leaderboard_type, p_metric, user_record.address, rank_counter, 
                    user_record.score, user_record.additional_data, NOW()
                );
                rank_counter := rank_counter + 1;
            END LOOP;
        ELSIF p_metric = 'total_won' THEN
            FOR user_record IN
                SELECT address, total_won as score,
                       json_build_object(
                           'pools_created', pools_created,
                           'total_staked', total_staked,
                           'success_rate', success_rate,
                           'volume_generated', volume_generated
                       ) as additional_data
                FROM analytics.guided_markets_leaderboard
                ORDER BY total_won DESC
                LIMIT p_limit
            LOOP
                INSERT INTO analytics.leaderboard_cache (
                    leaderboard_type, metric, user_address, rank, score, additional_data, updated_at
                ) VALUES (
                    p_leaderboard_type, p_metric, user_record.address, rank_counter, 
                    user_record.score, user_record.additional_data, NOW()
                );
                rank_counter := rank_counter + 1;
            END LOOP;
        ELSIF p_metric = 'success_rate' THEN
            FOR user_record IN
                SELECT address, success_rate as score,
                       json_build_object(
                           'pools_created', pools_created,
                           'total_staked', total_staked,
                           'total_won', total_won,
                           'volume_generated', volume_generated
                       ) as additional_data
                FROM analytics.guided_markets_leaderboard
                ORDER BY success_rate DESC
                LIMIT p_limit
            LOOP
                INSERT INTO analytics.leaderboard_cache (
                    leaderboard_type, metric, user_address, rank, score, additional_data, updated_at
                ) VALUES (
                    p_leaderboard_type, p_metric, user_record.address, rank_counter, 
                    user_record.score, user_record.additional_data, NOW()
                );
                rank_counter := rank_counter + 1;
            END LOOP;
        ELSIF p_metric = 'volume_generated' THEN
            FOR user_record IN
                SELECT address, volume_generated as score,
                       json_build_object(
                           'pools_created', pools_created,
                           'total_staked', total_staked,
                           'total_won', total_won,
                           'success_rate', success_rate
                       ) as additional_data
                FROM analytics.guided_markets_leaderboard
                ORDER BY volume_generated DESC
                LIMIT p_limit
            LOOP
                INSERT INTO analytics.leaderboard_cache (
                    leaderboard_type, metric, user_address, rank, score, additional_data, updated_at
                ) VALUES (
                    p_leaderboard_type, p_metric, user_record.address, rank_counter, 
                    user_record.score, user_record.additional_data, NOW()
                );
                rank_counter := rank_counter + 1;
            END LOOP;
        ELSE
            -- Default to total_staked
            FOR user_record IN
                SELECT address, total_staked as score,
                       json_build_object(
                           'pools_created', pools_created,
                           'total_won', total_won,
                           'success_rate', success_rate,
                           'volume_generated', volume_generated
                       ) as additional_data
                FROM analytics.guided_markets_leaderboard
                ORDER BY total_staked DESC
                LIMIT p_limit
            LOOP
                INSERT INTO analytics.leaderboard_cache (
                    leaderboard_type, metric, user_address, rank, score, additional_data, updated_at
                ) VALUES (
                    p_leaderboard_type, p_metric, user_record.address, rank_counter, 
                    user_record.score, user_record.additional_data, NOW()
                );
                rank_counter := rank_counter + 1;
            END LOOP;
        END IF;
    ELSIF p_leaderboard_type = 'reputation' THEN
        FOR user_record IN
            SELECT address, reputation as score,
                   json_build_object(
                       'total_actions', total_actions,
                       'influence_score', influence_score,
                       'prediction_streak', prediction_streak,
                       'is_verified', is_verified,
                       'success_rate', success_rate
                   ) as additional_data
            FROM analytics.reputation_leaderboard
            ORDER BY reputation DESC, influence_score DESC
            LIMIT p_limit
        LOOP
            INSERT INTO analytics.leaderboard_cache (
                leaderboard_type, metric, user_address, rank, score, additional_data, updated_at
            ) VALUES (
                p_leaderboard_type, p_metric, user_record.address, rank_counter, 
                user_record.score, user_record.additional_data, NOW()
            );
            rank_counter := rank_counter + 1;
        END LOOP;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- PERFORMANCE OPTIMIZATION INDEXES
-- =====================================================

-- Optimize leaderboard queries
CREATE INDEX IF NOT EXISTS idx_pools_creator_volume 
ON analytics.pools(creator_address, (creator_stake + total_bettor_stake) DESC);

CREATE INDEX IF NOT EXISTS idx_users_reputation 
ON core.users(reputation DESC);

CREATE INDEX IF NOT EXISTS idx_reputation_actions_user 
ON core.reputation_actions(user_address, reputation_delta);

-- =====================================================
-- INITIAL DATA SETUP
-- =====================================================

-- Refresh user statistics on schema creation
SELECT analytics.refresh_user_stats();

-- Create initial leaderboard caches
SELECT analytics.refresh_leaderboard_cache('guided_markets', 'total_staked', 100);
SELECT analytics.refresh_leaderboard_cache('guided_markets', 'total_won', 100);
SELECT analytics.refresh_leaderboard_cache('guided_markets', 'success_rate', 100);
SELECT analytics.refresh_leaderboard_cache('guided_markets', 'volume_generated', 100);
SELECT analytics.refresh_leaderboard_cache('reputation', 'reputation', 100);

-- =====================================================
-- COMMENTS AND DOCUMENTATION
-- =====================================================

COMMENT ON TABLE analytics.leaderboard_cache IS 'Caches leaderboard data for performance optimization';
COMMENT ON TABLE analytics.user_stats_aggregated IS 'Pre-aggregated user statistics for leaderboard calculations';
COMMENT ON VIEW analytics.guided_markets_leaderboard IS 'Guided markets leaderboard with user statistics';
COMMENT ON VIEW analytics.reputation_leaderboard IS 'Reputation-based leaderboard with user influence metrics';
COMMENT ON FUNCTION analytics.refresh_user_stats() IS 'Refreshes aggregated user statistics from source tables';
COMMENT ON FUNCTION analytics.refresh_leaderboard_cache(VARCHAR, VARCHAR, INTEGER) IS 'Refreshes leaderboard cache for specific type and metric';
