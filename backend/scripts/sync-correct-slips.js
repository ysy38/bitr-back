#!/usr/bin/env node

/**
 * Sync Correct Slips Script
 * 
 * Syncs the 2 slips from the CORRECT contract address to the database.
 * This fixes the issue where backend was using wrong contract address.
 */

require('dotenv').config();
const { ethers } = require('ethers');
const db = require('../db/db');
const config = require('../config');

async function syncCorrectSlips() {
  console.log('🚀 Syncing slips from CORRECT contract address...');
  
  try {
    // Use correct contract address
    const correctAddress = '0xD9E1f0c0D1105B03CE3ad6db1Ad36a4909EE733C';
    console.log(`📍 Using CORRECT contract address: ${correctAddress}`);
    
    // Connect to RPC
    let provider;
    try {
      provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
      await provider.getBlockNumber();
      console.log('✅ Primary RPC connected');
    } catch (error) {
      console.log('⚠️ Primary RPC failed, trying fallback...');
      provider = new ethers.JsonRpcProvider(config.blockchain.fallbackRpcUrl);
      await provider.getBlockNumber();
      console.log('✅ Fallback RPC connected');
    }
    
    // Load contract ABI
    const abiPath = require('path').join(__dirname, '../oddyssey-contract-abi.json');
    const abi = require(abiPath).abi;
    
    // Get contract instance
    const contract = new ethers.Contract(correctAddress, abi, provider);
    
    // Get current cycle and slip count
    const currentCycle = await contract.getCurrentCycle();
    const totalSlipCount = await contract.slipCount();
    
    console.log(`📊 Current cycle: ${currentCycle}`);
    console.log(`📋 Total slips: ${totalSlipCount}`);
    
    // Find and sync all slips
    const slipsToSync = [];
    for (let slipId = 0; slipId < Number(totalSlipCount); slipId++) {
      try {
        const slip = await contract.getSlip(slipId);
        if (slip && slip.cycleId) {
          const placedAt = new Date(Number(slip.placedAt) * 1000);
          const isToday = placedAt.toDateString() === new Date().toDateString();
          
          console.log(`✅ Found slip ${slipId}:`, {
            player: slip.player,
            cycleId: slip.cycleId.toString(),
            isEvaluated: slip.isEvaluated,
            correctCount: slip.correctCount.toString(),
            placedAt: placedAt.toISOString(),
            isToday: isToday
          });
          
          // Convert BigInt values to strings for JSON serialization
          const predictions = slip.predictions.map(pred => ({
            matchId: Number(pred.matchId),
            betType: Number(pred.betType),
            selection: pred.selection,
            selectedOdd: Number(pred.selectedOdd)
          }));
          
          slipsToSync.push({
            slipId,
            player: slip.player,
            cycleId: Number(slip.cycleId),
            predictions: predictions,
            totalOdds: Number(slip.totalOdds || 0),
            stake: Number(slip.stake || 0),
            isEvaluated: slip.isEvaluated,
            finalScore: Number(slip.finalScore),
            correctCount: Number(slip.correctCount),
            placedAt: placedAt
          });
        }
      } catch (error) {
        // Slip doesn't exist
        continue;
      }
    }
    
    console.log(`\n💾 Syncing ${slipsToSync.length} slips to database...`);
    
    for (const slip of slipsToSync) {
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
        
        // Insert slip using correct schema
        const query = `
          INSERT INTO oracle.oddyssey_slips (
            slip_id, player_address, cycle_id, predictions, 
            is_evaluated, final_score, correct_count, created_at, placed_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `;
        
        await db.query(query, [
          slip.slipId,
          slip.player,
          slip.cycleId,
          JSON.stringify(slip.predictions),
          slip.isEvaluated,
          slip.finalScore,
          slip.correctCount,
          slip.placedAt,
          slip.placedAt
        ]);
        
        console.log(`✅ Synced slip ${slip.slipId} to database`);
        
      } catch (error) {
        console.error(`❌ Failed to sync slip ${slip.slipId}:`, error);
      }
    }
    
    // Verify database
    const dbSlips = await db.query(
      'SELECT COUNT(*) as count FROM oracle.oddyssey_slips'
    );
    console.log(`\n✅ Database now has ${dbSlips.rows[0].count} total slips`);
    
    // Check today's slips specifically
    const todaySlips = await db.query(
      "SELECT slip_id, player_address, cycle_id, created_at FROM oracle.oddyssey_slips WHERE DATE(created_at) = CURRENT_DATE ORDER BY created_at"
    );
    console.log(`📅 Today's slips (${todaySlips.rows.length}):`);
    todaySlips.rows.forEach(slip => {
      console.log(`  - Slip ${slip.slip_id}: ${slip.player_address} (Cycle ${slip.cycle_id}) at ${slip.created_at}`);
    });
    
  } catch (error) {
    console.error('❌ Sync failed:', error);
    throw error;
  }
}

// Run the sync
async function main() {
  await syncCorrectSlips();
  process.exit(0);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { syncCorrectSlips };
