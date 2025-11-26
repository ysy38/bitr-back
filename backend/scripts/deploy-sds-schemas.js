#!/usr/bin/env node

/**
 * Deploy SDS Schemas to Production
 * Registers all data and event schemas on-chain
 */

const somniaDataStreams = require('../services/somnia-data-streams-service');

async function deploySchemas() {
  console.log('🚀 DEPLOYING SOMNIA DATA STREAMS SCHEMAS TO PRODUCTION\n');
  console.log('='.repeat(60));
  
  try {
    // Initialize SDS (this registers schemas)
    console.log('\n1️⃣ Initializing Somnia Data Streams...');
    await somniaDataStreams.initialize();
    
    console.log('\n2️⃣ Verifying schema registration...');
    
    // Check data schemas
    const dataSchemas = somniaDataStreams.schemaIds;
    const requiredDataSchemas = ['pool', 'bet', 'slip', 'poolProgress', 'reputation', 'liquidity', 'cycleResolved', 'slipEvaluated', 'prizeClaimed'];
    
    console.log('\n📊 Data Schemas:');
    for (const schema of requiredDataSchemas) {
      if (dataSchemas[schema]) {
        console.log(`   ✅ ${schema}: ${dataSchemas[schema]}`);
      } else {
        console.log(`   ❌ ${schema}: NOT REGISTERED`);
        throw new Error(`Data schema ${schema} not registered`);
      }
    }
    
    // Check event schemas
    const eventSchemas = somniaDataStreams.eventSchemaIds;
    const requiredEventSchemas = [
      { key: 'poolCreated', name: 'PoolCreated' },
      { key: 'poolSettled', name: 'PoolSettled' },
      { key: 'betPlaced', name: 'BetPlaced' },
      { key: 'reputationActionOccurred', name: 'ReputationActionOccurred' },
      { key: 'liquidityAdded', name: 'LiquidityAdded' },
      { key: 'cycleResolved', name: 'CycleResolved' },
      { key: 'slipEvaluated', name: 'SlipEvaluated' },
      { key: 'prizeClaimed', name: 'PrizeClaimed' }
    ];
    
    console.log('\n📡 Event Schemas:');
    for (const event of requiredEventSchemas) {
      if (eventSchemas[event.key] === event.name) {
        console.log(`   ✅ ${event.name}: Registered (string ID)`);
      } else {
        console.log(`   ❌ ${event.name}: NOT REGISTERED`);
        throw new Error(`Event schema ${event.name} not registered`);
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ ALL SCHEMAS DEPLOYED SUCCESSFULLY\n');
    console.log('📝 Summary:');
    console.log(`   - Data Schemas: ${requiredDataSchemas.length}/${requiredDataSchemas.length} registered`);
    console.log(`   - Event Schemas: ${requiredEventSchemas.length}/${requiredEventSchemas.length} registered`);
    console.log('\n🎉 PRODUCTION READY - Frontend can now subscribe\n');
    console.log('📡 Test with frontend:');
    console.log('   1. Deploy/restart backend on fly.io');
    console.log('   2. Frontend should connect to: wss://dream-rpc.somnia.network/ws');
    console.log('   3. Event schemas should be discoverable');
    console.log('='.repeat(60));
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ DEPLOYMENT FAILED:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run deployment
deploySchemas();

