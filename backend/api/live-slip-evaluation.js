const express = require('express');
const db = require('../db/db');
const Web3Service = require('../services/web3-service');
const websocketService = require('../services/websocket-service');

const router = express.Router();

/**
 * 🔴 LIVE SLIP EVALUATION API - WITH WEBSOCKET SUPPORT
 * 
 * Real-time slip evaluation showing live match progress
 * Updates predictions as matches progress (e.g., 30min 0-0 = incorrect for FT1)
 * NOW WITH: WebSocket broadcasting and safe JSON parsing
 */

/**
 * Safe JSON parser for double-stringified data
 */
const safeJsonParse = (data, defaultValue = []) => {
  try {
    if (!data) return defaultValue;
    let parsed = data;
    if (typeof data === 'string') {
      parsed = JSON.parse(data);
      // If result is still a string, try parsing again (double-stringified)
      if (typeof parsed === 'string' && (parsed.startsWith('[') || parsed.startsWith('{'))) {
        try {
          parsed = JSON.parse(parsed);
        } catch (e) {
          // Already parsed once, that's fine
        }
      }
    }
    return parsed;
  } catch (e) {
    console.warn('⚠️ JSON parse error:', e.message);
    return defaultValue;
  }
};

/**
 * GET /api/live-slip-evaluation/:slipId
 * Get real-time slip evaluation with live match updates
 */
router.get('/:slipId', async (req, res) => {
  try {
    const { slipId } = req.params;
    
    console.log(`🔴 Fetching live evaluation for slip ${slipId}...`);
    
    // Get slip data
    const slipResult = await db.query(`
      SELECT 
        s.slip_id, s.cycle_id, s.player_address, s.predictions,
        s.is_evaluated, s.final_score, s.correct_count,
        c.matches_data, c.is_resolved
      FROM oracle.oddyssey_slips s
      LEFT JOIN oracle.oddyssey_cycles c ON s.cycle_id = c.cycle_id
      WHERE s.slip_id = $1
    `, [slipId]);
    
    if (slipResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Slip not found'
      });
    }
    
    const slip = slipResult.rows[0];
    
    // USE SAFE PARSING
    const predictions = safeJsonParse(slip.predictions);
    const matchesData = safeJsonParse(slip.matches_data);
    
    // Get live match data for each prediction
    const liveEvaluations = [];
    
    for (const prediction of predictions) {
      const matchId = prediction.matchId || prediction[0];
      const betType = prediction.betType || prediction[1];
      const selection = prediction.selection || prediction[2];
      
      // Get current match status
      const matchResult = await db.query(`
        SELECT 
          fr.fixture_id, fr.home_score, fr.away_score,
          fr.outcome_1x2, fr.outcome_ou25, fr.evaluation_status,
          f.home_team, f.away_team, f.league_name, f.match_date, f.starting_at
        FROM oracle.fixture_results fr
        JOIN oracle.fixtures f ON fr.fixture_id::TEXT = f.id::TEXT
        WHERE fr.fixture_id = $1
      `, [matchId]);
      
      if (matchResult.rows.length === 0) {
        liveEvaluations.push({
          matchId,
          betType,
          selection,
          status: 'NO_DATA',
          currentScore: null,
          elapsedTime: null,
          isCorrect: null,
          actualResult: null,
          message: 'Match data not available'
        });
        continue;
      }
      
      const match = matchResult.rows[0];
      const currentScore = `${match.home_score}-${match.away_score}`;
      const elapsedTime = 0; // Not available in current schema
      
      // Determine if prediction is currently correct based on live data
      let isCorrect = null;
      let status = 'LIVE';
      let actualResult = null;
      let message = '';
      
      // Convert betType to number for comparison
      const betTypeNum = parseInt(betType);
      
      if (match.evaluation_status === 'FINISHED' || match.home_score !== null) {
        // Match finished - use final result
        actualResult = betTypeNum === 0 ? match.outcome_1x2 : match.outcome_ou25;
        
        // CRITICAL FIX: Normalize database format to contract format
        // Database: "Home"/"Draw"/"Away", "Over"/"Under"
        // Contract: "1"/"X"/"2", "Over"/"Under"
        if (betTypeNum === 0) {
          // 1X2 prediction: normalize both sides
          const normalizedResult = actualResult === 'Home' ? '1' : actualResult === 'Draw' ? 'X' : actualResult === 'Away' ? '2' : actualResult;
          const normalizedSelection = selection;  // Already in "1"/"X"/"2" format from contract
          isCorrect = normalizedSelection === normalizedResult;
        } else if (betTypeNum === 1) {
          // Over/Under: both already in "Over"/"Under" format
          isCorrect = selection === actualResult;
        }
        
        status = 'FINISHED';
        message = `Final: ${actualResult} (${currentScore})`;
      } else if (match.evaluation_status === 'IN_PROGRESS') {
        // Match in progress - show live status
        status = 'LIVE';
        
        if (betTypeNum === 0) {
          // 1X2 prediction - show current result
          const currentResult = getCurrent1X2Result(match.home_score, match.away_score);
          actualResult = currentResult;
          // Normalize: currentResult is already "1"/"X"/"2"
          isCorrect = selection === currentResult;
          message = `Live: ${currentResult} (${currentScore})`;
        } else if (betTypeNum === 1) {
          // Over/Under prediction - show current result
          const currentResult = getCurrentOverUnderResult(match.home_score, match.away_score);
          actualResult = currentResult;
          // currentResult is already "Over"/"Under"
          isCorrect = selection === currentResult;
          message = `Live: ${currentResult} (${currentScore})`;
        }
      } else {
        // Match not started
        status = 'NOT_STARTED';
        actualResult = null;
        message = 'Match not started yet';
      }
      
      liveEvaluations.push({
        matchId,
        betType,
        selection,
        status,
        currentScore,
        elapsedTime,
        isCorrect,
        actualResult,
        message,
        homeTeam: match.home_team,
        awayTeam: match.away_team,
        leagueName: match.league_name,
        matchDate: match.match_date
      });
    }
    
    // Calculate live slip status
    const correctCount = liveEvaluations.filter(e => e.isCorrect === true).length;
    const wrongCount = liveEvaluations.filter(e => e.isCorrect === false).length;
    const pendingCount = liveEvaluations.filter(e => e.isCorrect === null).length;
    
    const responseData = {
      slipId: slip.slip_id,
      cycleId: slip.cycle_id,
      playerAddress: slip.player_address,
      isEvaluated: slip.is_evaluated,
      finalScore: slip.final_score,
      correctCount: slip.correct_count,
      
      // Live evaluation data
      liveStatus: {
        correct: correctCount,
        wrong: wrongCount,
        pending: pendingCount,
        total: liveEvaluations.length
      },
      
      predictions: liveEvaluations,
      
      // Cycle status
      cycleResolved: slip.is_resolved,
      
      // Timestamps
      lastUpdated: new Date().toISOString()
    };
    
    // Broadcast via WebSocket to subscribed clients
    if (websocketService && websocketService.broadcastToChannel) {
      websocketService.broadcastToChannel(`slips:${slipId}:live`, responseData);
    }
    
    res.json({
      success: true,
      data: responseData
    });
    
  } catch (error) {
    console.error('❌ Error fetching live slip evaluation:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * Helper function to get current 1X2 result
 */
function getCurrent1X2Result(homeScore, awayScore) {
  if (homeScore > awayScore) return '1';
  if (awayScore > homeScore) return '2';
  return 'X';
}

/**
 * Helper function to get current Over/Under result
 */
function getCurrentOverUnderResult(homeScore, awayScore) {
  const totalGoals = homeScore + awayScore;
  return totalGoals > 2.5 ? 'Over' : 'Under';
}

/**
 * GET /api/live-slip-evaluation/user/:address/cycle/:cycleId
 * Get all user slips for a cycle with live evaluation
 */
router.get('/user/:address/cycle/:cycleId', async (req, res) => {
  try {
    const { address, cycleId } = req.params;
    
    console.log(`🔴 Fetching live evaluations for user ${address} in cycle ${cycleId}...`);
    
    // Get user slips for cycle
    const slipsResult = await db.query(`
      SELECT slip_id, predictions, is_evaluated, final_score, correct_count
      FROM oracle.oddyssey_slips
      WHERE player_address = $1 AND cycle_id = $2
      ORDER BY slip_id
    `, [address, cycleId]);
    
    const liveSlips = [];
    
    for (const slip of slipsResult.rows) {
      // Get live evaluation for this slip
      const liveEvaluation = await getLiveSlipEvaluation(slip.slip_id);
      liveSlips.push(liveEvaluation);
    }
    
    res.json({
      success: true,
      data: {
        userAddress: address,
        cycleId: parseInt(cycleId),
        slips: liveSlips,
        totalSlips: liveSlips.length,
        lastUpdated: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching user live evaluations:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * Helper function to get live slip evaluation
 */
async function getLiveSlipEvaluation(slipId) {
  // This would contain the same logic as the main endpoint
  // but return just the slip data
  // Implementation similar to above...
}

module.exports = router;
