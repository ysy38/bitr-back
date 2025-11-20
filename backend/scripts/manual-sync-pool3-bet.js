#!/usr/bin/env node

/**
 * Manual Sync for Pool 3 Bet
 * 
 * This script queries the blockchain for BetPlaced events for Pool 3
 * and saves them to the database.
 */

const { ethers } = require('ethers');
const config = require('../config');
const db = require('../db/db');

async function syncPool3Bets() {
  try {
    console.log('🔄 MANUALLY SYNCING POOL 3 BETS FROM BLOCKCHAIN\n');
    console.log('='.repeat(60));
    
    // Initialize provider and contract
    const provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    const poolCoreABI = require('../solidity/BitredictPoolCore.json').abi;
    const contract = new ethers.Contract(
      config.blockchain.contractAddresses.poolCore,
      poolCoreABI,
      provider
    );
    
    console.log('1. Querying BetPlaced events for Pool 3...');
    console.log('   Getting current block number...');
    
    const currentBlock = await provider.getBlockNumber();
    console.log(`   Current block: ${currentBlock}`);
    
    // Query last 900 blocks (under 1000 limit)
    const fromBlock = Math.max(0, currentBlock - 900);
    
    console.log(`   Querying blocks ${fromBlock} to ${currentBlock}`);
    
    // Query BetPlaced events for pool 3
    const filter = contract.filters.BetPlaced(3n); // Pool ID 3
    const events = await contract.queryFilter(filter, fromBlock, 'latest');
    
    console.log(`  Found ${events.length} BetPlaced events for Pool 3`);
    
    if (events.length === 0) {
      console.log('  ❌ No BetPlaced events found on-chain for Pool 3');
      console.log('  This means the bet transaction did NOT emit the event');
      console.log('  Check the transaction hash to verify');
      process.exit(0);
    }
    
    // Connect to database
    await db.connect();
    
    console.log('\n2. Saving bets to database...');
    let savedCount = 0;
    
    for (const event of events) {
      const { poolId, bettor, amount, isForOutcome } = event.args;
      const tx = await event.getTransaction();
      const block = await event.getBlock();
      
      console.log(`\n  Bet ${savedCount + 1}:`);
      console.log(`    Pool ID: ${poolId.toString()}`);
      console.log(`    Bettor: ${bettor}`);
      console.log(`    Amount: ${amount.toString()}`);
      console.log(`    For Outcome: ${isForOutcome}`);
      console.log(`    TX Hash: ${tx.hash}`);
      console.log(`    Block: ${block.number}`);
      
      // Check if already exists
      const existing = await db.query(
        'SELECT id FROM oracle.bets WHERE transaction_hash = $1',
        [tx.hash]
      );
      
      if (existing.rows.length > 0) {
        console.log(`    ⚠️ Already exists in database, skipping`);
        continue;
      }
      
      // Insert into database
      await db.query(`
        INSERT INTO oracle.bets (
          pool_id, bettor_address, amount, is_for_outcome,
          transaction_hash, block_number, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, NOW(), NOW()
        )
      `, [
        poolId.toString(),
        bettor,
        amount.toString(),
        isForOutcome,
        tx.hash,
        block.number
      ]);
      
      console.log(`    ✅ Saved to database`);
      savedCount++;
    }
    
    console.log(`\n✅ Manual sync completed: ${savedCount} bets saved`);
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

syncPool3Bets();

