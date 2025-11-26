-- Oddyssey Cycles and Matches Schema

-- Create table for tracking daily cycles
CREATE TABLE IF NOT EXISTS oracle.oddyssey_cycles (
    cycle_id BIGINT PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    matches_count INTEGER NOT NULL DEFAULT 10,
    matches_data JSONB NOT NULL,
    cycle_start_time TIMESTAMP WITH TIME ZONE,
    cycle_end_time TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    is_resolved BOOLEAN DEFAULT FALSE,
    tx_hash TEXT,
    resolution_tx_hash TEXT,
    resolution_data JSONB,
    ready_for_resolution BOOLEAN DEFAULT FALSE,
    resolution_prepared_at TIMESTAMP WITH TIME ZONE
);

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_oddyssey_cycles_created_at ON oracle.oddyssey_cycles(created_at);
CREATE INDEX IF NOT EXISTS idx_oddyssey_cycles_resolved ON oracle.oddyssey_cycles(is_resolved);

-- Create table for tracking user slips per cycle
CREATE TABLE IF NOT EXISTS oracle.oddyssey_slips (
    slip_id BIGINT PRIMARY KEY,
    cycle_id BIGINT NOT NULL REFERENCES oracle.oddyssey_cycles(cycle_id),
    player_address TEXT NOT NULL,
    placed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    predictions JSONB NOT NULL,
    final_score NUMERIC DEFAULT 0,
    correct_count INTEGER DEFAULT 0,
    is_evaluated BOOLEAN DEFAULT FALSE,
    leaderboard_rank INTEGER,
    prize_claimed BOOLEAN DEFAULT FALSE,
    tx_hash TEXT
);

-- Create indexes for user slip queries
CREATE INDEX IF NOT EXISTS idx_oddyssey_slips_cycle_id ON oracle.oddyssey_slips(cycle_id);
CREATE INDEX IF NOT EXISTS idx_oddyssey_slips_player ON oracle.oddyssey_slips(player_address);
CREATE INDEX IF NOT EXISTS idx_oddyssey_slips_placed_at ON oracle.oddyssey_slips(placed_at);

-- Drop view if exists to avoid conflicts
DROP VIEW IF EXISTS oracle.current_oddyssey_cycle;

-- Create view for current cycle info
CREATE VIEW oracle.current_oddyssey_cycle AS
SELECT 
    c.cycle_id,
    c.created_at,
    c.updated_at,
    c.matches_count,
    c.matches_data,
    c.cycle_start_time,
    c.cycle_end_time,
    c.resolved_at,
    c.is_resolved,
    c.tx_hash,
    c.resolution_tx_hash,
    c.resolution_data,
    c.ready_for_resolution,
    c.resolution_prepared_at,
    EXTRACT(EPOCH FROM (c.cycle_end_time - NOW())) as seconds_remaining,
    CASE 
        WHEN NOW() < c.cycle_end_time THEN 'active'
        WHEN c.is_resolved THEN 'resolved'
        ELSE 'pending_resolution'
    END as status
FROM oracle.oddyssey_cycles c
WHERE c.cycle_id = (SELECT MAX(cycle_id) FROM oracle.oddyssey_cycles);

-- Create view for leaderboard
CREATE OR REPLACE VIEW oracle.oddyssey_leaderboard AS
SELECT 
    s.cycle_id,
    s.player_address,
    s.final_score,
    s.correct_count,
    s.leaderboard_rank,
    s.prize_claimed,
    ROW_NUMBER() OVER (PARTITION BY s.cycle_id ORDER BY s.final_score DESC, s.correct_count DESC) as calculated_rank
FROM oracle.oddyssey_slips s
WHERE s.is_evaluated = TRUE;

-- Function to get daily match statistics
CREATE OR REPLACE FUNCTION oracle.get_daily_match_stats(target_date DATE DEFAULT CURRENT_DATE)
RETURNS TABLE (
    total_matches BIGINT,
    matches_with_odds BIGINT,
    popular_league_matches BIGINT,
    matches_after_13utc BIGINT,
    suitable_matches BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_matches,
        COUNT(CASE WHEN fo.fixture_id IS NOT NULL THEN 1 END) as matches_with_odds,
        COUNT(CASE WHEN f.league_name ILIKE '%premier league%' OR f.league_name ILIKE '%bundesliga%' OR f.league_name ILIKE '%la liga%' OR f.league_name ILIKE '%serie a%' OR f.league_name ILIKE '%ligue 1%' THEN 1 END) as popular_league_matches,
        COUNT(CASE WHEN EXTRACT(HOUR FROM f.match_date AT TIME ZONE 'UTC') >= 13 THEN 1 END) as matches_after_13utc,
        COUNT(CASE WHEN fo.fixture_id IS NOT NULL AND EXTRACT(HOUR FROM f.match_date AT TIME ZONE 'UTC') >= 13 THEN 1 END) as suitable_matches
    FROM oracle.fixtures f
    LEFT JOIN oracle.fixture_odds fo ON f.id::VARCHAR = fo.fixture_id
    WHERE DATE(f.match_date) = target_date
    AND f.status IN ('NS', 'Fixture');
END $$ LANGUAGE plpgsql;

-- Function to cleanup old Oddyssey data
CREATE OR REPLACE FUNCTION oracle.cleanup_old_oddyssey_data()
RETURNS void AS $$
BEGIN
    -- Delete cycles older than 30 days
    DELETE FROM oracle.oddyssey_cycles 
    WHERE created_at < NOW() - INTERVAL '30 days';
    
    -- Delete slips older than 30 days
    DELETE FROM oracle.oddyssey_slips 
    WHERE placed_at < NOW() - INTERVAL '30 days';
    
    -- Delete daily game matches older than 30 days
    DELETE FROM oddyssey.daily_game_matches 
    WHERE created_at < NOW() - INTERVAL '30 days';
    
    RAISE NOTICE 'Cleaned up old Oddyssey data';
END $$ LANGUAGE plpgsql;

-- Function to update updated_at column
CREATE OR REPLACE FUNCTION oracle.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END $$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER update_oddyssey_cycles_updated_at
    BEFORE UPDATE ON oracle.oddyssey_cycles
    FOR EACH ROW
    EXECUTE FUNCTION oracle.update_updated_at_column();

-- =================================================================
-- ODDYSSEY DAILY GAMES SCHEMA (PERMANENT FIXES INCLUDED)
-- =================================================================

-- Create table for daily games
CREATE TABLE IF NOT EXISTS oddyssey.daily_games (
    id BIGSERIAL PRIMARY KEY,
    game_date DATE NOT NULL,
    matches_count INTEGER DEFAULT 10,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create table for daily game matches with ALL required columns
CREATE TABLE IF NOT EXISTS oddyssey.daily_game_matches (
    id BIGSERIAL PRIMARY KEY,
    fixture_id BIGINT NOT NULL,
    home_team TEXT NOT NULL,
    away_team TEXT NOT NULL,
    league_name TEXT NOT NULL,
    match_date TIMESTAMP WITH TIME ZONE NOT NULL,
    game_date DATE NOT NULL,
    home_odds DECIMAL(10,2) NOT NULL,
    draw_odds DECIMAL(10,2) NOT NULL,
    away_odds DECIMAL(10,2) NOT NULL,
    over_25_odds DECIMAL(10,2) NOT NULL,
    under_25_odds DECIMAL(10,2) NOT NULL,
    selection_type TEXT DEFAULT '1x2_ou25',
    priority_score INTEGER DEFAULT 0,
    cycle_id INTEGER NOT NULL,
    display_order INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_fixture_cycle UNIQUE (fixture_id, cycle_id)
);

-- Create table for user slips
CREATE TABLE IF NOT EXISTS oddyssey.slips (
    id BIGSERIAL PRIMARY KEY,
    user_address TEXT NOT NULL,
    game_date DATE NOT NULL,
    predictions JSONB NOT NULL,
    final_score NUMERIC DEFAULT 0,
    correct_count INTEGER DEFAULT 0,
    is_evaluated BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create table for slip entries
CREATE TABLE IF NOT EXISTS oddyssey.slip_entries (
    id BIGSERIAL PRIMARY KEY,
    slip_id BIGINT NOT NULL REFERENCES oddyssey.slips(id),
    fixture_id BIGINT NOT NULL,
    prediction_type TEXT NOT NULL, -- '1x2' or 'ou25'
    selected_outcome TEXT NOT NULL, -- '1', 'X', '2', 'Over', 'Under'
    selected_odds DECIMAL(10,2) NOT NULL,
    is_correct BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create table for game results
CREATE TABLE IF NOT EXISTS oddyssey.game_results (
    id BIGSERIAL PRIMARY KEY,
    fixture_id BIGINT NOT NULL,
    game_date DATE NOT NULL,
    home_score INTEGER,
    away_score INTEGER,
    outcome_1x2 TEXT, -- '1', 'X', '2'
    outcome_ou25 TEXT, -- 'Over', 'Under'
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_daily_game_matches_game_date ON oddyssey.daily_game_matches(game_date);
CREATE INDEX IF NOT EXISTS idx_daily_game_matches_fixture_id ON oddyssey.daily_game_matches(fixture_id);
CREATE INDEX IF NOT EXISTS idx_daily_game_matches_cycle_id ON oddyssey.daily_game_matches(cycle_id);
CREATE INDEX IF NOT EXISTS idx_daily_game_matches_selection_type ON oddyssey.daily_game_matches(selection_type);
CREATE INDEX IF NOT EXISTS idx_slips_user_address ON oddyssey.slips(user_address);
CREATE INDEX IF NOT EXISTS idx_slips_game_date ON oddyssey.slips(game_date);
CREATE INDEX IF NOT EXISTS idx_slip_entries_slip_id ON oddyssey.slip_entries(slip_id);
CREATE INDEX IF NOT EXISTS idx_game_results_fixture_id ON oddyssey.game_results(fixture_id);
CREATE INDEX IF NOT EXISTS idx_game_results_game_date ON oddyssey.game_results(game_date); 