/**
 * Force Evaluate Cycle 5 Slips
 * 
 * This script manually triggers the evaluation for cycle 5
 */

const db = require('../db/db');
const UnifiedSlipEvaluationService = require('../services/unified-slip-evaluation-service');

async function forceEvaluateCycle5() {
  const service = new UnifiedSlipEvaluationService();
  
  try {
    console.log('🚀 Starting forced evaluation for Cycle 5...\n');
    
    // Check current status
    console.log('📊 Current Status:');
    const slips = await db.query(`
      SELECT slip_id, is_evaluated, correct_count
      FROM oracle.oddyssey_slips
      WHERE cycle_id = 5
    `);
    console.log(`Total slips: ${slips.rows.length}`);
    console.log(`Evaluated: ${slips.rows.filter(s => s.is_evaluated).length}`);
    console.log(`Unevaluated: ${slips.rows.filter(s => !s.is_evaluated).length}\n`);
    
    // Force evaluation
    console.log('🔧 Forcing evaluation...\n');
    const result = await service.evaluateCycle(5);
    
    console.log('\n✅ Evaluation complete!');
    console.log('Results:', result);
    
    // Check new status
    console.log('\n📊 New Status:');
    const newSlips = await db.query(`
      SELECT slip_id, is_evaluated, correct_count, tx_hash
      FROM oracle.oddyssey_slips
      WHERE cycle_id = 5
    `);
    console.log(`Total slips: ${newSlips.rows.length}`);
    console.log(`Evaluated: ${newSlips.rows.filter(s => s.is_evaluated).length}`);
    console.log(`Unevaluated: ${newSlips.rows.filter(s => !s.is_evaluated).length}`);
    
    console.log('\nSlip Details:');
    newSlips.rows.forEach(slip => {
      console.log(`  Slip ${slip.slip_id}: Evaluated=${slip.is_evaluated}, Correct=${slip.correct_count}/10, TX=${slip.tx_hash || 'None'}`);
    });
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Error during forced evaluation:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run
forceEvaluateCycle5();

