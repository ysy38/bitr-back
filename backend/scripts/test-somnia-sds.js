/**
 * Test script for Somnia Data Streams integration
 * 
 * Tests:
 * 1. Service initialization
 * 2. Schema registration/checking
 * 3. Schema ID caching
 * 4. Publishing a test pool (if pool exists)
 */

const somniaDataStreams = require('../services/somnia-data-streams-service');
const db = require('../db/db');

async function testSDSIntegration() {
  console.log('\n🧪 Testing Somnia Data Streams Integration\n');
  console.log('='.repeat(60));

  try {
    // Test 1: Initialize service
    console.log('\n1️⃣ Testing service initialization...');
    await somniaDataStreams.initialize();
    
    if (somniaDataStreams.isInitialized) {
      console.log('✅ Service initialized successfully');
    } else {
      console.log('⚠️ Service not initialized (check private key)');
      return;
    }

    // Test 2: Check schema IDs
    console.log('\n2️⃣ Testing schema ID caching...');
    const schemaIds = somniaDataStreams.schemaIds;
    console.log('Schema IDs:', {
      pool: schemaIds.pool ? '✅' : '❌',
      bet: schemaIds.bet ? '✅' : '❌',
      slip: schemaIds.slip ? '✅' : '❌',
      poolProgress: schemaIds.poolProgress ? '✅' : '❌'
    });

    // Test 3: Try to publish a test pool (if one exists)
    console.log('\n3️⃣ Testing pool publishing...');
    try {
      const poolResult = await db.query(`
        SELECT pool_id FROM oracle.pools 
        ORDER BY pool_id DESC 
        LIMIT 1
      `);

      if (poolResult.rows.length > 0) {
        const testPoolId = poolResult.rows[0].pool_id;
        console.log(`📝 Attempting to publish pool ${testPoolId}...`);
        
        const tx = await somniaDataStreams.publishPool(testPoolId, null);
        
        if (tx) {
          console.log(`✅ Pool published successfully (tx: ${tx})`);
        } else {
          console.log('⚠️ Pool publish returned null (check logs for details)');
        }
      } else {
        console.log('ℹ️ No pools found in database to test publishing');
      }
    } catch (error) {
      console.error('❌ Pool publishing test failed:', error.message);
    }

    // Test 4: Test pool progress publishing
    console.log('\n4️⃣ Testing pool progress publishing...');
    try {
      const poolResult = await db.query(`
        SELECT pool_id FROM oracle.pools 
        WHERE is_settled = false
        ORDER BY pool_id DESC 
        LIMIT 1
      `);

      if (poolResult.rows.length > 0) {
        const testPoolId = poolResult.rows[0].pool_id;
        console.log(`📊 Attempting to publish progress for pool ${testPoolId}...`);
        
        const tx = await somniaDataStreams.publishPoolProgress(testPoolId);
        
        if (tx) {
          console.log(`✅ Pool progress published successfully (tx: ${tx})`);
        } else {
          console.log('⚠️ Pool progress publish returned null');
        }
      } else {
        console.log('ℹ️ No active pools found to test progress publishing');
      }
    } catch (error) {
      console.error('❌ Pool progress publishing test failed:', error.message);
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ SDS Integration Test Complete!\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    // Database connection is managed by the db module
    process.exit(0);
  }
}

// Run test
testSDSIntegration().catch(console.error);

