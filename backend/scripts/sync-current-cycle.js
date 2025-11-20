#!/usr/bin/env node

/**
 * Script to sync current_oddyssey_cycle table with contract's current cycle
 * This ensures the database stays synchronized with the smart contract
 */

const Web3Service = require('../services/web3-service');
const db = require('../db/db');

async function syncCurrentCycle() {
  try {
    console.log('🔄 Starting current cycle synchronization...');
    
    // Get current cycle from contract
    const web3Service = new Web3Service();
    const contract = await web3Service.getOddysseyContract();
    const currentCycleId = await contract.dailyCycleId();
    
    console.log(`📊 Contract current cycle ID: ${currentCycleId}`);
    
    // Check what's currently in the database
    const currentDbResult = await db.query('SELECT cycle_id FROM oracle.current_oddyssey_cycle');
    const currentDbCycle = currentDbResult.rows[0]?.cycle_id;
    
    console.log(`📊 Database current cycle ID: ${currentDbCycle}`);
    
    if (currentDbCycle === currentCycleId.toString()) {
      console.log('✅ Current cycle is already synchronized');
      return;
    }
    
    // Check if the cycle exists in oddyssey_cycles table
    const cycleExistsResult = await db.query(
      'SELECT cycle_id FROM oracle.oddyssey_cycles WHERE cycle_id = $1',
      [parseInt(currentCycleId)]
    );
    
    if (cycleExistsResult.rows.length === 0) {
      console.log(`❌ Cycle ${currentCycleId} not found in oddyssey_cycles table`);
      console.log('💡 This might mean the cycle creation process failed');
      return;
    }
    
    // Update current_oddyssey_cycle table
    console.log(`🔄 Updating current_oddyssey_cycle to cycle ${currentCycleId}...`);
    
    await db.query('DELETE FROM oracle.current_oddyssey_cycle');
    
    const updateQuery = `
      INSERT INTO oracle.current_oddyssey_cycle (
        cycle_id, created_at, updated_at, matches_count, matches_data, 
        cycle_start_time, cycle_end_time, resolved_at, is_resolved, 
        tx_hash, resolution_tx_hash, resolution_data, ready_for_resolution, 
        resolution_prepared_at
      ) 
      SELECT 
        cycle_id, created_at, updated_at, matches_count, matches_data, 
        cycle_start_time, cycle_end_time, resolved_at, is_resolved, 
        tx_hash, resolution_tx_hash, resolution_data, ready_for_resolution, 
        resolution_prepared_at
      FROM oracle.oddyssey_cycles WHERE cycle_id = $1
    `;
    
    await db.query(updateQuery, [parseInt(currentCycleId)]);
    
    console.log(`✅ Successfully synchronized current_oddyssey_cycle to cycle ${currentCycleId}`);
    
    // Verify the update
    const verifyResult = await db.query('SELECT cycle_id FROM oracle.current_oddyssey_cycle');
    console.log(`✅ Verification: current_oddyssey_cycle now shows cycle ${verifyResult.rows[0].cycle_id}`);
    
  } catch (error) {
    console.error('❌ Error syncing current cycle:', error);
    process.exit(1);
  } finally {
    await db.end();
  }
}

// Run the sync
syncCurrentCycle();
