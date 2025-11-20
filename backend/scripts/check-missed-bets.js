#!/usr/bin/env node

/**
 * Check for Missed Bets
 * 
 * This script checks if there are any missed bets by comparing the database
 * with what should be there based on pool stakes.
 */

const db = require('../db/db');

async function checkMissedBets() {
  console.log('🔍 Checking for missed bets...\n');
  
  try {
    // Connect to database
    await db.connect();
    console.log('✅ Database connected');
    
    // Check Pool 4 bets
    console.log('\n📊 Pool 4 (BNB) bets in database:');
    const pool4Bets = await db.query(`
      SELECT 
        id, bettor_address, amount, is_for_outcome, 
        transaction_hash, block_number, created_at
      FROM oracle.bets 
      WHERE pool_id = '4' 
      ORDER BY created_at DESC
    `);
    
    console.log(`Found ${pool4Bets.rows.length} bets for Pool 4:`);
    pool4Bets.rows.forEach((bet, index) => {
      const amountTokens = (Number(bet.amount) / 1e18).toFixed(2);
      console.log(`  ${index + 1}. ${bet.bettor_address} - ${amountTokens} tokens (${bet.is_for_outcome ? 'FOR' : 'AGAINST'}) - ${bet.created_at}`);
    });
    
    // Check if there are any recent bets that might have been missed
    console.log('\n📈 Recent bets (last 24 hours):');
    const recentBets = await db.query(`
      SELECT 
        pool_id, bettor_address, amount, is_for_outcome, 
        transaction_hash, created_at
      FROM oracle.bets 
      WHERE created_at > NOW() - INTERVAL '24 hours'
      ORDER BY created_at DESC
    `);
    
    console.log(`Found ${recentBets.rows.length} bets in last 24 hours:`);
    recentBets.rows.forEach((bet, index) => {
      const amountTokens = (Number(bet.amount) / 1e18).toFixed(2);
      console.log(`  ${index + 1}. Pool ${bet.pool_id} - ${bet.bettor_address} - ${amountTokens} tokens - ${bet.created_at}`);
    });
    
    // Check for any bets with 1000 tokens (1K)
    console.log('\n💰 Checking for 1K token bets:');
    const oneKBets = await db.query(`
      SELECT 
        pool_id, bettor_address, amount, is_for_outcome, 
        transaction_hash, created_at
      FROM oracle.bets 
      WHERE amount = '1000000000000000000000'
      ORDER BY created_at DESC
    `);
    
    console.log(`Found ${oneKBets.rows.length} bets with 1000 tokens:`);
    oneKBets.rows.forEach((bet, index) => {
      console.log(`  ${index + 1}. Pool ${bet.pool_id} - ${bet.bettor_address} - ${bet.created_at}`);
    });
    
    // Check for any bets with amounts between 500 and 1500 tokens
    console.log('\n🔍 Checking for bets between 500-1500 tokens:');
    const mediumBets = await db.query(`
      SELECT 
        pool_id, bettor_address, amount, is_for_outcome, 
        transaction_hash, created_at
      FROM oracle.bets 
      WHERE amount::numeric BETWEEN 500000000000000000000 AND 1500000000000000000000
      ORDER BY created_at DESC
    `);
    
    console.log(`Found ${mediumBets.rows.length} bets between 500-1500 tokens:`);
    mediumBets.rows.forEach((bet, index) => {
      const amountTokens = (Number(bet.amount) / 1e18).toFixed(2);
      console.log(`  ${index + 1}. Pool ${bet.pool_id} - ${bet.bettor_address} - ${amountTokens} tokens - ${bet.created_at}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await db.disconnect();
  }
}

checkMissedBets();
