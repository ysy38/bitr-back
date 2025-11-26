const db = require('../db/db');

/**
 * 🔧 FIX ODYSSEY JSON STORAGE FORMAT
 * 
 * This script fixes the predictions data format to be frontend-ready
 * and adds the missing /results/all endpoint
 */

async function fixPredictionsFormat() {
  try {
    console.log('🔧 FIXING PREDICTIONS JSON FORMAT...');
    
    // Get all slips with predictions
    const slipsResult = await db.query(`
      SELECT 
        slip_id,
        cycle_id,
        predictions,
        is_evaluated,
        final_score,
        correct_count
      FROM oracle.oddyssey_slips
      WHERE predictions IS NOT NULL
      ORDER BY slip_id
    `);
    
    console.log(`📊 Found ${slipsResult.rows.length} slips to process`);
    
    for (const slip of slipsResult.rows) {
      try {
        const predictions = slip.predictions;
        
        // Skip if already in correct format (object with proper structure)
        if (Array.isArray(predictions) && predictions.length > 0) {
          const firstPred = predictions[0];
          
          // Check if it's already in the correct format
          if (typeof firstPred === 'object' && firstPred.matchId) {
            console.log(`   ✅ Slip ${slip.slip_id} already in correct format`);
            continue;
          }
          
          // Convert array format to object format
          const convertedPredictions = predictions.map((pred, index) => {
            if (Array.isArray(pred) && pred.length >= 7) {
              return {
                matchId: parseInt(pred[0]) || 0,
                betType: parseInt(pred[1]) || 0,
                selection: pred[2] || '',
                odds: parseFloat(pred[3]) || 0,
                homeTeam: pred[4] || '',
                awayTeam: pred[5] || '',
                league: pred[6] || '',
                predictionIndex: index
              };
            }
            return {
              matchId: 0,
              betType: 0,
              selection: '',
              odds: 0,
              homeTeam: '',
              awayTeam: '',
              league: '',
              predictionIndex: index
            };
          });
          
          // Update the slip with converted predictions
          await db.query(`
            UPDATE oracle.oddyssey_slips 
            SET predictions = $1
            WHERE slip_id = $2
          `, [JSON.stringify(convertedPredictions), slip.slip_id]);
          
          console.log(`   ✅ Slip ${slip.slip_id} converted to proper format`);
        }
        
      } catch (error) {
        console.error(`   ❌ Error processing slip ${slip.slip_id}:`, error.message);
      }
    }
    
    console.log('✅ Predictions format fixed successfully');
    
  } catch (error) {
    console.error('❌ Error fixing predictions format:', error);
  }
}

async function addMissingResultsEndpoint() {
  try {
    console.log('🔧 ADDING MISSING /results/all ENDPOINT...');
    
    // Check if the endpoint already exists in the oddyssey.js file
    const fs = require('fs');
    const path = require('path');
    const oddysseyFile = path.join(__dirname, '../api/oddyssey.js');
    
    let content = fs.readFileSync(oddysseyFile, 'utf8');
    
    // Check if the endpoint already exists
    if (content.includes('router.get(\'/results/all\'')) {
      console.log('   ✅ /results/all endpoint already exists');
      return;
    }
    
    // Add the missing endpoint
    const newEndpoint = `
/**
 * GET /api/oddyssey/results/all
 * Get all resolved cycles with results
 */
router.get('/results/all', cacheMiddleware(30000), asyncHandler(async (req, res) => {
  try {
    console.log('📊 Fetching all Odyssey results...');
    
    const result = await db.query(\`
      SELECT 
        cycle_id,
        cycle_start_time,
        cycle_end_time,
        is_resolved,
        evaluation_completed,
        matches_data,
        created_at
      FROM oracle.oddyssey_cycles 
      WHERE is_resolved = true
      ORDER BY cycle_start_time DESC
    \`);
    
    const cycles = result.rows.map(cycle => {
      const matchesData = JSON.parse(cycle.matches_data || '[]');
      
      return {
        cycleId: cycle.cycle_id,
        startTime: cycle.cycle_start_time,
        endTime: cycle.cycle_end_time,
        isResolved: cycle.is_resolved,
        evaluationCompleted: cycle.evaluation_completed,
        matchesCount: matchesData.length,
        matches: matchesData.map(match => ({
          id: match.id,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          league: match.leagueName,
          startTime: match.startTime,
          odds: {
            home: match.oddsHome,
            draw: match.oddsDraw,
            away: match.oddsAway,
            over: match.oddsOver,
            under: match.oddsUnder
          },
          result: match.result
        })),
        createdAt: cycle.created_at
      };
    });
    
    res.json({
      success: true,
      data: {
        cycles: cycles,
        totalCycles: cycles.length
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching all results:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch results',
      message: error.message
    });
  }
}));
`;
    
    // Insert the new endpoint before the module.exports
    const insertPoint = content.lastIndexOf('module.exports = router;');
    if (insertPoint !== -1) {
      content = content.slice(0, insertPoint) + newEndpoint + '\n' + content.slice(insertPoint);
      
      fs.writeFileSync(oddysseyFile, content);
      console.log('   ✅ /results/all endpoint added successfully');
    } else {
      console.log('   ❌ Could not find insertion point in oddyssey.js');
    }
    
  } catch (error) {
    console.error('❌ Error adding results endpoint:', error);
  }
}

async function testFixedFormat() {
  try {
    console.log('🧪 TESTING FIXED DATA FORMAT...');
    
    // Test predictions format
    const testSlip = await db.query(`
      SELECT 
        slip_id,
        predictions,
        is_evaluated,
        final_score,
        correct_count
      FROM oracle.oddyssey_slips
      WHERE predictions IS NOT NULL
      LIMIT 1
    `);
    
    if (testSlip.rows.length > 0) {
      const slip = testSlip.rows[0];
      const predictions = JSON.parse(slip.predictions);
      
      console.log('\\n📊 TESTING PREDICTIONS FORMAT:');
      console.log(`   Slip ID: ${slip.slip_id}`);
      console.log(`   Predictions Count: ${predictions.length}`);
      
      if (predictions.length > 0) {
        const firstPred = predictions[0];
        console.log('   Sample Prediction:');
        console.log(`     Match ID: ${firstPred.matchId}`);
        console.log(`     Bet Type: ${firstPred.betType}`);
        console.log(`     Selection: ${firstPred.selection}`);
        console.log(`     Odds: ${firstPred.odds}`);
        console.log(`     Teams: ${firstPred.homeTeam} vs ${firstPred.awayTeam}`);
        console.log(`     League: ${firstPred.league}`);
      }
    }
    
    // Test matches data format
    const testCycle = await db.query(`
      SELECT 
        cycle_id,
        matches_data,
        is_resolved
      FROM oracle.oddyssey_cycles
      WHERE matches_data IS NOT NULL AND matches_data != '[]'
      LIMIT 1
    `);
    
    if (testCycle.rows.length > 0) {
      const cycle = testCycle.rows[0];
      const matchesData = JSON.parse(cycle.matches_data);
      
      console.log('\\n📊 TESTING MATCHES DATA FORMAT:');
      console.log(`   Cycle ID: ${cycle.cycle_id}`);
      console.log(`   Matches Count: ${matchesData.length}`);
      
      if (matchesData.length > 0) {
        const firstMatch = matchesData[0];
        console.log('   Sample Match:');
        console.log(`     ID: ${firstMatch.id}`);
        console.log(`     Teams: ${firstMatch.homeTeam} vs ${firstMatch.awayTeam}`);
        console.log(`     League: ${firstMatch.leagueName}`);
        console.log(`     Start Time: ${firstMatch.startTime}`);
        console.log(`     Odds: H:${firstMatch.oddsHome} D:${firstMatch.oddsDraw} A:${firstMatch.oddsAway}`);
      }
    }
    
    console.log('\\n✅ Data format testing completed');
    
  } catch (error) {
    console.error('❌ Error testing fixed format:', error);
  }
}

async function main() {
  try {
    console.log('🚀 STARTING ODYSSEY JSON FORMAT FIX...');
    
    await fixPredictionsFormat();
    await addMissingResultsEndpoint();
    await testFixedFormat();
    
    console.log('\\n🎯 ODYSSEY JSON FORMAT FIX COMPLETED!');
    console.log('\\n📋 WHAT WAS FIXED:');
    console.log('   ✅ Predictions format converted to frontend-ready objects');
    console.log('   ✅ Added missing /api/oddyssey/results/all endpoint');
    console.log('   ✅ Tested data format for frontend consumption');
    
    console.log('\\n🔧 FRONTEND CAN NOW USE:');
    console.log('   GET /api/oddyssey/evaluated-slip/:slipId');
    console.log('   GET /api/oddyssey/user-slips-evaluated/:address');
    console.log('   GET /api/oddyssey/results/all');
    console.log('   GET /api/live-slip-evaluation/:slipId');
    
  } catch (error) {
    console.error('❌ Error in main process:', error);
  } finally {
    process.exit(0);
  }
}

main();
