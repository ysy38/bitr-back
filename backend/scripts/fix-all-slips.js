#!/usr/bin/env node

/**
 * Fix All Slips Script
 * 
 * Updates all slips in the database to have correct cycle data and predictions format from the contract.
 * 
 * Usage:
 *   node scripts/fix-all-slips.js
 */

require('dotenv').config();
const db = require('../db/db');
const Web3Service = require('../services/web3-service');
const { safeStringify } = require('../utils/bigint-serializer');

class FixAllSlips {
  constructor() {
    this.web3Service = new Web3Service();
    this.oddysseyContract = null;
    this.stats = {
      total: 0,
      updated: 0,
      skipped: 0,
      errors: 0
    };
  }

  async initialize() {
    console.log('🚀 Initializing Fix All Slips...');
    
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

  async fixAllSlips() {
    try {
      console.log('\n🔄 Fixing all slips...\n');
      
      // Get total slip count from contract
      const slipCount = await this.oddysseyContract.slipCount();
      const totalSlips = Number(slipCount);
      this.stats.total = totalSlips;
      
      console.log(`📊 Total slips in contract: ${totalSlips}\n`);
      
      // Process each slip
      for (let slipId = 0; slipId < totalSlips; slipId++) {
        try {
          await this.fixSlip(slipId);
        } catch (error) {
          console.error(`  ❌ Failed to fix slip ${slipId}:`, error.message);
          this.stats.errors++;
        }
      }
      
      // Print summary
      console.log('\n' + '='.repeat(60));
      console.log('📊 FIX SUMMARY');
      console.log('='.repeat(60));
      console.log(`Total slips: ${this.stats.total}`);
      console.log(`✅ Updated: ${this.stats.updated}`);
      console.log(`⏭️ Skipped (already correct): ${this.stats.skipped}`);
      console.log(`❌ Errors: ${this.stats.errors}`);
      console.log('='.repeat(60) + '\n');
      
    } catch (error) {
      console.error('❌ Fix all slips failed:', error);
      throw error;
    }
  }

  async fixSlip(slipId) {
    console.log(`🔄 Processing slip ${slipId}...`);
    
    // Get slip data from contract
    const slipData = await this.oddysseyContract.getSlip(slipId);
    
    const contractCycleId = Number(slipData.cycleId);
    const player = slipData.player;
    const placedAt = new Date(Number(slipData.placedAt) * 1000);
    
    // Check current database data
    const currentData = await db.query(
      'SELECT slip_id, cycle_id, placed_at FROM oracle.oddyssey_slips WHERE slip_id = $1',
      [slipId]
    );
    
    if (currentData.rows.length === 0) {
      console.log(`  ⚠️ Slip ${slipId} not found in database, skipping`);
      this.stats.skipped++;
      return;
    }
    
    const current = currentData.rows[0];
    const dbCycleId = Number(current.cycle_id);
    
    // Check if update is needed
    const needsUpdate = dbCycleId !== contractCycleId;
    
    if (!needsUpdate) {
      console.log(`  ⏭️ Slip ${slipId} already has correct data (cycle ${contractCycleId})`);
      this.stats.skipped++;
      return;
    }
    
    console.log(`  ⚠️ Updating slip ${slipId}: cycle ${dbCycleId} → ${contractCycleId}`);
    
    // Update slip with correct data
    const predictions = this.serializePredictions(slipData.predictions || []);
    
    await db.query(`
      UPDATE oracle.oddyssey_slips 
      SET 
        cycle_id = $1,
        player_address = $2,
        placed_at = $3,
        is_evaluated = $4,
        correct_count = $5,
        final_score = $6,
        predictions = $7,
        updated_at = NOW()
      WHERE slip_id = $8
    `, [
      contractCycleId,
      player,
      placedAt,
      slipData.isEvaluated || false,
      Number(slipData.correctCount || 0),
      slipData.finalScore?.toString() || '0',
      safeStringify(predictions),
      slipId
    ]);
    
    console.log(`  ✅ Slip ${slipId} updated successfully`);
    this.stats.updated++;
  }

  async close() {
    // Database connection is handled by db module
  }
}

// Main execution
async function main() {
  const fixService = new FixAllSlips();

  try {
    await fixService.initialize();
    await fixService.fixAllSlips();
    console.log('\n✅ Fix all slips completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Fix all slips failed:', error);
    process.exit(1);
  } finally {
    await fixService.close();
  }
}

if (require.main === module) {
  main();
}

module.exports = FixAllSlips;


