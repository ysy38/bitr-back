const db = require('../db/db');

class SlipEvaluator {
  constructor() {
    this.isRunning = false;
    this.evaluationInterval = null;
  }

  async start() {
    if (this.isRunning) {
      console.log('SlipEvaluator is already running');
      return;
    }

    this.isRunning = true;
    console.log('🚀 Starting SlipEvaluator service...');

    // Connect to database
    await db.connect();

    // Start periodic evaluation
    this.startPeriodicEvaluation();

    console.log('✅ SlipEvaluator started successfully');
  }

  async stop() {
    this.isRunning = false;
    
    if (this.evaluationInterval) {
      clearInterval(this.evaluationInterval);
      this.evaluationInterval = null;
    }
    
    console.log('SlipEvaluator stopped');
  }

  startPeriodicEvaluation() {
    // Evaluate slips every 10 minutes
    this.evaluationInterval = setInterval(async () => {
      if (!this.isRunning) return;
      
      try {
        await this.evaluateSlips();
      } catch (error) {
        console.error('Error during slip evaluation:', error);
      }
    }, 10 * 60 * 1000); // 10 minutes

    // Initial evaluation after 30 seconds
    setTimeout(() => {
      this.evaluateSlips();
    }, 30000);
  }

  async evaluateSlips() {
    console.log('🔍 Checking for slips to evaluate...');

    try {
              // Find slips that need evaluation (all matches have results but slip not evaluated)
        const query = `
          SELECT 
            s.slip_id,
            s.player_address,
            s.placed_at,
            s.predictions,
            s.cycle_id
          FROM oracle.oddyssey_slips s
          JOIN oracle.oddyssey_cycles c ON s.cycle_id = c.cycle_id
          WHERE s.is_evaluated = FALSE
          AND c.is_resolved = TRUE
          ORDER BY s.placed_at ASC
          LIMIT 50
        `;

      const result = await db.query(query);
      const slipsToEvaluate = result.rows;

      if (slipsToEvaluate.length === 0) {
        console.log('No slips need evaluation');
        return;
      }

      console.log(`Found ${slipsToEvaluate.length} slips to evaluate`);

      for (const slip of slipsToEvaluate) {
        try {
          await this.evaluateSlip(slip.slip_id);
        } catch (error) {
          console.error(`Failed to evaluate slip ${slip.slip_id}:`, error);
        }
      }
    } catch (error) {
      console.error('❌ Failed to check for slips to evaluate:', error);
    }
  }

  async evaluateSlip(slipId) {
    console.log(`📊 Evaluating slip ${slipId}...`);

    try {
      await db.transaction(async (client) => {
        // Get slip with predictions and cycle data
        const slipQuery = `
          SELECT 
            s.slip_id,
            s.player_address,
            s.predictions,
            s.cycle_id,
            c.matches_data
          FROM oracle.oddyssey_slips s
          JOIN oracle.oddyssey_cycles c ON s.cycle_id = c.cycle_id
          WHERE s.slip_id = $1
        `;

        const slipResult = await client.query(slipQuery, [slipId]);
        if (slipResult.rows.length === 0) {
          throw new Error(`Slip ${slipId} not found`);
        }

        const slip = slipResult.rows[0];
        const predictions = slip.predictions || [];
        const matches = slip.matches_data || [];

        if (predictions.length === 0) {
          throw new Error(`No predictions found for slip ${slipId}`);
        }
        
        console.log(`📊 Slip ${slipId} has ${predictions.length} predictions`);

        let correctCount = 0;
        let finalScore = 1000; // Start with ODDS_SCALING_FACTOR like contract

        // Evaluate each prediction
        for (const prediction of predictions) {
          const isCorrect = await this.isPredictionCorrect(prediction, matches);
          
          if (isCorrect) {
            correctCount++;
            // FIXED: Multiply odds instead of adding fixed points
            const odds = prediction.selectedOdd || prediction.odds || 1000;
            finalScore = Math.floor((finalScore * odds) / 1000);
          }
        }
        
        // Set score to 0 if no correct predictions
        if (correctCount === 0) {
          finalScore = 0;
        }

        // Update slip with evaluation results
        await client.query(`
          UPDATE oracle.oddyssey_slips 
          SET 
            is_evaluated = TRUE,
              correct_count = $1, 
              final_score = $2
          WHERE slip_id = $3
        `, [correctCount, finalScore, slipId]);

        // Add reputation points based on performance
        if (correctCount >= 8) {
          await this.addReputationPoints(entries[0].user_address, 'EXCELLENT_PREDICTION', 50, 'slip', slipId);
        } else if (correctCount >= 6) {
          await this.addReputationPoints(entries[0].user_address, 'GOOD_PREDICTION', 20, 'slip', slipId);
        } else if (correctCount >= 5) {
          await this.addReputationPoints(entries[0].user_address, 'DECENT_PREDICTION', 10, 'slip', slipId);
        }

        console.log(`✅ Evaluated slip ${slipId}: ${correctCount}/10 correct, score: ${finalScore}`);

        // TODO: Also call on-chain evaluation
        // await this.callOnChainEvaluation(slipId);
      });

    } catch (error) {
      console.error(`❌ Failed to evaluate slip ${slipId}:`, error);
    }
  }

  async isPredictionCorrect(prediction, matches) {
    // Support both fixture_id and matchId naming
    const fixture_id = prediction.fixture_id || prediction.matchId;
    const betType = prediction.betType;
    const selection = prediction.selection;
    
    if (!fixture_id) {
      console.warn(`⚠️ No fixture_id/matchId in prediction:`, prediction);
      return false;
    }
    
    // Find the match in cycle data
    const match = matches.find(m => m.id == fixture_id);
    if (!match) {
      console.warn(`⚠️ Match ${fixture_id} not found in cycle data`);
      return false;
    }
    
    // Get actual result from fixture_results table
    const fixtureResult = await db.query(`
      SELECT home_score, away_score, outcome_1x2, outcome_ou25
      FROM oracle.fixture_results 
      WHERE fixture_id = $1
    `, [String(fixture_id)]);
    
    if (fixtureResult.rows.length === 0) {
      console.warn(`⚠️ No result found for fixture ${fixture_id}`);
      return false;
    }
    
    const result = fixtureResult.rows[0];
    const homeScore = result.home_score || 0;
    const awayScore = result.away_score || 0;
    
    // betType: 0 = 1X2 (moneyline), 1 = OU (over/under)
    if (betType === 0) {
      // Moneyline prediction - ALWAYS calculate from scores to ensure correctness
      const actualResult = this.getMoneylineResult(homeScore, awayScore);
      return selection === actualResult;
      
    } else if (betType === 1) {
      // Over/Under prediction - ALWAYS calculate from scores to ensure correctness
      const actualResult = (homeScore + awayScore > 2.5) ? 'Over' : 'Under';
      return selection === actualResult;
    }
    
    return false;
  }

  getMoneylineResult(homeScore, awayScore) {
    if (homeScore > awayScore) return '1';
    if (homeScore < awayScore) return '2';
    return 'X';
  }

  mapMoneylineOutcome(outcome1x2) {
    switch (outcome1x2) {
      case '1': return '1';
      case 'X': return 'X';
      case '2': return '2';
      default: return null;
    }
  }

  async addReputationPoints(userAddress, action, points, refType, refId) {
    try {
      await db.addReputationLog(userAddress, action, points, refType, refId);
    } catch (error) {
      console.error(`Failed to add reputation points for ${userAddress}:`, error);
    }
  }

  async updateLeaderboards() {
    console.log('🏆 Updating leaderboards...');

    try {
      // Update leaderboard for each resolved cycle
      const query = `
        SELECT DISTINCT cycle_id
        FROM oracle.oddyssey_slips
        WHERE is_evaluated = TRUE
        AND cycle_id IN (
          SELECT cycle_id FROM oracle.oddyssey_cycles WHERE is_resolved = TRUE
        )
        ORDER BY cycle_id DESC
        LIMIT 10
      `;

      const result = await db.query(query);
      const cycles = result.rows;

      for (const { cycle_id } of cycles) {
        await this.updateCycleLeaderboard(cycle_id);
      }
    } catch (error) {
      console.error('❌ Failed to update leaderboards:', error);
    }
  }

  async updateCycleLeaderboard(cycleId) {
    console.log(`🏆 Updating leaderboard for cycle ${cycleId}`);

    try {
      // Get top performers for the cycle
      const query = `
        SELECT 
          player_address,
          slip_id,
          final_score,
          correct_count,
          ROW_NUMBER() OVER (ORDER BY final_score DESC, correct_count DESC, placed_at ASC) as rank
        FROM oracle.oddyssey_slips
        WHERE cycle_id = $1 
        AND is_evaluated = TRUE
        AND final_score > 0
        ORDER BY final_score DESC, correct_count DESC, placed_at ASC
        LIMIT 10
      `;

      const result = await db.query(query, [cycleId]);
      const winners = result.rows.map(row => ({
        player_address: row.player_address,
        slip_id: row.slip_id,
        final_score: parseFloat(row.final_score),
        correct_count: row.correct_count,
        rank: row.rank
      }));

      // Update slip ranks
      for (const winner of winners) {
        await db.query(
          'UPDATE oracle.oddyssey_slips SET leaderboard_rank = $1 WHERE slip_id = $2',
          [winner.rank, winner.slip_id]
        );
      }

      console.log(`✅ Updated leaderboard for cycle ${cycleId} with ${winners.length} winners`);
    } catch (error) {
      console.error(`❌ Failed to update leaderboard for cycle ${cycleId}:`, error);
    }
  }

  async performHealthCheck() {
    try {
      // Check for stuck evaluations
      const query = `
        SELECT COUNT(*) as stuck_slips
        FROM oddyssey.slips s
        WHERE s.is_evaluated = FALSE
        AND s.game_date < CURRENT_DATE - INTERVAL '1 day'
      `;

      const result = await db.query(query);
      const stuckSlips = parseInt(result.rows[0]?.stuck_slips || 0);

      if (stuckSlips > 0) {
        console.log(`⚠️ Found ${stuckSlips} stuck slips (older than 1 day)`);
      }

      return { stuckSlips };
    } catch (error) {
      console.error('❌ Evaluator health check failed:', error);
      return { error: error.message };
    }
  }
}

// Initialize and export
const slipEvaluator = new SlipEvaluator();

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down SlipEvaluator gracefully...');
  await slipEvaluator.stop();
  await db.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down SlipEvaluator gracefully...');
  await slipEvaluator.stop();
  await db.disconnect();
  process.exit(0);
});

// Start if run directly
if (require.main === module) {
  slipEvaluator.start().catch(error => {
    console.error('Failed to start SlipEvaluator:', error);
    process.exit(1);
  });
}

module.exports = slipEvaluator; 