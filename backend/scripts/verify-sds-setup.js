/**
 * Quick verification script for SDS setup
 * 
 * Verifies:
 * - Service initialization
 * - Schema registration
 * - Event schema registration
 * - Wallet identity
 * 
 * Usage: node scripts/verify-sds-setup.js
 */

const somniaDataStreams = require('../services/somnia-data-streams-service');

async function verifySetup() {
  console.log('\n🔍 Verifying Somnia Data Streams Setup\n');
  console.log('='.repeat(60));
  
  let allGood = true;
  
  try {
    // Initialize
    console.log('\n1️⃣ Initializing service...');
    await somniaDataStreams.initialize();
    
    if (!somniaDataStreams.isInitialized) {
      console.log('❌ Service not initialized');
      console.log('   Check SOMNIA_PRIVATE_KEY environment variable');
      return false;
    }
    console.log('✅ Service initialized');
    
    // Check SDK
    if (!somniaDataStreams.sdk) {
      console.log('❌ SDK not available');
      allGood = false;
    } else {
      console.log('✅ SDK available');
    }
    
    // Check data schemas
    console.log('\n2️⃣ Checking data schemas...');
    const schemaIds = somniaDataStreams.schemaIds;
    const requiredSchemas = [
      'pool', 'bet', 'slip', 'poolProgress', 
      'reputation', 'liquidity', 'cycleResolved', 
      'slipEvaluated', 'prizeClaimed'
    ];
    
    let missingSchemas = [];
    for (const schema of requiredSchemas) {
      if (!schemaIds[schema] || schemaIds[schema] === null) {
        missingSchemas.push(schema);
      }
    }
    
    if (missingSchemas.length > 0) {
      console.log(`❌ Missing schemas: ${missingSchemas.join(', ')}`);
      allGood = false;
    } else {
      console.log('✅ All data schemas registered');
    }
    
    // Check event schemas
    console.log('\n3️⃣ Checking event schemas...');
    const eventSchemaIds = somniaDataStreams.eventSchemaIds;
    const requiredEvents = [
      { key: 'poolCreated', name: 'PoolCreated' },
      { key: 'poolSettled', name: 'PoolSettled' },
      { key: 'betPlaced', name: 'BetPlaced' },
      { key: 'reputationActionOccurred', name: 'ReputationActionOccurred' },
      { key: 'liquidityAdded', name: 'LiquidityAdded' },
      { key: 'cycleResolved', name: 'CycleResolved' },
      { key: 'slipEvaluated', name: 'SlipEvaluated' },
      { key: 'prizeClaimed', name: 'PrizeClaimed' }
    ];
    
    let missingEvents = [];
    for (const event of requiredEvents) {
      // Check if event schema ID is a string (not null/undefined)
      if (!eventSchemaIds[event.key] || eventSchemaIds[event.key] !== event.name) {
        missingEvents.push(event.name);
      }
    }
    
    if (missingEvents.length > 0) {
      console.log(`❌ Missing event schemas: ${missingEvents.join(', ')}`);
      allGood = false;
    } else {
      console.log('✅ All event schemas registered');
    }
    
    // Summary
    console.log('\n' + '='.repeat(60));
    if (allGood) {
      console.log('✅ SDS Setup Verified - Ready to emit events!');
      console.log('\n📝 Next steps:');
      console.log('   - Run: node scripts/test-sds-event-emission.js');
      console.log('   - Check frontend can subscribe to events');
    } else {
      console.log('⚠️  SDS Setup Issues Found');
      console.log('\n📝 Troubleshooting:');
      console.log('   - Ensure SOMNIA_PRIVATE_KEY is set');
      console.log('   - Run: node scripts/register-sds-event-schemas.js');
      console.log('   - Check network connectivity to Somnia RPC');
    }
    console.log('='.repeat(60) + '\n');
    
    return allGood;
    
  } catch (error) {
    console.error('\n❌ Verification failed:', error.message);
    console.error('Stack:', error.stack);
    return false;
  }
}

verifySetup()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(console.error);

