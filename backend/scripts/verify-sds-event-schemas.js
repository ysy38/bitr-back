/**
 * Script to verify SDS event schemas are registered and accessible
 * 
 * Usage: node scripts/verify-sds-event-schemas.js
 */

const { SDK } = require('@somnia-chain/streams');
const { createPublicClient, http } = require('viem');
const { somniaTestnet } = require('viem/chains');

async function verifyEventSchemas() {
  try {
    console.log('🔍 Verifying SDS event schemas...');
    
    const rpcUrl = process.env.SOMNIA_RPC_URL || process.env.RPC_URL || 'https://dream-rpc.somnia.network';
    
    // Create public client (read-only, no wallet needed)
    const publicClient = createPublicClient({ 
      chain: somniaTestnet, 
      transport: http(rpcUrl) 
    });
    
    const sdk = new SDK({
      public: publicClient
    });
    
    const eventIds = [
      'PoolCreated', 
      'BetPlaced', 
      'PoolSettled', 
      'SlipPlaced',
      'CycleResolved',
      'SlipEvaluated',
      'PrizeClaimed',
      'ReputationActionOccurred',
      'LiquidityAdded'
    ];
    
    console.log(`\n📋 Checking ${eventIds.length} event schemas...\n`);
    
    try {
      const existingSchemas = await sdk.streams.getEventSchemasById(eventIds);
      
      let registeredCount = 0;
      let missingCount = 0;
      
      for (let i = 0; i < eventIds.length; i++) {
        const eventId = eventIds[i];
        const schema = existingSchemas[i];
        
        if (schema && schema.eventTopic) {
          console.log(`✅ ${eventId}: Registered`);
          console.log(`   Event Topic: ${schema.eventTopic}`);
          registeredCount++;
        } else {
          console.log(`❌ ${eventId}: NOT REGISTERED`);
          missingCount++;
        }
      }
      
      console.log(`\n📊 Summary:`);
      console.log(`   Registered: ${registeredCount}/${eventIds.length}`);
      console.log(`   Missing: ${missingCount}/${eventIds.length}`);
      
      if (missingCount > 0) {
        console.log(`\n⚠️ Some event schemas are missing!`);
        console.log(`   Run: node backend/scripts/register-sds-event-schemas.js`);
        process.exit(1);
      } else {
        console.log(`\n✅ All event schemas are registered and accessible!`);
        console.log(`   Frontend should be able to subscribe to these events.`);
      }
      
    } catch (error) {
      console.error(`❌ Error checking event schemas:`, error);
      console.error(`   This might mean the schemas aren't registered yet.`);
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Failed to verify event schemas:', error);
    process.exit(1);
  }
}

verifyEventSchemas()
  .then(() => {
    console.log('\n✅ Verification complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Verification failed:', error);
    process.exit(1);
  });

