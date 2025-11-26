#!/usr/bin/env node

/**
 * MANUAL SLIP EVALUATION
 * Manually evaluate slips for cycle 1 to fix the data inconsistency
 */

const db = require('../db/db');
const UnifiedEvaluationService = require('../services/unified-evaluation-service');

async function manualSlipEvaluation() {
  console.log('🚀 Starting manual slip evaluation for cycle 1...');
  
  try {
    // Connect to database
    await db.connect();
    console.log('✅ Database connected successfully');
    
    // Create evaluation service
    const evaluationService = new UnifiedEvaluationService();
    
    // First, let's check the current state
    console.log('🔍 Checking current state...');
    const cycleCheck = await db.query(`
      SELECT cycle_id, is_resolved, evaluation_completed 
      FROM oracle.oddyssey_cycles 
      WHERE cycle_id = 1
    `);
    
    const slipCheck = await db.query(`
      SELECT slip_id, is_evaluated, correct_count, final_score 
      FROM oracle.oddyssey_slips 
      WHERE cycle_id = 1
    `);
    
    console.log('📊 Current state:');
    console.log(`   Cycle 1: resolved=${cycleCheck.rows[0]?.is_resolved}, evaluation_completed=${cycleCheck.rows[0]?.evaluation_completed}`);
    console.log(`   Slips: ${slipCheck.rows.length} total, ${slipCheck.rows.filter(s => s.is_evaluated).length} evaluated`);
    
    // Reset cycle evaluation status to force re-evaluation
    console.log('🔄 Resetting cycle evaluation status...');
    await db.query(`
      UPDATE oracle.oddyssey_cycles 
      SET evaluation_completed = FALSE 
      WHERE cycle_id = 1
    `);
    
    // Reset slip evaluation status
    console.log('🔄 Resetting slip evaluation status...');
    await db.query(`
      UPDATE oracle.oddyssey_slips 
      SET is_evaluated = FALSE, correct_count = NULL, final_score = NULL 
      WHERE cycle_id = 1
    `);
    
    // Now run the evaluation
    console.log('🎯 Running evaluation for cycle 1...');
    const result = await evaluationService.evaluateCompleteCycle(1);
    
    console.log('🎉 Manual slip evaluation completed!');
    console.log(`📊 Results: ${result.slipsEvaluated}/${result.totalSlips} slips evaluated`);
    
    // Verify the results
    const finalCheck = await db.query(`
      SELECT slip_id, is_evaluated, correct_count, final_score 
      FROM oracle.oddyssey_slips 
      WHERE cycle_id = 1
    `);
    
    console.log('✅ Final verification:');
    finalCheck.rows.forEach(slip => {
      console.log(`   Slip ${slip.slip_id}: evaluated=${slip.is_evaluated}, correct=${slip.correct_count}, score=${slip.final_score}`);
    });
    
  } catch (error) {
    console.error('❌ Manual slip evaluation failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  manualSlipEvaluation()
    .then(() => {
      console.log('✅ Manual slip evaluation completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Manual slip evaluation failed:', error.message);
      process.exit(1);
    });
}

module.exports = { manualSlipEvaluation };
