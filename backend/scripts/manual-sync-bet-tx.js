#!/usr/bin/env node

/**
 * Manual Sync for Specific Bet Transaction
 * 
 * This script manually syncs a bet transaction by transaction hash
 * Useful when events are missed or not detected
 */

const { ethers } = require('ethers');
const config = require('../config');
const db = require('../db/db');
const EventDrivenBetSync = require('../services/event-driven-bet-sync');

// Transaction details from user
const TX_HASH = '0x874008cf426b86863dc9260e5dd4490c77738145b74c3e3636b8ca248741cf1e';
const BLOCK_NUMBER = 229689225;
const POOL_ID = 16;

async function syncBetTransaction() {
  try {
    console.log('🔄 MANUALLY SYNCING BET TRANSACTION\n');
    console.log('='.repeat(60));
    console.log(`Transaction Hash: ${TX_HASH}`);
    console.log(`Block Number: ${BLOCK_NUMBER}`);
    console.log(`Pool ID: ${POOL_ID}`);
    console.log('='.repeat(60));
    console.log('');
    
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
    
    // Check if bet already exists in database
    await db.connect();
    const existingBet = await db.query(
      'SELECT id, pool_id, bettor_address, amount FROM oracle.bets WHERE transaction_hash = $1',
      [TX_HASH]
    );
    
    if (existingBet.rows.length > 0) {
      console.log('✅ Bet already exists in database:');
      console.log(`   ID: ${existingBet.rows[0].id}`);
      console.log(`   Pool: ${existingBet.rows[0].pool_id}`);
      console.log(`   Bettor: ${existingBet.rows[0].bettor_address}`);
      console.log(`   Amount: ${existingBet.rows[0].amount} wei`);
      // Database connection is managed by the service
      process.exit(0);
    }
    
    console.log('1. Fetching transaction receipt...');
    const receipt = await provider.getTransactionReceipt(TX_HASH);
    
    if (!receipt) {
      console.error('❌ Transaction receipt not found!');
      console.error('   The transaction may not exist or may have failed.');
      process.exit(1);
    }
    
    console.log(`   ✅ Transaction found in block ${receipt.blockNumber}`);
    console.log(`   Status: ${receipt.status === 1 ? 'Success' : 'Failed'}`);
    
    if (receipt.status !== 1) {
      console.error('❌ Transaction failed! Cannot sync bet.');
      process.exit(1);
    }
    
    console.log('\n2. Parsing BetPlaced event from transaction logs...');
    
    // Find BetPlaced event in logs
    const betPlacedEvent = receipt.logs.find(log => {
      try {
        const parsedLog = contract.interface.parseLog(log);
        return parsedLog && parsedLog.name === 'BetPlaced';
      } catch (e) {
        return false;
      }
    });
    
    if (!betPlacedEvent) {
      console.error('❌ BetPlaced event not found in transaction logs!');
      console.error('   This transaction may not be a bet transaction.');
      console.error('   Available events:');
      receipt.logs.forEach((log, idx) => {
        try {
          const parsed = contract.interface.parseLog(log);
          console.error(`     ${idx + 1}. ${parsed.name}`);
        } catch (e) {
          console.error(`     ${idx + 1}. Unknown event`);
        }
      });
      process.exit(1);
    }
    
    // Parse the event
    const parsedEvent = contract.interface.parseLog(betPlacedEvent);
    const { poolId, bettor, amount, isForOutcome } = parsedEvent.args;
    
    console.log('   ✅ BetPlaced event found!');
    console.log(`   Pool ID: ${poolId.toString()}`);
    console.log(`   Bettor: ${bettor}`);
    console.log(`   Amount: ${amount.toString()} wei (${(Number(amount) / 1e18).toFixed(2)} BITR)`);
    console.log(`   Is For Outcome: ${isForOutcome}`);
    
    if (poolId.toString() !== POOL_ID.toString()) {
      console.warn(`   ⚠️  Warning: Pool ID mismatch! Expected ${POOL_ID}, got ${poolId.toString()}`);
    }
    
    console.log('\n3. Creating event object for bet sync service...');
    
    // Create a mock event object that matches what the service expects
    const eventObject = {
      args: {
        poolId: poolId,
        bettor: bettor,
        amount: amount,
        isForOutcome: isForOutcome
      },
      transactionHash: TX_HASH,
      blockNumber: receipt.blockNumber,
      log: {
        transactionHash: TX_HASH,
        blockNumber: receipt.blockNumber,
        blockHash: receipt.blockHash,
        logIndex: betPlacedEvent.index
      }
    };
    
    console.log('   ✅ Event object created');
    
    console.log('\n4. Processing bet using EventDrivenBetSync service...');
    
    // Use the bet sync service to process the bet
    const betSyncService = new EventDrivenBetSync();
    await betSyncService.initialize();
    
    await betSyncService.handleBetPlaced(
      poolId,
      bettor,
      amount,
      isForOutcome,
      eventObject
    );
    
    console.log('   ✅ Bet processed successfully!');
    
    // Verify it was saved
    const savedBet = await db.query(
      'SELECT id, pool_id, bettor_address, amount, transaction_hash FROM oracle.bets WHERE transaction_hash = $1',
      [TX_HASH]
    );
    
    if (savedBet.rows.length > 0) {
      console.log('\n✅ Bet successfully saved to database:');
      console.log(`   ID: ${savedBet.rows[0].id}`);
      console.log(`   Pool: ${savedBet.rows[0].pool_id}`);
      console.log(`   Bettor: ${savedBet.rows[0].bettor_address}`);
      console.log(`   Amount: ${savedBet.rows[0].amount} wei`);
      console.log(`   TX Hash: ${savedBet.rows[0].transaction_hash}`);
    } else {
      console.error('\n❌ Bet was not saved to database!');
      process.exit(1);
    }
    
    // Database connection is managed by the service, no need to close
    console.log('\n✅ Manual sync complete!');
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ ERROR:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

syncBetTransaction();

