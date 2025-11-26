#!/usr/bin/env node

/**
 * Sync Cycle 4 Slips Script
 * 
 * Fetches all slips for cycle 4 from Oddyssey contract and syncs missing ones to the database.
 * Uses the same logic as the fixed event-driven-slip-sync service.
 * 
 * Usage:
 *   node scripts/sync-cycle-4-slips.js
 */

require('dotenv').config();
const db = require('../db/db');
const Web3Service = require('../services/web3-service');
const { safeStringify } = require('../utils/bigint-serializer');

class Cycle4SlipSync {
  constructor() {
    this.web3Service = new Web3Service();
    this.oddysseyContract = null;
    this.targetCycle = 4;
    this.stats = {
      totalSlips: 0,
      foundInContract: 0,
      existingInDb: 0,
      synced: 0,
      errors: 0
    };
  }

  async initialize() {
    console.log('🚀 Initializing Cycle 4 Slip Sync...');
    
    if (!this.web3Service.isInitialized) {
      await this.web3Service.initialize();
    }
    
    this.oddysseyContract = await this.web3Service.getOddysseyContract();
    if (!this.oddysseyContract) {
      throw new Error('Oddyssey contract not available');
    }
    
    console.log('✅ Web3 Service initialized');
  }

  /**
   * Serialize predictions data for database storage
   * Converts contract array format [matchId, betType, selection, selectedOdd] to object format
   */
  serializePredictions(predictions) {
    if (!Array.isArray(predictions)) {
      return [];
    }
    
    return predictions.map(prediction => {
      // Contract returns predictions as arrays: [matchId, betType, selection, selectedOdd]
      if (Array.isArray(prediction)) {
        return {
          matchId: prediction[0]?.toString() || '0',
          betType: prediction[1]?.toString() || '0',
          selection: prediction[2] || '',
          selectedOdd: prediction[3]?.toString() || '0'
        };
      }
      
      // If it's already an object, just convert BigInts
      if (typeof prediction === 'object' && prediction !== null) {
        const serialized = {};
        for (const [key, value] of Object.entries(prediction)) {
          if (typeof value === 'bigint') {
            serialized[key] = value.toString();
          } else {
            serialized[key] = value;
          }
        }
        return serialized;
      }
      
      return prediction;
    });
  }

  /**
   * Find all slip IDs for cycle 4
   */
  async findCycle4SlipIds() {
    try {
      console.log(`🔍 Finding all slips for cycle ${this.targetCycle}...`);
      
      // Get total slip count from contract
      const slipCount = await this.oddysseyContract.slipCount();
      const totalSlips = Number(slipCount);
      this.stats.totalSlips = totalSlips;
      
      console.log(`📊 Total slips in contract: ${totalSlips}`);
      
      const cycle4SlipIds = [];
      
      // Check all slips from 0 to totalSlips - 1
      console.log(`🔄 Scanning ${totalSlips} slips for cycle ${this.targetCycle}...`);
      
      for (let slipId = 0; slipId < totalSlips; slipId++) {
        try {
          const slipData = await this.oddysseyContract.getSlip(slipId);
          
          if (slipData && slipData.cycleId) {
            const cycleId = Number(slipData.cycleId);
            
            if (cycleId === this.targetCycle) {
              cycle4SlipIds.push(slipId);
              this.stats.foundInContract++;
              console.log(`  ✅ Found slip ${slipId} for cycle ${this.targetCycle} (player: ${slipData.player})`);
            }
          }
        } catch (error) {
          // Slip doesn't exist or other error, continue
          continue;
        }
      }
      
      console.log(`\n✅ Found ${cycle4SlipIds.length} slips for cycle ${this.targetCycle}`);
      return cycle4SlipIds;
      
    } catch (error) {
      console.error(`❌ Failed to find cycle 4 slips:`, error.message);
      throw error;
    }
  }

  /**
   * Save slip to database using the same logic as event-driven-slip-sync
   */
  async saveSlipToDatabase(slipData, slipId, cycleId, player, txHash = null) {
    try {
      // Check if slip already exists for this specific cycle
      const existingSlip = await db.query(
        'SELECT slip_id, cycle_id FROM oracle.oddyssey_slips WHERE slip_id = $1 AND cycle_id = $2',
        [slipId, cycleId]
      );

      if (existingSlip.rows.length > 0) {
        this.stats.existingInDb++;
        return { exists: true, slipId };
      }

      // Check if slip exists but for different cycle (data inconsistency)
      const conflictingSlip = await db.query(
        'SELECT slip_id, cycle_id FROM oracle.oddyssey_slips WHERE slip_id = $1',
        [slipId]
      );

      if (conflictingSlip.rows.length > 0) {
        const existingCycleId = conflictingSlip.rows[0].cycle_id;
        console.log(`⚠️ Slip ${slipId} exists but for cycle ${existingCycleId}, not ${cycleId}. This indicates data inconsistency.`);
        this.stats.errors++;
        return { error: true, reason: `Slip ${slipId} exists for cycle ${existingCycleId}, not ${cycleId}`, slipId };
      }

      // Parse slip data - Contract Slip struct: {player, cycleId, placedAt, predictions, finalScore, correctCount, isEvaluated}
      const parsedSlip = {
        slipId: Number(slipId),
        cycleId: Number(cycleId),
        playerAddress: player,
        predictions: this.serializePredictions(slipData.predictions || []),
        isEvaluated: slipData.isEvaluated || false,
        correctCount: Number(slipData.correctCount || 0),
        finalScore: slipData.finalScore?.toString() || '0',
        placedAt: new Date(Number(slipData.placedAt || 0) * 1000),
        txHash: txHash || null
      };

      // Check if cycle exists in database
      const cycleCheck = await db.query(
        'SELECT cycle_id FROM oracle.oddyssey_cycles WHERE cycle_id = $1',
        [parsedSlip.cycleId]
      );

      if (cycleCheck.rows.length === 0) {
        console.log(`⚠️ Cycle ${parsedSlip.cycleId} does not exist in database, skipping slip ${slipId}`);
        return { skipped: true, reason: 'Cycle not in database', slipId };
      }

      // Insert new slip
      await db.query(`
        INSERT INTO oracle.oddyssey_slips (
          slip_id, cycle_id, player_address, predictions, is_evaluated,
          final_score, correct_count, placed_at, tx_hash, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW()
        )
      `, [
        parsedSlip.slipId,
        parsedSlip.cycleId,
        parsedSlip.playerAddress,
        safeStringify(parsedSlip.predictions),
        parsedSlip.isEvaluated,
        parsedSlip.finalScore || '0',
        parsedSlip.correctCount || 0,
        parsedSlip.placedAt,
        parsedSlip.txHash
      ]);

      this.stats.synced++;
      return { synced: true, slipId };

    } catch (error) {
      console.error(`❌ Failed to save slip ${slipId}:`, error.message);
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Sync all cycle 4 slips
   */
  async syncCycle4Slips() {
    try {
      console.log('\n🔄 Starting cycle 4 slip sync...\n');
      
      // Find all slip IDs for cycle 4
      const cycle4SlipIds = await this.findCycle4SlipIds();
      
      if (cycle4SlipIds.length === 0) {
        console.log('ℹ️ No slips found for cycle 4 in contract');
        return;
      }
      
      console.log(`\n📥 Syncing ${cycle4SlipIds.length} slips to database...\n`);
      
      // Sync each slip
      for (const slipId of cycle4SlipIds) {
        try {
          console.log(`🔄 Processing slip ${slipId}...`);
          
          // Get slip data from contract
          const slipData = await this.oddysseyContract.getSlip(slipId);
          const cycleId = Number(slipData.cycleId);
          const player = slipData.player;
          
          // Save to database (no event, so no txHash)
          const result = await this.saveSlipToDatabase(slipData, slipId, cycleId, player);
          
          if (result.exists) {
            console.log(`  ⏭️ Slip ${slipId} already exists in database for cycle ${cycleId}`);
          } else if (result.skipped) {
            console.log(`  ⚠️ Slip ${slipId} skipped: ${result.reason}`);
          } else if (result.error) {
            console.log(`  ❌ Slip ${slipId} error: ${result.reason}`);
          } else if (result.synced) {
            console.log(`  ✅ Slip ${slipId} synced successfully`);
          }
          
        } catch (error) {
          console.error(`  ❌ Failed to sync slip ${slipId}:`, error.message);
        }
      }
      
      // Print summary
      console.log('\n' + '='.repeat(60));
      console.log('📊 SYNC SUMMARY');
      console.log('='.repeat(60));
      console.log(`Total slips in contract: ${this.stats.totalSlips}`);
      console.log(`Found for cycle ${this.targetCycle}: ${this.stats.foundInContract}`);
      console.log(`Already in database: ${this.stats.existingInDb}`);
      console.log(`✅ Newly synced: ${this.stats.synced}`);
      console.log(`❌ Errors: ${this.stats.errors}`);
      console.log('='.repeat(60) + '\n');
      
      if (this.stats.synced > 0) {
        console.log(`✅ Successfully synced ${this.stats.synced} slip(s) for cycle ${this.targetCycle}`);
      }
      
    } catch (error) {
      console.error('❌ Cycle 4 slip sync failed:', error);
      throw error;
    }
  }

  async close() {
    // Database connection is handled by db module
    // No explicit cleanup needed unless using connection pooling
  }
}

// Main execution
async function main() {
  const syncService = new Cycle4SlipSync();

  try {
    await syncService.initialize();
    await syncService.syncCycle4Slips();
    console.log('\n✅ Cycle 4 slip sync completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Cycle 4 slip sync failed:', error);
    process.exit(1);
  } finally {
    await syncService.close();
  }
}

if (require.main === module) {
  main();
}

module.exports = Cycle4SlipSync;

