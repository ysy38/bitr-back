#!/usr/bin/env node

/**
 * CONTINUOUS SLIP EVALUATOR
 * Ensures slip evaluation never fails by running continuously
 */

const db = require('../db/db');
const UnifiedEvaluationService = require('./unified-evaluation-service');

class ContinuousSlipEvaluator {
  constructor() {
    this.serviceName = 'ContinuousSlipEvaluator';
    this.isRunning = false;
    this.evaluationInterval = null;
    this.evaluationService = new UnifiedEvaluationService();
  }

  async start() {
    if (this.isRunning) {
      console.log('🔄 ContinuousSlipEvaluator is already running');
      return;
    }

    this.isRunning = true;
    console.log('🚀 Starting ContinuousSlipEvaluator service...');

    // Connect to database
    await db.connect();
    console.log('✅ Database connected successfully');

    // Start continuous evaluation
    this.startContinuousEvaluation();

    console.log('✅ ContinuousSlipEvaluator started successfully');
  }

  async stop() {
    this.isRunning = false;
    
    if (this.evaluationInterval) {
      clearInterval(this.evaluationInterval);
      this.evaluationInterval = null;
    }
    
    console.log('🛑 ContinuousSlipEvaluator stopped');
  }

  startContinuousEvaluation() {
    // Evaluate slips every 5 minutes to ensure never fails
    this.evaluationInterval = setInterval(async () => {
      if (!this.isRunning) return;
      
      try {
        await this.evaluateAllPendingSlips();
      } catch (error) {
        console.error('❌ Error during continuous slip evaluation:', error);
        // Don't stop the service on error, just log and continue
      }
    }, 5 * 60 * 1000); // 5 minutes

    // Initial evaluation after 30 seconds
    setTimeout(() => {
      this.evaluateAllPendingSlips();
    }, 30000);
  }

  async evaluateAllPendingSlips() {
    console.log('🔍 ContinuousSlipEvaluator: Checking for pending slip evaluations...');

    try {
      // Find all resolved cycles with unevaluated slips
      const pendingCycles = await db.query(`
        SELECT DISTINCT c.cycle_id, c.is_resolved, c.evaluation_completed
        FROM oracle.oddyssey_cycles c
        JOIN oracle.oddyssey_slips s ON c.cycle_id = s.cycle_id
        WHERE c.is_resolved = TRUE 
        AND s.is_evaluated = FALSE
        ORDER BY c.cycle_id ASC
      `);

      if (pendingCycles.rows.length === 0) {
        console.log('✅ ContinuousSlipEvaluator: No pending evaluations');
        return;
      }

      console.log(`🎯 ContinuousSlipEvaluator: Found ${pendingCycles.rows.length} cycles with pending evaluations`);

      // Evaluate each cycle
      for (const cycle of pendingCycles.rows) {
        try {
          console.log(`🔧 ContinuousSlipEvaluator: Evaluating cycle ${cycle.cycle_id}...`);
          
          // Reset evaluation status to force re-evaluation
          await db.query(`
            UPDATE oracle.oddyssey_cycles 
            SET evaluation_completed = FALSE 
            WHERE cycle_id = $1
          `, [cycle.cycle_id]);

          // Run evaluation
          const result = await this.evaluationService.evaluateCompleteCycle(cycle.cycle_id);
          
          console.log(`✅ ContinuousSlipEvaluator: Cycle ${cycle.cycle_id} evaluated - ${result.slipsEvaluated}/${result.totalSlips} slips`);
          
        } catch (error) {
          console.error(`❌ ContinuousSlipEvaluator: Failed to evaluate cycle ${cycle.cycle_id}:`, error.message);
          // Continue with next cycle
        }
      }

    } catch (error) {
      console.error('❌ ContinuousSlipEvaluator: Error checking pending evaluations:', error);
    }
  }
}

// Auto-start when run directly
if (require.main === module) {
  const evaluator = new ContinuousSlipEvaluator();
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('🛑 Received SIGINT, shutting down ContinuousSlipEvaluator...');
    await evaluator.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('🛑 Received SIGTERM, shutting down ContinuousSlipEvaluator...');
    await evaluator.stop();
    process.exit(0);
  });

  // Start the service
  evaluator.start().catch(error => {
    console.error('❌ Failed to start ContinuousSlipEvaluator:', error);
    process.exit(1);
  });
}

module.exports = ContinuousSlipEvaluator;
