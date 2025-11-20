#!/usr/bin/env node

/**
 * MANUAL VERIFICATION
 * Cross-check slip predictions vs actual results
 */

const db = require('../db/db');

async function manualVerification() {
  console.log('🔍 Manual verification of slip predictions vs results...');
  
  try {
    await db.connect();
    
    // Get slip predictions
    const slipsResult = await db.query(`
      SELECT slip_id, predictions FROM oracle.oddyssey_slips WHERE cycle_id = 1 ORDER BY slip_id
    `);
    
    // Get all fixture results
    const resultsResult = await db.query(`
      SELECT fixture_id, home_score, away_score, outcome_1x2, outcome_ou25 
      FROM oracle.fixture_results 
      WHERE fixture_id IN ('19424934', '19427517', '19433527', '19467768', '19429254', '19431854', '19571045', '19585116', '19362241', '19571044')
      ORDER BY fixture_id
    `);
    
    // Create results lookup
    const resultsMap = {};
    resultsResult.rows.forEach(result => {
      resultsMap[result.fixture_id] = {
        home_score: result.home_score,
        away_score: result.away_score,
        outcome_1x2: result.outcome_1x2,
        outcome_ou25: result.outcome_ou25
      };
    });
    
    console.log('\n📊 MANUAL VERIFICATION RESULTS:\n');
    
    slipsResult.rows.forEach(slip => {
      console.log(`🎯 SLIP ${slip.slip_id}:`);
      console.log('='.repeat(50));
      
      let correctCount = 0;
      const predictions = slip.predictions || [];
      
      predictions.forEach((pred, index) => {
        const fixtureId = pred.matchId;
        const betType = pred.betType; // 0 = 1X2, 1 = OU
        const selection = pred.selection;
        const result = resultsMap[fixtureId];
        
        if (!result) {
          console.log(`❌ Match ${fixtureId}: NO RESULT FOUND`);
          return;
        }
        
        let actualOutcome;
        let isCorrect = false;
        
        if (betType === 0) {
          // 1X2 prediction
          actualOutcome = result.outcome_1x2;
          isCorrect = selection === actualOutcome;
        } else if (betType === 1) {
          // Over/Under prediction
          actualOutcome = result.outcome_ou25;
          isCorrect = selection === actualOutcome;
        }
        
        const status = isCorrect ? '✅ CORRECT' : '❌ WRONG';
        if (isCorrect) correctCount++;
        
        console.log(`   ${index + 1}. Match ${fixtureId}:`);
        console.log(`      Predicted: ${selection} (${betType === 0 ? '1X2' : 'OU'})`);
        console.log(`      Actual: ${actualOutcome} (${result.home_score}-${result.away_score})`);
        console.log(`      Result: ${status}`);
        console.log('');
      });
      
      console.log(`📈 SLIP ${slip.slip_id} SUMMARY: ${correctCount}/${predictions.length} correct`);
      console.log('='.repeat(50));
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Manual verification failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  manualVerification()
    .then(() => {
      console.log('✅ Manual verification completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Manual verification failed:', error.message);
      process.exit(1);
    });
}

module.exports = { manualVerification };
