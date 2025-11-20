/**
 * Manual Resolution for Cycles 1 & 2
 * This script will read the prepared resolution_data and submit to blockchain
 */

require('dotenv').config({ path: '../.env' });
const db = require('../db/db');
const Web3Service = require('../services/web3-service');

async function resolveReadyCycles() {
  try {
    console.log('🔍 Checking for cycles ready for resolution...');
    
    // Find cycles that are prepared but not resolved
    const result = await db.query(`
      SELECT 
        cycle_id,
        resolution_data,
        matches_data
      FROM oracle.oddyssey_cycles
      WHERE ready_for_resolution = true
        AND is_resolved = false
      ORDER BY cycle_id ASC
    `);
    
    if (result.rows.length === 0) {
      console.log('ℹ️ No cycles ready for resolution');
      return;
    }
    
    console.log(`📋 Found ${result.rows.length} cycles ready for resolution`);
    
    const web3Service = new Web3Service();
    await web3Service.initialize();
    
    for (const cycle of result.rows) {
      try {
        console.log(`\n🎯 Resolving cycle ${cycle.cycle_id}...`);
        
        // Get resolution data
        const resolutionData = cycle.resolution_data;
        if (!resolutionData || !resolutionData.formattedResults) {
          console.error(`❌ Cycle ${cycle.cycle_id}: No formatted results found`);
          continue;
        }
        
        const formattedResults = resolutionData.formattedResults;
        console.log(`📊 Results for cycle ${cycle.cycle_id}:`, formattedResults);
        
        // Submit to blockchain
        console.log(`⛓️ Submitting cycle ${cycle.cycle_id} to blockchain...`);
        const tx = await web3Service.resolveDailyCycle(cycle.cycle_id, formattedResults);
        
        if (tx && tx.hash) {
          console.log(`✅ Transaction sent: ${tx.hash}`);
          
          // Wait for confirmation
          console.log('⏳ Waiting for confirmation...');
          const receipt = await tx.wait();
          
          if (receipt.status === 1) {
            console.log(`🎉 Cycle ${cycle.cycle_id} resolved successfully!`);
            
            // Update database
            await db.query(`
              UPDATE oracle.oddyssey_cycles
              SET 
                is_resolved = true,
                resolution_tx_hash = $1,
                resolved_at = NOW()
              WHERE cycle_id = $2
            `, [tx.hash, cycle.cycle_id]);
            
            console.log(`✅ Database updated for cycle ${cycle.cycle_id}`);
          } else {
            console.error(`❌ Transaction failed for cycle ${cycle.cycle_id}`);
          }
        } else {
          console.error(`❌ No transaction hash returned for cycle ${cycle.cycle_id}`);
        }
        
      } catch (error) {
        console.error(`❌ Failed to resolve cycle ${cycle.cycle_id}:`, error.message);
        
        // Check if it's a revert error
        if (error.message && error.message.includes('revert')) {
          console.error('   Contract reverted - check if cycle already resolved or data invalid');
        }
      }
    }
    
    console.log('\n✅ Resolution process complete!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error in resolution process:', error);
    process.exit(1);
  }
}

resolveReadyCycles();

