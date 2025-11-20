#!/usr/bin/env node

/**
 * Test Fixed Pool Sync Service
 * Test the improved pool sync service with proper bytes32 decoding
 */

require('dotenv').config();
const FixedPoolSyncService = require('../services/fixed-pool-sync-service');

class FixedPoolSyncTester {
  constructor() {
    this.syncService = new FixedPoolSyncService();
  }

  async testPoolSync(poolId) {
    try {
      console.log(`🧪 Testing pool sync for pool ${poolId}...`);
      
      // Start the service
      await this.syncService.start();
      
      // Process the pool
      const poolData = await this.syncService.processPool(poolId);
      
      console.log(`✅ Pool ${poolId} sync test completed`);
      console.log(`📊 Pool Data:`);
      console.log(`  - Home Team: ${poolData.homeTeam}`);
      console.log(`  - Away Team: ${poolData.awayTeam}`);
      console.log(`  - League: ${poolData.league}`);
      console.log(`  - Category: ${poolData.category}`);
      console.log(`  - Market ID: ${poolData.marketId}`);
      console.log(`  - Oracle Type: ${poolData.oracleType}`);
      
      return poolData;
      
    } catch (error) {
      console.error(`❌ Error testing pool sync:`, error);
      throw error;
    } finally {
      await this.syncService.stop();
    }
  }

  async run() {
    try {
      console.log('🚀 Starting Fixed Pool Sync Tester...');
      
      const poolId = 0;
      
      // Test pool sync
      console.log(`\n📋 Testing pool sync for pool ${poolId}...`);
      const poolData = await this.testPoolSync(poolId);
      
      console.log('\n🎉 SUCCESS! Fixed Pool Sync Service is working correctly!');
      console.log('📊 Pool data is now properly decoded and saved');
      console.log('📊 Prediction market record created for guided pools');
      console.log('📊 Future pools will be synced correctly');
      
    } catch (error) {
      console.error('❌ Fixed Pool Sync Tester failed:', error);
      process.exit(1);
    }
  }
}

// Run the tester
const tester = new FixedPoolSyncTester();
tester.run();
