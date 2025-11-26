const express = require('express');
const router = express.Router();
const db = require('../db/db');
const { asyncHandler } = require('../utils/validation');
const optimizedCaching = require('../middleware/optimized-caching');

// Cache invalidation endpoint for debugging
router.delete('/cache/:fixtureId', asyncHandler(async (req, res) => {
  const { fixtureId } = req.params;
  await optimizedCaching.invalidatePattern(`optimized:/api/match-center/fixture/${fixtureId}*`);
  res.json({ success: true, message: `Cache invalidated for fixture ${fixtureId}` });
}));

/**
 * Match Center API
 * 
 * Provides comprehensive match data including:
 * - Live match status and scores
 * - Match events and statistics
 * - Historical results
 * - Team information and standings
 */

/**
 * GET /api/match-center/live
 * Get all live matches with real-time status
 */
router.get('/live', optimizedCaching.cacheMiddleware(30), asyncHandler(async (req, res) => {
  try {
    console.log('📊 Fetching live matches...');
    
    const result = await db.query(`
      SELECT 
        f.fixture_id,
        f.home_team,
        f.away_team,
        f.status,
        f.match_date,
        f.venue,
        f.league,
        f.result_info,
        -- Live match data
        CASE 
          WHEN f.status IN ('LIVE', 'HT', '2H', 'ET', 'PEN') THEN true
          ELSE false
        END as is_live,
        -- Score information
        f.result_info->>'home_score' as home_score,
        f.result_info->>'away_score' as away_score,
        f.result_info->>'ht_score' as ht_score,
        f.result_info->>'ft_score' as ft_score,
        -- Pool count for this match
        (SELECT COUNT(*) FROM oracle.pools WHERE fixture_id = f.id::text) as pool_count
      FROM oracle.fixtures f
      WHERE f.status IN ('LIVE', 'HT', '2H', 'ET', 'PEN', 'FT', 'NS', 'CANC', 'POSTP')
        AND f.match_date >= NOW() - INTERVAL '2 days'
        AND f.match_date <= NOW() + INTERVAL '7 days'
      ORDER BY 
        CASE 
          WHEN f.status IN ('LIVE', 'HT', '2H', 'ET', 'PEN') THEN 0
          WHEN f.status = 'FT' THEN 1
          WHEN f.status = 'NS' THEN 2
          ELSE 3
        END,
        f.match_date ASC
    `);
    
    const matches = result.rows.map(match => {
      const isLive = match.is_live;
      const isFinished = match.status === 'FT';
      
      return {
        fixtureId: match.fixture_id,
        teams: {
          home: match.home_team,
          away: match.away_team
        },
        status: {
          current: match.status,
          isLive: isLive,
          isFinished: isFinished
        },
        match: {
          date: match.match_date,
          venue: match.venue,
          league: match.league
        },
        score: {
          home: match.home_score ? parseInt(match.home_score) : null,
          away: match.away_score ? parseInt(match.away_score) : null,
          ht: match.ht_score,
          ft: match.ft_score,
          current: isLive ? `${match.home_score || 0}-${match.away_score || 0}` : null
        },
        activity: {
          poolCount: parseInt(match.pool_count || 0)
        },
        result: match.result_info ? {
          homeScore: match.result_info.home_score,
          awayScore: match.result_info.away_score,
          fullScore: match.result_info.full_score,
          htScore: match.result_info.ht_score,
          result1X2: match.result_info.outcome_1x2,
          resultOU25: match.result_info.outcome_ou25,
          resultOU15: match.result_info.result_ou15,
          resultOU35: match.result_info.result_ou35,
          resultBTTS: match.result_info.result_btts,
          resultHT1X2: match.result_info.result_ht_1x2
        } : null
      };
    });
    
    res.json({
      success: true,
      data: {
        matches: matches,
        totalMatches: matches.length,
        liveMatches: matches.filter(m => m.status.isLive).length,
        finishedMatches: matches.filter(m => m.status.isFinished).length,
        upcomingMatches: matches.filter(m => m.status.current === 'NS').length
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching live matches:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch live matches',
      message: error.message
    });
  }
}));

/**
 * GET /api/match-center/market/:marketId
 * Get match details by market ID
 * 
 * Note: In our system, marketId is actually the same as the fixture ID
 * stored in oracle.fixtures table (f.id = marketId)
 */
router.get('/market/:marketId', optimizedCaching.cacheMiddleware(15), asyncHandler(async (req, res) => {
  try {
    const { marketId } = req.params;
    console.log(`📊 Fetching match details for market ID ${marketId}...`);
    
    // Get fixture basic info by market ID with team logos
    const fixtureResult = await db.query(`
      SELECT 
        f.fixture_id,
        f.id,
        f.home_team,
        f.away_team,
        f.status,
        f.match_date,
        f.venue,
        f.league,
        f.result_info,
        f.referee,
        f.home_team_image_path,
        f.away_team_image_path,
        f.venue_image_path,
        f.league_image_path,
        f.participants,
        f.country,
        f.country_code
      FROM oracle.fixtures f
      WHERE f.id = $1::text
    `, [marketId]);
    
    if (fixtureResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Match not found',
        message: `Match with market ID ${marketId} not found`
      });
    }
    
    const fixture = fixtureResult.rows[0];
    
    // Get events (goals, cards, etc.) for this fixture
    // Use marketId as fixture_id since in our system marketId = fixture.id
    console.log(`🔍 DEBUG: Querying events for marketId: ${marketId}`);
    const eventsResult = await db.query(`
      SELECT 
        id,
        event_type,
        minute,
        extra_minute,
        player_name,
        player_id,
        team_id,
        related_player_name,
        related_player_id,
        reason,
        created_at
      FROM oracle.match_events 
      WHERE fixture_id = $1::bigint
      ORDER BY minute ASC, id ASC
    `, [marketId]);
    
    console.log(`🔍 DEBUG: Found ${eventsResult.rows.length} events from database`);
    eventsResult.rows.forEach((event, index) => {
      console.log(`  Event ${index + 1}: ${event.event_type} - ${event.player_name} (${event.minute}')`);
    });
    
    // Get pools for this fixture
    const poolsResult = await db.query(`
      SELECT 
        pool_id,
        title,
        predicted_outcome,
        market_id,
        is_settled,
        settlement_tx_hash,
        creator_side_won,
        result,
        settled_at,
        total_creator_side_stake,
        total_bettor_stake,
        category,
        league,
        odds,
        use_bitr
      FROM oracle.pools 
      WHERE market_id = $1::text
      ORDER BY created_at DESC
    `, [marketId]);
    
    // Format events for match card display
    const events = eventsResult.rows.map(event => ({
      id: event.id,
      type: event.event_type,
      minute: event.minute,
      extraMinute: event.extra_minute,
      player: event.player_name,
      playerId: event.player_id,
      teamId: event.team_id,
      relatedPlayer: event.related_player_name,
      relatedPlayerId: event.related_player_id,
      reason: event.reason,
      timestamp: event.created_at
    }));
    
    // Extract goal scorers for match card (only goal events)
    console.log(`🔍 DEBUG: Processing ${events.length} events for goalScorers`);
    const goalEvents = events.filter(event => event.type === 'goal' || event.type === 'Goal');
    console.log(`🔍 DEBUG: Found ${goalEvents.length} goal events`);
    
    const goalScorers = goalEvents.map((event, index) => ({
        id: event.id,
        player: event.player,
        minute: event.minute,
        teamId: event.teamId,
        team: (() => {
          const teamIdInt = parseInt(event.teamId);
          
          // First, try to match with participants (for real SportMonks data)
          if (fixture.participants && Array.isArray(fixture.participants)) {
            const foundParticipant = fixture.participants.find(p => p.id === teamIdInt);
            if (foundParticipant && foundParticipant.meta && foundParticipant.meta.location) {
              return foundParticipant.meta.location; // Returns 'home' or 'away'
            }
          }
          
          // Fallback for test data: assume team_id = 1 is home, team_id = 2 is away
          if (teamIdInt === 1) return 'home';
          if (teamIdInt === 2) return 'away';
          
          // Last resort: return 'unknown'
          console.warn(`⚠️ Could not determine team for teamId ${teamIdInt}`);
          return 'unknown';
        })(),
        relatedPlayer: event.relatedPlayer, // Assist
        description: `${event.player}${event.minute ? ` (${event.minute}')` : ''}`
      }));
    
    const matchCardData = {
      marketId: fixture.id,
      teams: {
        home: {
          name: fixture.home_team,
          logo: fixture.home_team_image_path || null
        },
        away: {
          name: fixture.away_team,
          logo: fixture.away_team_image_path || null
        }
      },
      match: {
        date: fixture.match_date,
        time: fixture.match_date,
        venue: fixture.venue?.name || 'TBD',
        league: fixture.league?.name || 'Unknown League',
        referee: fixture.referee,
        status: fixture.status
      },
      score: (() => {
        // Calculate score from actual goals instead of relying on potentially outdated result_info
        const homeGoals = goalScorers.filter(goal => goal.team === 'home').length;
        const awayGoals = goalScorers.filter(goal => goal.team === 'away').length;
        
        // Use calculated score if we have goals, otherwise fall back to result_info
        if (goalScorers.length > 0) {
          return {
            home: homeGoals,
            away: awayGoals,
            ht: fixture.result_info?.ht_score || null,
            ft: fixture.result_info?.ft_score || null,
            current: `${homeGoals}-${awayGoals}`
          };
        } else {
          // Fallback to result_info if no goals found
          return {
            home: fixture.result_info?.home_score || 0,
            away: fixture.result_info?.away_score || 0,
            ht: fixture.result_info?.ht_score || null,
            ft: fixture.result_info?.ft_score || null,
            current: fixture.result_info ? `${fixture.result_info.home_score}-${fixture.result_info.away_score}` : '0-0'
          };
        }
      })(),
      goalScorers: goalScorers,
      events: events,
      pools: poolsResult.rows.map(pool => ({
        poolId: pool.pool_id,
        title: pool.title,
        prediction: {
          outcome: pool.predicted_outcome,
          marketId: pool.market_id
        },
        settlement: {
          isSettled: pool.is_settled,
          settlementTxHash: pool.settlement_tx_hash,
          creatorSideWon: pool.creator_side_won,
          result: pool.result,
          settledAt: pool.settled_at
        },
        pool: {
          category: pool.category,
          league: pool.league,
          odds: pool.odds ? parseInt(pool.odds) : null,
          useBitr: pool.use_bitr,
          totalCreatorStake: pool.total_creator_side_stake,
          totalBettorStake: pool.total_bettor_stake
        }
      })),
      summary: {
        totalEvents: events.length,
        totalGoals: goalScorers.length,
        totalPools: poolsResult.rows.length,
        settledPools: poolsResult.rows.filter(p => p.is_settled).length
      }
    };
    
    res.json({
      success: true,
      data: matchCardData
    });
    
  } catch (error) {
    console.error(`❌ Error fetching match details for market ID ${req.params.marketId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch match details',
      message: error.message
    });
  }
}));

/**
 * GET /api/match-center/fixture/:fixtureId
 * Get detailed information for a specific fixture
 */
router.get('/fixture/:fixtureId', optimizedCaching.cacheMiddleware(15), asyncHandler(async (req, res) => {
  try {
    const { fixtureId } = req.params;
    console.log(`📊 Fetching fixture details for ${fixtureId}...`);
    
    // Get fixture basic info
    const fixtureResult = await db.query(`
      SELECT 
        f.id,
        f.home_team,
        f.away_team,
        f.home_team_image_path,
        f.away_team_image_path,
        f.status,
        f.match_date,
        f.venue,
        f.league,
        f.result_info,
        f.referee,
        f.country,
        f.country_code,
        f.participants
      FROM oracle.fixtures f
      WHERE f.id = $1::text
    `, [fixtureId]);
    
    if (fixtureResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Fixture not found',
        message: `Fixture ${fixtureId} not found`
      });
    }
    
    const fixture = fixtureResult.rows[0];
    
    // Get events (goals, cards, etc.) for this fixture
    const eventsResult = await db.query(`
      SELECT 
        id,
        event_type,
        minute,
        extra_minute,
        player_name,
        player_id,
        team_id,
        related_player_name,
        related_player_id,
        reason,
        created_at
      FROM oracle.match_events 
      WHERE fixture_id = $1::bigint
      ORDER BY minute ASC, id ASC
    `, [fixtureId]);
    
    // Get pools for this fixture
    const poolsResult = await db.query(`
      SELECT 
        pool_id,
        title,
        predicted_outcome,
        market_id,
        is_settled,
        settlement_tx_hash,
        creator_side_won,
        result,
        settled_at,
        total_creator_side_stake,
        total_bettor_stake,
        category,
        league,
        odds,
        use_bitr
      FROM oracle.pools 
      WHERE market_id = $1::text OR fixture_id = $1::text
      ORDER BY created_at DESC
    `, [fixtureId]);
    
    // Format events for match card display
    const events = eventsResult.rows.map(event => ({
      id: event.id,
      type: event.event_type,
      minute: event.minute,
      extraMinute: event.extra_minute,
      player: event.player_name,
      playerId: event.player_id,
      teamId: event.team_id,
      relatedPlayer: event.related_player_name,
      relatedPlayerId: event.related_player_id,
      reason: event.reason,
      timestamp: event.created_at
    }));
    
    // Extract goal scorers for match card (only goal events)
    console.log(`🔍 DEBUG: Processing ${events.length} events for goalScorers`);
    const goalEvents = events.filter(event => event.type === 'goal' || event.type === 'Goal');
    console.log(`🔍 DEBUG: Found ${goalEvents.length} goal events`);
    
    const goalScorers = goalEvents.map((event, index) => ({
        id: event.id,
        player: event.player,
        minute: event.minute,
        teamId: event.teamId,
        team: (() => {
          const teamIdInt = parseInt(event.teamId);
          
          // First, try to match with participants (for real SportMonks data)
          if (fixture.participants && Array.isArray(fixture.participants)) {
            const foundParticipant = fixture.participants.find(p => p.id === teamIdInt);
            if (foundParticipant && foundParticipant.meta && foundParticipant.meta.location) {
              return foundParticipant.meta.location; // Returns 'home' or 'away'
            }
          }
          
          // Fallback for test data: assume team_id = 1 is home, team_id = 2 is away
          if (teamIdInt === 1) return 'home';
          if (teamIdInt === 2) return 'away';
          
          // Last resort: return 'unknown'
          console.warn(`⚠️ Could not determine team for teamId ${teamIdInt}`);
          return 'unknown';
        })(),
        relatedPlayer: event.relatedPlayer, // Assist
        description: `${event.player}${event.minute ? ` (${event.minute}')` : ''}`
      }));
    
    const fixtureData = {
      fixtureId: fixture.id,
      teams: {
        home: {
          name: fixture.home_team,
          logo: fixture.home_team_image_path
        },
        away: {
          name: fixture.away_team,
          logo: fixture.away_team_image_path
        }
      },
      match: {
        date: fixture.match_date,
        venue: fixture.venue && typeof fixture.venue === 'object' && fixture.venue.name 
          ? fixture.venue.name 
          : (typeof fixture.venue === 'string' ? fixture.venue : ''),
        league: fixture.league,
        country: fixture.country || '',
        countryCode: fixture.country_code || '',
        referee: fixture.referee && typeof fixture.referee === 'object' && fixture.referee.name 
          ? fixture.referee.name 
          : (typeof fixture.referee === 'string' ? fixture.referee : null),
        status: fixture.result_info?.status || fixture.status
      },
      // Score data for MatchCenter component - Calculate from goals for accuracy
      score: (() => {
        // Calculate score from actual goals instead of relying on potentially outdated result_info
        const homeGoals = goalScorers.filter(goal => goal.team === 'home').length;
        const awayGoals = goalScorers.filter(goal => goal.team === 'away').length;
        
        // Use calculated score if we have goals, otherwise fall back to result_info
        if (goalScorers.length > 0) {
          return {
            home: homeGoals,
            away: awayGoals,
            current: `${homeGoals}-${awayGoals}`,
            ht: fixture.result_info?.ht_score || null,
            ft: fixture.result_info?.full_score || null
          };
        } else if (fixture.result_info) {
          return {
            home: fixture.result_info.home_score,
            away: fixture.result_info.away_score,
            current: fixture.result_info.full_score || `${fixture.result_info.home_score || 0}-${fixture.result_info.away_score || 0}`,
            ht: fixture.result_info.ht_score,
            ft: fixture.result_info.full_score
          };
        } else {
          return null;
        }
      })(),
      // Detailed result data for analysis
      result: fixture.result_info ? {
        homeScore: fixture.result_info.home_score,
        awayScore: fixture.result_info.away_score,
        fullScore: fixture.result_info.full_score,
        htScore: fixture.result_info.ht_score,
        result1X2: fixture.result_info.outcome_1x2,
        resultOU25: fixture.result_info.outcome_ou25,
        resultOU15: fixture.result_info.result_ou15,
        resultOU35: fixture.result_info.result_ou35,
        resultBTTS: fixture.result_info.result_btts,
        resultHT1X2: fixture.result_info.result_ht_1x2
      } : null,
      weather: null, // Weather info not available yet
      events: events, // Include events in fixture data
      goalScorers: goalScorers, // Include goalScorers in fixture data
      statistics: [], // Statistics data not available yet
      pools: poolsResult.rows.map(pool => ({
        poolId: pool.pool_id,
        title: pool.title,
        prediction: {
          outcome: pool.predicted_outcome,
          marketId: pool.market_id
        },
        settlement: {
          isSettled: pool.is_settled,
          settlementTxHash: pool.settlement_tx_hash,
          creatorSideWon: pool.creator_side_won,
          result: pool.result,
          settledAt: pool.settled_at
        },
        pool: {
          category: pool.category,
          league: pool.league,
          odds: pool.odds ? parseInt(pool.odds) : null,
          useBitr: pool.use_bitr,
          totalCreatorStake: pool.total_creator_side_stake,
          totalBettorStake: pool.total_bettor_stake
        }
      })),
      summary: {
        totalEvents: events.length,
        totalGoals: goalScorers.length,
        totalPools: poolsResult.rows.length,
        settledPools: poolsResult.rows.filter(p => p.is_settled).length
      }
    };
    
    res.json({
      success: true,
      data: fixtureData
    });
    
  } catch (error) {
    console.error(`❌ Error fetching fixture ${req.params.fixtureId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch fixture details',
      message: error.message
    });
  }
}));

/**
 * GET /api/match-center/events/:fixtureId
 * Get match events for a specific fixture
 */
router.get('/events/:fixtureId', optimizedCaching.cacheMiddleware(30), asyncHandler(async (req, res) => {
  try {
    const { fixtureId } = req.params;
    console.log(`📊 Fetching events for fixture ${fixtureId}...`);
    
    const result = await db.query(`
      SELECT 
        event_id,
        event_type,
        event_minute,
        event_player,
        event_team,
        event_description,
        event_additional_info,
        created_at
      FROM oracle.oracle_events 
      WHERE fixture_id = $1::bigint
      ORDER BY event_minute ASC, event_id ASC
    `, [fixtureId]);
    
    const events = result.rows.map(event => ({
      id: event.event_id,
      type: event.event_type,
      minute: event.event_minute,
      player: event.event_player,
      team: event.event_team,
      description: event.event_description,
      additionalInfo: event.event_additional_info,
      timestamp: event.created_at
    }));
    
    res.json({
      success: true,
      data: {
        fixtureId: fixtureId,
        events: events,
        totalEvents: events.length,
        eventsByType: events.reduce((acc, event) => {
          acc[event.type] = (acc[event.type] || 0) + 1;
          return acc;
        }, {})
      }
    });
    
  } catch (error) {
    console.error(`❌ Error fetching events for fixture ${req.params.fixtureId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch match events',
      message: error.message
    });
  }
}));

/**
 * GET /api/match-center/statistics/:fixtureId
 * Get match statistics for a specific fixture
 */
router.get('/statistics/:fixtureId', optimizedCaching.cacheMiddleware(60), asyncHandler(async (req, res) => {
  try {
    const { fixtureId } = req.params;
    console.log(`📊 Fetching statistics for fixture ${fixtureId}...`);
    
    const result = await db.query(`
      SELECT 
        stat_type,
        home_value,
        away_value,
        stat_description,
        stat_category
      FROM oracle.fixture_results 
      WHERE fixture_id = $1::bigint
      ORDER BY stat_category ASC, stat_type ASC
    `, [fixtureId]);
    
    const statistics = result.rows.map(stat => ({
      type: stat.stat_type,
      home: stat.home_value,
      away: stat.away_value,
      description: stat.stat_description,
      category: stat.stat_category
    }));
    
    // Group statistics by category
    const statsByCategory = statistics.reduce((acc, stat) => {
      const category = stat.category || 'General';
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(stat);
      return acc;
    }, {});
    
    res.json({
      success: true,
      data: {
        fixtureId: fixtureId,
        statistics: statistics,
        statisticsByCategory: statsByCategory,
        totalStats: statistics.length,
        categories: Object.keys(statsByCategory)
      }
    });
    
  } catch (error) {
    console.error(`❌ Error fetching statistics for fixture ${req.params.fixtureId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch match statistics',
      message: error.message
    });
  }
}));

/**
 * GET /api/match-center/league/:league
 * Get matches for a specific league
 */
router.get('/league/:league', optimizedCaching.cacheMiddleware(300), asyncHandler(async (req, res) => {
  try {
    const { league } = req.params;
    const { status, limit = 50, offset = 0 } = req.query;
    
    console.log(`📊 Fetching matches for league: ${league}...`);
    
    let statusFilter = '';
    if (status) {
      statusFilter = `AND f.status = '${status}'`;
    }
    
    const result = await db.query(`
      SELECT 
        f.fixture_id,
        f.home_team,
        f.away_team,
        f.status,
        f.match_date,
        f.venue,
        f.league,
        f.result_info,
        -- Score information
        f.result_info->>'home_score' as home_score,
        f.result_info->>'away_score' as away_score,
        f.result_info->>'ft_score' as ft_score,
        -- Pool count
        (SELECT COUNT(*) FROM oracle.pools WHERE fixture_id = f.id::text) as pool_count
      FROM oracle.fixtures f
      WHERE f.league_name ILIKE $1
        ${statusFilter}
        AND f.match_date >= NOW() - INTERVAL '30 days'
      ORDER BY f.match_date DESC
      LIMIT $2 OFFSET $3
    `, [`%${league}%`, parseInt(limit), parseInt(offset)]);
    
    const matches = result.rows.map(match => ({
      fixtureId: match.fixture_id,
      teams: {
        home: match.home_team,
        away: match.away_team
      },
      match: {
        date: match.match_date,
        venue: match.venue,
        league: match.league,
        status: match.status
      },
      score: {
        home: match.home_score ? parseInt(match.home_score) : null,
        away: match.away_score ? parseInt(match.away_score) : null,
        ft: match.ft_score
      },
      result: match.result_info ? {
        homeScore: match.result_info.home_score,
        awayScore: match.result_info.away_score,
        fullScore: match.result_info.full_score,
        result1X2: match.result_info.outcome_1x2,
        resultOU25: match.result_info.outcome_ou25
      } : null,
      activity: {
        poolCount: parseInt(match.pool_count || 0)
      }
    }));
    
    res.json({
      success: true,
      data: {
        league: league,
        matches: matches,
        totalMatches: matches.length,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: matches.length === parseInt(limit)
        }
      }
    });
    
  } catch (error) {
    console.error(`❌ Error fetching matches for league ${req.params.league}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch league matches',
      message: error.message
    });
  }
}));

/**
 * GET /api/match-center/search
 * Search matches by team name or other criteria
 */
router.get('/search', optimizedCaching.cacheMiddleware(60), asyncHandler(async (req, res) => {
  try {
    const { q, league, status, limit = 20 } = req.query;
    
    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Search query required',
        message: 'Please provide a search query (q parameter)'
      });
    }
    
    console.log(`📊 Searching matches for: ${q}...`);
    
    let filters = [];
    let params = [q];
    let paramCount = 1;
    
    if (league) {
      paramCount++;
      filters.push(`f.league ILIKE $${paramCount}`);
      params.push(`%${league}%`);
    }
    
    if (status) {
      paramCount++;
      filters.push(`f.status = $${paramCount}`);
      params.push(status);
    }
    
    const filterClause = filters.length > 0 ? `AND ${filters.join(' AND ')}` : '';
    
    const result = await db.query(`
      SELECT 
        f.fixture_id,
        f.home_team,
        f.away_team,
        f.status,
        f.match_date,
        f.venue,
        f.league,
        f.result_info,
        -- Score information
        f.result_info->>'home_score' as home_score,
        f.result_info->>'away_score' as away_score,
        f.result_info->>'ft_score' as ft_score,
        -- Pool count
        (SELECT COUNT(*) FROM oracle.pools WHERE fixture_id = f.id::text) as pool_count
      FROM oracle.fixtures f
      WHERE (f.home_team ILIKE $1 OR f.away_team ILIKE $1 OR f.league_name ILIKE $1)
        ${filterClause}
        AND f.match_date >= NOW() - INTERVAL '30 days'
      ORDER BY f.match_date DESC
      LIMIT $${paramCount + 1}
    `, [...params, parseInt(limit)]);
    
    const matches = result.rows.map(match => ({
      fixtureId: match.fixture_id,
      teams: {
        home: match.home_team,
        away: match.away_team
      },
      match: {
        date: match.match_date,
        venue: match.venue,
        league: match.league,
        status: match.status
      },
      score: {
        home: match.home_score ? parseInt(match.home_score) : null,
        away: match.away_score ? parseInt(match.away_score) : null,
        ft: match.ft_score
      },
      result: match.result_info ? {
        homeScore: match.result_info.home_score,
        awayScore: match.result_info.away_score,
        fullScore: match.result_info.full_score,
        result1X2: match.result_info.outcome_1x2,
        resultOU25: match.result_info.outcome_ou25
      } : null,
      activity: {
        poolCount: parseInt(match.pool_count || 0)
      }
    }));
    
    res.json({
      success: true,
      data: {
        query: q,
        matches: matches,
        totalMatches: matches.length,
        filters: {
          league: league || null,
          status: status || null
        }
      }
    });
    
  } catch (error) {
    console.error(`❌ Error searching matches:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to search matches',
      message: error.message
    });
  }
}));

module.exports = router;
