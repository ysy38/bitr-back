-- Create oddyssey.events table for storing blockchain events
CREATE SCHEMA IF NOT EXISTS oddyssey;

CREATE TABLE IF NOT EXISTS oddyssey.events (
    id SERIAL PRIMARY KEY,
    event_type TEXT NOT NULL,
    block_number BIGINT NOT NULL,
    transaction_hash TEXT NOT NULL,
    event_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_oddyssey_events_event_type ON oddyssey.events(event_type);
CREATE INDEX IF NOT EXISTS idx_oddyssey_events_block_number ON oddyssey.events(block_number);
CREATE INDEX IF NOT EXISTS idx_oddyssey_events_transaction_hash ON oddyssey.events(transaction_hash);

-- Add unique constraint to prevent duplicate events
CREATE UNIQUE INDEX IF NOT EXISTS idx_oddyssey_events_unique 
ON oddyssey.events(transaction_hash, event_type);
