const db = require('../db/db');
const Web3Service = require('./web3-service');
const UnifiedEvaluationService = require('./unified-evaluation-service');

/**
 * Unified Slip Evaluation Service
 * 
 * This service consolidates ALL slip evaluation logic into a single, coordinated process:
 * 1. Database-side evaluation (calculate correct predictions based on fixture results)
 * 2. On-chain evaluation (submit evaluations to the Oddyssey contract)
 * 3. Database synchronization (sync on-chain results back to database)
 * 
 * This replaces multiple separate evaluation services with a single source of truth.
 */
class UnifiedSlipEvaluationService {
  constructor() {
    this.serviceName = 'UnifiedSlipEvaluationService';
    this.web3Service = new Web3Service();
    this.unifiedEvalService = new UnifiedEvaluationService();
    this.isRunning = false;
    this.evaluationInterval = null;
    this.batchSize = 5; // Process 5 slips at a time to avoid gas limits
  }

  /**
   * Start the unified evaluation service
   */
  async start() {
    if (this.isRunning) {
      console.log(`⚠️ ${this.serviceName}: Already running`);
      return;
    }

    try {
      console.log(`🚀 Starting ${this.serviceName}...`);
      this.isRunning = true;
      
      // Check every 2 minutes for slips that need evaluation
      this.evaluationInterval = setInterval(async () => {
        if (!this.isRunning) return;
        try {
          await this.evaluateAllPendingSlips();
        } catch (error) {
          console.error(`❌ Error during unified evaluation:`, error.message);
        }
      }, 2 * 60 * 1000); // 2 minutes
      
      // Run initial check after 30 seconds
      setTimeout(async () => {
        try {
          await this.evaluateAllPendingSlips();
        } catch (error) {
          console.error(`❌ Error during initial evaluation check:`, error.message);
        }
      }, 30000);
      
      console.log(`✅ ${this.serviceName} started successfully`);
    } catch (error) {
      console.error(`❌ Failed to start ${this.serviceName}:`, error);
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Stop the unified evaluation service
   */
  async stop() {
    if (!this.isRunning) {
      console.log(`⚠️ ${this.serviceName}: Not running`);
      return;
    }

    try {
      console.log(`🛑 Stopping ${this.serviceName}...`);
      this.isRunning = false;
      
      if (this.evaluationInterval) {
        clearInterval(this.evaluationInterval);
        this.evaluationInterval = null;
      }
      
      console.log(`✅ ${this.serviceName} stopped successfully`);
    } catch (error) {
      console.error(`❌ Error stopping ${this.serviceName}:`, error);
      throw error;
    }
  }

  /**
   * Main entry point: Evaluate all pending slips in a coordinated workflow
   * 
   * WORKFLOW:
   * 1. Find all resolved cycles with unevaluated slips
   * 2. For each cycle:
   *    a. Evaluate slips in database (calculate correct predictions)
   *    b. Evaluate slips on-chain (submit to Oddyssey contract)
   *    c. Sync results back to database
   */
  async evaluateAllPendingSlips() {
    try {
      console.log(`🔍 ${this.serviceName}: Checking for pending slip evaluations...`);
      
      // Step 1: Find resolved cycles with unevaluated slips
      const pendingCycles = await db.query(`
        SELECT DISTINCT c.cycle_id, c.is_resolved, COUNT(s.slip_id) as unevaluated_count
        FROM oracle.oddyssey_cycles c
        JOIN oracle.oddyssey_slips s ON c.cycle_id = s.cycle_id
        WHERE c.is_resolved = true 
          AND s.is_evaluated = false
          AND c.resolution_tx_hash IS NOT NULL
        GROUP BY c.cycle_id, c.is_resolved
        ORDER BY c.cycle_id ASC
      `);

      if (pendingCycles.rows.length === 0) {
        console.log(`✅ No pending slip evaluations`);
        return { evaluated: 0, total: 0 };
      }

      console.log(`📊 Found ${pendingCycles.rows.length} cycles with pending evaluations`);

      let totalEvaluated = 0;

      // Step 2: Process each cycle
      for (const cycle of pendingCycles.rows) {
        try {
          console.log(`\n🎯 Processing cycle ${cycle.cycle_id} (${cycle.unevaluated_count} unevaluated slips)...`);
          
          const result = await this.evaluateCycle(cycle.cycle_id);
          totalEvaluated += result.evaluated;
          
        } catch (error) {
          console.error(`❌ Failed to process cycle ${cycle.cycle_id}:`, error.message);
          // Continue with next cycle
        }
      }

      console.log(`\n✅ Unified evaluation completed: ${totalEvaluated} slips evaluated`);
      return { evaluated: totalEvaluated };

    } catch (error) {
      console.error(`❌ Error in evaluateAllPendingSlips:`, error);
      throw error;
    }
  }

  /**
   * Evaluate a complete cycle (database + on-chain)
   */
  async evaluateCycle(cycleId) {
    try {
      console.log(`\n📋 CYCLE ${cycleId} - Starting unified evaluation...`);

      // STEP 1: Database Evaluation (calculate correct predictions)
      console.log(`\n1️⃣ DATABASE EVALUATION - Calculating correct predictions...`);
      const dbResult = await this.unifiedEvalService.evaluateCompleteCycle(cycleId);
      
      if (!dbResult.success) {
        throw new Error(`Database evaluation failed: ${dbResult.error}`);
      }

      console.log(`✅ Database evaluation complete: ${dbResult.slipsEvaluated}/${dbResult.totalSlips} slips evaluated`);

      // STEP 2: On-Chain Evaluation (submit to contract)
      console.log(`\n2️⃣ ON-CHAIN EVALUATION - Submitting to Oddyssey contract...`);
      const onchainResult = await this.evaluateCycleOnChain(cycleId);

      console.log(`✅ On-chain evaluation complete: ${onchainResult.evaluated} slips submitted to contract`);

      // STEP 3: Sync Results (verify on-chain data matches database)
      console.log(`\n3️⃣ RESULT SYNCHRONIZATION - Verifying on-chain data...`);
      const syncResult = await this.syncOnChainResults(cycleId);

      console.log(`✅ Synchronization complete: ${syncResult.synced} slips verified`);

      return {
        evaluated: onchainResult.evaluated,
        dbEvaluated: dbResult.slipsEvaluated,
        onchainSubmitted: onchainResult.evaluated,
        synced: syncResult.synced
      };

    } catch (error) {
      console.error(`❌ Error evaluating cycle ${cycleId}:`, error.message);
      throw error;
    }
  }

  /**
   * Step 2: Evaluate slips on-chain and submit to contract
   */
  async evaluateCycleOnChain(cycleId) {
    try {
      // Get all evaluated slips that haven't been submitted on-chain yet
      const slipsToEvaluate = await db.query(`
        SELECT slip_id, correct_count, final_score, tx_hash
        FROM oracle.oddyssey_slips
        WHERE cycle_id = $1 
          AND is_evaluated = true
          AND (tx_hash IS NULL OR tx_hash = 'auto-evaluated')
        ORDER BY slip_id ASC
        LIMIT 100
      `, [cycleId]);

      if (slipsToEvaluate.rows.length === 0) {
        console.log(`✅ No slips need on-chain evaluation for cycle ${cycleId}`);
        return { evaluated: 0 };
      }

      console.log(`📊 Found ${slipsToEvaluate.rows.length} slips ready for on-chain evaluation`);

      let evaluatedCount = 0;

      // Process in batches to avoid gas limits
      for (let i = 0; i < slipsToEvaluate.rows.length; i += this.batchSize) {
        const batch = slipsToEvaluate.rows.slice(i, i + this.batchSize);
        
        console.log(`\n  🔄 Evaluating batch ${Math.floor(i / this.batchSize) + 1}/${Math.ceil(slipsToEvaluate.rows.length / this.batchSize)} (${batch.length} slips)...`);
        
        for (const slip of batch) {
          try {
            const result = await this.evaluateSlipOnChain(slip.slip_id);
            
            if (result.success) {
              evaluatedCount++;
              console.log(`    ✅ Slip ${slip.slip_id}: ${result.correctCount}/10 correct`);
            } else {
              console.warn(`    ⚠️ Slip ${slip.slip_id}: ${result.error}`);
            }
            
            // Small delay between submissions to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 1000));
            
          } catch (error) {
            console.error(`    ❌ Failed to evaluate slip ${slip.slip_id}:`, error.message);
          }
        }

        // Delay between batches
        if (i + this.batchSize < slipsToEvaluate.rows.length) {
          console.log(`  ⏳ Waiting before next batch...`);
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }

      return { evaluated: evaluatedCount };

    } catch (error) {
      console.error(`❌ Error evaluating cycle on-chain:`, error);
      throw error;
    }
  }

  /**
   * Evaluate a single slip on-chain
   */
  async evaluateSlipOnChain(slipId) {
    try {
      // Check if already evaluated on-chain
      const contract = await this.web3Service.getOddysseyContract();
      const slipData = await contract.getSlip(slipId);
      
      if (slipData.isEvaluated) {
        console.log(`    ℹ️ Slip ${slipId} already evaluated on-chain`);
        
        // Update database to mark as submitted
        await db.query(`
          UPDATE oracle.oddyssey_slips 
          SET tx_hash = 'on-chain-evaluated'
          WHERE slip_id = $1 AND tx_hash IS NULL
        `, [slipId]);
        
        return { success: true, correctCount: Number(slipData.correctCount) };
      }

      // Submit evaluation to contract
      const result = await this.web3Service.evaluateSlip(slipId);
      
      if (!result.success) {
        return { success: false, error: result.error };
      }

      // Update database with transaction hash
      await db.query(`
        UPDATE oracle.oddyssey_slips 
        SET tx_hash = $1
        WHERE slip_id = $2
      `, [result.transactionHash, slipId]);

      return { success: true, transactionHash: result.transactionHash, correctCount: result.correctCount };

    } catch (error) {
      console.error(`❌ Error evaluating slip ${slipId} on-chain:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Step 3: Sync on-chain results back to database
   */
  async syncOnChainResults(cycleId) {
    try {
      // Get all evaluated slips from contract and verify they match database
      const evaluatedSlips = await db.query(`
        SELECT slip_id, correct_count, final_score, is_evaluated
        FROM oracle.oddyssey_slips
        WHERE cycle_id = $1 AND is_evaluated = true
        ORDER BY slip_id
      `, [cycleId]);

      if (evaluatedSlips.rows.length === 0) {
        console.log(`✅ No slips to sync for cycle ${cycleId}`);
        return { synced: 0 };
      }

      console.log(`📊 Verifying ${evaluatedSlips.rows.length} evaluated slips...`);

      let syncedCount = 0;
      const contract = await this.web3Service.getOddysseyContract();

      for (const slip of evaluatedSlips.rows) {
        try {
          const slipData = await contract.getSlip(slip.slip_id);
          
          const dbCorrectCount = slip.correct_count;
          const onchainCorrectCount = Number(slipData.correctCount);
          
          if (dbCorrectCount === onchainCorrectCount) {
            syncedCount++;
            console.log(`    ✅ Slip ${slip.slip_id}: Verified (${dbCorrectCount}/10 correct)`);
          } else {
            console.warn(`    ⚠️ Slip ${slip.slip_id}: Mismatch! DB=${dbCorrectCount}, On-Chain=${onchainCorrectCount}`);
            
            // If there's a mismatch, update database to match on-chain (source of truth)
            if (onchainCorrectCount > 0) {
              await db.query(`
                UPDATE oracle.oddyssey_slips 
                SET correct_count = $1, final_score = $2, updated_at = NOW()
                WHERE slip_id = $3
              `, [onchainCorrectCount, Number(slipData.finalScore), slip.slip_id]);
              
              console.log(`    🔄 Updated database to match on-chain results`);
              syncedCount++;
            }
          }
        } catch (error) {
          console.warn(`    ⚠️ Failed to verify slip ${slip.slip_id}:`, error.message);
        }
      }

      return { synced: syncedCount };

    } catch (error) {
      console.error(`❌ Error syncing on-chain results:`, error);
      throw error;
    }
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      serviceName: this.serviceName,
      isRunning: this.isRunning,
      batchSize: this.batchSize,
      description: 'Unified slip evaluation: Database + On-Chain + Synchronization'
    };
  }
}

module.exports = UnifiedSlipEvaluationService;
