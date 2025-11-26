#!/usr/bin/env node

/**
 * Fix Pool 2 Settlement Issue
 * 
 * Pool 2 was incorrectly settled with no bets and no settlement TX hash.
 * This script fixes the database to reflect the correct state.
 */

const db = require('../db/db');

async function fixPool2Settlement() {
  try {
    console.log('🔧 FIXING POOL 2 SETTLEMENT ISSUE...');
    console.log('=====================================\n');
    
    // Check current state
    const poolResult = await db.query(`
      SELECT 
        pool_id, creator_address, is_settled, settlement_tx_hash, 
        created_at, settled_at, creator_side_won, result
      FROM oracle.pools 
      WHERE pool_id = 2
    `);
    
    if (poolResult.rows.length === 0) {
      console.log('❌ Pool 2 not found');
      return;
    }
    
    const pool = poolResult.rows[0];
    console.log('📊 CURRENT POOL 2 STATE:');
    console.log(`   Creator: ${pool.creator_address}`);
    console.log(`   Settled: ${pool.is_settled}`);
    console.log(`   Settlement TX: ${pool.settlement_tx_hash}`);
    console.log(`   Creator Side Won: ${pool.creator_side_won}`);
    console.log(`   Result: ${pool.result}`);
    console.log(`   Created: ${pool.created_at}`);
    console.log(`   Settled At: ${pool.settled_at}`);
    
    // Check if there are any bets
    const betsCount = await db.query(`
      SELECT COUNT(*) as bet_count FROM oracle.bets WHERE pool_id = '2'
    `);
    
    console.log(`\n🎯 BETS COUNT: ${betsCount.rows[0].bet_count}`);
    
    // Check if creator got refunded
    const refundResult = await db.query(`
      SELECT * FROM oracle.pool_refunds WHERE pool_id = '2'
    `);
    
    console.log(`💰 REFUNDS COUNT: ${refundResult.rows.length}`);
    
    // Analysis
    console.log('\n🔍 ISSUE ANALYSIS:');
    if (pool.is_settled && !pool.settlement_tx_hash && betsCount.rows[0].bet_count === 0) {
      console.log('   ❌ CRITICAL ISSUE CONFIRMED:');
      console.log('   ❌ Pool marked as settled but has no settlement TX hash');
      console.log('   ❌ Pool has no bets but was not properly refunded');
      console.log('   ❌ Creator should have been refunded but settlement TX is null');
      console.log('   ❌ Frontend shows bettor won but there are no bets!');
      
      console.log('\n🔧 APPLYING FIX...');
      
      // Fix the database to reflect correct state
      await db.query(`
        UPDATE oracle.pools 
        SET 
          is_settled = false,
          settlement_tx_hash = NULL,
          creator_side_won = NULL,
          result = NULL,
          settled_at = NULL,
          updated_at = NOW()
        WHERE pool_id = '2'
      `);
      
      console.log('✅ Pool 2 reset to unsettled state');
      console.log('✅ Settlement TX hash cleared');
      console.log('✅ Creator side won cleared');
      console.log('✅ Result cleared');
      console.log('✅ Settled at cleared');
      
      console.log('\n💡 NEXT STEPS:');
      console.log('   1. Pool 2 is now in correct unsettled state');
      console.log('   2. Settlement system will now properly handle it');
      console.log('   3. If no bets are placed, creator will be refunded');
      console.log('   4. If bets are placed, pool will be settled normally');
      
    } else {
      console.log('   ✅ Pool 2 appears to be in correct state');
    }
    
  } catch (error) {
    console.error('❌ Error fixing pool 2 settlement:', error);
  }
}

// Run the fix
fixPool2Settlement().then(() => {
  console.log('\n🎉 Pool 2 settlement fix completed');
  process.exit(0);
}).catch(error => {
  console.error('❌ Fix failed:', error);
  process.exit(1);
});
