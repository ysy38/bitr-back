const express = require('express');
const router = express.Router();
const db = require('../db/db');

// Get all matches (for frontend Oddyssey display)
router.get('/matches', async (req, res) => {
  try {
    const { cycle_id } = req.query;
    
    if (!cycle_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'cycle_id parameter is required' 
      });
    }
    
    // Get cycle matches from oddyssey_cycles table
    const cycleResult = await db.query(`
      SELECT matches_data, is_resolved
      FROM oracle.oddyssey_cycles 
      WHERE cycle_id = $1
    `, [cycle_id]);
    
    if (cycleResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Cycle not found' 
      });
    }
    
    const cycle = cycleResult.rows[0];
    const matches = cycle.matches_data || [];
    
    // Enrich matches with fixture details
    const enrichedMatches = [];
    for (const match of matches) {
      const fixtureResult = await db.query(`
        SELECT id, home_team, away_team, match_date, status, result_info
        FROM oracle.fixtures 
        WHERE id = $1
      `, [match.id]);
      
      if (fixtureResult.rows.length > 0) {
        const fixture = fixtureResult.rows[0];
        enrichedMatches.push({
          id: fixture.id,
          homeTeam: fixture.home_team,
          awayTeam: fixture.away_team,
          matchTime: fixture.match_date,
          status: fixture.status,
          odds: {
            home: match.oddsHome / 1000,
            draw: match.oddsDraw / 1000,
            away: match.oddsAway / 1000,
            over: match.oddsOver / 1000,
            under: match.oddsUnder / 1000
          },
          result: fixture.result_info ? {
            homeScore: fixture.result_info.home_score,
            awayScore: fixture.result_info.away_score,
            status: fixture.result_info.status
          } : null
        });
      }
    }
    
    res.json({
      success: true,
      data: {
        cycleId: parseInt(cycle_id),
        isResolved: cycle.is_resolved,
        matches: enrichedMatches,
        matchCount: enrichedMatches.length
      }
    });
    
  } catch (error) {
    console.error('Error fetching matches:', error);
    res.status(500).json({ 
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
        details: {
          timestamp: new Date().toISOString(),
          path: '/matches',
          method: 'GET'
        }
      }
    });
  }
});

// Get match details by match ID (for UI display)
router.get('/match/:matchId', async (req, res) => {
  try {
    const { matchId } = req.params;
    
    const result = await db.query(`
      SELECT 
        m.match_id,
        m.home_team,
        m.away_team,
        m.match_time,
        m.league,
        mr.outcome_1x2,
        mr.outcome_ou25,
        mr.full_score,
        mr.resolved_at
      FROM oracle.matches m
      LEFT JOIN oracle.match_results mr ON m.match_id = mr.match_id
      WHERE m.match_id = $1
    `, [matchId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Match not found' });
    }
    
    const match = result.rows[0];
    
    res.json({
      success: true,
      data: {
        id: match.match_id,
        homeTeam: match.home_team,
        awayTeam: match.away_team,
        matchTime: match.match_time,
        league: match.league,
        result: {
          outcome1x2: match.outcome_1x2,
          outcomeOU25: match.outcome_ou25,
          fullScore: match.full_score,
          resolvedAt: match.resolved_at
        }
      }
    });
    
  } catch (error) {
    console.error('Error fetching match details:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get multiple matches by IDs (for batch requests)
router.post('/matches/batch', async (req, res) => {
  try {
    const { matchIds } = req.body;
    
    if (!Array.isArray(matchIds) || matchIds.length === 0) {
      return res.status(400).json({ error: 'matchIds array is required' });
    }
    
    if (matchIds.length > 50) {
      return res.status(400).json({ error: 'Maximum 50 matches per request' });
    }
    
    const result = await db.query(`
      SELECT 
        m.match_id,
        m.home_team,
        m.away_team,
        m.match_time,
        m.league,
        mr.outcome_1x2,
        mr.outcome_ou25,
        mr.full_score,
        mr.resolved_at
      FROM oracle.matches m
      LEFT JOIN oracle.match_results mr ON m.match_id = mr.match_id
      WHERE m.match_id = ANY($1)
      ORDER BY m.match_time ASC
    `, [matchIds]);
    
    const matches = result.rows.map(match => ({
      id: match.match_id,
      homeTeam: match.home_team,
      awayTeam: match.away_team,
      matchTime: match.match_time,
      league: match.league,
      result: {
        outcome1x2: match.outcome_1x2,
        outcomeOU25: match.outcome_ou25,
        fullScore: match.full_score,
        resolvedAt: match.resolved_at
      }
    }));
    
    res.json({
      success: true,
      data: matches,
      count: matches.length
    });
    
  } catch (error) {
    console.error('Error fetching matches:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current daily matches for Oddyssey game
router.get('/oddyssey/current', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const result = await db.query(`
      SELECT 
        dgm.match_id,
        m.home_team,
        m.away_team,
        m.match_time,
        m.league,
        mr.outcome_1x2,
        mr.outcome_ou25,
        mr.resolved_at IS NOT NULL as is_resolved
      FROM oddyssey.daily_games dg
      JOIN oracle.daily_game_matches dgm ON dg.game_date = dgm.game_date
      JOIN oracle.matches m ON dgm.match_id = m.match_id
      LEFT JOIN oracle.match_results mr ON m.match_id = mr.match_id
      WHERE dg.game_date = $1
      ORDER BY dgm.id ASC
    `, [today]);
    
    const matches = result.rows.map(match => ({
      id: match.match_id,
      homeTeam: match.home_team,
      awayTeam: match.away_team,
      matchTime: match.match_time,
      league: match.league,
      isResolved: match.is_resolved,
      result: match.is_resolved ? {
        outcome1x2: match.outcome_1x2,
        outcomeOU25: match.outcome_ou25
      } : null
    }));
    
    res.json({
      success: true,
      data: {
        gameDate: today,
        matches,
        matchCount: matches.length
      }
    });
    
  } catch (error) {
    console.error('Error fetching current Oddyssey matches:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router; 