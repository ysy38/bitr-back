-- Create missing blockchain_events table
CREATE TABLE IF NOT EXISTS oracle.blockchain_events (
    id SERIAL PRIMARY KEY,
    block_number BIGINT NOT NULL,
    transaction_hash TEXT NOT NULL,
    log_index INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    contract_address TEXT NOT NULL,
    event_data JSONB,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_blockchain_events_block_number ON oracle.blockchain_events(block_number);
CREATE INDEX IF NOT EXISTS idx_blockchain_events_event_type ON oracle.blockchain_events(event_type);
CREATE INDEX IF NOT EXISTS idx_blockchain_events_contract_address ON oracle.blockchain_events(contract_address);
CREATE INDEX IF NOT EXISTS idx_blockchain_events_transaction_hash ON oracle.blockchain_events(transaction_hash);

-- Add unique constraint to prevent duplicate events
CREATE UNIQUE INDEX IF NOT EXISTS idx_blockchain_events_unique 
ON oracle.blockchain_events(block_number, transaction_hash, log_index, event_type);

-- Create slip evaluation service table for tracking evaluation jobs
CREATE TABLE IF NOT EXISTS oracle.slip_evaluation_jobs (
    id SERIAL PRIMARY KEY,
    cycle_id BIGINT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
    total_slips INTEGER DEFAULT 0,
    processed_slips INTEGER DEFAULT 0,
    failed_slips INTEGER DEFAULT 0,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for slip evaluation jobs
CREATE INDEX IF NOT EXISTS idx_slip_evaluation_jobs_cycle_id ON oracle.slip_evaluation_jobs(cycle_id);
CREATE INDEX IF NOT EXISTS idx_slip_evaluation_jobs_status ON oracle.slip_evaluation_jobs(status);

-- Add comments for documentation
COMMENT ON TABLE oracle.blockchain_events IS 'Stores blockchain events indexed by the system';
COMMENT ON TABLE oracle.slip_evaluation_jobs IS 'Tracks slip evaluation jobs for resolved cycles';
