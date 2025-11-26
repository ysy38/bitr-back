#!/usr/bin/env node

/**
 * Manual Sync for Pool 16 Bets
 * 
 * This script queries the blockchain for BetPlaced events for Pool 16
 * and saves them to the database immediately.
 */

const { ethers } = require('ethers');
const config = require('../config');
const db = require('../db/db');
const EventDrivenBetSync = require('../services/event-driven-bet-sync');

async function syncPool16Bets() {
  try {
    console.log('🔄 MANUALLY SYNCING POOL 16 BETS FROM BLOCKCHAIN\n');
    console.log('='.repeat(60));
    
    // Initialize provider and contract
    const provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl, undefined, {
      timeout: 30000,
      polling: true,
      pollingInterval: 4000
    });
    
    const poolCoreABI = require('../solidity/BitredictPoolCore.json').abi;
    const contract = new ethers.Contract(
      config.blockchain.contractAddresses.poolCore,
      poolCoreABI,
      provider
    );
    
    console.log('1. Querying BetPlaced events for Pool 16...');
    console.log('   Getting current block number...');
    
    const currentBlock = await provider.getBlockNumber();
    console.log(`   Current block: ${currentBlock}`);
    
    // Query in batches of 1000 blocks (RPC limit)
    const batchSize = 1000;
    const lookbackBlocks = 5000; // Check last 5000 blocks
    const fromBlock = Math.max(0, currentBlock - lookbackBlocks);
    
    console.log(`   Querying blocks ${fromBlock} to ${currentBlock} in batches of ${batchSize}...`);
    
    // Query BetPlaced events for pool 16 in batches
    const filter = contract.filters.BetPlaced(16n); // Pool ID 16
    const allEvents = [];
    
    for (let start = fromBlock; start <= currentBlock; start += batchSize) {
      const end = Math.min(start + batchSize - 1, currentBlock);
      console.log(`   Querying blocks ${start} to ${end}...`);
      try {
        const batchEvents = await contract.queryFilter(filter, start, end);
        allEvents.push(...batchEvents);
        console.log(`     Found ${batchEvents.length} events in this batch`);
      } catch (error) {
        console.error(`     Error querying batch ${start}-${end}: ${error.message}`);
      }
    }
    
    const events = allEvents;
    
    console.log(`\n📈 Found ${events.length} BetPlaced events for Pool 16 on-chain\n`);
    
    if (events.length === 0) {
      console.log('  ❌ No BetPlaced events found on-chain for Pool 16');
      console.log('  This means either:');
      console.log('    1. No bets have been placed yet');
      console.log('    2. The transaction failed');
      console.log('    3. The pool ID is incorrect');
      
      // Check pool exists
      try {
        const poolData = await contract.getPool(16);
        console.log('\n  ✅ Pool 16 exists on-chain');
        console.log(`     Total Bettor Stake: ${poolData.totalBettorStake.toString()}`);
        console.log(`     Creator Stake: ${poolData.creatorStake.toString()}`);
        if (poolData.totalBettorStake > 0n) {
          console.log('\n  ⚠️  WARNING: Pool has bettor stake but no BetPlaced events found!');
          console.log('     This indicates a sync issue or event emission problem.');
          console.log('\n  🔍 Querying ALL BetPlaced events (not filtered by pool) to check if events exist...');
          
          // Query ALL BetPlaced events to see if any exist
          const allBetFilter = contract.filters.BetPlaced();
          const allBetEvents = await contract.queryFilter(allBetFilter, Math.max(0, currentBlock - 1000), currentBlock);
          console.log(`     Found ${allBetEvents.length} total BetPlaced events in last 1000 blocks`);
          
          if (allBetEvents.length > 0) {
            console.log('\n     Recent BetPlaced events:');
            allBetEvents.slice(-5).forEach((event, idx) => {
              console.log(`       ${idx + 1}. Pool: ${event.args.poolId.toString()}, TX: ${event.transactionHash.substring(0, 20)}...`);
            });
          }
          
          // Also check if we can query from pool creation
          await db.connect();
          const poolInfo = await db.query(
            "SELECT block_number FROM oracle.pools WHERE pool_id = '16'"
          );
          
          if (poolInfo.rows.length > 0 && poolInfo.rows[0].block_number) {
            const poolCreationBlock = Number(poolInfo.rows[0].block_number);
            console.log(`\n     Pool created at block: ${poolCreationBlock}`);
            console.log(`     Querying from pool creation block...`);
            
            const filter2 = contract.filters.BetPlaced(16n);
            const eventsFromCreation = await contract.queryFilter(filter2, poolCreationBlock, currentBlock);
            console.log(`     Found ${eventsFromCreation.length} BetPlaced events from pool creation`);
          } else {
            console.log('\n     ⚠️  Pool block_number not stored in database');
          }
        }
      } catch (error) {
        console.log(`\n  ❌ Pool 16 does not exist on-chain: ${error.message}`);
      }
      
      process.exit(0);
    }
    
    // Connect to database
    await db.connect();
    
    console.log('2. Checking database for existing bets...');
    const existingBets = await db.query(
      'SELECT transaction_hash FROM oracle.bets WHERE pool_id = $1',
      ['16']
    );
    const existingTxHashes = new Set(existingBets.rows.map(b => b.transaction_hash));
    console.log(`   Found ${existingBets.rows.length} existing bets in database\n`);
    
    console.log('3. Processing events and saving to database...\n');
    let savedCount = 0;
    let skippedCount = 0;
    
    // Use the EventDrivenBetSync service to handle bets properly
    const betSyncService = new EventDrivenBetSync();
    await betSyncService.initialize();
    
    for (const event of events) {
      const { poolId, bettor, amount, isForOutcome } = event.args;
      const txHash = event.transactionHash;
      const blockNumber = event.blockNumber;
      
      console.log(`   Event ${savedCount + skippedCount + 1}/${events.length}:`);
      console.log(`     Transaction: ${txHash}`);
      console.log(`     Block: ${blockNumber}`);
      console.log(`     Bettor: ${bettor}`);
      console.log(`     Amount: ${amount.toString()} wei (${(Number(amount) / 1e18).toFixed(2)} BITR)`);
      console.log(`     Is For Outcome: ${isForOutcome}`);
      
      if (existingTxHashes.has(txHash)) {
        console.log(`     ⏭️  Already in database - skipping\n`);
        skippedCount++;
        continue;
      }
      
      // Use the service's handleBetPlaced method to ensure proper processing
      try {
        await betSyncService.handleBetPlaced(poolId, bettor, amount, isForOutcome, event);
        console.log(`     ✅ Saved to database\n`);
        savedCount++;
      } catch (error) {
        console.error(`     ❌ Failed to save: ${error.message}\n`);
        console.error(`     Stack: ${error.stack}\n`);
      }
    }
    
    console.log('='.repeat(60));
    console.log(`\n✅ SYNC COMPLETE`);
    console.log(`   Total events found: ${events.length}`);
    console.log(`   New bets saved: ${savedCount}`);
    console.log(`   Already existed: ${skippedCount}`);
    console.log(`\n`);
    
    // Verify final state
    const finalBets = await db.query(
      'SELECT COUNT(*) as count FROM oracle.bets WHERE pool_id = $1',
      ['16']
    );
    console.log(`   Total bets in database for Pool 16: ${finalBets.rows[0].count}`);
    
    await db.end();
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ ERROR:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

syncPool16Bets();

