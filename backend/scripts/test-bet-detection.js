#!/usr/bin/env node

/**
 * Test Bet Detection and SDS Publishing
 * 
 * This script verifies that:
 * 1. Backend can detect BetPlaced events from the contract
 * 2. SDS publishBet() works correctly
 * 3. Event listeners are properly configured
 */

const { createPublicClient, http, parseAbiItem } = require('viem');
const { somniaTestnet } = require('../config/chains');
const db = require('../db/db');

const POOL_CORE_ABI = [
  'event BetPlaced(uint256 indexed poolId, address indexed bettor, uint256 amount, bool isForOutcome)'
];

const POOL_CORE_ADDRESS = '0x60CB15C4E423FdBE386e8a12e3e61F3AEaa48673';

async function testBetDetection() {
  try {
    console.log('🧪 Testing Bet Detection and SDS Publishing\n');
    
    // 1. Test blockchain connection
    console.log('1️⃣ Testing blockchain connection...');
    const publicClient = createPublicClient({
      chain: somniaTestnet,
      transport: http(process.env.RPC_URL || 'https://dream-rpc.somnia.network')
    });
    
    const blockNumber = await publicClient.getBlockNumber();
    console.log(`✅ Connected to Somnia - Current block: ${blockNumber}\n`);
    
    // 2. Check for recent BetPlaced events
    console.log('2️⃣ Checking for recent BetPlaced events...');
    const targetTxHash = '0x874008cf426b86863dc9260e5dd4490c77738145b74c3e3636b8ca248741cf1e';
    
    // Get transaction receipt to find the block number
    const receipt = await publicClient.getTransactionReceipt({ hash: targetTxHash });
    console.log(`📄 Transaction found at block: ${receipt.blockNumber}`);
    console.log(`   Pool ID from logs:`, receipt.logs);
    
    // Parse BetPlaced event from logs
    const betPlacedEventSignature = parseAbiItem('event BetPlaced(uint256 indexed poolId, address indexed bettor, uint256 amount, bool isForOutcome)');
    const betPlacedLogs = receipt.logs.filter(log => 
      log.topics[0] === betPlacedEventSignature.topicHash
    );
    
    if (betPlacedLogs.length > 0) {
      console.log(`✅ Found ${betPlacedLogs.length} BetPlaced event(s) in transaction\n`);
      
      for (const log of betPlacedLogs) {
        console.log('📊 BetPlaced Event Details:');
        console.log(`   Pool ID: ${BigInt(log.topics[1])}`);
        console.log(`   Bettor: ${log.topics[2]}`);
        console.log(`   Transaction: ${log.transactionHash}`);
        console.log(`   Block: ${log.blockNumber}\n`);
        
        const poolId = BigInt(log.topics[1]).toString();
        
        // 3. Check if bet exists in database
        console.log('3️⃣ Checking database for bet record...');
        const betResult = await db.query(`
          SELECT 
            b.pool_id,
            b.bettor_address,
            b.amount,
            b.is_for_outcome,
            b.created_at
          FROM oracle.bets b
          WHERE b.pool_id::text = $1
          ORDER BY b.created_at DESC
          LIMIT 5
        `, [poolId]);
        
        if (betResult.rows.length > 0) {
          console.log(`✅ Found ${betResult.rows.length} bet(s) in database for pool ${poolId}`);
          betResult.rows.forEach((bet, i) => {
            console.log(`   Bet ${i + 1}: ${bet.bettor_address} - ${bet.amount} wei`);
          });
        } else {
          console.log(`❌ No bets found in database for pool ${poolId}`);
          console.log(`   This indicates the event listener did NOT process this event`);
        }
        console.log();
        
        // 4. Test SDS publishing manually
        console.log('4️⃣ Testing SDS publishBet manually...');
        const somniaDataStreams = require('../services/somnia-data-streams-service');
        
        if (!somniaDataStreams.isInitialized) {
          console.log('🔧 Initializing SDS service...');
          await somniaDataStreams.initialize();
        }
        
        if (betResult.rows.length > 0) {
          const latestBet = betResult.rows[0];
          console.log(`📤 Publishing bet to SDS...`);
          const result = await somniaDataStreams.publishBet(
            poolId,
            latestBet.bettor_address,
            latestBet.amount,
            latestBet.is_for_outcome,
            { transactionHash: targetTxHash }
          );
          
          if (result) {
            console.log(`✅ SDS publish successful: ${result}`);
          } else {
            console.log(`⚠️ SDS publish returned null (may be disabled or failed)`);
          }
        }
      }
    } else {
      console.log(`❌ No BetPlaced events found in transaction ${targetTxHash}\n`);
    }
    
    // 5. Check event listener status
    console.log('\n5️⃣ Event Listener Status:');
    const EventDrivenBetSync = require('../services/event-driven-bet-sync');
    const betSync = new EventDrivenBetSync();
    
    console.log(`   Service initialized: ${betSync.isRunning ? 'YES' : 'NO'}`);
    console.log(`   Contract: ${betSync.contract ? 'Connected' : 'Not connected'}`);
    
    console.log('\n✅ Test complete!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    console.error('   Stack:', error.stack);
  } finally {
    process.exit(0);
  }
}

testBetDetection();

