-- Migration: Add Following/Followers System
-- Adds tables for user following/followers functionality
-- Production: neon.tech database

-- =====================================================
-- USER FOLLOWING/FOLLOWERS SYSTEM
-- =====================================================

-- User follows table (who follows whom)
CREATE TABLE IF NOT EXISTS core.user_follows (
    id BIGSERIAL PRIMARY KEY,
    follower_address VARCHAR(42) NOT NULL, -- User who is following
    following_address VARCHAR(42) NOT NULL, -- User being followed
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(follower_address, following_address),
    CHECK (follower_address != following_address), -- Cannot follow yourself
    FOREIGN KEY (follower_address) REFERENCES core.users(address) ON DELETE CASCADE,
    FOREIGN KEY (following_address) REFERENCES core.users(address) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_follows_follower ON core.user_follows(follower_address);
CREATE INDEX IF NOT EXISTS idx_user_follows_following ON core.user_follows(following_address);
CREATE INDEX IF NOT EXISTS idx_user_follows_created ON core.user_follows(created_at DESC);

-- Function to get follower count
CREATE OR REPLACE FUNCTION core.get_follower_count(user_address_param VARCHAR(42))
RETURNS INTEGER AS $$
BEGIN
    RETURN (SELECT COUNT(*)::int FROM core.user_follows WHERE following_address = user_address_param);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to get following count
CREATE OR REPLACE FUNCTION core.get_following_count(user_address_param VARCHAR(42))
RETURNS INTEGER AS $$
BEGIN
    RETURN (SELECT COUNT(*)::int FROM core.user_follows WHERE follower_address = user_address_param);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to check if user A follows user B
CREATE OR REPLACE FUNCTION core.is_following(follower_address_param VARCHAR(42), following_address_param VARCHAR(42))
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (SELECT 1 FROM core.user_follows 
                   WHERE follower_address = follower_address_param 
                   AND following_address = following_address_param);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON TABLE core.user_follows IS 'Tracks user following relationships';
COMMENT ON FUNCTION core.get_follower_count IS 'Returns the number of followers for a user';
COMMENT ON FUNCTION core.get_following_count IS 'Returns the number of users a user is following';
COMMENT ON FUNCTION core.is_following IS 'Checks if follower_address follows following_address';

