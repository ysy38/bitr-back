-- Create oracle.bets table for tracking pool bets
-- This table is used by the indexer to track all bets placed on pools

CREATE TABLE IF NOT EXISTS oracle.bets (
    bet_id BIGSERIAL PRIMARY KEY,
    pool_id BIGINT NOT NULL,
    bettor_address VARCHAR(42) NOT NULL,
    amount BIGINT NOT NULL,
    is_creator_side BOOLEAN NOT NULL DEFAULT false, -- true for LP bets, false for bettor bets
    tx_hash VARCHAR(66),
    block_number BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Foreign key to pools table
    FOREIGN KEY (pool_id) REFERENCES oracle.pools(pool_id) ON DELETE CASCADE
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_oracle_bets_pool_id ON oracle.bets(pool_id);
CREATE INDEX IF NOT EXISTS idx_oracle_bets_bettor_address ON oracle.bets(bettor_address);
CREATE INDEX IF NOT EXISTS idx_oracle_bets_created_at ON oracle.bets(created_at);
CREATE INDEX IF NOT EXISTS idx_oracle_bets_is_creator_side ON oracle.bets(is_creator_side);
CREATE INDEX IF NOT EXISTS idx_oracle_bets_tx_hash ON oracle.bets(tx_hash);

-- Add unique constraint to prevent duplicate bets from same transaction
CREATE UNIQUE INDEX IF NOT EXISTS idx_oracle_bets_unique_tx ON oracle.bets(pool_id, bettor_address, tx_hash);

-- Add comment to table
COMMENT ON TABLE oracle.bets IS 'Tracks all bets placed on prediction pools, including both bettor bets and liquidity provider bets';
COMMENT ON COLUMN oracle.bets.is_creator_side IS 'true for liquidity provider bets (creator side), false for bettor bets (challenger side)';
