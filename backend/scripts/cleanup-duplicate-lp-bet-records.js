/**
 * Cleanup Script: Remove Duplicate Bet Records for LP Events
 * 
 * This script removes bet records from oracle.bets that are duplicates of
 * LP events already stored in oracle.pool_liquidity_providers.
 * 
 * LP events should only exist in pool_liquidity_providers table, not in bets table.
 * 
 * Usage: node scripts/cleanup-duplicate-lp-bet-records.js [--dry-run]
 */

const db = require('../db/db');

async function findDuplicateLPBetRecords() {
  console.log('🔍 Finding duplicate bet records for LP events...\n');
  
  // Find bet records that match LP provider records
  // Criteria: is_for_outcome = false AND matches LP provider by pool_id, bettor_address, and timestamp
  // Note: We don't match by amount because bet records may have incorrect amounts
  const query = `
    SELECT 
      b.id as bet_id,
      b.transaction_hash,
      b.pool_id,
      b.bettor_address,
      b.amount,
      b.is_for_outcome,
      b.created_at as bet_created_at,
      lp.id as lp_id,
      lp.pool_id as lp_pool_id,
      lp.lp_address,
      lp.stake as lp_stake,
      lp.created_at as lp_created_at
    FROM oracle.bets b
    INNER JOIN oracle.pool_liquidity_providers lp ON (
      b.pool_id::text = lp.pool_id::text
      AND LOWER(b.bettor_address) = LOWER(lp.lp_address)
      AND b.is_for_outcome = false
      AND ABS(EXTRACT(EPOCH FROM (lp.created_at - b.created_at))) < 60 -- Within 60 seconds
    )
    ORDER BY b.created_at DESC
  `;
  
  const result = await db.query(query);
  return result.rows;
}

async function deleteDuplicateBetRecords(betIds, dryRun = false) {
  if (betIds.length === 0) {
    console.log('✅ No duplicate bet records to delete');
    return 0;
  }
  
  if (dryRun) {
    console.log(`\n🔍 DRY RUN: Would delete ${betIds.length} duplicate bet records`);
    console.log('   Bet IDs:', betIds.join(', '));
    return 0;
  }
  
  console.log(`\n🗑️  Deleting ${betIds.length} duplicate bet records...`);
  
  const deleteQuery = `
    DELETE FROM oracle.bets
    WHERE id = ANY($1::bigint[])
    RETURNING id, transaction_hash, pool_id, bettor_address, amount
  `;
  
  const result = await db.query(deleteQuery, [betIds]);
  
  console.log(`✅ Successfully deleted ${result.rows.length} duplicate bet records`);
  
  return result.rows.length;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || args.includes('-d');
  
  try {
    console.log('🧹 Cleanup Script: Remove Duplicate LP Bet Records\n');
    console.log('='.repeat(60));
    
    if (dryRun) {
      console.log('⚠️  DRY RUN MODE - No changes will be made\n');
    }
    
    // Find duplicate bet records
    const duplicates = await findDuplicateLPBetRecords();
    
    if (duplicates.length === 0) {
      console.log('✅ No duplicate bet records found for LP events');
      console.log('   Database is clean!');
      process.exit(0);
    }
    
    console.log(`\n📊 Found ${duplicates.length} duplicate bet records:\n`);
    
    // Group by pool_id for better reporting
    const groupedByPool = {};
    duplicates.forEach(dup => {
      const poolId = dup.pool_id;
      if (!groupedByPool[poolId]) {
        groupedByPool[poolId] = [];
      }
      groupedByPool[poolId].push(dup);
    });
    
    // Display summary
    console.log('Summary by Pool:');
    Object.keys(groupedByPool).forEach(poolId => {
      const poolDups = groupedByPool[poolId];
      console.log(`  Pool ${poolId}: ${poolDups.length} duplicate(s)`);
      poolDups.forEach(dup => {
        const amountInBITR = (parseFloat(dup.amount) / 1e18).toFixed(2);
        console.log(`    - Bet ID: ${dup.bet_id}, TX: ${dup.transaction_hash?.substring(0, 10)}..., Amount: ${amountInBITR} BITR, Bettor: ${dup.bettor_address?.substring(0, 10)}...`);
      });
    });
    
    // Show detailed information
    console.log('\n📋 Detailed Information:');
    duplicates.slice(0, 10).forEach((dup, index) => {
      const amountInBITR = (parseFloat(dup.amount) / 1e18).toFixed(2);
      const timeDiff = Math.abs(new Date(dup.bet_created_at) - new Date(dup.lp_created_at)) / 1000;
      console.log(`\n  ${index + 1}. Bet ID: ${dup.bet_id}`);
      console.log(`     Pool ID: ${dup.pool_id}`);
      console.log(`     Bettor/LP: ${dup.bettor_address}`);
      console.log(`     Amount: ${amountInBITR} BITR (${dup.amount} wei)`);
      console.log(`     Bet Created: ${dup.bet_created_at}`);
      console.log(`     LP Created: ${dup.lp_created_at}`);
      console.log(`     Time Difference: ${timeDiff.toFixed(1)} seconds`);
      console.log(`     Transaction Hash: ${dup.transaction_hash || 'N/A'}`);
    });
    
    if (duplicates.length > 10) {
      console.log(`\n  ... and ${duplicates.length - 10} more duplicates`);
    }
    
    // Extract bet IDs for deletion
    const betIds = duplicates.map(dup => dup.bet_id);
    
    // Delete duplicate records
    const deletedCount = await deleteDuplicateBetRecords(betIds, dryRun);
    
    if (!dryRun && deletedCount > 0) {
      console.log(`\n✅ Cleanup complete! Removed ${deletedCount} duplicate bet records`);
      console.log('   LP events will now only appear once in recent bets (from pool_liquidity_providers)');
    } else if (dryRun) {
      console.log('\n💡 Run without --dry-run to actually delete these records');
    }
    
    console.log('\n' + '='.repeat(60));
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    console.error('   Stack:', error.stack);
    process.exit(1);
  } finally {
    await db.end();
  }
}

// Run the script
main();

