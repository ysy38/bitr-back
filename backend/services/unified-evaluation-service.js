const db = require('../db/db');
const CycleFormatNormalizer = require('./cycle-format-normalizer');

/**
 * Unified Evaluation Service
 * 
 * This service coordinates the complete evaluation pipeline:
 * 1. Calculate fixture outcomes when results are available
 * 2. Evaluate slips when cycles are resolved
 * 3. Ensure data consistency across all systems
 */
class UnifiedEvaluationService {
  constructor() {
    this.serviceName = 'UnifiedEvaluationService';
    this.formatNormalizer = new CycleFormatNormalizer();
  }

  /**
   * MAIN ENTRY POINT: Complete evaluation pipeline for a cycle
   */
  async evaluateCompleteCycle(cycleId) {
    console.log(`🎯 ${this.serviceName}: Starting complete evaluation for cycle ${cycleId}`);
    
    try {
      // Step 1: Ensure all fixture results have calculated outcomes
      const outcomeResults = await this.calculateFixtureOutcomes(cycleId);
      console.log(`✅ Calculated outcomes for ${outcomeResults.calculated} fixtures`);
      
      // Step 2: Evaluate all slips for this cycle
      const evaluationResults = await this.evaluateCycleSlips(cycleId);
      console.log(`✅ Evaluated ${evaluationResults.evaluated} slips`);
      
      // Step 3: Update cycle evaluation status
      await this.markCycleEvaluated(cycleId);
      
      return {
        success: true,
        cycleId,
        fixturesProcessed: outcomeResults.calculated,
        slipsEvaluated: evaluationResults.evaluated,
        totalSlips: evaluationResults.total
      };
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Error evaluating cycle ${cycleId}:`, error);
      throw error;
    }
  }

  /**
   * Step 1: Calculate outcomes for all fixture results in a cycle
   */
  async calculateFixtureOutcomes(cycleId) {
    try {
      // Get all match IDs for this cycle
      const cycleResult = await db.query(`
        SELECT matches_data FROM oracle.oddyssey_cycles WHERE cycle_id = $1
      `, [cycleId]);
      
      if (cycleResult.rows.length === 0) {
        throw new Error(`Cycle ${cycleId} not found`);
      }
      
      const matchesData = cycleResult.rows[0].matches_data || [];
      const fixtureIds = matchesData.map(match => match.id).filter(id => id);
      
      if (fixtureIds.length === 0) {
        console.log(`⚠️ No fixtures found for cycle ${cycleId}`);
        return { calculated: 0 };
      }
      
      console.log(`🔍 Processing ${fixtureIds.length} fixtures for cycle ${cycleId}`);
      
      // Calculate outcomes for all fixtures that have scores but missing outcomes
      const updateQuery = `
        UPDATE oracle.fixture_results 
        SET 
          outcome_1x2 = CASE 
            WHEN home_score > away_score THEN 'Home'
            WHEN home_score < away_score THEN 'Away'
            ELSE 'Draw'
          END,
          outcome_ou25 = CASE 
            WHEN (home_score + away_score) > 2.5 THEN 'Over'
            ELSE 'Under'
          END,
          evaluation_status = 'completed',
          evaluation_timestamp = NOW()
        WHERE fixture_id = ANY($1)
        AND home_score IS NOT NULL 
        AND away_score IS NOT NULL
        AND (outcome_1x2 IS NULL OR outcome_ou25 IS NULL)
      `;
      
      const result = await db.query(updateQuery, [fixtureIds]);
      
      // Also handle fixtures with missing away_score (set to 0)
      // IMPORTANT: Setting away_score = 0 is only for truly missing data (NULL)
      // A score of 0 is VALID (e.g., 0-0 is a valid Draw result)
      // This query only fixes NULL values, not actual 0 scores
      const fixMissingScores = `
        UPDATE oracle.fixture_results 
        SET away_score = 0
        WHERE fixture_id = ANY($1)
        AND home_score IS NOT NULL 
        AND away_score IS NULL  -- Only update if truly missing (NULL), not if it's 0
      `;
      
      await db.query(fixMissingScores, [fixtureIds]);
      
      // Recalculate outcomes for the fixed scores
      const recalculateResult = await db.query(updateQuery, [fixtureIds]);
      
      const totalCalculated = result.rowCount + recalculateResult.rowCount;
      
      console.log(`✅ Calculated outcomes for ${totalCalculated} fixtures in cycle ${cycleId}`);
      
      return { calculated: totalCalculated };
      
    } catch (error) {
      console.error(`❌ Error calculating fixture outcomes for cycle ${cycleId}:`, error);
      throw error;
    }
  }

  /**
   * Step 2: Evaluate all slips for a resolved cycle
   */
  async evaluateCycleSlips(cycleId) {
    try {
      // Get all slips for this cycle that need evaluation
      const slipsResult = await db.query(`
        SELECT slip_id, player_address, predictions, is_evaluated
        FROM oracle.oddyssey_slips 
        WHERE cycle_id = $1 AND is_evaluated = FALSE
        ORDER BY slip_id
      `, [cycleId]);
      
      if (slipsResult.rows.length === 0) {
        console.log(`✅ No slips need evaluation for cycle ${cycleId}`);
        return { evaluated: 0, total: 0 };
      }
      
      console.log(`📊 Evaluating ${slipsResult.rows.length} slips for cycle ${cycleId}`);
      
      let evaluatedCount = 0;
      
      for (const slip of slipsResult.rows) {
        try {
          // CRITICAL FIX: Check if slip is already being evaluated by another service
          // Do a fresh query to verify the slip is still unevaluated (race condition prevention)
          const slipCheckResult = await db.query(`
            SELECT is_evaluated FROM oracle.oddyssey_slips WHERE slip_id = $1
          `, [slip.slip_id]);
          
          if (slipCheckResult.rows.length === 0) {
            console.log(`⚠️ Slip ${slip.slip_id} not found, skipping...`);
            continue;
          }
          
          if (slipCheckResult.rows[0].is_evaluated) {
            console.log(`⏭️ Slip ${slip.slip_id} already evaluated by another service, skipping...`);
            continue;
          }
          
          const evaluation = await this.evaluateSingleSlip(slip.slip_id, slip.predictions, cycleId);
          
          // Update slip with evaluation results (atomic: only update if still not evaluated)
          const updateResult = await db.query(`
            UPDATE oracle.oddyssey_slips 
            SET 
              is_evaluated = TRUE,
              correct_count = $1,
              final_score = $2,
              leaderboard_rank = $3,
              updated_at = NOW()
            WHERE slip_id = $4 AND is_evaluated = FALSE
            RETURNING slip_id
          `, [evaluation.correctCount, evaluation.finalScore, evaluation.rank, slip.slip_id]);
          
          // If update failed (another service got there first), log and move on
          if (updateResult.rows.length === 0) {
            console.log(`⏭️ Slip ${slip.slip_id} was evaluated by another service, skipping database update...`);
            continue;
          }
          
          evaluatedCount++;
          console.log(`✅ Evaluated slip ${slip.slip_id}: ${evaluation.correctCount}/10 correct, score: ${evaluation.finalScore}`);
          
        } catch (error) {
          console.error(`❌ Failed to evaluate slip ${slip.slip_id}:`, error.message);
        }
      }
      
      return { evaluated: evaluatedCount, total: slipsResult.rows.length };
      
    } catch (error) {
      console.error(`❌ Error evaluating slips for cycle ${cycleId}:`, error);
      throw error;
    }
  }

  /**
   * Evaluate a single slip's predictions
   */
  async evaluateSingleSlip(slipId, predictions, cycleId) {
    try {
      if (!predictions || predictions.length === 0) {
        throw new Error(`No predictions found for slip ${slipId}`);
      }
      
      // FIXED: Normalize predictions to handle format inconsistencies
      const normalizedPredictions = this.formatNormalizer.normalizePredictions(predictions, cycleId);
      
      if (normalizedPredictions.length === 0) {
        throw new Error(`No valid predictions after normalization for slip ${slipId}`);
      }
      
      let correctCount = 0;
      let finalScore = 1000; // ROOT CAUSE FIX: Start with ODDS_SCALING_FACTOR like contract
      
      console.log(`📊 Evaluating slip ${slipId} with ${normalizedPredictions.length} normalized predictions`);
      
      // Evaluate each normalized prediction
      for (const prediction of normalizedPredictions) {
        const { matchId, betType, selection, selectedOdd, selectionHash } = prediction;
        
        // Get fixture result - always use CURRENT (90-minute) results
        const resultQuery = `
          SELECT home_score, away_score, outcome_1x2, outcome_ou25
          FROM oracle.fixture_results 
          WHERE fixture_id = $1
        `;
        
        const resultData = await db.query(resultQuery, [matchId]);
        
        if (resultData.rows.length === 0) {
          console.warn(`⚠️ No result found for match ${matchId}`);
          continue;
        }
        
        const result = resultData.rows[0];
        let isCorrect = false;
        
        // Use the normalizer to get the correct result field
        const resultField = this.formatNormalizer.getResultField(betType);
        let actualOutcome = result[resultField];
        
        // CRITICAL FIX: Normalize outcome abbreviations to contract format
        // Database may store: "Home"/"Draw"/"Away" or "1"/"X"/"2"
        // Database may store: "U"/"O" or "Under"/"Over"
        // Contract expects: "1"/"X"/"2" and "Over"/"Under"
        
        // Normalize 1X2 results
        if (actualOutcome === 'Home') {
          actualOutcome = '1';
        } else if (actualOutcome === 'Draw') {
          actualOutcome = 'X';
        } else if (actualOutcome === 'Away') {
          actualOutcome = '2';
        }
        
        // Normalize O/U results
        if (actualOutcome === 'U') {
          actualOutcome = 'Under';
        } else if (actualOutcome === 'O') {
          actualOutcome = 'Over';
        }
        
        // ENHANCED: Use normalized prediction data for consistent evaluation
        console.log(`  📊 Evaluating ${betType} prediction for match ${matchId}:`);
        console.log(`    Predicted: ${selection} (hash: ${selectionHash})`);
        console.log(`    Actual outcome: ${actualOutcome}`);
        
        // Compare prediction with actual outcome
        isCorrect = selection === actualOutcome;
        
        console.log(`    Result: ${isCorrect ? '✅ CORRECT' : '❌ WRONG'}`);
        
        if (isCorrect) {
          correctCount++;
          // FIXED: Use selectedOdd from normalized prediction
          finalScore = Math.floor((finalScore * selectedOdd) / 1000);
        }
      }
      
      // Update slip with evaluation results
      await db.query(`
        UPDATE oracle.oddyssey_slips 
        SET 
          is_evaluated = TRUE,
          correct_count = $1, 
          final_score = $2,
          updated_at = NOW()
        WHERE slip_id = $3
      `, [correctCount, finalScore, slipId]);
      
      console.log(`✅ Slip ${slipId} evaluated: ${correctCount}/10 correct, score: ${finalScore}`);
      
      return { correctCount, finalScore };
      
    } catch (error) {
      console.error(`❌ Error evaluating slip ${slipId}:`, error);
      throw error;
    }
  }

  /**
   * Get moneyline result (1, X, 2)
   */
  getMoneylineResult(homeScore, awayScore) {
    if (homeScore > awayScore) return '1';
    if (homeScore < awayScore) return '2';
    return 'X';
  }

  /**
   * Step 3: Mark cycle as fully evaluated
   */
  async markCycleEvaluated(cycleId) {
    try {
      await db.query(`
        UPDATE oracle.oddyssey_cycles 
        SET 
          evaluation_completed = TRUE,
          evaluation_completed_at = NOW()
        WHERE cycle_id = $1
      `, [cycleId]);
      
      console.log(`✅ Marked cycle ${cycleId} as fully evaluated`);
      
    } catch (error) {
      // Column might not exist, add it
      try {
        await db.query(`
          ALTER TABLE oracle.oddyssey_cycles 
          ADD COLUMN IF NOT EXISTS evaluation_completed BOOLEAN DEFAULT FALSE,
          ADD COLUMN IF NOT EXISTS evaluation_completed_at TIMESTAMPTZ
        `);
        
        // Retry the update
        await db.query(`
          UPDATE oracle.oddyssey_cycles 
          SET 
            evaluation_completed = TRUE,
            evaluation_completed_at = NOW()
          WHERE cycle_id = $1
        `, [cycleId]);
        
        console.log(`✅ Added evaluation columns and marked cycle ${cycleId} as evaluated`);
        
      } catch (alterError) {
        console.warn(`⚠️ Could not mark cycle ${cycleId} as evaluated:`, alterError.message);
      }
    }
  }

  /**
   * Auto-evaluate all resolved cycles that haven't been evaluated
   */
  async autoEvaluateAllResolvedCycles() {
    console.log(`🤖 ${this.serviceName}: Starting auto-evaluation of all resolved cycles`);
    
    try {
      // Find resolved cycles that haven't been fully evaluated
      // Use a simpler approach that works with existing schema
      const cyclesResult = await db.query(`
        SELECT DISTINCT c.cycle_id
        FROM oracle.oddyssey_cycles c
        JOIN oracle.oddyssey_slips s ON c.cycle_id = s.cycle_id
        WHERE c.is_resolved = TRUE 
        AND s.is_evaluated = FALSE
        ORDER BY c.cycle_id
      `);
      
      if (cyclesResult.rows.length === 0) {
        console.log(`✅ ${this.serviceName}: No resolved cycles need evaluation`);
        return { evaluatedCycles: 0, totalSlips: 0 };
      }
      
      console.log(`📊 ${this.serviceName}: Found ${cyclesResult.rows.length} cycles to evaluate`);
      
      let totalSlipsEvaluated = 0;
      let evaluatedCycles = 0;
      
      for (const row of cyclesResult.rows) {
        try {
          const result = await this.evaluateCompleteCycle(row.cycle_id);
          totalSlipsEvaluated += result.slipsEvaluated;
          evaluatedCycles++;
          
        } catch (error) {
          console.error(`❌ ${this.serviceName}: Error evaluating cycle ${row.cycle_id}:`, error.message);
        }
      }
      
      console.log(`🎉 ${this.serviceName}: Auto-evaluation completed - ${evaluatedCycles} cycles, ${totalSlipsEvaluated} slips evaluated`);
      
      return { evaluatedCycles, totalSlips: totalSlipsEvaluated };
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Error in auto-evaluation:`, error.message);
      throw error;
    }
  }

  /**
   * Trigger evaluation when a cycle is resolved (called by indexer)
   */
  async onCycleResolved(cycleId) {
    console.log(`🔔 ${this.serviceName}: Cycle ${cycleId} resolved - triggering evaluation`);
    
    try {
      // Wait a bit for all data to be consistent
      setTimeout(async () => {
        try {
          await this.evaluateCompleteCycle(cycleId);
          console.log(`✅ Auto-evaluation completed for cycle ${cycleId}`);
        } catch (error) {
          console.error(`❌ Auto-evaluation failed for cycle ${cycleId}:`, error.message);
        }
      }, 5000); // 5 second delay
      
    } catch (error) {
      console.error(`❌ Error triggering evaluation for cycle ${cycleId}:`, error);
    }
  }

  /**
   * Health check - verify evaluation system is working
   */
  async healthCheck() {
    try {
      // Check for unresolved cycles with slips
      const unresolvedResult = await db.query(`
        SELECT COUNT(DISTINCT c.cycle_id) as unresolved_cycles
        FROM oracle.oddyssey_cycles c
        JOIN oracle.oddyssey_slips s ON c.cycle_id = s.cycle_id
        WHERE c.is_resolved = FALSE
        AND c.cycle_end_time < NOW() - INTERVAL '2 hours'
      `);
      
      // Check for resolved cycles with unevaluated slips
      const unevaluatedResult = await db.query(`
        SELECT COUNT(DISTINCT c.cycle_id) as unevaluated_cycles
        FROM oracle.oddyssey_cycles c
        JOIN oracle.oddyssey_slips s ON c.cycle_id = s.cycle_id
        WHERE c.is_resolved = TRUE
        AND s.is_evaluated = FALSE
      `);
      
      const health = {
        status: 'healthy',
        unresolvedCycles: parseInt(unresolvedResult.rows[0].unresolved_cycles),
        unevaluatedCycles: parseInt(unevaluatedResult.rows[0].unevaluated_cycles),
        timestamp: new Date().toISOString()
      };
      
      if (health.unresolvedCycles > 0 || health.unevaluatedCycles > 0) {
        health.status = 'needs_attention';
        console.log(`⚠️ Evaluation health check: ${health.unevaluatedCycles} cycles need evaluation`);
      }
      
      return health;
      
    } catch (error) {
      console.error(`❌ Health check failed:`, error);
      return {
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = UnifiedEvaluationService;
