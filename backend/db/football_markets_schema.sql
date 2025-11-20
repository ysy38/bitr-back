-- =================================================================
--  FOOTBALL GUIDED MARKETS SCHEMA
--  Extends the oracle schema with football prediction markets
-- =================================================================

-- Football prediction markets table
CREATE TABLE IF NOT EXISTS oracle.football_prediction_markets (
    id BIGSERIAL PRIMARY KEY,
    market_id TEXT UNIQUE NOT NULL,         -- Format: football-{fixtureId}-{outcomeType}-{predictedOutcome}
    fixture_id BIGINT NOT NULL REFERENCES oracle.fixtures(id),
    outcome_type TEXT NOT NULL,             -- '1X2', 'OU25', 'OU35', 'BTTS'
    predicted_outcome TEXT NOT NULL,        -- 'home', 'draw', 'away', 'over', 'under', 'yes', 'no'
    end_time TIMESTAMPTZ NOT NULL,          -- Market resolution time (match end + buffer)
    resolved BOOLEAN DEFAULT false,
    actual_result TEXT,                     -- Actual outcome from match result
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_outcome_type CHECK (outcome_type IN ('1X2', 'OU25', 'OU35', 'BTTS')),
    CONSTRAINT valid_1x2_outcome CHECK (
        (outcome_type = '1X2' AND predicted_outcome IN ('home', 'draw', 'away')) OR
        (outcome_type != '1X2')
    ),
    CONSTRAINT valid_ou25_outcome CHECK (
        (outcome_type = 'OU25' AND predicted_outcome IN ('over', 'under')) OR
        (outcome_type != 'OU25')
    ),
    CONSTRAINT valid_ou35_outcome CHECK (
        (outcome_type = 'OU35' AND predicted_outcome IN ('over', 'under')) OR
        (outcome_type != 'OU35')
    ),
    CONSTRAINT valid_btts_outcome CHECK (
        (outcome_type = 'BTTS' AND predicted_outcome IN ('yes', 'no')) OR
        (outcome_type != 'BTTS')
    )
);

-- Indexes for football prediction markets
CREATE INDEX IF NOT EXISTS idx_football_markets_fixture ON oracle.football_prediction_markets(fixture_id);
CREATE INDEX IF NOT EXISTS idx_football_markets_resolved ON oracle.football_prediction_markets(resolved);
CREATE INDEX IF NOT EXISTS idx_football_markets_end_time ON oracle.football_prediction_markets(end_time);
CREATE INDEX IF NOT EXISTS idx_football_markets_pending ON oracle.football_prediction_markets(resolved, end_time);
CREATE INDEX IF NOT EXISTS idx_football_markets_outcome_type ON oracle.football_prediction_markets(outcome_type);

-- Football resolution logs for debugging and monitoring
CREATE TABLE IF NOT EXISTS oracle.football_resolution_logs (
    id BIGSERIAL PRIMARY KEY,
    market_id TEXT NOT NULL,
    fixture_id BIGINT NOT NULL,
    outcome_type TEXT NOT NULL,
    predicted_outcome TEXT NOT NULL,
    actual_result TEXT,
    success BOOLEAN,
    error_message TEXT,
    processing_time_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for football resolution logs
CREATE INDEX IF NOT EXISTS idx_football_resolution_logs_market ON oracle.football_resolution_logs(market_id);
CREATE INDEX IF NOT EXISTS idx_football_resolution_logs_fixture ON oracle.football_resolution_logs(fixture_id);
CREATE INDEX IF NOT EXISTS idx_football_resolution_logs_time ON oracle.football_resolution_logs(created_at);

-- Football market statistics for analytics
CREATE TABLE IF NOT EXISTS oracle.football_market_stats (
    id BIGSERIAL PRIMARY KEY,
    outcome_type TEXT NOT NULL,
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
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(outcome_type, date)
);

-- Indexes for football market stats
CREATE INDEX IF NOT EXISTS idx_football_stats_outcome_date ON oracle.football_market_stats(outcome_type, date);
CREATE INDEX IF NOT EXISTS idx_football_stats_date ON oracle.football_market_stats(date);

-- Views for easy querying

-- Active football markets with fixture details
CREATE OR REPLACE VIEW oracle.active_football_markets AS
SELECT 
    fpm.id,
    fpm.market_id,
    fpm.fixture_id,
    fpm.outcome_type,
    fpm.predicted_outcome,
    fpm.end_time,
    fpm.resolved,
    f.home_team,
    f.away_team,
    f.match_date,
    f.league_name,
    f.status
FROM oracle.football_prediction_markets fpm
JOIN oracle.fixtures f ON fpm.fixture_id = f.id
WHERE fpm.resolved = false
ORDER BY fpm.end_time ASC;

-- Resolved football markets with results
CREATE OR REPLACE VIEW oracle.resolved_football_markets AS
SELECT 
    fpm.id,
    fpm.market_id,
    fpm.fixture_id,
    fpm.outcome_type,
    fpm.predicted_outcome,
    fpm.actual_result,
    fpm.resolved_at,
    f.home_team,
    f.away_team,
    f.match_date,
    fr.home_score,
    fr.away_score,
    fr.result_1x2,
    fr.result_ou25,
    fr.result_btts,
    CASE 
        WHEN fpm.predicted_outcome = fpm.actual_result THEN true
        ELSE false
    END as prediction_correct
FROM oracle.football_prediction_markets fpm
JOIN oracle.fixtures f ON fpm.fixture_id = f.id
LEFT JOIN oracle.fixture_results fr ON f.id::VARCHAR = fr.fixture_id
WHERE fpm.resolved = true
ORDER BY fpm.resolved_at DESC;

-- Football market performance by outcome type
CREATE OR REPLACE VIEW oracle.football_market_performance AS
SELECT 
    outcome_type,
    COUNT(*) as total_markets,
    COUNT(*) FILTER (WHERE predicted_outcome = actual_result) as correct_predictions,
    ROUND(
        (COUNT(*) FILTER (WHERE predicted_outcome = actual_result)::DECIMAL / COUNT(*)) * 100, 2
    ) as accuracy_percentage,
    MIN(resolved_at) as first_resolution,
    MAX(resolved_at) as last_resolution
FROM oracle.football_prediction_markets
WHERE resolved = true
GROUP BY outcome_type
ORDER BY total_markets DESC;

-- Comments
COMMENT ON TABLE oracle.football_prediction_markets IS 'Football prediction markets for guided markets system';
COMMENT ON TABLE oracle.football_resolution_logs IS 'Logs for football market resolution attempts and results';
COMMENT ON TABLE oracle.football_market_stats IS 'Daily statistics for football prediction markets';
COMMENT ON VIEW oracle.active_football_markets IS 'View of all active football prediction markets';
COMMENT ON VIEW oracle.resolved_football_markets IS 'View of all resolved football prediction markets with results';
COMMENT ON VIEW oracle.football_market_performance IS 'Performance statistics for football prediction markets by outcome type'; 