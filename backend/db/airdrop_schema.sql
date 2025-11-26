-- =================================================================
--  AIRDROP SYSTEM DATABASE SCHEMA
--  Complete schema for tracking BITR activities and airdrop eligibility
-- =================================================================

-- Create airdrop schema
CREATE SCHEMA IF NOT EXISTS airdrop;

-- Track faucet claims (20K BITR per wallet)
CREATE TABLE IF NOT EXISTS airdrop.faucet_claims (
    id BIGSERIAL PRIMARY KEY,
    user_address TEXT NOT NULL UNIQUE,
    amount NUMERIC(78, 18) NOT NULL DEFAULT '20000000000000000000000',
    claimed_at TIMESTAMPTZ NOT NULL,
    block_number BIGINT NOT NULL,
    transaction_hash TEXT NOT NULL UNIQUE,
    had_stt_activity BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Track all BITR activities for eligibility
CREATE TABLE IF NOT EXISTS airdrop.bitr_activities (
    id BIGSERIAL PRIMARY KEY,
    user_address TEXT NOT NULL,
    activity_type TEXT NOT NULL, -- 'POOL_CREATE', 'BET_PLACE', 'STAKING', 'TRANSFER_IN', 'TRANSFER_OUT'
    amount NUMERIC(78, 18),
    pool_id TEXT,
    from_address TEXT,
    to_address TEXT,
    transaction_hash TEXT NOT NULL,
    block_number BIGINT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Track staking activities
CREATE TABLE IF NOT EXISTS airdrop.staking_activities (
    id BIGSERIAL PRIMARY KEY,
    user_address TEXT NOT NULL,
    action_type TEXT NOT NULL, -- 'STAKE', 'UNSTAKE', 'CLAIM_REWARDS'
    amount NUMERIC(78, 18),
    tier_id INTEGER,
    duration_option INTEGER,
    transaction_hash TEXT NOT NULL,
    block_number BIGINT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Track transfer patterns for Sybil detection
CREATE TABLE IF NOT EXISTS airdrop.transfer_patterns (
    id BIGSERIAL PRIMARY KEY,
    from_address TEXT NOT NULL,
    to_address TEXT NOT NULL,
    amount NUMERIC(78, 18) NOT NULL,
    transaction_hash TEXT NOT NULL,
    block_number BIGINT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    is_suspicious BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Main eligibility tracking table
CREATE TABLE IF NOT EXISTS airdrop.eligibility (
    user_address TEXT PRIMARY KEY,
    has_faucet_claim BOOLEAN DEFAULT FALSE,
    faucet_claim_date TIMESTAMPTZ,
    has_stt_activity_before_faucet BOOLEAN DEFAULT FALSE,
    bitr_action_count INTEGER DEFAULT 0,
    has_staking_activity BOOLEAN DEFAULT FALSE,
    oddyssey_slip_count INTEGER DEFAULT 0,
    has_suspicious_transfers BOOLEAN DEFAULT FALSE,
    is_transfer_only_recipient BOOLEAN DEFAULT FALSE,
    consolidation_detected BOOLEAN DEFAULT FALSE,
    is_eligible BOOLEAN DEFAULT FALSE,
    snapshot_bitr_balance NUMERIC(78, 18),
    airdrop_amount NUMERIC(78, 18),
    snapshot_taken_at TIMESTAMPTZ,
    eligibility_updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Airdrop snapshots for distribution
CREATE TABLE IF NOT EXISTS airdrop.snapshots (
    id BIGSERIAL PRIMARY KEY,
    snapshot_name TEXT NOT NULL UNIQUE,
    snapshot_block BIGINT NOT NULL,
    snapshot_timestamp TIMESTAMPTZ NOT NULL,
    total_eligible_wallets INTEGER DEFAULT 0,
    total_eligible_bitr NUMERIC(78, 18) DEFAULT 0,
    is_final BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Snapshot balances for each user
CREATE TABLE IF NOT EXISTS airdrop.snapshot_balances (
    id BIGSERIAL PRIMARY KEY,
    snapshot_id BIGINT NOT NULL REFERENCES airdrop.snapshots(id),
    user_address TEXT NOT NULL,
    bitr_balance NUMERIC(78, 18) NOT NULL,
    airdrop_amount NUMERIC(78, 18),
    is_eligible BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(snapshot_id, user_address)
);

-- Statistics tracking
CREATE TABLE IF NOT EXISTS airdrop.statistics (
    metric_name TEXT PRIMARY KEY,
    metric_value NUMERIC DEFAULT 0,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Summary stats table
CREATE TABLE IF NOT EXISTS airdrop.summary_stats (
    metric_name TEXT PRIMARY KEY,
    metric_value NUMERIC DEFAULT 0,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert initial statistics
INSERT INTO airdrop.statistics (metric_name, metric_value, description) VALUES
('total_faucet_claims', 0, 'Total number of faucet claims'),
('total_bitr_distributed_faucet', 0, 'Total BITR distributed via faucet'),
('total_eligible_wallets', 0, 'Total eligible wallets for airdrop'),
('average_bitr_actions_per_user', 0, 'Average BITR actions per eligible user'),
('eligible_percentage', 0, 'Percentage of faucet claimers who are eligible'),
('sybil_wallets_detected', 0, 'Number of wallets flagged as Sybil attacks')
ON CONFLICT (metric_name) DO NOTHING;

-- Create summary stats view
CREATE OR REPLACE VIEW airdrop.summary_stats AS
SELECT 
    (SELECT metric_value FROM airdrop.statistics WHERE metric_name = 'total_faucet_claims') as total_faucet_claims,
    (SELECT metric_value FROM airdrop.statistics WHERE metric_name = 'total_bitr_distributed_faucet') as total_bitr_distributed_faucet,
    (SELECT metric_value FROM airdrop.statistics WHERE metric_name = 'total_eligible_wallets') as total_eligible_wallets,
    (SELECT metric_value FROM airdrop.statistics WHERE metric_name = 'average_bitr_actions_per_user') as average_bitr_actions_per_user,
    (SELECT metric_value FROM airdrop.statistics WHERE metric_name = 'eligible_percentage') as eligible_percentage,
    (SELECT metric_value FROM airdrop.statistics WHERE metric_name = 'sybil_wallets_detected') as sybil_wallets_detected;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_faucet_claims_user ON airdrop.faucet_claims(user_address);
CREATE INDEX IF NOT EXISTS idx_faucet_claims_claimed_at ON airdrop.faucet_claims(claimed_at);

CREATE INDEX IF NOT EXISTS idx_bitr_activities_user ON airdrop.bitr_activities(user_address);
CREATE INDEX IF NOT EXISTS idx_bitr_activities_type ON airdrop.bitr_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_bitr_activities_timestamp ON airdrop.bitr_activities(timestamp);
CREATE INDEX IF NOT EXISTS idx_bitr_activities_block ON airdrop.bitr_activities(block_number);

CREATE INDEX IF NOT EXISTS idx_staking_activities_user ON airdrop.staking_activities(user_address);
CREATE INDEX IF NOT EXISTS idx_staking_activities_action ON airdrop.staking_activities(action_type);
CREATE INDEX IF NOT EXISTS idx_staking_activities_timestamp ON airdrop.staking_activities(timestamp);

CREATE INDEX IF NOT EXISTS idx_transfer_patterns_from ON airdrop.transfer_patterns(from_address);
CREATE INDEX IF NOT EXISTS idx_transfer_patterns_to ON airdrop.transfer_patterns(to_address);
CREATE INDEX IF NOT EXISTS idx_transfer_patterns_suspicious ON airdrop.transfer_patterns(is_suspicious);

CREATE INDEX IF NOT EXISTS idx_eligibility_eligible ON airdrop.eligibility(is_eligible);
CREATE INDEX IF NOT EXISTS idx_eligibility_updated ON airdrop.eligibility(eligibility_updated_at);

CREATE INDEX IF NOT EXISTS idx_snapshot_balances_snapshot ON airdrop.snapshot_balances(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_snapshot_balances_user ON airdrop.snapshot_balances(user_address);

-- Comments
COMMENT ON SCHEMA airdrop IS 'Schema for tracking BITR testnet activities and airdrop eligibility';
COMMENT ON TABLE airdrop.faucet_claims IS 'Records of BITR faucet claims (20K per wallet)';
COMMENT ON TABLE airdrop.bitr_activities IS 'All BITR-related activities for eligibility calculation';
COMMENT ON TABLE airdrop.staking_activities IS 'BITR staking, unstaking, and reward claims';
COMMENT ON TABLE airdrop.transfer_patterns IS 'BITR transfer patterns for Sybil detection';
COMMENT ON TABLE airdrop.eligibility IS 'Final eligibility determination for each user';
COMMENT ON TABLE airdrop.snapshots IS 'Airdrop snapshots for distribution calculation';
COMMENT ON TABLE airdrop.snapshot_balances IS 'User balances and airdrop amounts per snapshot';
COMMENT ON TABLE airdrop.statistics IS 'System-wide airdrop statistics and metrics';