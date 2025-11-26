#!/usr/bin/env node

/**
 * Direct Contract Slip Inspector
 * 
 * Makes direct contract calls to find all slips for today's cycle.
 * This bypasses any database issues and queries the contract directly.
 */

require('dotenv').config();
const db = require('../db/db');
const Web3Service = require('../services/web3-service');

class ContractSlipInspector {
  constructor() {
    this.web3Service = new Web3Service();
    this.oddysseyContract = null;
  }

  async initialize() {
    console.log('🚀 Initializing Contract Slip Inspector...');
    
    if (!this.web3Service.isInitialized) {
      await this.web3Service.initialize();
    }
    
    // Use the correct contract address from config
    const config = require('../config');
    const correctAddress = config.blockchain.contractAddresses.oddyssey;
    console.log(`📍 Using correct Oddyssey address: ${correctAddress}`);
    
    this.oddysseyContract = await this.web3Service.getOddysseyContract();
    console.log('✅ Contract initialized');
  }

  async inspectCurrentCycle() {
    console.log('🔍 Inspecting current cycle...');
    
    try {
      // Get current cycle ID
      const currentCycle = await this.oddysseyContract.getCurrentCycle();
      console.log(`📊 Current cycle: ${currentCycle}`);
      
      // Get slip count for current cycle
      const slipCount = await this.oddysseyContract.getDailySlipCount(currentCycle);
      console.log(`📋 Slips in current cycle: ${slipCount}`);
      
      return {
        cycleId: Number(currentCycle),
        totalSlips: Number(slipCount)
      };
      
    } catch (error) {
      console.error('❌ Failed to get current cycle:', error);
      throw error;
    }
  }

  async findSlipsInCycle(cycleId) {
    console.log(`🔍 Searching for slips in cycle ${cycleId}...`);
    
    const foundSlips = [];
    const maxSlipId = 1000; // Check up to 1000 slip IDs
    
    for (let slipId = 0; slipId < maxSlipId; slipId++) {
      try {
        const slipData = await this.oddysseyContract.getSlip(slipId);
        
        if (slipData && slipData.cycleId && Number(slipData.cycleId) === cycleId) {
          console.log(`✅ Found slip ${slipId} for cycle ${cycleId}:`, {
            player: slipData.player,
            cycleId: slipData.cycleId.toString(),
            predictions: slipData.predictions,
            totalOdds: slipData.totalOdds.toString(),
            stake: slipData.stake.toString(),
            isEvaluated: slipData.isEvaluated,
            finalScore: slipData.finalScore.toString(),
            correctCount: slipData.correctCount.toString()
          });
          
          foundSlips.push({
            slipId,
            ...slipData
          });
        }
      } catch (error) {
        // Slip doesn't exist, continue
        if (slipId % 100 === 0) {
          console.log(`🔍 Checked ${slipId} slip IDs...`);
        }
        continue;
      }
    }
    
    return foundSlips;
  }

  async syncSlipsToDatabase(slips, cycleId) {
    console.log(`💾 Syncing ${slips.length} slips to database...`);
    
    for (const slip of slips) {
      try {
        // Check if slip already exists
        const existingSlip = await db.query(
          'SELECT slip_id FROM oracle.oddyssey_slips WHERE slip_id = $1',
          [slip.slipId]
        );
        
        if (existingSlip.rows.length > 0) {
          console.log(`⚠️ Slip ${slip.slipId} already exists in database`);
          continue;
        }
        
        // Insert slip
        const query = `
          INSERT INTO oracle.oddyssey_slips (
            slip_id, player_address, cycle_id, predictions, total_odds, 
            stake, is_evaluated, final_score, correct_count, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        `;
        
        await db.query(query, [
          slip.slipId,
          slip.player,
          Number(slip.cycleId),
          JSON.stringify(slip.predictions),
          Number(slip.totalOdds),
          Number(slip.stake),
          slip.isEvaluated,
          Number(slip.finalScore),
          Number(slip.correctCount)
        ]);
        
        console.log(`✅ Synced slip ${slip.slipId} to database`);
        
      } catch (error) {
        console.error(`❌ Failed to sync slip ${slip.slipId}:`, error);
      }
    }
  }

  async run() {
    try {
      await this.initialize();
      
      // Get current cycle info
      const cycleData = await this.inspectCurrentCycle();
      console.log(`\n📊 Current cycle: ${cycleData.cycleId}`);
      
      // Check current cycle and recent cycles
      const cyclesToCheck = [cycleData.cycleId, 1]; // Check current cycle and cycle 1
      
      for (const cycleId of cyclesToCheck) {
        console.log(`\n🔍 Checking cycle ${cycleId}...`);
        
        // Get slip count for this cycle
        try {
          const cycleSlipCount = await this.oddysseyContract.getDailySlipCount(cycleId);
          console.log(`📊 Cycle ${cycleId} has ${cycleSlipCount} slips according to contract`);
          
          if (Number(cycleSlipCount) > 0) {
            const slips = await this.findSlipsInCycle(cycleId);
            console.log(`🎯 Found ${slips.length} slips in cycle ${cycleId}`);
            
            if (slips.length > 0) {
              // Sync to database
              await this.syncSlipsToDatabase(slips, cycleId);
              
              // Verify database
              const dbSlips = await db.query(
                'SELECT COUNT(*) as count FROM oracle.oddyssey_slips WHERE cycle_id = $1',
                [cycleId]
              );
              console.log(`✅ Database now has ${dbSlips.rows[0].count} slips for cycle ${cycleId}`);
            }
          } else {
            console.log(`ℹ️ No slips in cycle ${cycleId}`);
          }
        } catch (error) {
          console.log(`⚠️ Could not check cycle ${cycleId}: ${error.message}`);
        }
      }
      
    } catch (error) {
      console.error('❌ Contract slip inspection failed:', error);
      throw error;
    }
  }
}

// Run the inspector
async function main() {
  const inspector = new ContractSlipInspector();
  await inspector.run();
  process.exit(0);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = ContractSlipInspector;
