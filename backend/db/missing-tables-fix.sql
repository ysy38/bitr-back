-- =================================================================
-- MISSING TABLES AND FIELDS FIX
-- This script adds missing tables and fields needed by the API
-- =================================================================

-- Create user activity table for tracking user actions
CREATE TABLE IF NOT EXISTS core.user_activity (
    id BIGSERIAL PRIMARY KEY,
    user_address VARCHAR(42) NOT NULL,
    activity_type VARCHAR(50) NOT NULL, -- 'bet_placed', 'bet_won', 'bet_lost', 'pool_created', 'pool_settled', 'achievement_unlocked', 'staking_event'
    description TEXT NOT NULL,
    amount NUMERIC(78, 18),
    pool_id VARCHAR(255),
    category VARCHAR(100),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    block_number BIGINT,
    tx_hash VARCHAR(66),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (user_address) REFERENCES core.users(address) ON DELETE CASCADE
);

-- Create category performance table for user analytics
CREATE TABLE IF NOT EXISTS core.user_category_performance (
    id BIGSERIAL PRIMARY KEY,
    user_address VARCHAR(42) NOT NULL,
    category VARCHAR(100) NOT NULL,
    total_bets INTEGER DEFAULT 0,
    won_bets INTEGER DEFAULT 0,
    total_volume NUMERIC(78, 18) DEFAULT 0,
    profit_loss NUMERIC(78, 18) DEFAULT 0,
    avg_bet_size NUMERIC(78, 18) DEFAULT 0,
    best_streak INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (user_address) REFERENCES core.users(address) ON DELETE CASCADE,
    UNIQUE(user_address, category)
);

-- Create user portfolio table for active positions
CREATE TABLE IF NOT EXISTS core.user_portfolio (
    id BIGSERIAL PRIMARY KEY,
    user_address VARCHAR(42) NOT NULL,
    active_bets JSONB DEFAULT '[]',
    active_pools_created JSONB DEFAULT '[]',
    total_value NUMERIC(78, 18) DEFAULT 0,
    potential_winnings NUMERIC(78, 18) DEFAULT 0,
    risked_amount NUMERIC(78, 18) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (user_address) REFERENCES core.users(address) ON DELETE CASCADE
);

-- Add missing column to user_badges table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'core' 
        AND table_name = 'user_badges' 
        AND column_name = 'is_active'
    ) THEN
        ALTER TABLE core.user_badges ADD COLUMN is_active BOOLEAN DEFAULT true;
    END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_activity_user_address ON core.user_activity(user_address);
CREATE INDEX IF NOT EXISTS idx_user_activity_type ON core.user_activity(activity_type);
CREATE INDEX IF NOT EXISTS idx_user_activity_timestamp ON core.user_activity(timestamp);

CREATE INDEX IF NOT EXISTS idx_user_category_performance_user ON core.user_category_performance(user_address);
CREATE INDEX IF NOT EXISTS idx_user_category_performance_category ON core.user_category_performance(category);

CREATE INDEX IF NOT EXISTS idx_user_portfolio_user ON core.user_portfolio(user_address);

-- Insert sample data for testing
INSERT INTO core.users (address, reputation, total_volume, profit_loss, total_bets, won_bets, favorite_category, total_pools_created, pools_won) VALUES
('0x1234567890123456789012345678901234567890', 85, 5600.25, 1250.75, 45, 32, 'crypto', 12, 8),
('0x0987654321098765432109876543210987654321', 72, 3200.50, 850.25, 28, 18, 'sports', 8, 5)
ON CONFLICT (address) DO NOTHING;

-- Insert sample badges
INSERT INTO core.user_badges (user_address, badge_type, badge_category, title, description, icon_name, rarity) VALUES
('0x1234567890123456789012345678901234567890', 'first_bet', 'bettor', 'First Steps', 'Placed your first bet', 'FaBolt', 'common'),
('0x1234567890123456789012345678901234567890', 'winning_streak', 'bettor', 'Hot Streak', 'Won 5 bets in a row', 'FaFire', 'uncommon'),
('0x0987654321098765432109876543210987654321', 'first_bet', 'bettor', 'First Steps', 'Placed your first bet', 'FaBolt', 'common')
ON CONFLICT (user_address, badge_type) DO NOTHING;

-- Insert sample user activity
INSERT INTO core.user_activity (user_address, activity_type, description, amount, pool_id, category) VALUES
('0x1234567890123456789012345678901234567890', 'bet_placed', 'Placed bet on Bitcoin reaching $100k', 150.00, 'pool_123', 'crypto'),
('0x1234567890123456789012345678901234567890', 'bet_won', 'Won bet on Ethereum upgrade', 225.50, 'pool_124', 'crypto'),
('0x0987654321098765432109876543210987654321', 'pool_created', 'Created pool for Premier League match', 500.00, 'pool_125', 'sports')
ON CONFLICT DO NOTHING;

-- Insert sample category performance
INSERT INTO core.user_category_performance (user_address, category, total_bets, won_bets, total_volume, profit_loss, avg_bet_size, best_streak) VALUES
('0x1234567890123456789012345678901234567890', 'crypto', 25, 18, 3200.50, 850.25, 128.02, 6),
('0x1234567890123456789012345678901234567890', 'sports', 15, 10, 1800.75, 320.50, 120.05, 4),
('0x0987654321098765432109876543210987654321', 'sports', 20, 12, 2100.25, 450.75, 105.01, 5)
ON CONFLICT (user_address, category) DO NOTHING;

-- Insert sample portfolio data
INSERT INTO core.user_portfolio (user_address, active_bets, active_pools_created, total_value, potential_winnings, risked_amount) VALUES
('0x1234567890123456789012345678901234567890', 
 '[{"id": "bet_1", "poolId": "pool_123", "amount": "150.00", "potentialWin": "262.50", "category": "crypto", "description": "Bitcoin reaches $100k"}]',
 '[{"id": "pool_456", "title": "Ethereum 2.0 success", "totalStake": "2500.00", "participants": 15}]',
 4250.75, 1850.25, 750.00),
('0x0987654321098765432109876543210987654321',
 '[]', '[]', 1200.50, 0, 0)
ON CONFLICT (user_address) DO NOTHING;

-- Create updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for updated_at columns
DROP TRIGGER IF EXISTS update_user_category_performance_updated_at ON core.user_category_performance;
CREATE TRIGGER update_user_category_performance_updated_at 
    BEFORE UPDATE ON core.user_category_performance 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_portfolio_updated_at ON core.user_portfolio;
CREATE TRIGGER update_user_portfolio_updated_at 
    BEFORE UPDATE ON core.user_portfolio 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Verify all tables exist
DO $$ 
BEGIN
    -- Check core.users
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'core' AND table_name = 'users') THEN
        RAISE EXCEPTION 'core.users table missing';
    END IF;
    
    -- Check core.user_badges
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'core' AND table_name = 'user_badges') THEN
        RAISE EXCEPTION 'core.user_badges table missing';
    END IF;
    
    -- Check core.user_activity
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'core' AND table_name = 'user_activity') THEN
        RAISE EXCEPTION 'core.user_activity table missing';
    END IF;
    
    -- Check core.user_category_performance
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'core' AND table_name = 'user_category_performance') THEN
        RAISE EXCEPTION 'core.user_category_performance table missing';
    END IF;
    
    -- Check core.user_portfolio
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'core' AND table_name = 'user_portfolio') THEN
        RAISE EXCEPTION 'core.user_portfolio table missing';
    END IF;
    
    RAISE NOTICE 'All required tables exist and are ready!';
END $$;

-- Display table summary
SELECT 
    schemaname as schema_name,
    tablename as table_name,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = schemaname AND table_name = tablename) as column_count
FROM pg_tables 
WHERE schemaname = 'core'
ORDER BY schemaname, tablename;
