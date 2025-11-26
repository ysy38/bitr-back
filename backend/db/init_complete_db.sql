-- =================================================================
--  COMPLETE DATABASE INITIALIZATION
--  This script initializes all schemas and tables for Bitredict
-- =================================================================

-- Start transaction
BEGIN;

-- Execute all schema files in order
\i backend/db/schema.sql
\i backend/db/crypto_schema.sql
\i backend/db/airdrop_schema.sql
\i backend/db/oddyssey_schema.sql
\i backend/db/oddyssey_indexer_schema.sql
\i backend/db/fixtures_schema.sql

-- Verify installations
DO $$ 
BEGIN
    -- Check core schema
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'core' AND table_name = 'users') THEN
        RAISE EXCEPTION 'Core schema not properly initialized';
    END IF;
    
    -- Check oracle schema
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'oracle' AND table_name = 'crypto_prediction_markets') THEN
        RAISE EXCEPTION 'Oracle crypto schema not properly initialized';
    END IF;
    
    -- Check airdrop schema
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'airdrop' AND table_name = 'eligibility') THEN
        RAISE EXCEPTION 'Airdrop schema not properly initialized';
    END IF;
    
    -- Check oddyssey schema
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'oracle' AND table_name = 'oddyssey_cycles') THEN
        RAISE EXCEPTION 'Oddyssey schema not properly initialized';
    END IF;
    
    RAISE NOTICE 'All database schemas initialized successfully!';
END $$;

-- Commit transaction
COMMIT;

-- Display summary
SELECT 
    schemaname as schema_name,
    COUNT(*) as table_count
FROM pg_tables 
WHERE schemaname IN ('core', 'oracle', 'prediction', 'oddyssey', 'analytics', 'airdrop')
GROUP BY schemaname
ORDER BY schemaname; 