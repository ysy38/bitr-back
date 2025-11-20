#!/usr/bin/env node

/**
 * Fix Slip 1 Cycle Script
 * 
 * Updates slip 1 in the database to have the correct cycle 4 data from the contract.
 * This fixes the data inconsistency where slip 1 was saved with cycle 1 instead of cycle 4.
 * 
 * Usage:
 *   node scripts/fix-slip-1-cycle.js
 */

require('dotenv').config();
const db = require('../db/db');
const Web3Service = require('../services/web3-service');
const { safeStringify } = require('../utils/bigint-serializer');

class FixSlip1Cycle {
  constructor() {
    this.web3Service = new Web3Service();
    this.oddysseyContract = null;
  }

  async initialize() {
    console.log('🚀 Initializing Fix Slip 1 Cycle...');
    
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

  async fixSlip1Cycle() {
    try {
      console.log('\n🔄 Fixing slip 1 cycle data...\n');
      
      // Get slip 1 data from contract
      console.log('📥 Fetching slip 1 from contract...');
      const slipData = await this.oddysseyContract.getSlip(1);
      
      const contractCycleId = Number(slipData.cycleId);
      const player = slipData.player;
      const placedAt = new Date(Number(slipData.placedAt) * 1000);
      
      console.log(`Contract data:`);
      console.log(`  Cycle: ${contractCycleId}`);
      console.log(`  Player: ${player}`);
      console.log(`  PlacedAt: ${placedAt.toISOString()}`);
      console.log(`  Evaluated: ${slipData.isEvaluated}`);
      console.log(`  CorrectCount: ${slipData.correctCount}`);
      console.log(`  FinalScore: ${slipData.finalScore}`);
      
      // Check current database data
      console.log('\n📊 Checking current database data...');
      const currentData = await db.query(
        'SELECT slip_id, cycle_id, player_address, placed_at, is_evaluated, correct_count, final_score FROM oracle.oddyssey_slips WHERE slip_id = 1',
        []
      );
      
      if (currentData.rows.length === 0) {
        console.log('❌ Slip 1 not found in database');
        return;
      }
      
      const current = currentData.rows[0];
      console.log(`Database data:`);
      console.log(`  Cycle: ${current.cycle_id}`);
      console.log(`  Player: ${current.player_address}`);
      console.log(`  PlacedAt: ${current.placed_at}`);
      console.log(`  Evaluated: ${current.is_evaluated}`);
      console.log(`  CorrectCount: ${current.correct_count}`);
      console.log(`  FinalScore: ${current.final_score}`);
      
      // Check if update is needed
      if (Number(current.cycle_id) === contractCycleId) {
        console.log('\n✅ Slip 1 already has correct cycle data');
        return;
      }
      
      console.log(`\n⚠️ Data mismatch detected! Updating slip 1 from cycle ${current.cycle_id} to cycle ${contractCycleId}`);
      
      // Update slip 1 with correct cycle data
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
        WHERE slip_id = 1
      `, [
        contractCycleId,
        player,
        placedAt,
        slipData.isEvaluated || false,
        Number(slipData.correctCount || 0),
        slipData.finalScore?.toString() || '0',
        safeStringify(predictions)
      ]);
      
      console.log('\n✅ Slip 1 updated successfully!');
      
      // Verify the update
      console.log('\n🔍 Verifying update...');
      const updatedData = await db.query(
        'SELECT slip_id, cycle_id, player_address, placed_at, is_evaluated, correct_count, final_score FROM oracle.oddyssey_slips WHERE slip_id = 1',
        []
      );
      
      const updated = updatedData.rows[0];
      console.log(`Updated data:`);
      console.log(`  Cycle: ${updated.cycle_id}`);
      console.log(`  Player: ${updated.player_address}`);
      console.log(`  PlacedAt: ${updated.placed_at}`);
      console.log(`  Evaluated: ${updated.is_evaluated}`);
      console.log(`  CorrectCount: ${updated.correct_count}`);
      console.log(`  FinalScore: ${updated.final_score}`);
      
      console.log('\n✅ Fix completed successfully!');
      
    } catch (error) {
      console.error('❌ Fix failed:', error);
      throw error;
    }
  }

  async close() {
    // Database connection is handled by db module
  }
}

// Main execution
async function main() {
  const fixService = new FixSlip1Cycle();

  try {
    await fixService.initialize();
    await fixService.fixSlip1Cycle();
    console.log('\n✅ Slip 1 cycle fix completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Slip 1 cycle fix failed:', error);
    process.exit(1);
  } finally {
    await fixService.close();
  }
}

if (require.main === module) {
  main();
}

module.exports = FixSlip1Cycle;
