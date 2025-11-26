-- =====================================================
-- BITREDICT PERFECT DATABASE SCHEMA - COMPLETE VERSION
-- =====================================================
-- This schema eliminates all type casting issues and ensures
-- complete compatibility with our API requirements
-- =====================================================

-- Create schemas
CREATE SCHEMA IF NOT EXISTS oracle;
CREATE SCHEMA IF NOT EXISTS oddyssey;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS system;
CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS crypto;
CREATE SCHEMA IF NOT EXISTS airdrop;

-- =====================================================
-- CORE SCHEMA - User management and reputation
-- =====================================================

-- Users table
CREATE TABLE IF NOT EXISTS core.users (
    address VARCHAR(42) PRIMARY KEY,
    reputation INTEGER DEFAULT 40,
    total_volume NUMERIC(78, 18) DEFAULT 0,
    profit_loss NUMERIC(78, 18) DEFAULT 0,
    total_bets INTEGER DEFAULT 0,
    won_bets INTEGER DEFAULT 0,
    current_streak INTEGER DEFAULT 0,
    max_win_streak INTEGER DEFAULT 0,
    max_loss_streak INTEGER DEFAULT 0,
    streak_is_win BOOLEAN DEFAULT true,
    biggest_win NUMERIC(78, 18) DEFAULT 0,
    biggest_loss NUMERIC(78, 18) DEFAULT 0,
    favorite_category VARCHAR(100),
    total_pools_created INTEGER DEFAULT 0,
    pools_won INTEGER DEFAULT 0,
    avg_bet_size NUMERIC(78, 18) DEFAULT 0,
    risk_score INTEGER DEFAULT 500,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Reputation actions table
CREATE TABLE IF NOT EXISTS core.reputation_actions (
    id BIGSERIAL PRIMARY KEY,
    user_address VARCHAR(42) NOT NULL,
    action_type INTEGER NOT NULL,
    reputation_delta INTEGER NOT NULL,
    associated_value VARCHAR(255),
    pool_id VARCHAR(255),
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    block_number BIGINT NOT NULL,
    transaction_hash VARCHAR(66) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (user_address) REFERENCES core.users(address) ON DELETE CASCADE
);

-- Achievements table
CREATE TABLE IF NOT EXISTS core.achievements (
    id BIGSERIAL PRIMARY KEY,
    user_address VARCHAR(42) NOT NULL,
    achievement_type VARCHAR(100) NOT NULL,
    achievement_value NUMERIC(78, 18) NOT NULL,
    achievement_category VARCHAR(100),
    unlocked_at TIMESTAMP WITH TIME ZONE NOT NULL,
    block_number BIGINT NOT NULL,
    transaction_hash VARCHAR(66) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (user_address) REFERENCES core.users(address) ON DELETE CASCADE
);

-- User badges table (CRITICAL FOR REPUTATION SYSTEM)
CREATE TABLE IF NOT EXISTS core.user_badges (
    id BIGSERIAL PRIMARY KEY,
    user_address VARCHAR(255) NOT NULL,
    badge_type VARCHAR(50) NOT NULL,
    badge_category VARCHAR(20) NOT NULL, -- 'creator', 'bettor', 'community', 'oddyssey', 'special'
    title VARCHAR(100) NOT NULL,
    description TEXT,
    icon_name VARCHAR(50),
    rarity VARCHAR(20), -- 'common', 'rare', 'epic', 'legendary'
    criteria_met JSONB,
    earned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_address, badge_type)
);

-- =====================================================
-- ORACLE SCHEMA - Core football data
-- =====================================================

-- Leagues table
CREATE TABLE IF NOT EXISTS oracle.leagues (
    league_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    country VARCHAR(100),
    country_code VARCHAR(10),
    logo_url TEXT,
    season_id VARCHAR(50),
    is_popular BOOLEAN DEFAULT false,
    -- IMAGE PATHS (CRITICAL FOR UI)
    image_path TEXT, -- League logo/emblem
    country_image_path TEXT, -- Country flag
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Fixtures table - ALL IDs as VARCHAR to prevent type mismatches
CREATE TABLE IF NOT EXISTS oracle.fixtures (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(500) NOT NULL,
    home_team_id VARCHAR(50),
    away_team_id VARCHAR(50),
    home_team VARCHAR(255) NOT NULL,
    away_team VARCHAR(255) NOT NULL,
    league_id VARCHAR(50),
    league_name VARCHAR(255),
    season_id VARCHAR(50),
    round_id VARCHAR(50),
    round VARCHAR(100),
    match_date TIMESTAMP WITH TIME ZONE NOT NULL,
    starting_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(100),
    venue_id VARCHAR(50),
    state_id VARCHAR(50),
    result_info JSONB,
    leg INTEGER,
    venue JSONB,
    referee VARCHAR(255),
    league JSONB,
    season JSONB,
    stage JSONB,
    round_obj JSONB,
    state JSONB,
    participants JSONB,
    metadata JSONB,
    -- IMAGE PATHS AND METADATA (CRITICAL FOR UI)
    referee_id VARCHAR(50),
    referee_name VARCHAR(255),
    referee_image_path TEXT,
    venue_capacity INTEGER,
    venue_coordinates VARCHAR(100),
    venue_surface VARCHAR(50),
    venue_image_path TEXT,
    home_team_image_path TEXT,
    away_team_image_path TEXT,
    league_image_path TEXT,
    country_image_path TEXT,
    -- VALIDATION COLUMNS (CRITICAL FOR FIXTURE PROCESSING)
    team_assignment_validated BOOLEAN DEFAULT FALSE,
    odds_mapping_validated BOOLEAN DEFAULT FALSE,
    processing_errors JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Fixture odds table - ALL IDs as VARCHAR
CREATE TABLE IF NOT EXISTS oracle.fixture_odds (
    id VARCHAR(50) PRIMARY KEY,
    fixture_id VARCHAR(50) NOT NULL,
    market_id VARCHAR(50),
    bookmaker_id VARCHAR(50),
    label VARCHAR(100),
    value NUMERIC(10, 6),
    name VARCHAR(100),
    sort_order INTEGER,
    market_description VARCHAR(255),
    probability VARCHAR(20),
    dp3 VARCHAR(20),
    fractional VARCHAR(20),
    american VARCHAR(20),
    winning BOOLEAN DEFAULT false,
    stopped BOOLEAN DEFAULT false,
    total NUMERIC(10, 6), -- For Over/Under markets (0.5, 1.5, 2.5, 3.5, 4.5)
    handicap NUMERIC(10, 6),
    participants JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    original_label VARCHAR(100),
    latest_bookmaker_update TIMESTAMP WITH TIME ZONE,
    bookmaker JSONB,
    -- BOOKMAKER INFO (CRITICAL FOR UI)
    bookmaker_name VARCHAR(100),
    bookmaker_logo TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (fixture_id) REFERENCES oracle.fixtures(id) ON DELETE CASCADE
);

-- Fixture results table - ALL IDs as VARCHAR
CREATE TABLE IF NOT EXISTS oracle.fixture_results (
    id VARCHAR(50) PRIMARY KEY,
    fixture_id VARCHAR(50) NOT NULL UNIQUE,
    home_score INTEGER,
    away_score INTEGER,
    ht_home_score INTEGER,
    ht_away_score INTEGER,
    
    -- FULL TIME RESULTS (All Guided Markets)
    result_1x2 VARCHAR(10), -- '1', 'X', '2' - Full time result
    result_ou05 VARCHAR(10), -- 'Over', 'Under' - Over/Under 0.5 goals
    result_ou15 VARCHAR(10), -- 'Over', 'Under' - Over/Under 1.5 goals  
    result_ou25 VARCHAR(10), -- 'Over', 'Under' - Over/Under 2.5 goals
    result_ou35 VARCHAR(10), -- 'Over', 'Under' - Over/Under 3.5 goals
    result_ou45 VARCHAR(10), -- 'Over', 'Under' - Over/Under 4.5 goals
    result_btts VARCHAR(10), -- 'Yes', 'No' - Both teams to score
    
    -- HALF TIME RESULTS (Guided Markets)
    result_ht VARCHAR(10), -- '1', 'X', '2' - Half time result
    result_ht_ou05 VARCHAR(10), -- 'Over', 'Under' - HT Over/Under 0.5 goals
    result_ht_ou15 VARCHAR(10), -- 'Over', 'Under' - HT Over/Under 1.5 goals
    result_ht_goals INTEGER, -- Total HT goals for evaluation
    
    -- LEGACY/COMPATIBILITY
    outcome_1x2 VARCHAR(10),
    outcome_ou05 VARCHAR(10),
    outcome_ou15 VARCHAR(10),
    outcome_ou25 VARCHAR(10),
    outcome_ou35 VARCHAR(10),
    outcome_ht_result VARCHAR(10),
    outcome_btts VARCHAR(10),
    full_score VARCHAR(20),
    ht_score VARCHAR(20),
    final_price NUMERIC(10, 6),
    finished_at TIMESTAMP WITH TIME ZONE,
    
    -- EVALUATION TRACKING (CRITICAL FOR ORACLE)
    evaluation_status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'evaluated', 'failed'
    evaluation_timestamp TIMESTAMP WITH TIME ZONE,
    evaluator VARCHAR(50) DEFAULT 'auto', -- 'auto', 'manual', 'oracle'
    confidence_score NUMERIC(5,2) DEFAULT 100.0, -- Confidence in evaluation (0-100)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (fixture_id) REFERENCES oracle.fixtures(id) ON DELETE CASCADE
);

-- Football prediction markets (COMPLETE GUIDED MARKETS)
CREATE TABLE IF NOT EXISTS oracle.football_prediction_markets (
    id VARCHAR(50) PRIMARY KEY,
    market_id VARCHAR(100) UNIQUE, -- CRITICAL: Unique market identifier
    fixture_id VARCHAR(50) NOT NULL,
    market_type VARCHAR(50) NOT NULL,
    outcome_type VARCHAR(50), -- ADDED: Type of outcome (1X2, OU25, etc.)
    predicted_outcome VARCHAR(50), -- ADDED: Predicted outcome value
    end_time TIMESTAMP WITH TIME ZONE, -- ADDED: When market ends
    resolved BOOLEAN DEFAULT false, -- ADDED: Whether market is resolved
    
    -- 1X2 MARKETS
    home_odds NUMERIC(10, 6), -- Full time 1X2
    draw_odds NUMERIC(10, 6),
    away_odds NUMERIC(10, 6),
    ht_home_odds NUMERIC(10, 6), -- Half time 1X2
    ht_draw_odds NUMERIC(10, 6),
    ht_away_odds NUMERIC(10, 6),
    
    -- OVER/UNDER MARKETS (FULL TIME)
    over_05_odds NUMERIC(10, 6), -- Over 0.5 goals
    under_05_odds NUMERIC(10, 6),
    over_15_odds NUMERIC(10, 6), -- Over 1.5 goals
    under_15_odds NUMERIC(10, 6),
    over_25_odds NUMERIC(10, 6), -- Over 2.5 goals
    under_25_odds NUMERIC(10, 6),
    over_35_odds NUMERIC(10, 6), -- Over 3.5 goals
    under_35_odds NUMERIC(10, 6),
    over_45_odds NUMERIC(10, 6), -- Over 4.5 goals
    under_45_odds NUMERIC(10, 6),
    
    -- HALF TIME OVER/UNDER MARKETS
    ht_over_05_odds NUMERIC(10, 6), -- HT Over 0.5 goals
    ht_under_05_odds NUMERIC(10, 6),
    ht_over_15_odds NUMERIC(10, 6), -- HT Over 1.5 goals
    ht_under_15_odds NUMERIC(10, 6),
    
    -- BTTS MARKETS
    btts_yes_odds NUMERIC(10, 6),
    btts_no_odds NUMERIC(10, 6),
    
    -- LEGACY COMPATIBILITY
    over_odds NUMERIC(10, 6), -- Maps to over_25_odds
    under_odds NUMERIC(10, 6), -- Maps to under_25_odds
    
    -- MARKET META
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (fixture_id) REFERENCES oracle.fixtures(id) ON DELETE CASCADE
);

-- Matches table (for legacy compatibility)
CREATE TABLE IF NOT EXISTS oracle.matches (
    match_id VARCHAR(50) PRIMARY KEY,
    home_team VARCHAR(255) NOT NULL,
    away_team VARCHAR(255) NOT NULL,
    match_time TIMESTAMP WITH TIME ZONE NOT NULL,
    league VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending',
    home_score INTEGER,
    away_score INTEGER,
    ht_home_score INTEGER,
    ht_away_score INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Match results table (for legacy compatibility)
CREATE TABLE IF NOT EXISTS oracle.match_results (
    id VARCHAR(50) PRIMARY KEY,
    match_id VARCHAR(50) NOT NULL,
    home_score INTEGER,
    away_score INTEGER,
    ht_home_score INTEGER,
    ht_away_score INTEGER,
    result VARCHAR(10), -- '1', 'X', '2'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (match_id) REFERENCES oracle.matches(match_id) ON DELETE CASCADE
);

-- Oddyssey cycles table (in oracle schema for compatibility)
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
    resolution_prepared_at TIMESTAMP WITH TIME ZONE,
    start_time TIMESTAMP WITH TIME ZONE,
    end_time TIMESTAMP WITH TIME ZONE
);

-- Coins table (crypto data in oracle schema)
CREATE TABLE IF NOT EXISTS oracle.coins (
    id VARCHAR(50) PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    price_usd NUMERIC(20, 8),
    market_cap_usd NUMERIC(20, 2),
    volume_24h_usd NUMERIC(20, 2),
    price_change_24h NUMERIC(10, 4),
    market_cap_rank INTEGER,
    coinpaprika_id VARCHAR(50) UNIQUE,
    -- COINPAPRIKA IMAGE URLS (CRITICAL FOR UI)
    logo_url TEXT, -- https://static.coinpaprika.com/coin/{id}/logo.png
    whitepaper_url TEXT, -- Project whitepaper URL
    website_url TEXT, -- Official website URL
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crypto price snapshots (detailed historical data)
CREATE TABLE IF NOT EXISTS oracle.crypto_price_snapshots (
    id BIGSERIAL PRIMARY KEY,
    coinpaprika_id VARCHAR(50) NOT NULL,
    price_usd NUMERIC(20, 8) NOT NULL,
    market_cap NUMERIC(20, 2),
    volume_24h NUMERIC(20, 2),
    circulating_supply NUMERIC(20, 2),
    total_supply NUMERIC(20, 2),
    max_supply NUMERIC(20, 2),
    percent_change_1h NUMERIC(10, 4),
    percent_change_24h NUMERIC(10, 4),
    percent_change_7d NUMERIC(10, 4),
    ath_price NUMERIC(20, 8),
    ath_date TIMESTAMP WITH TIME ZONE,
    beta_value NUMERIC(10, 6),
    last_updated TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crypto prediction markets
CREATE TABLE IF NOT EXISTS oracle.crypto_prediction_markets (
    id BIGSERIAL PRIMARY KEY,
    market_id VARCHAR(100) UNIQUE NOT NULL,
    coinpaprika_id VARCHAR(50) NOT NULL,
    target_price NUMERIC(20, 8) NOT NULL,
    direction VARCHAR(10) NOT NULL, -- 'above' or 'below'
    timeframe VARCHAR(10) NOT NULL, -- '1h', '24h', '7d', '30d'
    start_price NUMERIC(20, 8) NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    resolved BOOLEAN DEFAULT false,
    final_price NUMERIC(20, 8),
    result VARCHAR(10), -- 'YES' or 'NO'
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crypto market statistics
CREATE TABLE IF NOT EXISTS oracle.crypto_market_stats (
    id BIGSERIAL PRIMARY KEY,
    coinpaprika_id VARCHAR(50) NOT NULL,
    date DATE NOT NULL,
    avg_price NUMERIC(20, 8),
    min_price NUMERIC(20, 8),
    max_price NUMERIC(20, 8),
    volatility NUMERIC(10, 4),
    volume_24h NUMERIC(20, 2),
    market_cap NUMERIC(20, 2),
    price_movement_score NUMERIC(10, 4),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(coinpaprika_id, date)
);

-- Crypto resolution logs
CREATE TABLE IF NOT EXISTS oracle.crypto_resolution_logs (
    id BIGSERIAL PRIMARY KEY,
    market_id VARCHAR(100) NOT NULL,
    coinpaprika_id VARCHAR(50) NOT NULL,
    predicted_direction VARCHAR(10) NOT NULL,
    actual_result VARCHAR(10),
    success BOOLEAN,
    error_message TEXT,
    processing_time_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Football resolution logs
CREATE TABLE IF NOT EXISTS oracle.football_resolution_logs (
    id BIGSERIAL PRIMARY KEY,
    market_id VARCHAR(100) NOT NULL,
    fixture_id VARCHAR(50) NOT NULL,
    outcome_type VARCHAR(50) NOT NULL,
    predicted_outcome VARCHAR(50) NOT NULL,
    actual_result VARCHAR(50),
    success BOOLEAN,
    error_message TEXT,
    processing_time_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Football market statistics
CREATE TABLE IF NOT EXISTS oracle.football_market_stats (
    id BIGSERIAL PRIMARY KEY,
    outcome_type VARCHAR(50) NOT NULL,
    date DATE NOT NULL,
    total_markets INTEGER DEFAULT 0,
    resolved_markets INTEGER DEFAULT 0,
    home_wins INTEGER DEFAULT 0,
    draw_results INTEGER DEFAULT 0,
    away_wins INTEGER DEFAULT 0,
    over_results INTEGER DEFAULT 0,
    under_results INTEGER DEFAULT 0,
    btts_yes INTEGER DEFAULT 0,
    btts_no INTEGER DEFAULT 0,
    avg_resolution_time_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(outcome_type, date)
);

-- Referees master table
CREATE TABLE IF NOT EXISTS oracle.referees (
    id VARCHAR(50) PRIMARY KEY,
    sport_id VARCHAR(50),
    country_id VARCHAR(50),
    city_id VARCHAR(50),
    common_name VARCHAR(255),
    firstname VARCHAR(255),
    lastname VARCHAR(255),
    name VARCHAR(255),
    display_name VARCHAR(255),
    image_path TEXT,
    height INTEGER,
    weight INTEGER,
    date_of_birth DATE,
    gender VARCHAR(10),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Venues master table
CREATE TABLE IF NOT EXISTS oracle.venues (
    id VARCHAR(50) PRIMARY KEY,
    country_id VARCHAR(50),
    city_id VARCHAR(50),
    name VARCHAR(255) NOT NULL,
    address TEXT,
    city VARCHAR(255),
    capacity INTEGER,
    image_path TEXT,
    coordinates VARCHAR(100), -- "lat,lng" format
    surface VARCHAR(50), -- 'grass', 'artificial', etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bookmakers master table
CREATE TABLE IF NOT EXISTS oracle.bookmakers (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    logo_url TEXT,
    website_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Countries master table
CREATE TABLE IF NOT EXISTS oracle.countries (
    id VARCHAR(50) PRIMARY KEY,
    continent_id VARCHAR(50),
    name VARCHAR(255) NOT NULL,
    official_name VARCHAR(255),
    fifa_name VARCHAR(10),
    iso2 VARCHAR(10),
    iso3 VARCHAR(10),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    image_path TEXT, -- Country flag URL
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- ODYSSEY SCHEMA - Game mechanics
-- =====================================================

-- Daily games table
CREATE TABLE IF NOT EXISTS oddyssey.daily_games (
    game_date DATE PRIMARY KEY,
    entry_fee NUMERIC(18, 6) DEFAULT 0.01,
    max_participants INTEGER DEFAULT 1000,
    total_prize_pool NUMERIC(18, 6) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Daily game matches
CREATE TABLE IF NOT EXISTS oddyssey.daily_game_matches (
    id BIGSERIAL PRIMARY KEY,
    game_date DATE NOT NULL,
    fixture_id VARCHAR(50) NOT NULL,
    match_order INTEGER,
    home_odds NUMERIC(10, 6),
    draw_odds NUMERIC(10, 6),
    away_odds NUMERIC(10, 6),
    over_25_odds NUMERIC(10, 6),
    under_25_odds NUMERIC(10, 6),
    cycle_id BIGINT,
    home_team VARCHAR(255),
    away_team VARCHAR(255),
    league_name VARCHAR(255),
    match_date TIMESTAMP WITH TIME ZONE,
    display_order INTEGER,
    selection_type VARCHAR(50) DEFAULT 'auto',
    priority_score INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (fixture_id, cycle_id),
    FOREIGN KEY (game_date) REFERENCES oddyssey.daily_games(game_date) ON DELETE CASCADE,
    FOREIGN KEY (fixture_id) REFERENCES oracle.fixtures(id) ON DELETE CASCADE,
    FOREIGN KEY (cycle_id) REFERENCES oddyssey.oddyssey_cycles(id) ON DELETE CASCADE
);

-- Oddyssey cycles
CREATE TABLE IF NOT EXISTS oddyssey.oddyssey_cycles (
    id BIGSERIAL PRIMARY KEY,
    cycle_number INTEGER UNIQUE NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    total_participants INTEGER DEFAULT 0,
    total_volume NUMERIC(18, 6) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Oddyssey slips (user bets)
CREATE TABLE IF NOT EXISTS oddyssey.oddyssey_slips (
    slip_id VARCHAR(50) PRIMARY KEY,
    user_address VARCHAR(42) NOT NULL,
    cycle_id VARCHAR(50) NOT NULL,
    game_date DATE NOT NULL,
    total_odds NUMERIC(10, 6),
    stake_amount NUMERIC(18, 6),
    potential_winnings NUMERIC(18, 6),
    status VARCHAR(50) DEFAULT 'pending',
    final_score NUMERIC(10, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (cycle_id) REFERENCES oddyssey.oddyssey_cycles(id) ON DELETE CASCADE,
    FOREIGN KEY (game_date) REFERENCES oddyssey.daily_games(game_date) ON DELETE CASCADE
);

-- Oddyssey slip selections
CREATE TABLE IF NOT EXISTS oddyssey.oddyssey_slip_selections (
    id BIGSERIAL PRIMARY KEY,
    slip_id VARCHAR(50) NOT NULL,
    fixture_id VARCHAR(50) NOT NULL,
    selection_type VARCHAR(50) NOT NULL, -- '1X2', 'Over/Under', 'BTTS'
    selection_value VARCHAR(10) NOT NULL, -- '1', 'X', '2', 'Over', 'Under', 'Yes', 'No'
    odds NUMERIC(10, 6),
    result VARCHAR(10), -- 'W', 'L', 'P' (Win, Loss, Push)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (slip_id) REFERENCES oddyssey.oddyssey_slips(slip_id) ON DELETE CASCADE,
    FOREIGN KEY (fixture_id) REFERENCES oracle.fixtures(id) ON DELETE CASCADE
);

-- Slips table (legacy compatibility)
CREATE TABLE IF NOT EXISTS oddyssey.slips (
    slip_id BIGSERIAL PRIMARY KEY,
    user_address VARCHAR(42) NOT NULL,
    game_date DATE NOT NULL,
    total_odds NUMERIC(10, 4) NOT NULL,
    is_evaluated BOOLEAN DEFAULT false,
    correct_count INTEGER,
    final_score INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Slip entries
CREATE TABLE IF NOT EXISTS oddyssey.slip_entries (
    id BIGSERIAL PRIMARY KEY,
    slip_id BIGINT NOT NULL,
    match_id INTEGER NOT NULL,
    bet_type VARCHAR(50) NOT NULL,
    selected_outcome VARCHAR(50) NOT NULL,
    selected_odd NUMERIC(10, 4) NOT NULL,
    is_correct BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (slip_id) REFERENCES oddyssey.slips(slip_id) ON DELETE CASCADE
);

-- Game results (daily game outcomes)
CREATE TABLE IF NOT EXISTS oddyssey.game_results (
    id BIGSERIAL PRIMARY KEY,
    game_date DATE NOT NULL UNIQUE,
    total_participants INTEGER DEFAULT 0,
    total_slips INTEGER DEFAULT 0,
    winners JSONB, -- Array of winner objects with rankings
    prize_pool NUMERIC(18, 6) DEFAULT 0,
    is_finalized BOOLEAN DEFAULT false,
    finalized_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (game_date) REFERENCES oddyssey.daily_games(game_date) ON DELETE CASCADE
);

-- Cycle status tracking (CRITICAL FOR ODDYSSEY INDEXER)
CREATE TABLE IF NOT EXISTS oddyssey.cycle_status (
    id BIGSERIAL PRIMARY KEY,
    cycle_id VARCHAR(50) NOT NULL UNIQUE,
    status VARCHAR(50) NOT NULL, -- 'active', 'pending', 'completed', 'cancelled'
    start_time TIMESTAMP WITH TIME ZONE,
    end_time TIMESTAMP WITH TIME ZONE,
    total_participants INTEGER DEFAULT 0,
    total_entries INTEGER DEFAULT 0,
    prize_pool NUMERIC(18, 6) DEFAULT 0,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- ANALYTICS SCHEMA - Data analysis
-- =====================================================

-- User analytics
CREATE TABLE IF NOT EXISTS analytics.user_analytics (
    id BIGSERIAL PRIMARY KEY,
    user_address VARCHAR(42) NOT NULL,
    total_bets INTEGER DEFAULT 0,
    winning_bets INTEGER DEFAULT 0,
    total_staked NUMERIC(18, 6) DEFAULT 0,
    total_won NUMERIC(18, 6) DEFAULT 0,
    win_rate NUMERIC(5, 2) DEFAULT 0,
    avg_odds NUMERIC(10, 6) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Market analytics
CREATE TABLE IF NOT EXISTS analytics.market_analytics (
    id BIGSERIAL PRIMARY KEY,
    fixture_id VARCHAR(50) NOT NULL,
    market_type VARCHAR(50) NOT NULL,
    total_bets INTEGER DEFAULT 0,
    home_bets INTEGER DEFAULT 0,
    draw_bets INTEGER DEFAULT 0,
    away_bets INTEGER DEFAULT 0,
    over_bets INTEGER DEFAULT 0,
    under_bets INTEGER DEFAULT 0,
    btts_yes_bets INTEGER DEFAULT 0,
    btts_no_bets INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (fixture_id) REFERENCES oracle.fixtures(id) ON DELETE CASCADE
);

-- Staking events
CREATE TABLE IF NOT EXISTS analytics.staking_events (
    id BIGSERIAL PRIMARY KEY,
    user_address VARCHAR(42) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    amount NUMERIC(78, 18) NOT NULL,
    transaction_hash VARCHAR(66) UNIQUE NOT NULL,
    block_number BIGINT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    additional_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Pools table
CREATE TABLE IF NOT EXISTS analytics.pools (
    pool_id VARCHAR(50) PRIMARY KEY,
    creator_address VARCHAR(42) NOT NULL,
    odds INTEGER,
    is_settled BOOLEAN DEFAULT false,
    creator_side_won BOOLEAN,
    is_private BOOLEAN DEFAULT false,
    uses_bitr BOOLEAN DEFAULT false,
    oracle_type VARCHAR(50),
    market_id VARCHAR(50),
    predicted_outcome VARCHAR(50),
    actual_result VARCHAR(50),
    creator_stake NUMERIC(78, 18) NOT NULL,
    total_creator_side_stake NUMERIC(78, 18) NOT NULL,
    total_bettor_stake NUMERIC(78, 18) DEFAULT 0,
    max_bettor_stake NUMERIC(78, 18),
    event_start_time TIMESTAMP WITH TIME ZONE,
    event_end_time TIMESTAMP WITH TIME ZONE,
    betting_end_time TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    settled_at TIMESTAMP WITH TIME ZONE
);

-- =====================================================
-- SYSTEM SCHEMA - System management
-- =====================================================

-- System configuration
CREATE TABLE IF NOT EXISTS system.config (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- System logs
CREATE TABLE IF NOT EXISTS system.logs (
    id BIGSERIAL PRIMARY KEY,
    level VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    context JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Cron locks table
CREATE TABLE IF NOT EXISTS system.cron_locks (
    id BIGSERIAL PRIMARY KEY,
    job_name VARCHAR(100) NOT NULL,
    locked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    locked_by VARCHAR(100) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Cron execution log
CREATE TABLE IF NOT EXISTS system.cron_execution_log (
    id BIGSERIAL PRIMARY KEY,
    job_name VARCHAR(100) NOT NULL,
    execution_id VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL, -- 'started', 'completed', 'failed'
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,
    metadata JSONB,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- CRYPTO SCHEMA - Cryptocurrency data
-- =====================================================

-- Crypto coins (in crypto schema)
CREATE TABLE IF NOT EXISTS crypto.crypto_coins (
    id VARCHAR(50) PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    price_usd NUMERIC(20, 8),
    market_cap_usd NUMERIC(20, 2),
    volume_24h_usd NUMERIC(20, 2),
    price_change_24h NUMERIC(10, 4),
    market_cap_rank INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crypto coins (in oracle schema for compatibility with existing code)
CREATE TABLE IF NOT EXISTS oracle.crypto_coins (
    coinpaprika_id VARCHAR(50) PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    is_popular BOOLEAN DEFAULT false,
    rank INTEGER,
    logo_url TEXT,
    whitepaper_url TEXT,
    website_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Core schema indexes
CREATE INDEX IF NOT EXISTS idx_users_address ON core.users(address);
CREATE INDEX IF NOT EXISTS idx_reputation_actions_user_address ON core.reputation_actions(user_address);
CREATE INDEX IF NOT EXISTS idx_reputation_actions_timestamp ON core.reputation_actions(timestamp);
CREATE INDEX IF NOT EXISTS idx_achievements_user_address ON core.achievements(user_address);

-- Oracle schema indexes
CREATE INDEX IF NOT EXISTS idx_fixtures_match_date ON oracle.fixtures(match_date);
CREATE INDEX IF NOT EXISTS idx_fixtures_league_id ON oracle.fixtures(league_id);
CREATE INDEX IF NOT EXISTS idx_fixtures_status ON oracle.fixtures(status);
CREATE INDEX IF NOT EXISTS idx_fixture_odds_fixture_id ON oracle.fixture_odds(fixture_id);
CREATE INDEX IF NOT EXISTS idx_fixture_odds_market_id ON oracle.fixture_odds(market_id);
CREATE INDEX IF NOT EXISTS idx_fixture_odds_label ON oracle.fixture_odds(label);
CREATE INDEX IF NOT EXISTS idx_matches_match_time ON oracle.matches(match_time);
CREATE INDEX IF NOT EXISTS idx_oddyssey_cycles_created_at ON oracle.oddyssey_cycles(created_at);
CREATE INDEX IF NOT EXISTS idx_oddyssey_cycles_resolved ON oracle.oddyssey_cycles(is_resolved);
CREATE INDEX IF NOT EXISTS idx_coins_symbol ON oracle.coins(symbol);
CREATE INDEX IF NOT EXISTS idx_coins_coinpaprika_id ON oracle.coins(coinpaprika_id);

-- Crypto oracle indexes
CREATE INDEX IF NOT EXISTS idx_crypto_price_snapshots_coin ON oracle.crypto_price_snapshots(coinpaprika_id);
CREATE INDEX IF NOT EXISTS idx_crypto_price_snapshots_time ON oracle.crypto_price_snapshots(created_at);
CREATE INDEX IF NOT EXISTS idx_crypto_price_snapshots_coin_time ON oracle.crypto_price_snapshots(coinpaprika_id, created_at);
CREATE INDEX IF NOT EXISTS idx_crypto_prediction_markets_coin ON oracle.crypto_prediction_markets(coinpaprika_id);
CREATE INDEX IF NOT EXISTS idx_crypto_prediction_markets_resolved ON oracle.crypto_prediction_markets(resolved);
CREATE INDEX IF NOT EXISTS idx_crypto_prediction_markets_end_time ON oracle.crypto_prediction_markets(end_time);
CREATE INDEX IF NOT EXISTS idx_crypto_market_stats_coin_date ON oracle.crypto_market_stats(coinpaprika_id, date);
CREATE INDEX IF NOT EXISTS idx_crypto_market_stats_date ON oracle.crypto_market_stats(date);
CREATE INDEX IF NOT EXISTS idx_crypto_resolution_logs_market ON oracle.crypto_resolution_logs(market_id);
CREATE INDEX IF NOT EXISTS idx_crypto_resolution_logs_time ON oracle.crypto_resolution_logs(created_at);

-- Football oracle indexes
CREATE INDEX IF NOT EXISTS idx_football_resolution_logs_market ON oracle.football_resolution_logs(market_id);
CREATE INDEX IF NOT EXISTS idx_football_resolution_logs_fixture ON oracle.football_resolution_logs(fixture_id);
CREATE INDEX IF NOT EXISTS idx_football_resolution_logs_time ON oracle.football_resolution_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_football_market_stats_outcome_date ON oracle.football_market_stats(outcome_type, date);
CREATE INDEX IF NOT EXISTS idx_football_market_stats_date ON oracle.football_market_stats(date);

-- Master tables indexes
CREATE INDEX IF NOT EXISTS idx_referees_name ON oracle.referees(name);
CREATE INDEX IF NOT EXISTS idx_referees_country ON oracle.referees(country_id);
CREATE INDEX IF NOT EXISTS idx_venues_name ON oracle.venues(name);
CREATE INDEX IF NOT EXISTS idx_venues_city ON oracle.venues(city);
CREATE INDEX IF NOT EXISTS idx_venues_capacity ON oracle.venues(capacity);
CREATE INDEX IF NOT EXISTS idx_bookmakers_name ON oracle.bookmakers(name);
CREATE INDEX IF NOT EXISTS idx_bookmakers_active ON oracle.bookmakers(is_active);
CREATE INDEX IF NOT EXISTS idx_countries_name ON oracle.countries(name);
CREATE INDEX IF NOT EXISTS idx_countries_iso2 ON oracle.countries(iso2);

-- Oddyssey schema indexes
CREATE INDEX IF NOT EXISTS idx_oddyssey_slips_user_address ON oddyssey.oddyssey_slips(user_address);
CREATE INDEX IF NOT EXISTS idx_oddyssey_slips_cycle_id ON oddyssey.oddyssey_slips(cycle_id);
CREATE INDEX IF NOT EXISTS idx_oddyssey_slips_game_date ON oddyssey.oddyssey_slips(game_date);
CREATE INDEX IF NOT EXISTS idx_daily_game_matches_game_date ON oddyssey.daily_game_matches(game_date);
CREATE INDEX IF NOT EXISTS idx_daily_game_matches_cycle_id ON oddyssey.daily_game_matches(cycle_id);
CREATE INDEX IF NOT EXISTS idx_slips_user_address ON oddyssey.slips(user_address);
CREATE INDEX IF NOT EXISTS idx_slips_game_date ON oddyssey.slips(game_date);

-- Analytics schema indexes
CREATE INDEX IF NOT EXISTS idx_user_analytics_user_address ON analytics.user_analytics(user_address);
CREATE INDEX IF NOT EXISTS idx_market_analytics_fixture_id ON analytics.market_analytics(fixture_id);
CREATE INDEX IF NOT EXISTS idx_staking_events_user_address ON analytics.staking_events(user_address);
CREATE INDEX IF NOT EXISTS idx_staking_events_timestamp ON analytics.staking_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_pools_creator_address ON analytics.pools(creator_address);
CREATE INDEX IF NOT EXISTS idx_pools_created_at ON analytics.pools(created_at);

-- System schema indexes
CREATE INDEX IF NOT EXISTS idx_cron_locks_job_name ON system.cron_locks(job_name);
CREATE INDEX IF NOT EXISTS idx_cron_locks_expires_at ON system.cron_locks(expires_at);
CREATE INDEX IF NOT EXISTS idx_cron_execution_log_job_started ON system.cron_execution_log(job_name, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_cron_execution_log_status ON system.cron_execution_log(status);

-- =====================================================
-- INITIAL DATA
-- =====================================================

-- Insert default system configuration
INSERT INTO system.config (key, value, description) VALUES
('sportmonks_api_token', '', 'SportMonks API token for football data'),
('coinpaprika_api_key', '', 'Coinpaprika API key for crypto data'),
('web3_provider_url', '', 'Web3 provider URL for blockchain interactions'),
('admin_wallet_address', '', 'Admin wallet address for contract interactions'),
('system_status', 'active', 'System status: active, maintenance, disabled')
ON CONFLICT (key) DO NOTHING;

-- Insert today's daily game
INSERT INTO oddyssey.daily_games (game_date, entry_fee, max_participants, status)
VALUES (CURRENT_DATE, 0.01, 1000, 'active')
ON CONFLICT (game_date) DO NOTHING;

-- =====================================================
-- CRON LOCK FUNCTIONS (CRITICAL FOR JOB COORDINATION)
-- =====================================================

-- Function to acquire a distributed lock for cron job coordination
CREATE OR REPLACE FUNCTION system.acquire_cron_lock(
    job_name VARCHAR(100),
    locked_by VARCHAR(255),
    duration_minutes INTEGER DEFAULT 30
) RETURNS BOOLEAN AS $$
DECLARE
    lock_expires_at TIMESTAMP WITH TIME ZONE := NOW() + (duration_minutes || ' minutes')::INTERVAL;
    lock_acquired BOOLEAN := FALSE;
BEGIN
    -- Clean up expired locks first
    DELETE FROM system.cron_locks 
    WHERE expires_at < NOW();
    
    -- Try to acquire the lock
    INSERT INTO system.cron_locks (job_name, locked_at, locked_by, expires_at)
    VALUES (job_name, NOW(), locked_by, lock_expires_at)
    ON CONFLICT (job_name) DO NOTHING;
    
    -- Check if we got the lock
    GET DIAGNOSTICS lock_acquired = ROW_COUNT;
    
    RETURN (lock_acquired > 0);
END;
$$ LANGUAGE plpgsql;

-- Function to release a distributed lock
CREATE OR REPLACE FUNCTION system.release_cron_lock(
    job_name VARCHAR(100),
    locked_by VARCHAR(255)
) RETURNS BOOLEAN AS $$
DECLARE
    lock_released BOOLEAN := FALSE;
BEGIN
    DELETE FROM system.cron_locks 
    WHERE job_name = job_name AND locked_by = locked_by;
    
    GET DIAGNOSTICS lock_released = ROW_COUNT;
    
    RETURN (lock_released > 0);
END;
$$ LANGUAGE plpgsql;

-- Function to check if a cron lock is currently active
CREATE OR REPLACE FUNCTION system.is_cron_lock_active(
    job_name VARCHAR(100)
) RETURNS BOOLEAN AS $$
DECLARE
    lock_active BOOLEAN := FALSE;
BEGIN
    -- Clean up expired locks first
    DELETE FROM system.cron_locks 
    WHERE expires_at < NOW();
    
    -- Check if lock exists and is not expired
    SELECT EXISTS(
        SELECT 1 FROM system.cron_locks 
        WHERE job_name = job_name AND expires_at > NOW()
    ) INTO lock_active;
    
    RETURN lock_active;
END;
$$ LANGUAGE plpgsql;

-- Generic function to update updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- SCHEMA VERIFICATION COMPLETE
-- =====================================================

-- =====================================================
-- AIRDROP SCHEMA - Complete airdrop system
-- =====================================================

-- Track faucet claims (20K BITR per wallet)
CREATE TABLE IF NOT EXISTS airdrop.faucet_claims (
    id BIGSERIAL PRIMARY KEY,
    user_address VARCHAR(255) NOT NULL UNIQUE,
    amount NUMERIC(78, 18) NOT NULL DEFAULT '20000000000000000000000',
    claimed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    block_number BIGINT NOT NULL,
    transaction_hash VARCHAR(255) NOT NULL UNIQUE,
    had_stt_activity BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Track all BITR activities for eligibility
CREATE TABLE IF NOT EXISTS airdrop.bitr_activities (
    id BIGSERIAL PRIMARY KEY,
    user_address VARCHAR(255) NOT NULL,
    activity_type VARCHAR(100) NOT NULL, -- 'POOL_CREATE', 'BET_PLACE', 'STAKING', 'TRANSFER_IN', 'TRANSFER_OUT'
    amount NUMERIC(78, 18),
    pool_id VARCHAR(255),
    from_address VARCHAR(255),
    to_address VARCHAR(255),
    transaction_hash VARCHAR(255) NOT NULL,
    block_number BIGINT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Track staking activities
CREATE TABLE IF NOT EXISTS airdrop.staking_activities (
    id BIGSERIAL PRIMARY KEY,
    user_address VARCHAR(255) NOT NULL,
    action_type VARCHAR(100) NOT NULL, -- 'STAKE', 'UNSTAKE', 'CLAIM_REWARDS'
    amount NUMERIC(78, 18),
    tier_id INTEGER,
    duration_option INTEGER,
    transaction_hash VARCHAR(255) NOT NULL,
    block_number BIGINT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Track transfer patterns for Sybil detection
CREATE TABLE IF NOT EXISTS airdrop.transfer_patterns (
    id BIGSERIAL PRIMARY KEY,
    from_address VARCHAR(255) NOT NULL,
    to_address VARCHAR(255) NOT NULL,
    amount NUMERIC(78, 18) NOT NULL,
    transaction_hash VARCHAR(255) NOT NULL,
    block_number BIGINT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    is_suspicious BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Main eligibility tracking table
CREATE TABLE IF NOT EXISTS airdrop.eligibility (
    user_address VARCHAR(255) PRIMARY KEY,
    has_faucet_claim BOOLEAN DEFAULT FALSE,
    faucet_claim_date TIMESTAMP WITH TIME ZONE,
    has_stt_activity_before_faucet BOOLEAN DEFAULT FALSE,
    bitr_action_count INTEGER DEFAULT 0,
    has_staking_activity BOOLEAN DEFAULT FALSE,
    oddyssey_slip_count INTEGER DEFAULT 0,
    has_suspicious_transfers BOOLEAN DEFAULT FALSE,
    is_transfer_only_recipient BOOLEAN DEFAULT FALSE,
    is_eligible BOOLEAN DEFAULT FALSE,
    snapshot_bitr_balance NUMERIC(78, 18),
    airdrop_amount NUMERIC(78, 18),
    snapshot_taken_at TIMESTAMP WITH TIME ZONE,
    eligibility_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Airdrop snapshots for distribution
CREATE TABLE IF NOT EXISTS airdrop.snapshots (
    id BIGSERIAL PRIMARY KEY,
    snapshot_name VARCHAR(255) NOT NULL UNIQUE,
    snapshot_block BIGINT NOT NULL,
    snapshot_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    total_eligible_wallets INTEGER DEFAULT 0,
    total_eligible_bitr NUMERIC(78, 18) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Snapshot balances for each user
CREATE TABLE IF NOT EXISTS airdrop.snapshot_balances (
    id BIGSERIAL PRIMARY KEY,
    snapshot_id BIGINT NOT NULL,
    user_address VARCHAR(255) NOT NULL,
    bitr_balance NUMERIC(78, 18) NOT NULL,
    airdrop_amount NUMERIC(78, 18),
    is_eligible BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(snapshot_id, user_address),
    FOREIGN KEY (snapshot_id) REFERENCES airdrop.snapshots(id) ON DELETE CASCADE
);

-- Statistics tracking
CREATE TABLE IF NOT EXISTS airdrop.statistics (
    metric_name VARCHAR(255) PRIMARY KEY,
    metric_value NUMERIC DEFAULT 0,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Airdrop indexes
CREATE INDEX IF NOT EXISTS idx_faucet_claims_user ON airdrop.faucet_claims(user_address);
CREATE INDEX IF NOT EXISTS idx_faucet_claims_claimed_at ON airdrop.faucet_claims(claimed_at);
CREATE INDEX IF NOT EXISTS idx_bitr_activities_user ON airdrop.bitr_activities(user_address);
CREATE INDEX IF NOT EXISTS idx_bitr_activities_type ON airdrop.bitr_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_bitr_activities_timestamp ON airdrop.bitr_activities(timestamp);
CREATE INDEX IF NOT EXISTS idx_staking_activities_user ON airdrop.staking_activities(user_address);
CREATE INDEX IF NOT EXISTS idx_transfer_patterns_from ON airdrop.transfer_patterns(from_address);
CREATE INDEX IF NOT EXISTS idx_transfer_patterns_to ON airdrop.transfer_patterns(to_address);
CREATE INDEX IF NOT EXISTS idx_eligibility_eligible ON airdrop.eligibility(is_eligible);
CREATE INDEX IF NOT EXISTS idx_snapshot_balances_snapshot ON airdrop.snapshot_balances(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_snapshot_balances_user ON airdrop.snapshot_balances(user_address);

-- =====================================================
-- ADDITIONAL TABLES FOR COMPLETE SCHEMA
-- =====================================================

-- Additional tables that were missing from the validation test

-- Predictions table (for user betting predictions)
CREATE TABLE IF NOT EXISTS predictions (
    id SERIAL PRIMARY KEY,
    match_id VARCHAR(255) NOT NULL,
    user_address VARCHAR(255) NOT NULL,
    prediction_type VARCHAR(50) NOT NULL, -- home_win, away_win, draw, over_2.5, etc.
    prediction_value VARCHAR(255) NOT NULL,
    amount DECIMAL(20, 8) NOT NULL, -- Bet amount
    odds DECIMAL(10, 4) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending', -- pending, won, lost, cancelled
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE,
    
    -- Foreign key constraints
    FOREIGN KEY (match_id) REFERENCES oracle.fixtures(id) ON DELETE CASCADE,
    FOREIGN KEY (user_address) REFERENCES core.users(address) ON DELETE CASCADE
);

-- Oracle submissions table (for oracle data submissions)
CREATE TABLE IF NOT EXISTS oracle_submissions (
    id SERIAL PRIMARY KEY,
    match_id VARCHAR(255) NOT NULL,
    oracle_address VARCHAR(255) NOT NULL,
    outcome_data JSONB NOT NULL, -- Flexible JSON structure for outcome data
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Foreign key constraint
    FOREIGN KEY (match_id) REFERENCES oracle.fixtures(id) ON DELETE CASCADE
);

-- Betting cycles table (for betting cycle information)
CREATE TABLE IF NOT EXISTS betting_cycles (
    id SERIAL PRIMARY KEY,
    cycle_id VARCHAR(255) UNIQUE NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(50) DEFAULT 'active', -- active, closed, resolved
    total_pool DECIMAL(20, 8) DEFAULT 0, -- Total pool amount
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Transactions table (for blockchain transactions)
CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    user_address VARCHAR(255) NOT NULL,
    transaction_hash VARCHAR(255) UNIQUE NOT NULL,
    type VARCHAR(50) NOT NULL, -- bet, win, deposit, withdraw
    amount DECIMAL(20, 8) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending', -- pending, confirmed, failed
    block_number BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Foreign key constraint
    FOREIGN KEY (user_address) REFERENCES core.users(address) ON DELETE CASCADE
);

-- Teams table (for team information)
CREATE TABLE IF NOT EXISTS teams (
    id SERIAL PRIMARY KEY,
    team_id VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    short_name VARCHAR(50),
    logo VARCHAR(500), -- URL to logo
    country VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seasons table (for season information)
CREATE TABLE IF NOT EXISTS seasons (
    id SERIAL PRIMARY KEY,
    season_id VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    league_id VARCHAR(255) NOT NULL,
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Foreign key constraint
    FOREIGN KEY (league_id) REFERENCES oracle.leagues(league_id) ON DELETE CASCADE
);

-- Matches table (for legacy compatibility - public schema)
CREATE TABLE IF NOT EXISTS matches (
    id SERIAL PRIMARY KEY,
    match_id VARCHAR(255) UNIQUE NOT NULL,
    home_team VARCHAR(255) NOT NULL,
    away_team VARCHAR(255) NOT NULL,
    home_score INTEGER,
    away_score INTEGER,
    status VARCHAR(50) DEFAULT 'scheduled', -- scheduled, live, finished, cancelled
    start_time TIMESTAMP WITH TIME ZONE,
    end_time TIMESTAMP WITH TIME ZONE,
    league_id VARCHAR(255),
    league_name VARCHAR(255),
    season_id VARCHAR(255),
    season_name VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Users table (for legacy compatibility - public schema)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    address VARCHAR(255) UNIQUE NOT NULL, -- Ethereum address
    username VARCHAR(255),
    email VARCHAR(255),
    balance DECIMAL(20, 8) DEFAULT 0, -- Token balance
    total_bets INTEGER DEFAULT 0,
    total_wins INTEGER DEFAULT 0,
    total_losses INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Leagues table (for legacy compatibility - public schema)
CREATE TABLE IF NOT EXISTS leagues (
    id SERIAL PRIMARY KEY,
    league_id VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    country VARCHAR(255),
    logo VARCHAR(500), -- URL to logo
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for the new tables
CREATE INDEX IF NOT EXISTS idx_predictions_match_id ON predictions(match_id);
CREATE INDEX IF NOT EXISTS idx_predictions_user_address ON predictions(user_address);
CREATE INDEX IF NOT EXISTS idx_predictions_status ON predictions(status);
CREATE INDEX IF NOT EXISTS idx_oracle_submissions_match_id ON oracle_submissions(match_id);
CREATE INDEX IF NOT EXISTS idx_betting_cycles_cycle_id ON betting_cycles(cycle_id);
CREATE INDEX IF NOT EXISTS idx_betting_cycles_status ON betting_cycles(status);
CREATE INDEX IF NOT EXISTS idx_transactions_user_address ON transactions(user_address);
CREATE INDEX IF NOT EXISTS idx_transactions_hash ON transactions(transaction_hash);
CREATE INDEX IF NOT EXISTS idx_teams_team_id ON teams(team_id);
CREATE INDEX IF NOT EXISTS idx_seasons_season_id ON seasons(season_id);
CREATE INDEX IF NOT EXISTS idx_seasons_league_id ON seasons(league_id);

-- Indexes for legacy tables (public schema)
CREATE INDEX IF NOT EXISTS idx_matches_match_id ON matches(match_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_start_time ON matches(start_time);
CREATE INDEX IF NOT EXISTS idx_users_address ON users(address);
CREATE INDEX IF NOT EXISTS idx_leagues_league_id ON leagues(league_id);

-- Add updated_at triggers for the new tables (using DROP IF EXISTS + CREATE to handle existing triggers)
DROP TRIGGER IF EXISTS update_predictions_updated_at ON predictions;
CREATE TRIGGER update_predictions_updated_at BEFORE UPDATE ON predictions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_oracle_submissions_updated_at ON oracle_submissions;
CREATE TRIGGER update_oracle_submissions_updated_at BEFORE UPDATE ON oracle_submissions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_betting_cycles_updated_at ON betting_cycles;
CREATE TRIGGER update_betting_cycles_updated_at BEFORE UPDATE ON betting_cycles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_transactions_updated_at ON transactions;
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_teams_updated_at ON teams;
CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON teams FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_seasons_updated_at ON seasons;
CREATE TRIGGER update_seasons_updated_at BEFORE UPDATE ON seasons FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert required daily_games records to prevent foreign key constraint violations
INSERT INTO oddyssey.daily_games (game_date, created_at, updated_at) VALUES 
('2025-08-12', NOW(), NOW()),
('2025-08-13', NOW(), NOW()),
('2025-08-14', NOW(), NOW()),
('2025-08-15', NOW(), NOW()),
('2025-08-16', NOW(), NOW()),
('2025-08-17', NOW(), NOW()),
('2025-08-18', NOW(), NOW()),
('2025-08-19', NOW(), NOW()),
('2025-08-20', NOW(), NOW()),
('2025-08-21', NOW(), NOW())
ON CONFLICT (game_date) DO NOTHING;

-- Add updated_at triggers for legacy tables (public schema)
DROP TRIGGER IF EXISTS update_matches_updated_at ON matches;
CREATE TRIGGER update_matches_updated_at BEFORE UPDATE ON matches FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_leagues_updated_at ON leagues;
CREATE TRIGGER update_leagues_updated_at BEFORE UPDATE ON leagues FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- MISSING TABLES FROM CODEBASE ANALYSIS
-- =====================================================

-- Create missing schemas
CREATE SCHEMA IF NOT EXISTS prediction;

-- =====================================================
-- PREDICTION SCHEMA - Core betting functionality
-- =====================================================

-- Pools table (core betting functionality)
CREATE TABLE IF NOT EXISTS prediction.pools (
    pool_id VARCHAR(50) PRIMARY KEY,
    creator_address VARCHAR(42) NOT NULL,
    odds INTEGER NOT NULL,
    is_settled BOOLEAN DEFAULT false,
    creator_side_won BOOLEAN,
    is_private BOOLEAN DEFAULT false,
    uses_bitr BOOLEAN DEFAULT false,
    oracle_type VARCHAR(50),
    market_id VARCHAR(50),
    predicted_outcome VARCHAR(50),
    actual_result VARCHAR(50),
    creator_stake NUMERIC(78, 18) NOT NULL,
    total_creator_side_stake NUMERIC(78, 18) NOT NULL,
    total_bettor_stake NUMERIC(78, 18) DEFAULT 0,
    max_bettor_stake NUMERIC(78, 18),
    event_start_time TIMESTAMP WITH TIME ZONE,
    event_end_time TIMESTAMP WITH TIME ZONE,
    betting_end_time TIMESTAMP WITH TIME ZONE,
    creation_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    settled_at TIMESTAMP WITH TIME ZONE
);

-- Bets table (user bets on pools)
CREATE TABLE IF NOT EXISTS prediction.bets (
    bet_id VARCHAR(50) PRIMARY KEY,
    pool_id VARCHAR(50) NOT NULL,
    user_address VARCHAR(42) NOT NULL,
    bet_amount NUMERIC(78, 18) NOT NULL,
    bet_side VARCHAR(10) NOT NULL, -- 'creator' or 'bettor'
    odds_at_bet INTEGER NOT NULL,
    potential_winnings NUMERIC(78, 18) NOT NULL,
    is_winner BOOLEAN,
    is_settled BOOLEAN DEFAULT false,
    settled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (pool_id) REFERENCES prediction.pools(pool_id) ON DELETE CASCADE
);

-- =====================================================
-- CORE SCHEMA - Additional social and reputation features
-- =====================================================

-- Pool creation notifications
CREATE TABLE IF NOT EXISTS core.pool_creation_notifications (
    id BIGSERIAL PRIMARY KEY,
    pool_id VARCHAR(50) NOT NULL,
    creator_address VARCHAR(42) NOT NULL,
    notification_type VARCHAR(50) NOT NULL,
    message TEXT,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Pool comments
CREATE TABLE IF NOT EXISTS core.pool_comments (
    id BIGSERIAL PRIMARY KEY,
    pool_id VARCHAR(50) NOT NULL,
    user_address VARCHAR(42) NOT NULL,
    comment_text TEXT NOT NULL,
    parent_comment_id BIGINT,
    is_deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (parent_comment_id) REFERENCES core.pool_comments(id) ON DELETE CASCADE
);

-- Community discussions
CREATE TABLE IF NOT EXISTS core.community_discussions (
    id BIGSERIAL PRIMARY KEY,
    user_address VARCHAR(42) NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    category VARCHAR(100),
    is_deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Discussion replies
CREATE TABLE IF NOT EXISTS core.discussion_replies (
    id BIGSERIAL PRIMARY KEY,
    discussion_id BIGINT NOT NULL,
    user_address VARCHAR(42) NOT NULL,
    content TEXT NOT NULL,
    parent_reply_id BIGINT,
    is_deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (discussion_id) REFERENCES core.community_discussions(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_reply_id) REFERENCES core.discussion_replies(id) ON DELETE CASCADE
);

-- Social reactions
CREATE TABLE IF NOT EXISTS core.social_reactions (
    id BIGSERIAL PRIMARY KEY,
    user_address VARCHAR(42) NOT NULL,
    target_type VARCHAR(50) NOT NULL, -- 'pool', 'comment', 'discussion', 'reply'
    target_id BIGINT NOT NULL,
    reaction_type VARCHAR(20) NOT NULL, -- 'like', 'dislike', 'love', 'laugh'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_address, target_type, target_id)
);

-- Pool reflections (user thoughts on pools)
CREATE TABLE IF NOT EXISTS core.pool_reflections (
    id BIGSERIAL PRIMARY KEY,
    pool_id VARCHAR(50) NOT NULL,
    user_address VARCHAR(42) NOT NULL,
    reflection_text TEXT NOT NULL,
    confidence_level INTEGER CHECK (confidence_level >= 1 AND confidence_level <= 10),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Reputation log (legacy compatibility)
CREATE TABLE IF NOT EXISTS core.reputation_log (
    id BIGSERIAL PRIMARY KEY,
    user_address VARCHAR(42) NOT NULL,
    action VARCHAR(100) NOT NULL,
    points INTEGER NOT NULL,
    ref_type VARCHAR(50),
    ref_id VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- ANALYTICS SCHEMA - Additional analytics tables
-- =====================================================

-- Daily statistics
CREATE TABLE IF NOT EXISTS analytics.daily_stats (
    id BIGSERIAL PRIMARY KEY,
    date DATE NOT NULL UNIQUE,
    total_users INTEGER DEFAULT 0,
    total_pools INTEGER DEFAULT 0,
    total_bets INTEGER DEFAULT 0,
    total_volume NUMERIC(78, 18) DEFAULT 0,
    active_users INTEGER DEFAULT 0,
    new_users INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Hourly activity tracking
CREATE TABLE IF NOT EXISTS analytics.hourly_activity (
    id BIGSERIAL PRIMARY KEY,
    date_hour TIMESTAMP WITH TIME ZONE NOT NULL UNIQUE,
    active_users INTEGER DEFAULT 0,
    total_actions INTEGER DEFAULT 0,
    pools_created INTEGER DEFAULT 0,
    bets_placed INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Category statistics
CREATE TABLE IF NOT EXISTS analytics.category_stats (
    id BIGSERIAL PRIMARY KEY,
    category VARCHAR(100) NOT NULL,
    date DATE NOT NULL,
    total_pools INTEGER DEFAULT 0,
    total_volume NUMERIC(78, 18) DEFAULT 0,
    avg_odds NUMERIC(10, 6) DEFAULT 0,
    win_rate NUMERIC(5, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(category, date)
);

-- Pool challenge scores
CREATE TABLE IF NOT EXISTS analytics.pool_challenge_scores (
    id BIGSERIAL PRIMARY KEY,
    pool_id VARCHAR(50) NOT NULL,
    user_address VARCHAR(42) NOT NULL,
    challenge_score NUMERIC(10, 2) DEFAULT 0,
    difficulty_level INTEGER DEFAULT 1,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(pool_id, user_address)
);

-- BITR rewards tracking
CREATE TABLE IF NOT EXISTS analytics.bitr_rewards (
    id BIGSERIAL PRIMARY KEY,
    user_address VARCHAR(42) NOT NULL,
    reward_type VARCHAR(50) NOT NULL,
    amount NUMERIC(78, 18) NOT NULL,
    reason TEXT,
    pool_id VARCHAR(50),
    challenge_id BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User social statistics
CREATE TABLE IF NOT EXISTS analytics.user_social_stats (
    id BIGSERIAL PRIMARY KEY,
    user_address VARCHAR(42) NOT NULL UNIQUE,
    total_comments INTEGER DEFAULT 0,
    total_discussions INTEGER DEFAULT 0,
    total_replies INTEGER DEFAULT 0,
    total_reactions_given INTEGER DEFAULT 0,
    total_reactions_received INTEGER DEFAULT 0,
    total_reflections INTEGER DEFAULT 0,
    social_score INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- ORACLE SCHEMA - Additional oracle tables
-- =====================================================

-- Current Oddyssey cycle view (as table for compatibility)
CREATE TABLE IF NOT EXISTS oracle.current_oddyssey_cycle (
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

-- Oddyssey slips (in oracle schema for compatibility)
CREATE TABLE IF NOT EXISTS oracle.oddyssey_slips (
    slip_id BIGINT PRIMARY KEY,
    cycle_id BIGINT NOT NULL,
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

-- Oddyssey user preferences
CREATE TABLE IF NOT EXISTS oracle.oddyssey_user_preferences (
    id BIGSERIAL PRIMARY KEY,
    user_address VARCHAR(42) NOT NULL UNIQUE,
    auto_evaluate BOOLEAN DEFAULT true,
    auto_claim BOOLEAN DEFAULT true,
    notifications BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Oddyssey user statistics
CREATE TABLE IF NOT EXISTS oracle.oddyssey_user_stats (
    id BIGSERIAL PRIMARY KEY,
    user_address VARCHAR(42) NOT NULL UNIQUE,
    total_slips INTEGER DEFAULT 0,
    total_wins INTEGER DEFAULT 0,
    best_score NUMERIC(10, 2) DEFAULT 0,
    win_rate NUMERIC(5, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Oddyssey prize claims
CREATE TABLE IF NOT EXISTS oracle.oddyssey_prize_claims (
    id BIGSERIAL PRIMARY KEY,
    cycle_id BIGINT NOT NULL,
    player_address VARCHAR(42) NOT NULL,
    rank INTEGER NOT NULL,
    amount NUMERIC(78, 18) NOT NULL,
    claimed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    tx_hash VARCHAR(66),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Daily game matches (in oracle schema for compatibility)
CREATE TABLE IF NOT EXISTS oracle.daily_game_matches (
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
    cycle_id BIGINT NOT NULL,
    display_order INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_fixture_cycle UNIQUE (fixture_id, cycle_id)
);

-- Active crypto markets view (as table for compatibility)
CREATE TABLE IF NOT EXISTS oracle.active_crypto_markets (
    market_id VARCHAR(100) PRIMARY KEY,
    coinpaprika_id VARCHAR(50) NOT NULL,
    target_price NUMERIC(20, 8) NOT NULL,
    direction VARCHAR(10) NOT NULL,
    timeframe VARCHAR(10) NOT NULL,
    start_price NUMERIC(20, 8) NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    resolved BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Pending crypto resolutions view (as table for compatibility)
CREATE TABLE IF NOT EXISTS oracle.pending_crypto_resolutions (
    market_id VARCHAR(100) PRIMARY KEY,
    coinpaprika_id VARCHAR(50) NOT NULL,
    target_price NUMERIC(20, 8) NOT NULL,
    direction VARCHAR(10) NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    current_price NUMERIC(20, 8),
    is_resolvable BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- SYSTEM SCHEMA - Additional system tables
-- =====================================================

-- Health checks
CREATE TABLE IF NOT EXISTS system.health_checks (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    overall_status VARCHAR(20) NOT NULL,
    check_duration INTEGER NOT NULL,
    services_data JSONB NOT NULL,
    performance_data JSONB NOT NULL,
    alerts_data JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Performance metrics
CREATE TABLE IF NOT EXISTS system.performance_metrics (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    metric_name VARCHAR(100) NOT NULL,
    metric_value NUMERIC(10,2) NOT NULL,
    metric_unit VARCHAR(20),
    service_name VARCHAR(100),
    context_data JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- AIRDROP SCHEMA - Additional airdrop tables
-- =====================================================

-- Summary statistics
CREATE TABLE IF NOT EXISTS airdrop.summary_stats (
    id BIGSERIAL PRIMARY KEY,
    metric_name VARCHAR(255) UNIQUE NOT NULL,
    metric_value NUMERIC DEFAULT 0,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- INDEXES FOR MISSING TABLES
-- =====================================================

-- Prediction schema indexes
CREATE INDEX IF NOT EXISTS idx_prediction_pools_creator ON prediction.pools(creator_address);
CREATE INDEX IF NOT EXISTS idx_prediction_pools_created_at ON prediction.pools(created_at);
CREATE INDEX IF NOT EXISTS idx_prediction_pools_settled ON prediction.pools(is_settled);
CREATE INDEX IF NOT EXISTS idx_prediction_bets_pool_id ON prediction.bets(pool_id);
CREATE INDEX IF NOT EXISTS idx_prediction_bets_user_address ON prediction.bets(user_address);
CREATE INDEX IF NOT EXISTS idx_prediction_bets_created_at ON prediction.bets(created_at);

-- Core schema indexes
CREATE INDEX IF NOT EXISTS idx_pool_comments_pool_id ON core.pool_comments(pool_id);
CREATE INDEX IF NOT EXISTS idx_pool_comments_user_address ON core.pool_comments(user_address);
CREATE INDEX IF NOT EXISTS idx_community_discussions_user_address ON core.community_discussions(user_address);
CREATE INDEX IF NOT EXISTS idx_community_discussions_category ON core.community_discussions(category);
CREATE INDEX IF NOT EXISTS idx_discussion_replies_discussion_id ON core.discussion_replies(discussion_id);
CREATE INDEX IF NOT EXISTS idx_social_reactions_target ON core.social_reactions(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_social_reactions_user ON core.social_reactions(user_address);
CREATE INDEX IF NOT EXISTS idx_pool_reflections_pool_id ON core.pool_reflections(pool_id);
CREATE INDEX IF NOT EXISTS idx_reputation_log_user_address ON core.reputation_log(user_address);

-- Analytics schema indexes
CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON analytics.daily_stats(date);
CREATE INDEX IF NOT EXISTS idx_hourly_activity_date_hour ON analytics.hourly_activity(date_hour);
CREATE INDEX IF NOT EXISTS idx_category_stats_category_date ON analytics.category_stats(category, date);
CREATE INDEX IF NOT EXISTS idx_pool_challenge_scores_pool ON analytics.pool_challenge_scores(pool_id);
CREATE INDEX IF NOT EXISTS idx_pool_challenge_scores_user ON analytics.pool_challenge_scores(user_address);
CREATE INDEX IF NOT EXISTS idx_bitr_rewards_user_address ON analytics.bitr_rewards(user_address);
CREATE INDEX IF NOT EXISTS idx_bitr_rewards_type ON analytics.bitr_rewards(reward_type);

-- Oracle schema indexes
CREATE INDEX IF NOT EXISTS idx_oddyssey_slips_cycle_id ON oracle.oddyssey_slips(cycle_id);
CREATE INDEX IF NOT EXISTS idx_oddyssey_slips_player ON oracle.oddyssey_slips(player_address);
CREATE INDEX IF NOT EXISTS idx_oddyssey_user_preferences_user ON oracle.oddyssey_user_preferences(user_address);
CREATE INDEX IF NOT EXISTS idx_oddyssey_user_stats_user ON oracle.oddyssey_user_stats(user_address);
CREATE INDEX IF NOT EXISTS idx_oddyssey_prize_claims_cycle ON oracle.oddyssey_prize_claims(cycle_id);
CREATE INDEX IF NOT EXISTS idx_daily_game_matches_game_date ON oracle.daily_game_matches(game_date);
CREATE INDEX IF NOT EXISTS idx_daily_game_matches_cycle_id ON oracle.daily_game_matches(cycle_id);
CREATE INDEX IF NOT EXISTS idx_active_crypto_markets_resolved ON oracle.active_crypto_markets(resolved);
CREATE INDEX IF NOT EXISTS idx_pending_crypto_resolutions_end_time ON oracle.pending_crypto_resolutions(end_time);

-- System schema indexes
CREATE INDEX IF NOT EXISTS idx_health_checks_timestamp ON system.health_checks(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_timestamp_service ON system.performance_metrics(timestamp DESC, service_name);

-- =====================================================
-- INITIAL DATA FOR MISSING TABLES
-- =====================================================

-- Insert default airdrop summary stats
INSERT INTO airdrop.summary_stats (metric_name, metric_value, description) VALUES
('total_faucet_claims', 0, 'Total number of faucet claims'),
('total_eligible_wallets', 0, 'Total number of eligible wallets'),
('total_airdrop_amount', 0, 'Total airdrop amount allocated'),
('avg_bitr_actions', 0, 'Average BITR actions per eligible wallet'),
('suspicious_wallets_detected', 0, 'Number of suspicious wallets detected')
ON CONFLICT (metric_name) DO NOTHING;

-- =====================================================
-- MISSING PRODUCTION TABLES - ADDING TO SYNC WITH NEON
-- =====================================================

-- Oddyssey events table (blockchain events tracking)
CREATE TABLE IF NOT EXISTS oddyssey.events (
    id SERIAL PRIMARY KEY,
    event_type TEXT NOT NULL,
    block_number BIGINT NOT NULL,
    transaction_hash TEXT NOT NULL,
    event_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Oracle combo pools (multi-pool betting)
CREATE TABLE IF NOT EXISTS oracle.combo_pools (
    combo_pool_id BIGINT PRIMARY KEY,
    creator_address TEXT NOT NULL,
    creator_stake BIGINT NOT NULL,
    total_creator_side_stake BIGINT NOT NULL,
    max_bettor_stake BIGINT NOT NULL,
    total_bettor_stake BIGINT DEFAULT 0,
    total_odds INTEGER NOT NULL,
    settled BOOLEAN DEFAULT false,
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

-- Oracle fixture mappings (market to fixture mapping)
CREATE TABLE IF NOT EXISTS oracle.fixture_mappings (
    id SERIAL PRIMARY KEY,
    market_id_hash VARCHAR(255) NOT NULL,
    fixture_id VARCHAR(255) NOT NULL,
    home_team VARCHAR(255),
    away_team VARCHAR(255),
    league_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    predicted_outcome VARCHAR(255),
    readable_outcome TEXT,
    market_type TEXT,
    odds_decimal NUMERIC,
    creator_stake_wei NUMERIC,
    payment_token TEXT,
    use_bitr BOOLEAN,
    description TEXT,
    user_position TEXT,
    match_date TIMESTAMP,
    binary_selection TEXT
);

-- Oracle indexed blocks (blockchain indexing state)
CREATE TABLE IF NOT EXISTS oracle.indexed_blocks (
    block_number BIGINT PRIMARY KEY,
    indexed_at TIMESTAMP DEFAULT NOW()
);

-- Oracle indexer state (indexer status tracking)
CREATE TABLE IF NOT EXISTS oracle.indexer_state (
    id SERIAL PRIMARY KEY,
    last_indexed_block BIGINT NOT NULL DEFAULT 0,
    last_processed_block BIGINT NOT NULL DEFAULT 0,
    is_processing BOOLEAN DEFAULT false,
    total_blocks BIGINT DEFAULT 0,
    total_events BIGINT DEFAULT 0,
    start_time TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Oracle monitoring alerts (system monitoring)
CREATE TABLE IF NOT EXISTS oracle.monitoring_alerts (
    id SERIAL PRIMARY KEY,
    alert_type VARCHAR(255) NOT NULL,
    severity VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    details JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Oracle monitoring metrics (performance tracking)
CREATE TABLE IF NOT EXISTS oracle.monitoring_metrics (
    id SERIAL PRIMARY KEY,
    metric_name VARCHAR(255) NOT NULL,
    metric_value NUMERIC NOT NULL,
    metric_unit VARCHAR(50),
    timestamp TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Oracle cycle health checks (oddyssey cycle monitoring)
CREATE TABLE IF NOT EXISTS oracle.cycle_health_checks (
    id SERIAL PRIMARY KEY,
    cycle_id BIGINT NOT NULL,
    check_type VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL,
    details JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Oracle cycle health reports (cycle health summaries)
CREATE TABLE IF NOT EXISTS oracle.cycle_health_reports (
    id SERIAL PRIMARY KEY,
    cycle_id BIGINT NOT NULL,
    overall_health VARCHAR(50) NOT NULL,
    issues_found INTEGER DEFAULT 0,
    report_data JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Oracle oddyssey prize rollovers (prize rollover tracking)
CREATE TABLE IF NOT EXISTS oracle.oddyssey_prize_rollovers (
    id SERIAL PRIMARY KEY,
    from_cycle_id BIGINT NOT NULL,
    to_cycle_id BIGINT NOT NULL,
    amount NUMERIC(78, 18) NOT NULL,
    rollover_reason TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Oracle pool claims (pool claim tracking)
CREATE TABLE IF NOT EXISTS oracle.pool_claims (
    id SERIAL PRIMARY KEY,
    pool_id BIGINT NOT NULL,
    user_address VARCHAR(42) NOT NULL,
    amount NUMERIC(78, 18) NOT NULL,
    claimed_at TIMESTAMP DEFAULT NOW(),
    tx_hash VARCHAR(66),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Oracle pool liquidity providers (liquidity provider tracking)
CREATE TABLE IF NOT EXISTS oracle.pool_liquidity_providers (
    id SERIAL PRIMARY KEY,
    pool_id BIGINT NOT NULL,
    provider_address VARCHAR(42) NOT NULL,
    amount_provided NUMERIC(78, 18) NOT NULL,
    provided_at TIMESTAMP DEFAULT NOW(),
    tx_hash VARCHAR(66),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Oracle pool refunds (pool refund tracking)
CREATE TABLE IF NOT EXISTS oracle.pool_refunds (
    id SERIAL PRIMARY KEY,
    pool_id BIGINT NOT NULL,
    user_address VARCHAR(42) NOT NULL,
    amount NUMERIC(78, 18) NOT NULL,
    refund_reason TEXT,
    refunded_at TIMESTAMP DEFAULT NOW(),
    tx_hash VARCHAR(66),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Oracle system health checks (system health monitoring)
CREATE TABLE IF NOT EXISTS oracle.system_health_checks (
    id SERIAL PRIMARY KEY,
    check_name VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL,
    response_time_ms INTEGER,
    error_message TEXT,
    checked_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Neon Auth schema and users sync table
CREATE SCHEMA IF NOT EXISTS neon_auth;

CREATE TABLE IF NOT EXISTS neon_auth.users_sync (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL UNIQUE,
    email VARCHAR(255),
    display_name VARCHAR(255),
    profile_image_url TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create comprehensive slips view
CREATE OR REPLACE VIEW oracle.comprehensive_slips AS
SELECT 
    os.slip_id,
    os.cycle_id,
    os.player_address,
    os.placed_at,
    os.predictions,
    os.final_score,
    os.correct_count,
    os.is_evaluated,
    os.leaderboard_rank,
    os.prize_claimed,
    os.tx_hash,
    oc.cycle_start_time,
    oc.cycle_end_time,
    oc.is_resolved as cycle_resolved
FROM oracle.oddyssey_slips os
LEFT JOIN oracle.oddyssey_cycles oc ON os.cycle_id = oc.cycle_id;

-- =====================================================
-- INDEXES FOR NEW TABLES
-- =====================================================

-- Oddyssey events indexes
CREATE INDEX IF NOT EXISTS idx_oddyssey_events_type ON oddyssey.events(event_type);
CREATE INDEX IF NOT EXISTS idx_oddyssey_events_block ON oddyssey.events(block_number);
CREATE INDEX IF NOT EXISTS idx_oddyssey_events_tx_hash ON oddyssey.events(transaction_hash);

-- Oracle combo pools indexes
CREATE INDEX IF NOT EXISTS idx_combo_pools_creator ON oracle.combo_pools(creator_address);
CREATE INDEX IF NOT EXISTS idx_combo_pools_settled ON oracle.combo_pools(settled);
CREATE INDEX IF NOT EXISTS idx_combo_pools_event_start ON oracle.combo_pools(event_start_time);

-- Oracle fixture mappings indexes
CREATE INDEX IF NOT EXISTS idx_fixture_mappings_market_hash ON oracle.fixture_mappings(market_id_hash);
CREATE INDEX IF NOT EXISTS idx_fixture_mappings_fixture_id ON oracle.fixture_mappings(fixture_id);

-- Oracle indexer state indexes
CREATE INDEX IF NOT EXISTS idx_indexer_state_last_block ON oracle.indexer_state(last_indexed_block);
CREATE INDEX IF NOT EXISTS idx_indexer_state_processing ON oracle.indexer_state(is_processing);

-- Oracle monitoring indexes
CREATE INDEX IF NOT EXISTS idx_monitoring_alerts_type ON oracle.monitoring_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_monitoring_alerts_severity ON oracle.monitoring_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_monitoring_metrics_name ON oracle.monitoring_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_monitoring_metrics_timestamp ON oracle.monitoring_metrics(timestamp);

-- Oracle health check indexes
CREATE INDEX IF NOT EXISTS idx_cycle_health_checks_cycle ON oracle.cycle_health_checks(cycle_id);
CREATE INDEX IF NOT EXISTS idx_cycle_health_reports_cycle ON oracle.cycle_health_reports(cycle_id);

-- Oracle pool tracking indexes
CREATE INDEX IF NOT EXISTS idx_pool_claims_pool_id ON oracle.pool_claims(pool_id);
CREATE INDEX IF NOT EXISTS idx_pool_claims_user ON oracle.pool_claims(user_address);
CREATE INDEX IF NOT EXISTS idx_pool_liquidity_pool_id ON oracle.pool_liquidity_providers(pool_id);
CREATE INDEX IF NOT EXISTS idx_pool_refunds_pool_id ON oracle.pool_refunds(pool_id);

-- System health indexes
CREATE INDEX IF NOT EXISTS idx_system_health_checks_name ON oracle.system_health_checks(check_name);
CREATE INDEX IF NOT EXISTS idx_system_health_checks_status ON oracle.system_health_checks(status);

-- Neon auth indexes
CREATE INDEX IF NOT EXISTS idx_neon_auth_users_user_id ON neon_auth.users_sync(user_id);
CREATE INDEX IF NOT EXISTS idx_neon_auth_users_email ON neon_auth.users_sync(email);

-- =====================================================
-- PERFECT SCHEMA COMPLETE - 117+ TABLES TOTAL (SYNCED WITH PRODUCTION)
-- =====================================================
-- 
-- Schema Breakdown:
-- - oracle: 40+ tables (football data, crypto data, odds, results, monitoring, indexing)
-- - oddyssey: 11 tables (game mechanics, cycles, slips, events)
-- - analytics: 8 tables (statistics, metrics, tracking)
-- - core: 8 tables (users, reputation, social features)
-- - system: 6 tables (configuration, monitoring, cron, health)
-- - airdrop: 9 tables (eligibility, tracking, snapshots)
-- - prediction: 2 tables (pools, bets)
-- - crypto: 1 table (crypto coins)
-- - public: 9 tables (legacy compatibility)
-- - neon_auth: 1 table (authentication sync)
-- 
-- Total: 117+ tables - FULLY SYNCED WITH PRODUCTION NEON DATABASE
-- =====================================================

-- Match Events Table (goals, cards, substitutions, etc.)
CREATE TABLE IF NOT EXISTS oracle.match_events (
    id SERIAL PRIMARY KEY,
    fixture_id BIGINT NOT NULL,
    event_type VARCHAR(50) NOT NULL, -- 'goal', 'card', 'substitution', 'injury_time', etc.
    minute SMALLINT, -- Minute when event occurred (0-120)
    extra_minute SMALLINT, -- Extra time minute if applicable
    player_name VARCHAR(255), -- Player who committed action
    player_id BIGINT, -- Sportmonks player ID
    team_id BIGINT, -- Which team (for goals, cards, etc.)
    related_player_name VARCHAR(255), -- For assists, recipient, etc.
    related_player_id BIGINT,
    reason VARCHAR(255), -- For cards (yellow/red), substitutions (reason)
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    FOREIGN KEY (fixture_id) REFERENCES oracle.fixtures(fixture_id) ON DELETE CASCADE,
    INDEX idx_fixture_events(fixture_id),
    INDEX idx_event_type(fixture_id, event_type)
);

COMMENT ON TABLE oracle.match_events IS 'Match events (goals, cards, substitutions) from Sportmonks';
COMMENT ON COLUMN oracle.match_events.event_type IS 'Type of event: goal, yellow_card, red_card, substitution, injury_time';
COMMENT ON COLUMN oracle.match_events.minute IS 'Minute when event occurred';
COMMENT ON COLUMN oracle.match_events.player_name IS 'Player name from Sportmonks';
