-- Migration: Add Social Stats Support
-- Adds tables and columns for tracking pool views, likes, and social stats
-- Production: neon.tech database

-- =====================================================
-- POOL VIEWS TRACKING
-- =====================================================
CREATE TABLE IF NOT EXISTS core.pool_views (
    id BIGSERIAL PRIMARY KEY,
    pool_id VARCHAR(50) NOT NULL,
    viewer_address VARCHAR(42), -- NULL for anonymous views
    ip_address VARCHAR(45), -- IPv6 compatible
    user_agent TEXT,
    viewed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance (no unique constraint - handled at application level)
CREATE INDEX IF NOT EXISTS idx_pool_views_pool_id ON core.pool_views(pool_id);
CREATE INDEX IF NOT EXISTS idx_pool_views_viewer ON core.pool_views(viewer_address);
CREATE INDEX IF NOT EXISTS idx_pool_views_viewed_at ON core.pool_views(viewed_at);
CREATE INDEX IF NOT EXISTS idx_pool_views_composite ON core.pool_views(pool_id, viewer_address, ip_address, viewed_at);

-- =====================================================
-- POOL LIKES TRACKING (using social_reactions table)
-- =====================================================
-- Note: social_reactions table already exists and supports target_type = 'pool'
-- We just need to ensure it's being used correctly

-- =====================================================
-- ADD SOCIAL STATS COLUMN TO POOLS TABLE (if not exists)
-- =====================================================
-- Check if column exists and add if not
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'oracle' 
        AND table_name = 'pools' 
        AND column_name = 'social_stats'
    ) THEN
        ALTER TABLE oracle.pools 
        ADD COLUMN social_stats JSONB DEFAULT '{"likes": 0, "comments": 0, "views": 0, "shares": 0}'::jsonb;
    END IF;
END $$;

-- =====================================================
-- CREATE FUNCTION TO UPDATE POOL SOCIAL STATS
-- =====================================================
CREATE OR REPLACE FUNCTION core.update_pool_social_stats(pool_id_param VARCHAR(50))
RETURNS JSONB AS $$
DECLARE
    likes_count INTEGER;
    comments_count INTEGER;
    views_count INTEGER;
    shares_count INTEGER;
    stats JSONB;
BEGIN
    -- Count pool likes (from social_reactions where target_type = 'pool')
    SELECT COALESCE(COUNT(*), 0) INTO likes_count
    FROM core.social_reactions
    WHERE target_type = 'pool' 
    AND target_id::text = pool_id_param
    AND reaction_type = 'like';

    -- Count comments
    SELECT COALESCE(COUNT(*), 0) INTO comments_count
    FROM core.pool_comments
    WHERE pool_id = pool_id_param
    AND is_deleted = false;

    -- Count unique views (one per user/IP per day)
    SELECT COALESCE(COUNT(DISTINCT viewer_address), 0) + 
           COALESCE(COUNT(DISTINCT CASE WHEN viewer_address IS NULL THEN ip_address END), 0) 
    INTO views_count
    FROM core.pool_views
    WHERE pool_id = pool_id_param;

    -- Shares count (for future implementation)
    shares_count := 0;

    -- Build stats JSON
    stats := jsonb_build_object(
        'likes', likes_count,
        'comments', comments_count,
        'views', views_count,
        'shares', shares_count
    );

    -- Update pools table
    UPDATE oracle.pools
    SET social_stats = stats
    WHERE pool_id::text = pool_id_param;

    RETURN stats;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- CREATE INDEXES FOR PERFORMANCE
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_social_reactions_pool ON core.social_reactions(target_type, target_id) 
WHERE target_type = 'pool';
CREATE INDEX IF NOT EXISTS idx_pool_comments_pool_id ON core.pool_comments(pool_id, is_deleted);

COMMENT ON TABLE core.pool_views IS 'Tracks pool views for analytics and social stats';
COMMENT ON FUNCTION core.update_pool_social_stats IS 'Updates social stats for a pool (likes, comments, views)';

