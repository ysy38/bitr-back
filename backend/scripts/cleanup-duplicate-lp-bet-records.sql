-- Cleanup Script: Remove Duplicate Bet Records for LP Events
-- 
-- This SQL script removes bet records from oracle.bets that are duplicates of
-- LP events already stored in oracle.pool_liquidity_providers.
-- 
-- LP events should only exist in pool_liquidity_providers table, not in bets table.
-- 
-- Usage: Run this via Neon MCP or psql
-- 
-- WARNING: This will DELETE data. Review the SELECT query first!

-- Step 1: First, let's see what will be deleted (SAFE - read-only)
-- Uncomment this to preview what will be deleted:
-- Note: We match by pool_id, bettor_address, and timestamp only (not amount)
-- because bet records may have incorrect amounts
/*
SELECT 
  b.id as bet_id,
  b.transaction_hash,
  b.pool_id,
  b.bettor_address,
  b.amount as bet_amount,
  b.is_for_outcome,
  b.created_at as bet_created_at,
  lp.id as lp_id,
  lp.pool_id as lp_pool_id,
  lp.lp_address,
  lp.stake as lp_stake,
  lp.created_at as lp_created_at,
  ABS(EXTRACT(EPOCH FROM (lp.created_at - b.created_at))) as time_diff_seconds
FROM oracle.bets b
INNER JOIN oracle.pool_liquidity_providers lp ON (
  b.pool_id::text = lp.pool_id::text
  AND LOWER(b.bettor_address) = LOWER(lp.lp_address)
  AND b.is_for_outcome = false
  AND ABS(EXTRACT(EPOCH FROM (lp.created_at - b.created_at))) < 60 -- Within 60 seconds
)
ORDER BY b.created_at DESC;
*/

-- Step 2: Count how many duplicates exist
-- Note: We match by pool_id, bettor_address, and timestamp only (not amount)
SELECT 
  COUNT(*) as total_duplicates,
  COUNT(DISTINCT b.pool_id) as affected_pools
FROM oracle.bets b
INNER JOIN oracle.pool_liquidity_providers lp ON (
  b.pool_id::text = lp.pool_id::text
  AND LOWER(b.bettor_address) = LOWER(lp.lp_address)
  AND b.is_for_outcome = false
  AND ABS(EXTRACT(EPOCH FROM (lp.created_at - b.created_at))) < 60
);

-- Step 3: DELETE duplicate bet records
-- ⚠️ WARNING: This will permanently delete data!
-- Uncomment the DELETE statement below after reviewing the SELECT results above
-- Note: We match by pool_id, bettor_address, and timestamp only (not amount)
/*
DELETE FROM oracle.bets
WHERE id IN (
  SELECT b.id
  FROM oracle.bets b
  INNER JOIN oracle.pool_liquidity_providers lp ON (
    b.pool_id::text = lp.pool_id::text
    AND LOWER(b.bettor_address) = LOWER(lp.lp_address)
    AND b.is_for_outcome = false
    AND ABS(EXTRACT(EPOCH FROM (lp.created_at - b.created_at))) < 60
  )
);
*/

-- Step 4: Verify cleanup (run after DELETE)
-- This should return 0 rows if cleanup was successful
-- Note: We match by pool_id, bettor_address, and timestamp only (not amount)
SELECT 
  COUNT(*) as remaining_duplicates
FROM oracle.bets b
INNER JOIN oracle.pool_liquidity_providers lp ON (
  b.pool_id::text = lp.pool_id::text
  AND LOWER(b.bettor_address) = LOWER(lp.lp_address)
  AND b.is_for_outcome = false
  AND ABS(EXTRACT(EPOCH FROM (lp.created_at - b.created_at))) < 60
);

