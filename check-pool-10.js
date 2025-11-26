const { ethers } = require('ethers');
require('dotenv').config();
const db = require('./backend/db/db');

async function checkPool10() {
  try {
    // Connect to database
    await db.connect();
    
    // Get pool 10 from database
    const poolResult = await db.query(`
      SELECT 
        pool_id, title, category, market_id, predicted_outcome,
        event_start_time, event_end_time, betting_end_time,
        creator_stake, total_bettor_stake, max_bettor_stake,
        odds, oracle_type, market_type, created_at
      FROM oracle.pools 
      WHERE pool_id = '10'
    `);
    
    if (poolResult.rows.length === 0) {
      console.log('❌ Pool 10 not found in database');
      return;
    }
    
    const pool = poolResult.rows[0];
    console.log('\n📊 POOL 10 DATABASE DATA:');
    console.log('========================');
    console.log(`Pool ID: ${pool.pool_id}`);
    console.log(`Title: ${pool.title}`);
    console.log(`Category: ${pool.category}`);
    console.log(`Market ID: ${pool.market_id}`);
    console.log(`Predicted Outcome: ${pool.predicted_outcome}`);
    console.log(`\n⏰ TIMING:`);
    console.log(`Event Start Time: ${pool.event_start_time} (${new Date(Number(pool.event_start_time) * 1000).toISOString()})`);
    console.log(`Event End Time: ${pool.event_end_time} (${new Date(Number(pool.event_end_time) * 1000).toISOString()})`);
    console.log(`Betting End Time: ${pool.betting_end_time} (${new Date(Number(pool.betting_end_time) * 1000).toISOString()})`);
    
    // Calculate timeframe
    const timeframeSeconds = Number(pool.event_end_time) - Number(pool.event_start_time);
    const hours = Math.floor(timeframeSeconds / 3600);
    const days = Math.floor(hours / 24);
    const minutes = Math.floor((timeframeSeconds % 3600) / 60);
    console.log(`\n📅 TIMEFRAME CALCULATION:`);
    console.log(`Timeframe seconds: ${timeframeSeconds}`);
    console.log(`Timeframe: ${days} days, ${hours % 24} hours, ${minutes} minutes`);
    console.log(`Expected: 4 hours`);
    
    // Check current time vs event start
    const now = Math.floor(Date.now() / 1000);
    const timeUntilEventStart = Number(pool.event_start_time) - now;
    const timeUntilEventStartMinutes = Math.floor(timeUntilEventStart / 60);
    console.log(`\n⏱️ TIME UNTIL EVENT START:`);
    console.log(`Current time: ${now} (${new Date(now * 1000).toISOString()})`);
    console.log(`Time until event start: ${timeUntilEventStart} seconds (${timeUntilEventStartMinutes} minutes)`);
    console.log(`Expected: Should be set to 8:00 UTC`);
    
    // Check bets
    const betsResult = await db.query(`
      SELECT 
        transaction_hash as bet_id, bettor_address, amount, created_at, transaction_hash
      FROM oracle.bets 
      WHERE pool_id = '10'
      ORDER BY created_at DESC
    `);
    
    console.log(`\n💰 BETS:`);
    console.log(`Total bets in database: ${betsResult.rows.length}`);
    betsResult.rows.forEach((bet, idx) => {
      console.log(`  Bet ${idx + 1}:`);
      console.log(`    ID: ${bet.bet_id}`);
      console.log(`    Bettor: ${bet.bettor_address}`);
      console.log(`    Amount: ${ethers.formatEther(bet.amount)} STT`);
      console.log(`    Created: ${bet.created_at}`);
      console.log(`    TX: ${bet.transaction_hash}`);
    });
    
    // Try to get pool from contract
    console.log(`\n🔗 CHECKING CONTRACT DATA...`);
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://rpc.somnia.network');
    const poolCoreAddress = process.env.POOL_CORE_ADDRESS || '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9';
    const poolCoreABI = require('./backend/abis/BitredictPoolCore.json');
    const poolCore = new ethers.Contract(poolCoreAddress, poolCoreABI, provider);
    
    try {
      const poolData = await poolCore.getPoolWithDecodedNames(10);
      console.log(`\n📋 CONTRACT DATA:`);
      console.log(`Event Start Time: ${poolData.eventStartTime.toString()} (${new Date(Number(poolData.eventStartTime) * 1000).toISOString()})`);
      console.log(`Event End Time: ${poolData.eventEndTime.toString()} (${new Date(Number(poolData.eventEndTime) * 1000).toISOString()})`);
      console.log(`Market ID: ${poolData.marketId}`);
      console.log(`Predicted Outcome: ${poolData.predictedOutcome}`);
      
      // Calculate contract timeframe
      const contractTimeframeSeconds = Number(poolData.eventEndTime) - Number(poolData.eventStartTime);
      const contractHours = Math.floor(contractTimeframeSeconds / 3600);
      const contractDays = Math.floor(contractHours / 24);
      console.log(`Contract Timeframe: ${contractDays} days, ${contractHours % 24} hours`);
      
      // Get bettor count from contract
      const stats = await poolCore.getPoolStats(10);
      console.log(`\n📊 CONTRACT STATS:`);
      console.log(`Bettor Count: ${stats.bettorCount.toString()}`);
      console.log(`Total Bettor Stake: ${ethers.formatEther(stats.totalBettorStake)} STT`);
      
    } catch (error) {
      console.log(`❌ Error fetching contract data: ${error.message}`);
    }
    
    await db.end();
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkPool10();

