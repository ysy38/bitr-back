#!/usr/bin/env node

/**
 * 🔍 INDEX MISSING TRANSACTION SCRIPT
 * 
 * This script manually indexes a specific transaction that was missed
 * by the regular indexing process.
 */

require('dotenv').config();
const { ethers } = require('ethers');
const db = require('../db/db');
const Web3Service = require('../services/web3-service');

async function indexMissingTransaction(txHash) {
  console.log(`🔍 Indexing missing transaction: ${txHash}`);
  
  const web3Service = new Web3Service();
  
  try {
    // Initialize web3 service
    await web3Service.initialize();
    
    // Get transaction receipt
    const receipt = await web3Service.provider.getTransactionReceipt(txHash);
    if (!receipt) {
      throw new Error(`Transaction ${txHash} not found`);
    }
    
    console.log(`📋 Transaction found in block ${receipt.blockNumber}`);
    console.log(`📋 Gas used: ${receipt.gasUsed.toString()}`);
    console.log(`📋 Status: ${receipt.status === 1 ? 'Success' : 'Failed'}`);
    
    if (receipt.status !== 1) {
      throw new Error('Transaction failed on blockchain');
    }
    
    // Get the contract
    const contract = await web3Service.getOddysseyContract();
    
    // Parse logs to find SlipPlaced event
    const slipPlacedEvents = receipt.logs
      .filter(log => log.address.toLowerCase() === contract.target.toLowerCase())
      .map(log => {
        try {
          return contract.interface.parseLog(log);
        } catch (error) {
          return null;
        }
      })
      .filter(event => event && event.name === 'SlipPlaced');
    
    if (slipPlacedEvents.length === 0) {
      throw new Error('No SlipPlaced events found in transaction');
    }
    
    console.log(`🎫 Found ${slipPlacedEvents.length} SlipPlaced event(s)`);
    
    // Process each SlipPlaced event
    for (const event of slipPlacedEvents) {
      const { cycleId, player, slipId } = event.args;
      
      console.log(`\n📝 Processing slip:`)
      console.log(`   Slip ID: ${slipId.toString()}`);
      console.log(`   Player: ${player}`);
      console.log(`   Cycle: ${cycleId.toString()}`);
      
      // Check if slip already exists
      const existingSlip = await db.query(
        'SELECT slip_id FROM oracle.oddyssey_slips WHERE slip_id = $1',
        [slipId.toString()]
      );
      
      if (existingSlip.rows.length > 0) {
        console.log(`   ⚠️ Slip ${slipId} already exists in database`);
        continue;
      }
      
      // Get slip data from contract
      let slipData = null;
      try {
        slipData = await contract.getSlip(slipId);
        console.log(`   ✅ Retrieved slip data from contract`);
      } catch (error) {
        console.warn(`   ⚠️ Could not retrieve slip data: ${error.message}`);
      }
      
      // Get block data for timestamp
      const block = await web3Service.provider.getBlock(receipt.blockNumber);
      
      // Prepare predictions data
      let predictions = [];
      if (slipData && slipData.predictions) {
        predictions = slipData.predictions.map(pred => ({
          matchId: Number(pred.matchId),
          betType: pred.betType === 0 ? 'MONEYLINE' : 'OVER_UNDER',
          selection: pred.selection,
          selectedOdd: Number(pred.selectedOdd),
          homeTeam: pred.homeTeam || '',
          awayTeam: pred.awayTeam || '',
          leagueName: pred.leagueName || ''
        }));
      }
      
      // Calculate total odds
      const totalOdds = predictions.reduce((total, pred) => {
        return total * (pred.selectedOdd / 1000);
      }, 1);
      
      // Insert slip into database (using actual schema)
      try {
        await db.query(`
          INSERT INTO oracle.oddyssey_slips (
            slip_id, 
            cycle_id, 
            player_address, 
            placed_at, 
            predictions,
            final_score,
            correct_count,
            is_evaluated,
            tx_hash,
            transaction_hash,
            creator_address,
            category,
            uses_bitr,
            creator_stake,
            odds,
            pool_id,
            notification_type,
            message,
            is_read
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $3, 'oddyssey', FALSE, 0.5, $10, $11, 'slip_placed', 'Your Oddyssey slip has been placed successfully', FALSE)
        `, [
          Number(slipId),           // bigint
          Number(cycleId),          // bigint  
          player,                   // text
          new Date(block.timestamp * 1000), // timestamp
          JSON.stringify(predictions), // jsonb
          slipData ? Number(slipData.finalScore) : 0, // numeric
          slipData ? Number(slipData.correctCount) : 0, // integer
          slipData ? slipData.isEvaluated : false, // boolean
          txHash,                   // text (tx_hash)
          totalOdds,                // numeric (odds)
          slipId.toString()         // text (pool_id)
        ]);
        
        console.log(`   ✅ Successfully indexed slip ${slipId}`);
        
        // Store the event for tracking
        await db.query(`
          INSERT INTO oracle.blockchain_events (
            block_number, transaction_hash, log_index, event_type, 
            contract_address, event_data, processed_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
          ON CONFLICT (block_number, transaction_hash, log_index, event_type) DO NOTHING
        `, [
          receipt.blockNumber,
          txHash,
          0, // log index - using 0 for simplicity
          'SlipPlaced',
          contract.target,
          JSON.stringify({ 
            cycleId: cycleId.toString(), 
            player, 
            slipId: slipId.toString(),
            manuallyIndexed: true
          })
        ]);
        
        console.log(`   ✅ Stored SlipPlaced event`);
        
      } catch (error) {
        console.error(`   ❌ Failed to index slip ${slipId}: ${error.message}`);
      }
    }
    
    // Verify the slip is now in the database
    console.log('\n🔍 Verifying indexed slips...');
    const slipsResult = await db.query(
      'SELECT slip_id, player_address, cycle_id, placed_at FROM oracle.oddyssey_slips WHERE tx_hash = $1',
      [txHash]
    );
    
    if (slipsResult.rows.length > 0) {
      console.log(`✅ Successfully indexed ${slipsResult.rows.length} slip(s):`);
      slipsResult.rows.forEach(slip => {
        console.log(`   - Slip ${slip.slip_id} by ${slip.player_address} in cycle ${slip.cycle_id}`);
      });
    } else {
      console.log('❌ No slips found in database after indexing');
    }
    
  } catch (error) {
    console.error('❌ Error indexing transaction:', error);
    throw error;
  } finally {
    await db.disconnect();
  }
}

// Main execution
async function main() {
  const txHash = process.argv[2];
  
  if (!txHash) {
    console.log('Usage: node index-missing-transaction.js <transaction_hash>');
    console.log('Example: node index-missing-transaction.js 0xa5b1fe42a64a95d6a97f0bdefa9cd3d496fb7e9647860dc08d6e74815c9c298f');
    process.exit(1);
  }
  
  if (!txHash.startsWith('0x') || txHash.length !== 66) {
    console.error('❌ Invalid transaction hash format');
    process.exit(1);
  }
  
  try {
    await indexMissingTransaction(txHash);
    console.log('\n🎉 Transaction indexing completed successfully!');
  } catch (error) {
    console.error('\n❌ Transaction indexing failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { indexMissingTransaction };
