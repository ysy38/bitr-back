-- =================================================================
-- ODDYSSEY DATABASE CLEANUP SCRIPT
-- =================================================================
-- This script removes ALL Oddyssey-related data and resets to cycle 0
-- WARNING: This will permanently delete all Oddyssey data!

-- =================================================================
-- STEP 1: BACKUP CURRENT DATA (OPTIONAL)
-- =================================================================
-- Uncomment the following lines if you want to backup before cleanup
/*
CREATE TABLE IF NOT EXISTS backup_oddyssey_cycles AS 
SELECT * FROM oracle.oddyssey_cycles;

CREATE TABLE IF NOT EXISTS backup_oddyssey_slips AS 
SELECT * FROM oracle.oddyssey_slips;

CREATE TABLE IF NOT EXISTS backup_current_oddyssey_cycle AS 
SELECT * FROM oracle.current_oddyssey_cycle;
*/

-- =================================================================
-- STEP 2: CLEAN ORACLE SCHEMA
-- =================================================================

-- Clear Oddyssey cycles
DELETE FROM oracle.oddyssey_cycles;
ALTER SEQUENCE IF EXISTS oracle.oddyssey_cycles_cycle_id_seq RESTART WITH 1;

-- Clear current cycle cache
DELETE FROM oracle.current_oddyssey_cycle;

-- Clear Oddyssey slips
DELETE FROM oracle.oddyssey_slips;
ALTER SEQUENCE IF EXISTS oracle.oddyssey_slips_slip_id_seq RESTART WITH 1;

-- Clear Oddyssey prize claims
DELETE FROM oracle.oddyssey_prize_claims;
ALTER SEQUENCE IF EXISTS oracle.oddyssey_prize_claims_id_seq RESTART WITH 1;

-- Clear Oddyssey user stats
DELETE FROM oracle.oddyssey_user_stats;

-- Clear Oddyssey user preferences
DELETE FROM oracle.oddyssey_user_preferences;

-- Clear daily game matches (Oddyssey-specific)
DELETE FROM oracle.daily_game_matches WHERE cycle_id IS NOT NULL;

-- =================================================================
-- STEP 3: CLEAN ODDYSSEY SCHEMA
-- =================================================================

-- Clear Oddyssey cycles
DELETE FROM oddyssey.oddyssey_cycles;
ALTER SEQUENCE IF EXISTS oddyssey.oddyssey_cycles_id_seq RESTART WITH 1;

-- Clear Oddyssey slips
DELETE FROM oddyssey.oddyssey_slips;

-- Clear Oddyssey slip selections
DELETE FROM oddyssey.oddyssey_slip_selections;
ALTER SEQUENCE IF EXISTS oddyssey.oddyssey_slip_selections_id_seq RESTART WITH 1;

-- Clear slip entries
DELETE FROM oddyssey.slip_entries;
ALTER SEQUENCE IF EXISTS oddyssey.slip_entries_id_seq RESTART WITH 1;

-- Clear slips
DELETE FROM oddyssey.slips;
ALTER SEQUENCE IF EXISTS oddyssey.slips_slip_id_seq RESTART WITH 1;

-- Clear daily games
DELETE FROM oddyssey.daily_games;
ALTER SEQUENCE IF EXISTS oddyssey.daily_games_id_seq RESTART WITH 1;

-- Clear daily game matches (table has been dropped, this is for reference)
-- DELETE FROM oddyssey.daily_game_matches;
-- ALTER SEQUENCE IF EXISTS oddyssey.daily_game_matches_id_seq RESTART WITH 1;

-- Clear game results
DELETE FROM oddyssey.game_results;
ALTER SEQUENCE IF EXISTS oddyssey.game_results_id_seq RESTART WITH 1;

-- =================================================================
-- STEP 4: RESET SEQUENCES
-- =================================================================

-- Reset all Oddyssey-related sequences
DO $$
DECLARE
    seq_name text;
BEGIN
    -- Find and reset all sequences related to Oddyssey
    FOR seq_name IN 
        SELECT sequence_name 
        FROM information_schema.sequences 
        WHERE sequence_schema IN ('oracle', 'oddyssey') 
        AND sequence_name LIKE '%oddyssey%'
    LOOP
        EXECUTE format('ALTER SEQUENCE %I RESTART WITH 1', seq_name);
        RAISE NOTICE 'Reset sequence: %', seq_name;
    END LOOP;
END $$;

-- =================================================================
-- STEP 5: CLEAN UP ARTIFACTS AND CONFIG
-- =================================================================

-- Remove any contract artifacts (this is handled by file system cleanup)
-- The following are just database references that might exist

-- Clear any contract deployment records
DELETE FROM oracle.contract_deployments WHERE contract_name LIKE '%oddyssey%';

-- Clear any contract state records
DELETE FROM oracle.contract_states WHERE contract_name LIKE '%oddyssey%';

-- =================================================================
-- STEP 6: VERIFY CLEANUP
-- =================================================================

-- Check that all Oddyssey tables are empty
DO $$
DECLARE
    table_name text;
    row_count integer;
BEGIN
    RAISE NOTICE 'Verifying cleanup...';
    
    -- Check oracle schema
    FOR table_name IN 
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'oracle' 
        AND tablename LIKE '%oddyssey%'
    LOOP
        EXECUTE format('SELECT COUNT(*) FROM oracle.%I', table_name) INTO row_count;
        RAISE NOTICE 'oracle.%: % rows', table_name, row_count;
    END LOOP;
    
    -- Check oddyssey schema
    FOR table_name IN 
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'oddyssey'
    LOOP
        EXECUTE format('SELECT COUNT(*) FROM oddyssey.%I', table_name) INTO row_count;
        RAISE NOTICE 'oddyssey.%: % rows', table_name, row_count;
    END LOOP;
END $$;

-- =================================================================
-- STEP 7: CREATE FRESH CYCLE 0 ENTRY
-- =================================================================

-- Insert a fresh cycle 0 entry to indicate clean state
INSERT INTO oracle.oddyssey_cycles (
    cycle_id,
    created_at,
    updated_at,
    matches_count,
    matches_data,
    cycle_start_time,
    cycle_end_time,
    resolved_at,
    is_resolved,
    tx_hash,
    resolution_tx_hash,
    resolution_data,
    ready_for_resolution
) VALUES (
    0,
    NOW(),
    NOW(),
    0,
    '[]'::jsonb,
    NULL,
    NULL,
    NULL,
    FALSE,
    NULL,
    NULL,
    NULL,
    FALSE
);

-- Insert into current cycle cache
INSERT INTO oracle.current_oddyssey_cycle (
    cycle_id,
    created_at,
    updated_at,
    matches_count,
    matches_data,
    cycle_start_time,
    cycle_end_time,
    resolved_at,
    is_resolved,
    tx_hash,
    resolution_tx_hash,
    resolution_data,
    ready_for_resolution
) VALUES (
    0,
    NOW(),
    NOW(),
    0,
    '[]'::jsonb,
    NULL,
    NULL,
    NULL,
    FALSE,
    NULL,
    NULL,
    NULL,
    FALSE
);

-- =================================================================
-- STEP 8: FINAL VERIFICATION
-- =================================================================

SELECT 
    'Cleanup Complete' as status,
    COUNT(*) as remaining_oddyssey_records
FROM (
    SELECT COUNT(*) as cnt FROM oracle.oddyssey_cycles WHERE cycle_id > 0
    UNION ALL
    SELECT COUNT(*) FROM oracle.oddyssey_slips
    UNION ALL
    SELECT COUNT(*) FROM oracle.oddyssey_prize_claims
    UNION ALL
    SELECT COUNT(*) FROM oracle.oddyssey_user_stats
    UNION ALL
    SELECT COUNT(*) FROM oracle.oddyssey_user_preferences
    UNION ALL
    SELECT COUNT(*) FROM oddyssey.oddyssey_cycles
    UNION ALL
    SELECT COUNT(*) FROM oddyssey.oddyssey_slips
    UNION ALL
    SELECT COUNT(*) FROM oddyssey.daily_games
    -- UNION ALL
    -- SELECT COUNT(*) FROM oddyssey.daily_game_matches
) as counts;

-- =================================================================
-- STEP 9: CLEANUP COMPLETE
-- =================================================================

RAISE NOTICE '========================================';
RAISE NOTICE 'ODDYSSEY DATABASE CLEANUP COMPLETE';
RAISE NOTICE '========================================';
RAISE NOTICE 'All Oddyssey data has been removed';
RAISE NOTICE 'Database is now at cycle 0';
RAISE NOTICE 'Ready for fresh Oddyssey deployment';
RAISE NOTICE '========================================';
