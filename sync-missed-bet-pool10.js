const db = require('./backend/db/db');
const { ethers } = require('ethers');
require('dotenv').config();

/**
 * Manual sync script for missed bet on Pool 10
 * Transaction: 0x4d4c1a1dbaa78b9d8347762a0ead03345ad08255f1fae736fb48c57d37ea46dc
 * Block: 225525674
 */
async function syncMissedBet() {
  try {
    await db.connect();
    
    const txHash = '0x4d4c1a1dbaa78b9d8347762a0ead03345ad08255f1fae736fb48c57d37ea46dc';
    const poolId = '10';
    const bettorAddress = '0x150e7665a6f3e66933bdfd51a60a43f1bcc7971b';
    const amount = ethers.parseEther('3500'); // 3500 STT
    const blockNumber = 225525674;
    
    // Check if bet already exists
    const existingBet = await db.query(
      'SELECT * FROM oracle.bets WHERE transaction_hash = $1',
      [txHash]
    );
    
    if (existingBet.rows.length > 0) {
      console.log('✅ Bet already exists in database');
      console.log(existingBet.rows[0]);
      process.exit(0);
    }
    
    // Get pool data for bet record
    const poolData = await db.query(
      'SELECT event_start_time, event_end_time, betting_end_time, league, category, home_team, away_team, title FROM oracle.pools WHERE pool_id = $1',
      [poolId]
    );
    
    if (poolData.rows.length === 0) {
      throw new Error(`Pool ${poolId} not found in database`);
    }
    
    const pool = poolData.rows[0];
    
    // Insert bet record
    await db.query(`
      INSERT INTO oracle.bets (
        transaction_hash, pool_id, bettor_address, amount, is_for_outcome,
        block_number, event_start_time, event_end_time, betting_end_time,
        league, category, home_team, away_team, title, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
    `, [
      txHash,
      poolId,
      bettorAddress.toLowerCase(),
      amount.toString(),
      true, // is_for_outcome
      blockNumber,
      pool.event_start_time,
      pool.event_end_time,
      pool.betting_end_time,
      pool.league,
      pool.category,
      pool.home_team,
      pool.away_team,
      pool.title
    ]);
    
    console.log('✅ Successfully synced missed bet to database');
    console.log(`   Transaction: ${txHash}`);
    console.log(`   Pool ID: ${poolId}`);
    console.log(`   Bettor: ${bettorAddress}`);
    console.log(`   Amount: ${ethers.formatEther(amount)} STT`);
    
    await db.end();
    
  } catch (error) {
    console.error('❌ Error syncing bet:', error);
    process.exit(1);
  }
}

syncMissedBet();

