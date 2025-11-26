#!/usr/bin/env node

/**
 * Manual Slip Sync Script
 * 
 * Fetches ALL slips from Oddyssey contract and syncs them to the database.
 * Use this to catch up missed slips or fix sync issues.
 * 
 * Usage:
 *   node scripts/manual-slip-sync.js
 *   node scripts/manual-slip-sync.js --cycle 1  # Sync specific cycle
 */

require('dotenv').config();
const db = require('../db/db');
const Web3Service = require('../services/web3-service');

class ManualSlipSync {
  constructor() {
    this.web3Service = new Web3Service();
    this.oddysseyContract = null;
    this.stats = {
      found: 0,
      synced: 0,
      skipped: 0,
      errors: 0
    };
  }

  async initialize() {
    console.log('🚀 Initializing Manual Slip Sync...');
    
    if (!this.web3Service.isInitialized) {
      await this.web3Service.initialize();
    }
    
    this.oddysseyContract = await this.web3Service.getOddysseyContract();
    if (!this.oddysseyContract) {
      throw new Error('Oddyssey contract not available');
    }
    
    console.log('✅ Web3 Service initialized');
  }

  async syncAllSlips(specificCycle = null) {
    try {
      console.log('🔄 Starting manual slip sync...');
      
      // Get current cycle or use specific cycle
      let targetCycle;
      if (specificCycle !== null) {
        targetCycle = specificCycle;
        console.log(`🎯 Syncing slips for cycle ${targetCycle}`);
      } else {
        targetCycle = await this.oddysseyContract.currentCycle();
        console.log(`🎯 Current cycle: ${targetCycle}`);
      }

      // Get all slips for the cycle
      console.log(`📥 Fetching slips from contract for cycle ${targetCycle}...`);
      
      // Method 1: Try to get slips for all users in the cycle
      let slipIds = [];
      try {
        // Get all users who placed slips in this cycle
        // We'll need to iterate through potential slip IDs
        console.log(`🔍 Searching for slips in cycle ${targetCycle}...`);
        
        // Try to find slips by checking slip IDs from 0 to a reasonable range
        const maxSlipId = 100; // Check first 100 slip IDs
        for (let slipId = 0; slipId < maxSlipId; slipId++) {
          try {
            const slipData = await this.oddysseyContract.getSlip(slipId);
            if (slipData && slipData.cycleId && Number(slipData.cycleId) === targetCycle) {
              slipIds.push(slipId);
              console.log(`✅ Found slip ${slipId} for cycle ${targetCycle}`);
            }
          } catch (error) {
            // Slip doesn't exist, continue
            continue;
          }
        }
        
        console.log(`✅ Found ${slipIds.length} slips in cycle ${targetCycle}`);
        
      } catch (error) {
        console.error(`❌ Failed to get slips:`, error.message);
        throw error;
      }

      this.stats.found = slipIds.length;

      if (slipIds.length === 0) {
        console.log('ℹ️ No slips found to sync');
        return;
      }

      // Sync each slip
      for (const slipId of slipIds) {
        try {
          await this.syncSlip(slipId, targetCycle);
        } catch (error) {
          console.error(`❌ Failed to sync slip ${slipId}:`, error.message);
          this.stats.errors++;
        }
      }

      // Print summary
      console.log('\n📊 Sync Summary:');
      console.log(`   Found: ${this.stats.found}`);
      console.log(`   Synced: ${this.stats.synced}`);
      console.log(`   Skipped (existing): ${this.stats.skipped}`);
      console.log(`   Errors: ${this.stats.errors}`);

    } catch (error) {
      console.error('❌ Manual slip sync failed:', error);
      throw error;
    }
  }

  async syncSlip(slipId, cycleId) {
    try {
      console.log(`\n🔄 Processing slip ${slipId}...`);

      // Check if slip already exists
      const existingSlip = await db.query(
        'SELECT slip_id FROM oracle.oddyssey_slips WHERE slip_id = $1',
        [slipId]
      );

      if (existingSlip.rows.length > 0) {
        console.log(`⏭️ Slip ${slipId} already exists, skipping`);
        this.stats.skipped++;
        return;
      }

      // Get slip data from contract
      console.log(`📥 Fetching slip ${slipId} from contract...`);
      const slipData = await this.oddysseyContract.getSlip(slipId);
      
      // Get additional data
      const playerAddress = slipData.player || slipData.playerAddress;
      const predictions = slipData.predictions || [];
      
      console.log(`   Player: ${playerAddress}`);
      console.log(`   Predictions: ${predictions.length}`);
      console.log(`   Evaluated: ${slipData.isEvaluated || false}`);

      // Insert into database
      await db.query(`
        INSERT INTO oracle.oddyssey_slips (
          slip_id, cycle_id, player_address, predictions, 
          is_evaluated, final_score, correct_count,
          leaderboard_rank, prize_claimed, tx_hash,
          placed_at, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW(), NOW()
        )
      `, [
        Number(slipId),
        Number(cycleId),
        playerAddress,
        JSON.stringify(predictions),
        slipData.isEvaluated || false,
        slipData.finalScore || 0,
        slipData.correctCount || 0,
        slipData.leaderboardRank || null,
        slipData.prizeClaimed || false,
        slipData.txHash || null
      ]);

      console.log(`✅ Slip ${slipId} synced successfully`);
      this.stats.synced++;

    } catch (error) {
      console.error(`❌ Error syncing slip ${slipId}:`, error.message);
      throw error;
    }
  }

  async close() {
    await db.end();
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const cycleArg = args.find(arg => arg.startsWith('--cycle'));
  const specificCycle = cycleArg ? parseInt(cycleArg.split('=')[1]) : null;

  const syncService = new ManualSlipSync();

  try {
    await syncService.initialize();
    await syncService.syncAllSlips(specificCycle);
    console.log('\n✅ Manual slip sync completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Manual slip sync failed:', error);
    process.exit(1);
  } finally {
    await syncService.close();
  }
}

if (require.main === module) {
  main();
}

module.exports = ManualSlipSync;

