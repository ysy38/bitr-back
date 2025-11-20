#!/usr/bin/env node

/**
 * Manual Bets Sync Script
 * Sync bets from blockchain events for a specific pool
 */

const { ethers } = require('ethers');
const config = require('../config');
const db = require('../db/db');

async function syncBets() {
  try {
    console.log('🚀 Starting manual bets sync...');
    
    // Connect to provider
    const provider = new ethers.JsonRpcProvider('https://dream-rpc.somnia.network/');
    const poolCoreABI = require('../solidity/BitredictPoolCore.json').abi;
    const poolCoreAddress = '0x59210719f4218c87ceA8661FEe29167639D124bA';
    const contract = new ethers.Contract(poolCoreAddress, poolCoreABI, provider);
    
    // Connect to database
    await db.connect();
    console.log('✅ Database connected');
    
    // Get BetPlaced events for pool 0
    const poolId = 0;
    console.log(`🔍 Fetching BetPlaced events for pool ${poolId}...`);
    
    // Get the transaction block for the pool creation
    const fromBlock = 192766577; // Block where pool was created
    const toBlock = 192766577 + 1000; // Scan next 1000 blocks
    
    console.log(`📦 Scanning blocks ${fromBlock} to ${toBlock}...`);
    
    // Get BetPlaced events
    const filter = contract.filters.BetPlaced(poolId);
    const events = await contract.queryFilter(filter, fromBlock, toBlock);
    
    console.log(`📊 Found ${events.length} BetPlaced events`);
    
    for (const event of events) {
      try {
        const { poolId, bettor, amount, side, potentialPayout } = event.args;
        
        console.log(`🎯 Processing bet:`, {
          poolId: Number(poolId),
          bettor,
          amount: ethers.formatEther(amount),
          side,
          potentialPayout: ethers.formatEther(potentialPayout)
        });
        
        // Save to database
        await db.query(`
          INSERT INTO oracle.bets (
            pool_id, bettor_address, amount, side, 
            created_at, is_claimed
          ) VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (pool_id, bettor_address) DO UPDATE SET
            amount = EXCLUDED.amount,
            side = EXCLUDED.side
        `, [
          Number(poolId),
          bettor,
          ethers.formatEther(amount),
          side,
          new Date(event.blockNumber * 1000),
          false
        ]);
        
        console.log(`✅ Bet synced successfully`);
        
      } catch (error) {
        console.error(`❌ Error processing bet:`, error.message);
      }
    }
    
    console.log(`\n✅ Sync completed! Total bets synced: ${events.length}`);
    
  } catch (error) {
    console.error('❌ Sync failed:', error);
    throw error;
  } finally {
    await db.disconnect();
  }
}

// Run
syncBets()
  .then(() => {
    console.log('✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed:', error);
    process.exit(1);
  });

