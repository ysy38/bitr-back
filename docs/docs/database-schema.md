---
sidebar_position: 8
---

# Database Schema

Bitredict utilizes a sophisticated PostgreSQL database architecture with multiple schemas to organize different aspects of the platform. The database is designed for high performance, scalability, and data integrity.

## 🗄️ Schema Organization

The database is organized into seven primary schemas, each serving specific platform functions:

```sql
-- Core schemas for different system components
CREATE SCHEMA IF NOT EXISTS oracle;      -- Sports and crypto data
CREATE SCHEMA IF NOT EXISTS oddyssey;    -- Daily contest data
CREATE SCHEMA IF NOT EXISTS analytics;   -- Platform analytics
CREATE SCHEMA IF NOT EXISTS system;      -- System configuration
CREATE SCHEMA IF NOT EXISTS core;        -- User and reputation data
CREATE SCHEMA IF NOT EXISTS crypto;      -- Cryptocurrency data
CREATE SCHEMA IF NOT EXISTS airdrop;     -- Airdrop management
```

## 📊 Core Schema (`core.*`)

### Users Table
Central user management and profile data.

```sql
CREATE TABLE core.users (
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
```

**Key Fields:**
- `address`: Ethereum wallet address (primary key)
- `reputation`: Dynamic reputation score (0-150)
- `total_volume`: Total betting volume in platform tokens
- `profit_loss`: Net profit/loss from all bets
- `streak_*`: Current and historical win/loss streaks
- `risk_score`: Calculated risk tolerance score

### Reputation Actions Table
Tracks all reputation-affecting actions for audit and analytics.

```sql
CREATE TABLE core.reputation_actions (
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
```

**Action Types:**
- `0`: POOL_CREATED
- `1`: POOL_FILLED_ABOVE_60
- `2`: POOL_SPAMMED
- `3`: BET_WON_HIGH_VALUE
- `4`: OUTCOME_PROPOSED_CORRECTLY
- `5`: OUTCOME_PROPOSED_INCORRECTLY
- `6`: CHALLENGE_SUCCESSFUL
- `7`: CHALLENGE_FAILED

### User Badges Table
Achievement and badge system for user engagement.

```sql
CREATE TABLE core.user_badges (
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
```

### Achievements Table
Historical achievement tracking for analytics.

```sql
CREATE TABLE core.achievements (
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
```

## 🔮 Oracle Schema (`oracle.*`)

### Leagues Table
Sports league and competition data.

```sql
CREATE TABLE oracle.leagues (
    league_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    country VARCHAR(100),
    country_code VARCHAR(10),
    logo_url TEXT,
    season_id VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Teams Table
Sports team information and metadata.

```sql
CREATE TABLE oracle.teams (
    team_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    short_name VARCHAR(50),
    country VARCHAR(100),
    logo_url TEXT,
    league_id VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (league_id) REFERENCES oracle.leagues(league_id)
);
```

### Matches Table
Individual match data with odds and results.

```sql
CREATE TABLE oracle.matches (
    match_id VARCHAR(50) PRIMARY KEY,
    league_id VARCHAR(50) NOT NULL,
    home_team_id VARCHAR(50) NOT NULL,
    away_team_id VARCHAR(50) NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'scheduled',
    home_score INTEGER,
    away_score INTEGER,
    odds_home NUMERIC(10, 3),
    odds_draw NUMERIC(10, 3),
    odds_away NUMERIC(10, 3),
    odds_over NUMERIC(10, 3),
    odds_under NUMERIC(10, 3),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (league_id) REFERENCES oracle.leagues(league_id),
    FOREIGN KEY (home_team_id) REFERENCES oracle.teams(team_id),
    FOREIGN KEY (away_team_id) REFERENCES oracle.teams(team_id)
);
```

### Match Results Table
Detailed match outcome data.

```sql
CREATE TABLE oracle.match_results (
    id BIGSERIAL PRIMARY KEY,
    match_id VARCHAR(50) NOT NULL,
    home_score INTEGER,
    away_score INTEGER,
    half_time_home_score INTEGER,
    half_time_away_score INTEGER,
    result_type VARCHAR(20), -- 'home_win', 'away_win', 'draw'
    over_under_result VARCHAR(10), -- 'over', 'under'
    both_teams_scored BOOLEAN,
    result_source VARCHAR(50), -- 'sportmonks', 'manual', 'community'
    verified BOOLEAN DEFAULT false,
    verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (match_id) REFERENCES oracle.matches(match_id)
);
```

## 🎮 Oddyssey Schema (`oddyssey.*`)

### Cycles Table
Daily contest cycle management.

```sql
CREATE TABLE oddyssey.cycles (
    cycle_id BIGSERIAL PRIMARY KEY,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    prize_pool NUMERIC(78, 18) DEFAULT 0,
    slip_count INTEGER DEFAULT 0,
    evaluated_slips INTEGER DEFAULT 0,
    state INTEGER DEFAULT 0, -- 0: NotStarted, 1: Active, 2: Ended, 3: Resolved
    has_winner BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Cycle Matches Table
Matches selected for each Oddyssey cycle.

```sql
CREATE TABLE oddyssey.cycle_matches (
    id BIGSERIAL PRIMARY KEY,
    cycle_id BIGINT NOT NULL,
    match_id VARCHAR(50) NOT NULL,
    match_order INTEGER NOT NULL,
    odds_home NUMERIC(10, 3),
    odds_draw NUMERIC(10, 3),
    odds_away NUMERIC(10, 3),
    odds_over NUMERIC(10, 3),
    odds_under NUMERIC(10, 3),
    result_home_win BOOLEAN,
    result_draw BOOLEAN,
    result_away_win BOOLEAN,
    result_over BOOLEAN,
    result_under BOOLEAN,
    is_resolved BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (cycle_id) REFERENCES oddyssey.cycles(cycle_id),
    FOREIGN KEY (match_id) REFERENCES oracle.matches(match_id)
);
```

### Slips Table
User prediction slips for Oddyssey contests.

```sql
CREATE TABLE oddyssey.slips (
    slip_id BIGSERIAL PRIMARY KEY,
    player_address VARCHAR(42) NOT NULL,
    cycle_id BIGINT NOT NULL,
    placed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    predictions JSONB NOT NULL,
    final_score NUMERIC(78, 18) DEFAULT 0,
    correct_count INTEGER DEFAULT 0,
    is_evaluated BOOLEAN DEFAULT false,
    evaluation_time TIMESTAMP WITH TIME ZONE,
    prize_amount NUMERIC(78, 18) DEFAULT 0,
    is_claimed BOOLEAN DEFAULT false,
    claimed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (cycle_id) REFERENCES oddyssey.cycles(cycle_id)
);
```

### Leaderboard Table
Daily contest leaderboard tracking.

```sql
CREATE TABLE oddyssey.leaderboard (
    id BIGSERIAL PRIMARY KEY,
    cycle_id BIGINT NOT NULL,
    player_address VARCHAR(42) NOT NULL,
    slip_id BIGINT NOT NULL,
    final_score NUMERIC(78, 18) NOT NULL,
    correct_count INTEGER NOT NULL,
    position INTEGER,
    prize_amount NUMERIC(78, 18) DEFAULT 0,
    is_claimed BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (cycle_id) REFERENCES oddyssey.cycles(cycle_id),
    FOREIGN KEY (slip_id) REFERENCES oddyssey.slips(slip_id)
);
```

## 📈 Analytics Schema (`analytics.*`)

### Platform Metrics Table
Aggregated platform performance metrics.

```sql
CREATE TABLE analytics.platform_metrics (
    id BIGSERIAL PRIMARY KEY,
    date DATE NOT NULL,
    total_users INTEGER DEFAULT 0,
    active_users INTEGER DEFAULT 0,
    total_volume NUMERIC(78, 18) DEFAULT 0,
    total_pools INTEGER DEFAULT 0,
    active_pools INTEGER DEFAULT 0,
    total_bets INTEGER DEFAULT 0,
    total_liquidity NUMERIC(78, 18) DEFAULT 0,
    platform_fees NUMERIC(78, 18) DEFAULT 0,
    average_bet_size NUMERIC(78, 18) DEFAULT 0,
    win_rate NUMERIC(5, 4) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(date)
);
```

### User Analytics Table
Individual user behavior and performance analytics.

```sql
CREATE TABLE analytics.user_analytics (
    id BIGSERIAL PRIMARY KEY,
    user_address VARCHAR(42) NOT NULL,
    date DATE NOT NULL,
    bets_placed INTEGER DEFAULT 0,
    bets_won INTEGER DEFAULT 0,
    total_volume NUMERIC(78, 18) DEFAULT 0,
    profit_loss NUMERIC(78, 18) DEFAULT 0,
    pools_created INTEGER DEFAULT 0,
    liquidity_provided NUMERIC(78, 18) DEFAULT 0,
    reputation_change INTEGER DEFAULT 0,
    session_duration INTEGER DEFAULT 0, -- in seconds
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (user_address) REFERENCES core.users(address),
    UNIQUE(user_address, date)
);
```

### Category Performance Table
Performance metrics by market category.

```sql
CREATE TABLE analytics.category_performance (
    id BIGSERIAL PRIMARY KEY,
    category VARCHAR(100) NOT NULL,
    date DATE NOT NULL,
    total_pools INTEGER DEFAULT 0,
    total_volume NUMERIC(78, 18) DEFAULT 0,
    total_bets INTEGER DEFAULT 0,
    average_odds NUMERIC(10, 3) DEFAULT 0,
    win_rate NUMERIC(5, 4) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(category, date)
);
```

## 💰 Crypto Schema (`crypto.*`)

### Cryptocurrency Prices Table
Real-time cryptocurrency price data.

```sql
CREATE TABLE crypto.prices (
    id BIGSERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    price_usd NUMERIC(20, 8) NOT NULL,
    market_cap_usd NUMERIC(20, 2),
    volume_24h_usd NUMERIC(20, 2),
    price_change_24h NUMERIC(10, 4),
    price_change_percentage_24h NUMERIC(10, 4),
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    source VARCHAR(50) DEFAULT 'coingecko',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Crypto Markets Table
Cryptocurrency market metadata.

```sql
CREATE TABLE crypto.markets (
    market_id VARCHAR(100) PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    name VARCHAR(255) NOT NULL,
    current_price NUMERIC(20, 8),
    market_cap_rank INTEGER,
    market_cap_usd NUMERIC(20, 2),
    volume_24h_usd NUMERIC(20, 2),
    circulating_supply NUMERIC(20, 8),
    total_supply NUMERIC(20, 8),
    max_supply NUMERIC(20, 8),
    ath NUMERIC(20, 8),
    ath_change_percentage NUMERIC(10, 4),
    ath_date TIMESTAMP WITH TIME ZONE,
    atl NUMERIC(20, 8),
    atl_change_percentage NUMERIC(10, 4),
    atl_date TIMESTAMP WITH TIME ZONE,
    last_updated TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## 🎁 Airdrop Schema (`airdrop.*`)

### Airdrop Eligibility Table
User eligibility tracking for airdrops.

```sql
CREATE TABLE airdrop.eligibility (
    id BIGSERIAL PRIMARY KEY,
    user_address VARCHAR(42) NOT NULL,
    airdrop_id VARCHAR(100) NOT NULL,
    is_eligible BOOLEAN DEFAULT false,
    eligibility_score NUMERIC(10, 4) DEFAULT 0,
    criteria_met JSONB,
    allocation_amount NUMERIC(78, 18) DEFAULT 0,
    claimed_amount NUMERIC(78, 18) DEFAULT 0,
    claimed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_address, airdrop_id)
);
```

### Airdrop Claims Table
Historical airdrop claim tracking.

```sql
CREATE TABLE airdrop.claims (
    id BIGSERIAL PRIMARY KEY,
    user_address VARCHAR(42) NOT NULL,
    airdrop_id VARCHAR(100) NOT NULL,
    amount NUMERIC(78, 18) NOT NULL,
    transaction_hash VARCHAR(66),
    block_number BIGINT,
    claimed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## ⚙️ System Schema (`system.*`)

### Configuration Table
System configuration and parameters.

```sql
CREATE TABLE system.configuration (
    id BIGSERIAL PRIMARY KEY,
    key VARCHAR(100) NOT NULL UNIQUE,
    value TEXT,
    description TEXT,
    category VARCHAR(50),
    is_encrypted BOOLEAN DEFAULT false,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### System Events Table
System-level event logging.

```sql
CREATE TABLE system.events (
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB,
    severity VARCHAR(20) DEFAULT 'info',
    source VARCHAR(100),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## 🔍 Indexes and Performance

### Primary Indexes
```sql
-- Core schema indexes
CREATE INDEX idx_users_reputation ON core.users(reputation);
CREATE INDEX idx_users_volume ON core.users(total_volume);
CREATE INDEX idx_reputation_actions_user ON core.reputation_actions(user_address);
CREATE INDEX idx_reputation_actions_timestamp ON core.reputation_actions(timestamp);

-- Oracle schema indexes
CREATE INDEX idx_matches_start_time ON oracle.matches(start_time);
CREATE INDEX idx_matches_status ON oracle.matches(status);
CREATE INDEX idx_matches_league ON oracle.matches(league_id);
CREATE INDEX idx_match_results_match ON oracle.match_results(match_id);

-- Oddyssey schema indexes
CREATE INDEX idx_cycles_state ON oddyssey.cycles(state);
CREATE INDEX idx_cycles_start_time ON oddyssey.cycles(start_time);
CREATE INDEX idx_slips_player ON oddyssey.slips(player_address);
CREATE INDEX idx_slips_cycle ON oddyssey.slips(cycle_id);
CREATE INDEX idx_leaderboard_cycle ON oddyssey.leaderboard(cycle_id);

-- Analytics schema indexes
CREATE INDEX idx_platform_metrics_date ON analytics.platform_metrics(date);
CREATE INDEX idx_user_analytics_user_date ON analytics.user_analytics(user_address, date);
CREATE INDEX idx_category_performance_category_date ON analytics.category_performance(category, date);

-- Crypto schema indexes
CREATE INDEX idx_prices_symbol_timestamp ON crypto.prices(symbol, timestamp);
CREATE INDEX idx_markets_symbol ON crypto.markets(symbol);

-- Airdrop schema indexes
CREATE INDEX idx_eligibility_user ON airdrop.eligibility(user_address);
CREATE INDEX idx_eligibility_airdrop ON airdrop.eligibility(airdrop_id);
```

### Composite Indexes
```sql
-- Performance optimization indexes
CREATE INDEX idx_users_reputation_volume ON core.users(reputation, total_volume);
CREATE INDEX idx_matches_league_status_time ON oracle.matches(league_id, status, start_time);
CREATE INDEX idx_slips_cycle_evaluated ON oddyssey.slips(cycle_id, is_evaluated);
CREATE INDEX idx_analytics_user_date_volume ON analytics.user_analytics(user_address, date, total_volume);
```

## 🔒 Data Integrity

### Foreign Key Constraints
All tables maintain referential integrity through foreign key constraints:

```sql
-- Example foreign key constraints
ALTER TABLE core.reputation_actions 
ADD CONSTRAINT fk_reputation_actions_user 
FOREIGN KEY (user_address) REFERENCES core.users(address) ON DELETE CASCADE;

ALTER TABLE oracle.matches 
ADD CONSTRAINT fk_matches_league 
FOREIGN KEY (league_id) REFERENCES oracle.leagues(league_id);

ALTER TABLE oddyssey.slips 
ADD CONSTRAINT fk_slips_cycle 
FOREIGN KEY (cycle_id) REFERENCES oddyssey.cycles(cycle_id);
```

### Check Constraints
Data validation through check constraints:

```sql
-- Reputation score validation
ALTER TABLE core.users 
ADD CONSTRAINT chk_reputation_range 
CHECK (reputation >= 0 AND reputation <= 150);

-- Odds validation
ALTER TABLE oracle.matches 
ADD CONSTRAINT chk_odds_positive 
CHECK (odds_home > 0 AND odds_away > 0);

-- Score validation
ALTER TABLE oracle.matches 
ADD CONSTRAINT chk_scores_non_negative 
CHECK (home_score >= 0 AND away_score >= 0);
```

## 📊 Data Retention and Archiving

### Retention Policies
```sql
-- Archive old analytics data (keep 2 years)
CREATE TABLE analytics.platform_metrics_archive AS 
SELECT * FROM analytics.platform_metrics 
WHERE date < CURRENT_DATE - INTERVAL '2 years';

-- Archive old system events (keep 1 year)
CREATE TABLE system.events_archive AS 
SELECT * FROM system.events 
WHERE timestamp < CURRENT_TIMESTAMP - INTERVAL '1 year';
```

### Partitioning Strategy
For high-volume tables, implement partitioning:

```sql
-- Partition crypto prices by month
CREATE TABLE crypto.prices_partitioned (
    LIKE crypto.prices INCLUDING ALL
) PARTITION BY RANGE (timestamp);

-- Create monthly partitions
CREATE TABLE crypto.prices_2024_01 PARTITION OF crypto.prices_partitioned
FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
```

---

*The Bitredict database schema represents a comprehensive data architecture designed for scalability, performance, and data integrity, supporting all aspects of the prediction market platform.*
