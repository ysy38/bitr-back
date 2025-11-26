/**
 * Manual re-evaluation script for Slip #0
 * Run this after deploying the gas fix
 */

require('dotenv').config({ path: '../.env' });
const Web3Service = require('../services/web3-service');
const db = require('../db/db');

async function reEvaluateSlip0() {
  try {
    console.log('🔍 Re-evaluating Slip #0 with increased gas limit...');
    
    const web3Service = new Web3Service();
    await web3Service.initialize();
    
    // Slip ID = 0
    const slipId = 0;
    
    // Check if already evaluated on-chain
    const contract = await web3Service.getOddysseyContract();
    const slipData = await contract.getSlip(slipId);
    
    if (slipData.isEvaluated) {
      console.log(`✅ Slip ${slipId} already evaluated on-chain!`);
      console.log(`   Correct: ${slipData.correctCount}`);
      console.log(`   Score: ${slipData.finalScore}`);
      
      // Sync to database
      await db.query(`
        UPDATE oracle.oddyssey_slips
        SET 
          is_evaluated = true,
          correct_count = $1,
          final_score = $2,
          tx_hash = 'already-evaluated',
          updated_at = NOW()
        WHERE slip_id = $3
      `, [Number(slipData.correctCount), Number(slipData.finalScore), slipId]);
      
      console.log(`✅ Database synced`);
      process.exit(0);
      return;
    }
    
    console.log(`📊 Evaluating slip ${slipId}...`);
    
    // Evaluate with new gas settings (100% buffer)
    const result = await web3Service.evaluateSlip(slipId);
    
    if (result.success) {
      console.log(`✅ Slip ${slipId} evaluated successfully!`);
      console.log(`   Transaction: ${result.transactionHash}`);
      console.log(`   Correct: ${result.correctCount}`);
      console.log(`   Score: ${result.finalScore}`);
      
      // Update database
      await db.query(`
        UPDATE oracle.oddyssey_slips
        SET 
          is_evaluated = true,
          correct_count = $1,
          final_score = $2,
          tx_hash = $3,
          updated_at = NOW()
        WHERE slip_id = $4
      `, [result.correctCount, result.finalScore, result.transactionHash, slipId]);
      
      console.log(`✅ Database updated`);
    } else {
      console.error(`❌ Evaluation failed: ${result.error}`);
      process.exit(1);
    }
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

reEvaluateSlip0();

