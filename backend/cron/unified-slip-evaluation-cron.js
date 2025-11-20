#!/usr/bin/env node

require('dotenv').config({ path: '../.env' });
const UnifiedSlipEvaluationService = require('../services/unified-slip-evaluation-service');

/**
 * Unified Slip Evaluation Cron Job
 * 
 * This single cron job handles ALL slip evaluation logic in a coordinated workflow:
 * 1. Database-side evaluation (calculate correct predictions based on fixture results)
 * 2. On-chain evaluation (submit evaluations to the Oddyssey contract)
 * 3. Result synchronization (verify on-chain data matches database)
 * 
 * This replaces the separate auto-evaluation-cron.js and oddyssey-onchain-evaluation-cron.js
 * with a single, unified process that ensures data consistency across database and blockchain.
 * 
 * Scheduling:
 * - Managed by master-consolidated-cron.js (runs every 20 minutes via node-cron scheduler)
 * - Or run manually: node cron/unified-slip-evaluation-cron.js
 */

async function runUnifiedSlipEvaluationCron() {
  const startTime = new Date();
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🚀 [${startTime.toISOString()}] Starting Unified Slip Evaluation Cron Job...`);
  console.log(`${'='.repeat(80)}\n`);
  
  try {
    const evaluationService = new UnifiedSlipEvaluationService();
    
    // Get service status
    const status = evaluationService.getStatus();
    console.log(`📊 Service: ${status.serviceName}`);
    console.log(`📋 Description: ${status.description}`);
    console.log(`🔋 Batch Size: ${status.batchSize} slips\n`);
    
    // Run the unified evaluation process
    console.log(`${'─'.repeat(80)}`);
    console.log(`EVALUATION WORKFLOW`);
    console.log(`${'─'.repeat(80)}\n`);
    
    const result = await evaluationService.evaluateAllPendingSlips();
    
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`COMPLETION SUMMARY`);
    console.log(`${'─'.repeat(80)}`);
    console.log(`Total Slips Evaluated: ${result.evaluated}`);
    
    const endTime = new Date();
    const duration = endTime - startTime;
    console.log(`Duration: ${duration}ms`);
    console.log(`${'='.repeat(80)}\n`);
    
    console.log(`✅ Unified Slip Evaluation Cron Job Completed Successfully\n`);
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Unified Slip Evaluation Cron Job Failed:', error.message);
    console.error('Stack trace:', error.stack);
    
    // Log error for monitoring
    try {
      const db = require('../db/db');
      await db.query(`
        INSERT INTO oracle.system_alerts (alert_type, message, details, created_at)
        VALUES ('unified_slip_evaluation_error', $1, $2, NOW())
      `, [
        'Unified slip evaluation cron job failed',
        JSON.stringify({ error: error.message, stack: error.stack })
      ]);
    } catch (logError) {
      console.error('❌ Failed to log error to database:', logError.message);
    }
    
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runUnifiedSlipEvaluationCron().catch(console.error);
}

module.exports = runUnifiedSlipEvaluationCron;
