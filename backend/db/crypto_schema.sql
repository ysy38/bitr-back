-- =================================================================
--  Crypto Markets Database Schema for Bitredict Platform
--  Integration with Coinpaprika API for price-based predictions
-- =================================================================

-- Extend oracle schema for crypto data
-- Note: oracle.coins and oracle.coin_snapshots already exist in main schema

-- Enhanced crypto data table for Coinpaprika integration
CREATE TABLE IF NOT EXISTS oracle.crypto_coins (
    id SERIAL PRIMARY KEY,
    coinpaprika_id TEXT UNIQUE NOT NULL,     -- e.g., 'btc-bitcoin'
    symbol TEXT NOT NULL,                    -- e.g., 'BTC'
    name TEXT NOT NULL,                      -- e.g., 'Bitcoin'
    rank INTEGER,                            -- Market cap rank
    logo_url TEXT,                           -- Coinpaprika logo URL
    is_popular BOOLEAN DEFAULT false,        -- Featured in popular coins
    is_active BOOLEAN DEFAULT true,          -- Whether coin is actively tracked
    type TEXT,                              -- 'coin' or 'token'
    first_data_at TIMESTAMPTZ,              -- When coin data first became available
    last_data_at TIMESTAMPTZ,               -- Last data update
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for crypto_coins
CREATE INDEX IF NOT EXISTS idx_crypto_coins_symbol ON oracle.crypto_coins(symbol);
CREATE INDEX IF NOT EXISTS idx_crypto_coins_popular ON oracle.crypto_coins(is_popular);
CREATE INDEX IF NOT EXISTS idx_crypto_coins_active ON oracle.crypto_coins(is_active);

-- Enhanced price snapshots with more detailed data
CREATE TABLE IF NOT EXISTS oracle.crypto_price_snapshots (
    id BIGSERIAL PRIMARY KEY,
    coinpaprika_id TEXT NOT NULL REFERENCES oracle.crypto_coins(coinpaprika_id),
    price_usd NUMERIC(20, 8) NOT NULL,
    market_cap NUMERIC(20, 2),
    volume_24h NUMERIC(20, 2),
    circulating_supply NUMERIC(20, 2),
    total_supply NUMERIC(20, 2),
    max_supply NUMERIC(20, 2),
    percent_change_1h NUMERIC(10, 4),
    percent_change_24h NUMERIC(10, 4),
    percent_change_7d NUMERIC(10, 4),
    ath_price NUMERIC(20, 8),              -- All-time high
    ath_date TIMESTAMPTZ,                  -- Date of ATH
    beta_value NUMERIC(10, 6),             -- Market beta value
    last_updated TIMESTAMPTZ,              -- From Coinpaprika
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for price snapshots
CREATE INDEX IF NOT EXISTS idx_crypto_price_snapshots_coin ON oracle.crypto_price_snapshots(coinpaprika_id);
CREATE INDEX IF NOT EXISTS idx_crypto_price_snapshots_time ON oracle.crypto_price_snapshots(created_at);
CREATE INDEX IF NOT EXISTS idx_crypto_price_snapshots_coin_time ON oracle.crypto_price_snapshots(coinpaprika_id, created_at);

-- Crypto prediction markets table (simplified CHECK constraints)
CREATE TABLE IF NOT EXISTS oracle.crypto_prediction_markets (
    id BIGSERIAL PRIMARY KEY,
    market_id TEXT UNIQUE NOT NULL,         -- Format: crypto-{coinId}-{targetPrice}-{direction}-{timeframe}
    coinpaprika_id TEXT NOT NULL REFERENCES oracle.crypto_coins(coinpaprika_id),
    target_price NUMERIC(20, 8) NOT NULL,   -- Price target for prediction
    direction TEXT NOT NULL,                -- Price direction ('above' or 'below')
    timeframe TEXT NOT NULL,                -- Time window ('1h', '24h', '7d', '30d')
    start_price NUMERIC(20, 8) NOT NULL,    -- Price when market was created
    start_time TIMESTAMPTZ NOT NULL,        -- Market start time
    end_time TIMESTAMPTZ NOT NULL,          -- Market resolution time
    resolved BOOLEAN DEFAULT false,
    final_price NUMERIC(20, 8),            -- Price at resolution
    result TEXT,                            -- Outcome ('YES' or 'NO')
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for prediction markets
CREATE INDEX IF NOT EXISTS idx_crypto_markets_coin ON oracle.crypto_prediction_markets(coinpaprika_id);
CREATE INDEX IF NOT EXISTS idx_crypto_markets_resolved ON oracle.crypto_prediction_markets(resolved);
CREATE INDEX IF NOT EXISTS idx_crypto_markets_end_time ON oracle.crypto_prediction_markets(end_time);
CREATE INDEX IF NOT EXISTS idx_crypto_markets_pending ON oracle.crypto_prediction_markets(resolved, end_time);

-- Market statistics for analytics
CREATE TABLE IF NOT EXISTS oracle.crypto_market_stats (
    id BIGSERIAL PRIMARY KEY,
    coinpaprika_id TEXT NOT NULL REFERENCES oracle.crypto_coins(coinpaprika_id),
    date DATE NOT NULL,
    avg_price NUMERIC(20, 8),
    min_price NUMERIC(20, 8),
    max_price NUMERIC(20, 8),
    volatility NUMERIC(10, 4),              -- Calculated volatility
    volume_24h NUMERIC(20, 2),
    market_cap NUMERIC(20, 2),
    predictions_created INTEGER DEFAULT 0,
    predictions_resolved INTEGER DEFAULT 0,
    predictions_won INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(coinpaprika_id, date)
);

-- Indexes for market stats
CREATE INDEX IF NOT EXISTS idx_crypto_stats_coin_date ON oracle.crypto_market_stats(coinpaprika_id, date);
CREATE INDEX IF NOT EXISTS idx_crypto_stats_date ON oracle.crypto_market_stats(date);

-- Oracle resolution logs for debugging and monitoring
CREATE TABLE IF NOT EXISTS oracle.crypto_resolution_logs (
    id BIGSERIAL PRIMARY KEY,
    market_id TEXT NOT NULL,
    coinpaprika_id TEXT NOT NULL,
    target_price NUMERIC(20, 8),
    current_price NUMERIC(20, 8),
    direction TEXT,
    result TEXT,
    success BOOLEAN,
    error_message TEXT,
    processing_time_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for resolution logs
CREATE INDEX IF NOT EXISTS idx_crypto_resolution_logs_market ON oracle.crypto_resolution_logs(market_id);
CREATE INDEX IF NOT EXISTS idx_crypto_resolution_logs_time ON oracle.crypto_resolution_logs(created_at);

-- Views for easy querying

-- Popular coins with latest prices
CREATE OR REPLACE VIEW oracle.popular_crypto_coins AS
SELECT 
    cc.coinpaprika_id,
    cc.symbol,
    cc.name,
    cc.rank,
    cps.price_usd,
    cps.market_cap,
    cps.volume_24h,
    cps.percent_change_24h,
    cps.percent_change_7d,
    cps.last_updated,
    cc.updated_at
FROM oracle.crypto_coins cc
LEFT JOIN LATERAL (
    SELECT * FROM oracle.crypto_price_snapshots 
    WHERE coinpaprika_id = cc.coinpaprika_id 
    ORDER BY created_at DESC 
    LIMIT 1
) cps ON true
WHERE cc.is_popular = true AND cc.is_active = true
ORDER BY cc.rank ASC NULLS LAST;

-- Active prediction markets
CREATE OR REPLACE VIEW oracle.active_crypto_markets AS
SELECT 
    cpm.*,
    cc.symbol,
    cc.name,
    EXTRACT(EPOCH FROM (cpm.end_time - NOW())) / 3600 AS hours_remaining,
    cps.price_usd as current_price,
    CASE 
        WHEN cpm.direction = 'above' THEN 
            CASE WHEN cps.price_usd >= cpm.target_price THEN 'Winning' ELSE 'Losing' END
        WHEN cpm.direction = 'below' THEN 
            CASE WHEN cps.price_usd <= cpm.target_price THEN 'Winning' ELSE 'Losing' END
    END as current_status
FROM oracle.crypto_prediction_markets cpm
JOIN oracle.crypto_coins cc ON cpm.coinpaprika_id = cc.coinpaprika_id
LEFT JOIN LATERAL (
    SELECT price_usd FROM oracle.crypto_price_snapshots 
    WHERE coinpaprika_id = cpm.coinpaprika_id 
    ORDER BY created_at DESC 
    LIMIT 1
) cps ON true
WHERE cpm.resolved = false AND cpm.end_time > NOW()
ORDER BY cpm.end_time ASC;

-- Markets pending resolution
CREATE OR REPLACE VIEW oracle.pending_crypto_resolutions AS
SELECT 
    cpm.*,
    cc.symbol,
    cc.name,
    cps.price_usd as current_price,
    EXTRACT(EPOCH FROM (NOW() - cpm.end_time)) / 3600 AS hours_overdue
FROM oracle.crypto_prediction_markets cpm
JOIN oracle.crypto_coins cc ON cpm.coinpaprika_id = cc.coinpaprika_id
LEFT JOIN LATERAL (
    SELECT price_usd FROM oracle.crypto_price_snapshots 
    WHERE coinpaprika_id = cpm.coinpaprika_id 
    ORDER BY created_at DESC 
    LIMIT 1
) cps ON true
WHERE cpm.resolved = false AND cpm.end_time <= NOW()
ORDER BY cpm.end_time ASC;

-- Market performance stats
CREATE OR REPLACE VIEW oracle.crypto_market_performance AS
SELECT 
    coinpaprika_id,
    COUNT(*) as total_markets,
    COUNT(*) FILTER (WHERE resolved = true) as resolved_markets,
    COUNT(*) FILTER (WHERE resolved = true AND result = 'YES') as markets_won,
    COUNT(*) FILTER (WHERE resolved = true AND result = 'NO') as markets_lost,
    ROUND(
        COUNT(*) FILTER (WHERE resolved = true AND result = 'YES')::NUMERIC * 100.0 / 
        NULLIF(COUNT(*) FILTER (WHERE resolved = true), 0), 2
    ) as win_rate_percent,
    AVG(target_price) as avg_target_price,
    AVG(CASE WHEN resolved THEN final_price END) as avg_final_price
FROM oracle.crypto_prediction_markets
GROUP BY coinpaprika_id;

-- Triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop triggers if they exist
DROP TRIGGER IF EXISTS update_crypto_coins_updated_at ON oracle.crypto_coins;
DROP TRIGGER IF EXISTS update_crypto_markets_updated_at ON oracle.crypto_prediction_markets;

-- Create triggers
CREATE TRIGGER update_crypto_coins_updated_at
    BEFORE UPDATE ON oracle.crypto_coins
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_crypto_markets_updated_at
    BEFORE UPDATE ON oracle.crypto_prediction_markets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insert popular coins for initial setup
INSERT INTO oracle.crypto_coins (coinpaprika_id, symbol, name, is_popular, rank) VALUES
    ('btc-bitcoin', 'BTC', 'Bitcoin', true, 1),
    ('eth-ethereum', 'ETH', 'Ethereum', true, 2),
    ('sol-solana', 'SOL', 'Solana', true, 5),
    ('ada-cardano', 'ADA', 'Cardano', true, 8),
    ('matic-polygon', 'MATIC', 'Polygon', true, 13),
    ('avax-avalanche', 'AVAX', 'Avalanche', true, 15),
    ('dot-polkadot', 'DOT', 'Polkadot', true, 12),
    ('link-chainlink', 'LINK', 'Chainlink', true, 20),
    ('uni-uniswap', 'UNI', 'Uniswap', true, 25),
    ('ltc-litecoin', 'LTC', 'Litecoin', true, 18)
ON CONFLICT (coinpaprika_id) DO UPDATE SET
    symbol = EXCLUDED.symbol,
    name = EXCLUDED.name,
    is_popular = EXCLUDED.is_popular,
    rank = EXCLUDED.rank,
    updated_at = NOW();

-- Comments for documentation
COMMENT ON TABLE oracle.crypto_coins IS 'Cryptocurrency information from Coinpaprika API';
COMMENT ON TABLE oracle.crypto_price_snapshots IS 'Historical price and market data snapshots';
COMMENT ON TABLE oracle.crypto_prediction_markets IS 'Price-based prediction markets for cryptocurrencies';
COMMENT ON TABLE oracle.crypto_market_stats IS 'Daily statistics and analytics for crypto markets';
COMMENT ON TABLE oracle.crypto_resolution_logs IS 'Logs for market resolution debugging and monitoring';

COMMENT ON VIEW oracle.popular_crypto_coins IS 'Popular cryptocurrencies with latest price data';
COMMENT ON VIEW oracle.active_crypto_markets IS 'Currently active prediction markets with real-time status';
COMMENT ON VIEW oracle.pending_crypto_resolutions IS 'Markets that need resolution (past end time)';
COMMENT ON VIEW oracle.crypto_market_performance IS 'Performance statistics by cryptocurrency'; 