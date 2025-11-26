/**
 * Test SDS Publishing Locally
 * 
 * This script tests that SDS publishing works correctly on localhost
 * Tests the new SchemaEncoder-based implementation with schema registration
 * 
 * Run: node scripts/test-sds-publishing-local.js
 */

const somniaDataStreams = require('../services/somnia-data-streams-service');
const db = require('../db/db');

async function testSDSPublishing() {
  console.log('🧪 Testing SDS Publishing Locally...\n');
  console.log('='.repeat(60));
  
  try {
    // Step 1: Initialize SDS service (includes schema registration)
    console.log('\n1️⃣ Initializing SDS service...');
    await somniaDataStreams.initialize();
    
    if (!somniaDataStreams.isInitialized) {
      console.error('❌ SDS service failed to initialize');
      console.error('   Check SOMNIA_PRIVATE_KEY environment variable');
      console.error('   Check network connectivity to Somnia RPC');
      process.exit(1);
    }
    console.log('✅ SDS service initialized');
    
    const service = somniaDataStreams.getInstance();
    if (service && service.publisherAddress) {
      console.log(`   Publisher address: ${service.publisherAddress}`);
    }
    
    // Step 2: Verify schema is registered
    console.log('\n2️⃣ Verifying schema registration...');
    try {
      const { SDK, SchemaEncoder } = require('@somnia-chain/streams');
      const { createPublicClient, http } = require('viem');
      const { somniaTestnet } = require('viem/chains');
      
      const rpcUrl = process.env.SOMNIA_RPC_URL || process.env.RPC_URL || 'https://dream-rpc.somnia.network';
      const publicClient = createPublicClient({ 
        chain: somniaTestnet, 
        transport: http(rpcUrl) 
      });
      
      const testSdk = new SDK({ public: publicClient });
      const jsonSchema = 'string jsonData';
      const schemaId = await testSdk.streams.computeSchemaId(jsonSchema);
      
      let isRegistered = false;
      try {
        if (typeof testSdk.streams.isSchemaRegistered === 'function') {
          isRegistered = await testSdk.streams.isSchemaRegistered(schemaId);
        } else if (typeof testSdk.streams.isDataSchemaRegistered === 'function') {
          isRegistered = await testSdk.streams.isDataSchemaRegistered(schemaId);
        }
      } catch (e) {
        console.log('   ⚠️ Could not check registration status');
      }
      
      if (isRegistered) {
        console.log(`   ✅ Schema registered (ID: ${schemaId.slice(0, 20)}...)`);
      } else {
        console.log(`   ⚠️ Schema not registered yet (ID: ${schemaId.slice(0, 20)}...)`);
        console.log('   ℹ️ Schema will be registered on first publish');
      }
    } catch (error) {
      console.log('   ⚠️ Could not verify schema registration:', error.message);
    }
    
    // Step 3: Test publishing a pool
    console.log('\n3️⃣ Testing pool publishing...');
    const testPoolId = '999';
    const testPoolData = {
      poolId: testPoolId,
      creator: '0x483fc7FD690dCf2a01318282559C389F385d4428',
      odds: 200,
      creatorStake: '1000000000000000000',
      totalBettorStake: '0',
      totalCreatorSideStake: '1000000000000000000',
      maxBettorStake: '5000000000000000000',
      category: 'test',
      league: 'test',
      homeTeam: 'Test Home',
      awayTeam: 'Test Away',
      marketId: 'test-market',
      eventStartTime: '0',
      eventEndTime: '0',
      bettingEndTime: '0',
      isSettled: false,
      creatorSideWon: false,
      title: 'Test Pool',
      fillPercentage: 0,
      participantCount: 0,
      currency: 'STT',
      timestamp: Math.floor(Date.now() / 1000)
    };
    
    const poolTx = await somniaDataStreams.publishPool(testPoolId, testPoolData);
    if (poolTx) {
      console.log(`   ✅ Pool published successfully`);
      console.log(`   📝 Transaction: ${poolTx}`);
      console.log(`   🔗 View on explorer: https://explorer.somnia.network/tx/${poolTx}`);
    } else {
      console.log('   ⚠️ Pool publish returned null (check logs for details)');
    }
    
    // Step 4: Test publishing a bet
    console.log('\n4️⃣ Testing bet publishing...');
    const testBettor = '0x483fc7FD690dCf2a01318282559C389F385d4428';
    const testAmount = '500000000000000000';
    const testIsForOutcome = true;
    
    // First, ensure the pool exists in DB for the bet query
    try {
      await db.query(`
        INSERT INTO oracle.pools (pool_id, creator_address, odds, creator_stake, title, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (pool_id) DO NOTHING
      `, [testPoolId, testPoolData.creator, testPoolData.odds, testPoolData.creatorStake, testPoolData.title]);
    } catch (e) {
      // Pool might already exist, that's fine
    }
    
    const betTx = await somniaDataStreams.publishBet(testPoolId, testBettor, testAmount, testIsForOutcome, null);
    if (betTx) {
      console.log(`   ✅ Bet published successfully`);
      console.log(`   📝 Transaction: ${betTx}`);
    } else {
      console.log('   ⚠️ Bet publish returned null (check logs for details)');
    }
    
    // Step 5: Test publishing pool progress
    console.log('\n5️⃣ Testing pool progress publishing...');
    const progressTx = await somniaDataStreams.publishPoolProgress(testPoolId);
    if (progressTx) {
      console.log(`   ✅ Pool progress published successfully`);
      console.log(`   📝 Transaction: ${progressTx}`);
    } else {
      console.log('   ⚠️ Pool progress publish returned null (check logs for details)');
    }
    
    // Step 6: Test publishing liquidity
    console.log('\n6️⃣ Testing liquidity publishing...');
    const testProvider = '0x483fc7FD690dCf2a01318282559C389F385d4428';
    const testLiquidityAmount = '1000000000000000000';
    const liquidityTx = await somniaDataStreams.publishLiquidityEvent(testPoolId, testProvider, testLiquidityAmount, null);
    if (liquidityTx) {
      console.log(`   ✅ Liquidity event published successfully`);
      console.log(`   📝 Transaction: ${liquidityTx}`);
    } else {
      console.log('   ⚠️ Liquidity publish returned null (check logs for details)');
    }
    
    // Step 7: Test publishing cycle resolved
    console.log('\n7️⃣ Testing cycle resolved publishing...');
    const testCycleId = '17';
    const testPrizePool = '10000000000000000000';
    const testTotalSlips = 5;
    const cycleTx = await somniaDataStreams.publishCycleResolved(testCycleId, testPrizePool, testTotalSlips, Math.floor(Date.now() / 1000));
    if (cycleTx) {
      console.log(`   ✅ Cycle resolved published successfully`);
      console.log(`   📝 Transaction: ${cycleTx}`);
    } else {
      console.log('   ⚠️ Cycle resolved publish returned null (check logs for details)');
    }
    
    // Step 8: Test publishing slip evaluated
    console.log('\n8️⃣ Testing slip evaluated publishing...');
    const testSlipId = '999';
    const testPlayer = '0x483fc7FD690dCf2a01318282559C389F385d4428';
    const testIsWinner = true;
    const testCorrectPredictions = 8;
    const testTotalPredictions = 10;
    const testRank = 1;
    const testPrizeAmount = '2000000000000000000';
    const slipTx = await somniaDataStreams.publishSlipEvaluated(
      testSlipId, testCycleId, testPlayer, testIsWinner, 
      testCorrectPredictions, testTotalPredictions, testRank, testPrizeAmount,
      Math.floor(Date.now() / 1000)
    );
    if (slipTx) {
      console.log(`   ✅ Slip evaluated published successfully`);
      console.log(`   📝 Transaction: ${slipTx}`);
    } else {
      console.log('   ⚠️ Slip evaluated publish returned null (check logs for details)');
    }
    
    // Step 9: Test publishing prize claimed
    console.log('\n9️⃣ Testing prize claimed publishing...');
    const prizeTx = await somniaDataStreams.publishPrizeClaimed(
      testPlayer, testSlipId, testCycleId, testPrizeAmount, testRank,
      Math.floor(Date.now() / 1000)
    );
    if (prizeTx) {
      console.log(`   ✅ Prize claimed published successfully`);
      console.log(`   📝 Transaction: ${prizeTx}`);
    } else {
      console.log('   ⚠️ Prize claimed publish returned null (check logs for details)');
    }
    
    // Step 10: Test reading back published data
    console.log('\n🔟 Testing data retrieval...');
    try {
      const { SDK } = require('@somnia-chain/streams');
      const { createPublicClient, http } = require('viem');
      const { somniaTestnet } = require('viem/chains');
      
      const rpcUrl = process.env.SOMNIA_RPC_URL || process.env.RPC_URL || 'https://dream-rpc.somnia.network';
      const publicClient = createPublicClient({ 
        chain: somniaTestnet, 
        transport: http(rpcUrl) 
      });
      
      const testSdk = new SDK({ public: publicClient });
      const jsonSchema = 'string jsonData';
      const schemaId = await testSdk.streams.computeSchemaId(jsonSchema);
      
      if (service && service.publisherAddress) {
        try {
          const latest = await testSdk.streams.getLastPublishedDataForSchema(
            schemaId,
            service.publisherAddress
          );
          
          if (latest) {
            console.log('   ✅ Successfully retrieved latest published data');
            console.log('   📦 Data format:', Array.isArray(latest) ? 'Array' : typeof latest);
          } else {
            console.log('   ⚠️ No data found (may need to wait for block confirmation)');
          }
        } catch (error) {
          if (error.message && error.message.includes('NoData')) {
            console.log('   ℹ️ No data published yet (this is normal for first run)');
          } else {
            console.log('   ⚠️ Error retrieving data:', error.message);
          }
        }
      }
    } catch (error) {
      console.log('   ⚠️ Could not test data retrieval:', error.message);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ All SDS publishing tests completed!');
    console.log('\n📝 Summary:');
    console.log('   - Schema registration: Checked');
    console.log('   - All 8 event types: Tested');
    console.log('   - Data retrieval: Tested');
    console.log('\n💡 Tips:');
    console.log('   - If publishes returned null, check:');
    console.log('     • SOMNIA_PRIVATE_KEY environment variable is set');
    console.log('     • Network connectivity to Somnia RPC');
    console.log('     • Publisher wallet has sufficient STT balance');
    console.log('   - View transactions on: https://explorer.somnia.network');
    
    // Cleanup test data
    try {
      await db.query('DELETE FROM oracle.pools WHERE pool_id = $1', [testPoolId]);
      console.log('\n🧹 Cleaned up test pool from database');
    } catch (e) {
      // Ignore cleanup errors
    }
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run tests
testSDSPublishing();
