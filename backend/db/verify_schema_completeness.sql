-- =================================================================
--  SCHEMA COMPLETENESS VERIFICATION
--  This script verifies that all required tables are properly defined
-- =================================================================

-- Check core schema tables
SELECT 'core.users' as table_name, 
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'core' AND table_name = 'users') 
            THEN '✅ EXISTS' ELSE '❌ MISSING' END as status
UNION ALL
SELECT 'core.reputation_actions', 
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'core' AND table_name = 'reputation_actions') 
            THEN '✅ EXISTS' ELSE '❌ MISSING' END
UNION ALL
SELECT 'core.achievements', 
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'core' AND table_name = 'achievements') 
            THEN '✅ EXISTS' ELSE '❌ MISSING' END;

-- Check oracle schema tables
SELECT 'oracle.oddyssey_cycles' as table_name, 
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'oracle' AND table_name = 'oddyssey_cycles') 
            THEN '✅ EXISTS' ELSE '❌ MISSING' END as status
UNION ALL
SELECT 'oracle.oddyssey_slips', 
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'oracle' AND table_name = 'oddyssey_slips') 
            THEN '✅ EXISTS' ELSE '❌ MISSING' END
UNION ALL
SELECT 'oracle.oddyssey_user_stats', 
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'oracle' AND table_name = 'oddyssey_user_stats') 
            THEN '✅ EXISTS' ELSE '❌ MISSING' END
UNION ALL
SELECT 'oracle.fixtures', 
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'oracle' AND table_name = 'fixtures') 
            THEN '✅ EXISTS' ELSE '❌ MISSING' END
UNION ALL
SELECT 'oracle.fixture_odds', 
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'oracle' AND table_name = 'fixture_odds') 
            THEN '✅ EXISTS' ELSE '❌ MISSING' END;

-- Check oddyssey schema tables (for backward compatibility)
SELECT 'oddyssey.daily_games' as table_name, 
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'oddyssey' AND table_name = 'daily_games') 
            THEN '✅ EXISTS' ELSE '❌ MISSING' END as status
UNION ALL
SELECT 'oddyssey.daily_game_matches', 
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'oddyssey' AND table_name = 'daily_game_matches') 
            THEN '✅ EXISTS' ELSE '❌ MISSING' END
UNION ALL
SELECT 'oddyssey.slips', 
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'oddyssey' AND table_name = 'slips') 
            THEN '✅ EXISTS' ELSE '❌ MISSING' END
UNION ALL
SELECT 'oddyssey.slip_entries', 
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'oddyssey' AND table_name = 'slip_entries') 
            THEN '✅ EXISTS' ELSE '❌ MISSING' END
UNION ALL
SELECT 'oddyssey.game_results', 
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'oddyssey' AND table_name = 'game_results') 
            THEN '✅ EXISTS' ELSE '❌ MISSING' END;

-- Check views
SELECT 'oracle.current_oddyssey_cycle' as view_name, 
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema = 'oracle' AND table_name = 'current_oddyssey_cycle') 
            THEN '✅ EXISTS' ELSE '❌ MISSING' END as status
UNION ALL
SELECT 'oracle.oddyssey_leaderboard', 
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema = 'oracle' AND table_name = 'oddyssey_leaderboard') 
            THEN '✅ EXISTS' ELSE '❌ MISSING' END;

-- Summary
SELECT 
    schemaname as schema_name,
    COUNT(*) as table_count
FROM pg_tables 
WHERE schemaname IN ('core', 'oracle', 'oddyssey', 'analytics', 'airdrop')
GROUP BY schemaname
ORDER BY schemaname; 