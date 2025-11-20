/**
 * Script to register SDS event schemas on-chain
 * Run this once to ensure all event schemas are registered before frontend tries to subscribe
 * 
 * Usage: node scripts/register-sds-event-schemas.js
 */

const somniaDataStreams = require('../services/somnia-data-streams-service');

async function registerEventSchemas() {
  try {
    console.log('🚀 Initializing Somnia Data Streams service...');
    
    // Initialize the service
    await somniaDataStreams.initialize();
    
    if (!somniaDataStreams.isInitialized) {
      throw new Error('SDS service failed to initialize - check SOMNIA_PRIVATE_KEY environment variable');
    }
    
    console.log('✅ SDS service initialized');
    console.log('📝 Registering event schemas on-chain...');
    
    // Register event schemas (this will check which ones are already registered)
    await somniaDataStreams.registerEventSchemas();
    
    console.log('✅ Event schema registration complete!');
    console.log('\n📋 Registered event schemas:');
    console.log('   - PoolCreated');
    console.log('   - BetPlaced');
    console.log('   - PoolSettled');
    console.log('   - SlipPlaced');
    console.log('   - CycleResolved');
    console.log('   - SlipEvaluated');
    console.log('   - PrizeClaimed');
    console.log('   - ReputationActionOccurred');
    console.log('   - LiquidityAdded');
    console.log('\n✅ Frontend can now subscribe to these events via SDS');
    
  } catch (error) {
    console.error('❌ Failed to register event schemas:', error);
    process.exit(1);
  }
}

registerEventSchemas()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

