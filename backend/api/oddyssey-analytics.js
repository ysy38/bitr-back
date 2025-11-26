/**
 * 🎯 ODDYSSEY ANALYTICS API
 * 
 * UPDATED: Removed all transaction endpoints for contract-first architecture
 * - REMOVED: POST /place-slip → Frontend direct contract call
 * - REMOVED: POST /claim-prize → Frontend direct contract call
 * - REMOVED: POST /evaluate → Frontend direct contract call
 * - KEPT: GET endpoints for analytics, leaderboards, and cycle info
 * - ENHANCED: Real-time contract data integration
 */

const express = require('express');
const router = express.Router();
const readOnlyWeb3Service = require('../services/web3-service-readonly');
const db = require('../db/db');

// Simple cache for analytics data
const cache = new Map();
const CACHE_TTL = 30 * 1000; // 30 seconds

function cacheMiddleware(ttl = CACHE_TTL) {
  return (req, res, next) => {
    const key = `${req.method}:${req.path}:${JSON.stringify(req.query)}`;
    const cached = cache.get(key);
    
    if (cached && Date.now() - cached.timestamp < ttl) {
      res.set({
        'Cache-Control': `public, max-age=${Math.floor(ttl / 1000)}`,
        'X-Cache-Status': 'HIT'
      });
      return res.json(cached.data);
    }
    
    const originalJson = res.json;
    res.json = function(data) {
      cache.set(key, { data, timestamp: Date.now() });
      res.set('X-Cache-Status', 'MISS');
      originalJson.call(this, data);
    };
    
    next();
  };
}

/**
 * 📊 GET /api/oddyssey/current-cycle
 * Get current cycle information from contract
 */
router.get('/current-cycle', cacheMiddleware(10000), async (req, res) => {
  try {
    const oddysseyContract = await readOnlyWeb3Service.getContract('oddyssey');
    
    // Get current cycle from contract
    const currentCycleId = await oddysseyContract.currentCycle();
    const cycleInfo = await oddysseyContract.cycles(currentCycleId);
    
    // Get cycle stats from database for additional analytics
    const statsQuery = `
      SELECT 
        total_slips,
        total_participants,
        average_score,
        top_score,
        prize_pool
      FROM oracle.oddyssey_cycles 
      WHERE cycle_id = $1
    `;
    const statsResult = await db.query(statsQuery, [currentCycleId.toString()]);
    
    res.json({
      success: true,
      data: {
        cycle_id: currentCycleId.toString(),
        contract_info: {
          start_time: cycleInfo.startTime.toString(),
          end_time: cycleInfo.endTime.toString(),
          is_active: cycleInfo.isActive,
          total_prize_pool: cycleInfo.totalPrizePool.toString(),
          participant_count: cycleInfo.participantCount.toString()
        },
        analytics: statsResult.rows[0] || {},
        source: 'smart_contract',
        real_time: true
      },
      meta: {
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Error fetching current cycle:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CYCLE_ERROR',
        message: 'Failed to fetch current cycle',
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * 🏆 GET /api/oddyssey/leaderboard
 * Get cycle leaderboard from contract
 */
router.get('/leaderboard', cacheMiddleware(15000), async (req, res) => {
  try {
    const cycleId = req.query.cycle_id;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = parseInt(req.query.offset) || 0;
    
    const oddysseyContract = await readOnlyWeb3Service.getContract('oddyssey');
    
    // Get current cycle if not specified
    const targetCycle = cycleId || (await oddysseyContract.currentCycle()).toString();
    
    // Get leaderboard from contract
    const leaderboard = await oddysseyContract.getCycleLeaderboard(targetCycle, limit, offset);
    
    // Enhance with user analytics from contracts
    const enhancedLeaderboard = await Promise.all(
      leaderboard.map(async (entry, index) => {
        try {
          const userStats = await oddysseyContract.userStats(entry.user);
          return {
            rank: offset + index + 1,
            user_address: entry.user,
            score: entry.score.toString(),
            correct_predictions: entry.correctPredictions.toString(),
            total_slips: entry.totalSlips.toString(),
            cycle_stats: {
              total_cycles: userStats.totalCycles.toString(),
              total_wins: userStats.totalWins.toString(),
              lifetime_score: userStats.lifetimeScore.toString(),
              current_streak: userStats.currentStreak.toString(),
              longest_streak: userStats.longestStreak.toString()
            }
          };
        } catch (error) {
          console.error(`❌ Error fetching user stats for ${entry.user}:`, error);
          return {
            rank: offset + index + 1,
            user_address: entry.user,
            score: entry.score.toString(),
            correct_predictions: entry.correctPredictions.toString(),
            total_slips: entry.totalSlips.toString(),
            cycle_stats: {}
          };
        }
      })
    );
    
    res.json({
      success: true,
      data: {
        cycle_id: targetCycle,
        leaderboard: enhancedLeaderboard,
        pagination: {
          limit,
          offset,
          has_more: enhancedLeaderboard.length === limit
        }
      },
      meta: {
        source: 'smart_contract',
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Error fetching leaderboard:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'LEADERBOARD_ERROR',
        message: 'Failed to fetch leaderboard',
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * 📈 GET /api/oddyssey/user/:address/stats
 * Get user statistics from contract
 */
router.get('/user/:address/stats', cacheMiddleware(), async (req, res) => {
  try {
    const userAddress = req.params.address;
    const cycleId = req.query.cycle_id;
    
    if (!userAddress || !userAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ADDRESS',
          message: 'Invalid Ethereum address format'
        }
      });
    }
    
    const oddysseyContract = await readOnlyWeb3Service.getContract('oddyssey');
    
    // Get current cycle if not specified
    const targetCycle = cycleId || (await oddysseyContract.currentCycle()).toString();
    
    // Get user stats from contract
    const [userStats, cycleSlips] = await Promise.all([
      oddysseyContract.userStats(userAddress),
      oddysseyContract.getUserSlipsWithData(userAddress, targetCycle)
    ]);
    
    res.json({
      success: true,
      data: {
        user_address: userAddress,
        cycle_id: targetCycle,
        overall_stats: {
          total_cycles: userStats.totalCycles.toString(),
          total_wins: userStats.totalWins.toString(),
          lifetime_score: userStats.lifetimeScore.toString(),
          current_streak: userStats.currentStreak.toString(),
          longest_streak: userStats.longestStreak.toString(),
          total_slips_placed: userStats.totalSlips.toString()
        },
        current_cycle: {
          slips_placed: cycleSlips.slipIds.length,
          slips_data: cycleSlips.slipsData.map(slip => ({
            slip_id: slip.slipId.toString(),
            predictions: slip.predictions,
            correct_count: slip.correctCount.toString(),
            final_score: slip.finalScore.toString(),
            is_evaluated: slip.isEvaluated,
            placed_at: slip.placedAt.toString()
          }))
        }
      },
      meta: {
        source: 'smart_contract',
        real_time: true,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error(`❌ Error fetching user stats for ${req.params.address}:`, error);
    res.status(500).json({
      success: false,
      error: {
        code: 'USER_STATS_ERROR',
        message: 'Failed to fetch user statistics',
        user_address: req.params.address,
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * 🎯 GET /api/oddyssey/matches
 * Get current cycle matches for slip creation
 */
router.get('/matches', cacheMiddleware(60000), async (req, res) => {
  try {
    const oddysseyContract = await readOnlyWeb3Service.getContract('oddyssey');
    
    // Get current cycle
    const currentCycleId = await oddysseyContract.currentCycle();
    const cycleInfo = await oddysseyContract.cycles(currentCycleId);
    
    // Get matches for current cycle from database (external data)
    const matchesQuery = `
      SELECT 
        m.fixture_id as match_id,
        m.home_team,
        m.away_team,
        m.league_name as league,
        m.match_date as start_time,
        'NS' as status,
        null as home_score,
        null as away_score
      FROM oracle.daily_game_matches m
      WHERE m.cycle_id = $1
      ORDER BY m.match_date ASC
    `;
    
    const matchesResult = await db.query(matchesQuery, [currentCycleId.toString()]);
    
    res.json({
      success: true,
      data: {
        cycle_id: currentCycleId.toString(),
        cycle_info: {
          start_time: cycleInfo.startTime.toString(),
          end_time: cycleInfo.endTime.toString(),
          is_active: cycleInfo.isActive
        },
        matches: matchesResult.rows,
        match_count: matchesResult.rows.length
      },
      meta: {
        source: 'database_external_data',
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Error fetching matches:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'MATCHES_ERROR',
        message: 'Failed to fetch cycle matches',
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * 📊 GET /api/oddyssey/analytics
 * Get comprehensive Oddyssey analytics
 */
router.get('/analytics', cacheMiddleware(30000), async (req, res) => {
  try {
    const timeRange = req.query.time_range || '30d';
    
    // Get analytics from database
    const analyticsQuery = `
      SELECT 
        COUNT(DISTINCT user_address) as total_users,
        COUNT(*) as total_slips,
        AVG(final_score) as avg_score,
        MAX(final_score) as max_score,
        COUNT(CASE WHEN is_evaluated = true THEN 1 END) as evaluated_slips
      FROM oracle.oddyssey_user_stats
      WHERE created_at >= NOW() - INTERVAL '${timeRange}'
    `;
    
    const [analyticsResult, cycleStatsQuery] = await Promise.all([
      db.query(analyticsQuery),
      db.query(`
        SELECT 
          cycle_id,
          total_slips,
          total_participants,
          average_score,
          top_score,
          prize_pool
        FROM oracle.oddyssey_cycles
        ORDER BY cycle_id DESC
        LIMIT 10
      `)
    ]);
    
    res.json({
      success: true,
      data: {
        overall_analytics: analyticsResult.rows[0] || {},
        recent_cycles: cycleStatsQuery.rows,
        time_range: timeRange
      },
      meta: {
        source: 'database_analytics',
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Error fetching analytics:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'ANALYTICS_ERROR',
        message: 'Failed to fetch Oddyssey analytics',
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * 🔍 GET /api/oddyssey/slip/:slipId
 * Get specific slip data from contract
 */
router.get('/slip/:slipId', async (req, res) => {
  try {
    const slipId = parseInt(req.params.slipId);
    
    if (isNaN(slipId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_SLIP_ID',
          message: 'Slip ID must be a number'
        }
      });
    }
    
    const oddysseyContract = await readOnlyWeb3Service.getContract('oddyssey');
    
    // Get slip data from contract
    const slip = await oddysseyContract.slips(slipId);
    
    res.json({
      success: true,
      data: {
        slip_id: slipId,
        user_address: slip.user,
        cycle_id: slip.cycleId.toString(),
        predictions: slip.predictions,
        correct_count: slip.correctCount.toString(),
        final_score: slip.finalScore.toString(),
        is_evaluated: slip.isEvaluated,
        placed_at: slip.placedAt.toString()
      },
      meta: {
        source: 'smart_contract',
        real_time: true,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error(`❌ Error fetching slip ${req.params.slipId}:`, error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SLIP_ERROR',
        message: 'Failed to fetch slip data',
        slip_id: req.params.slipId,
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * 🏅 GET /api/oddyssey/achievements/:address
 * Get user achievements and milestones
 */
router.get('/achievements/:address', cacheMiddleware(), async (req, res) => {
  try {
    const userAddress = req.params.address;
    
    if (!userAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ADDRESS',
          message: 'Invalid Ethereum address format'
        }
      });
    }
    
    const oddysseyContract = await readOnlyWeb3Service.getContract('oddyssey');
    const userStats = await oddysseyContract.userStats(userAddress);
    
    // Calculate achievements based on stats
    const achievements = [];
    
    if (parseInt(userStats.totalCycles) >= 10) {
      achievements.push({ name: 'Veteran Player', description: 'Participated in 10+ cycles' });
    }
    
    if (parseInt(userStats.longestStreak) >= 5) {
      achievements.push({ name: 'Streak Master', description: 'Achieved 5+ correct predictions in a row' });
    }
    
    if (parseInt(userStats.totalWins) >= 5) {
      achievements.push({ name: 'Champion', description: 'Won 5+ cycles' });
    }
    
    res.json({
      success: true,
      data: {
        user_address: userAddress,
        achievements,
        stats: {
          total_cycles: userStats.totalCycles.toString(),
          total_wins: userStats.totalWins.toString(),
          current_streak: userStats.currentStreak.toString(),
          longest_streak: userStats.longestStreak.toString()
        }
      },
      meta: {
        source: 'smart_contract',
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error(`❌ Error fetching achievements for ${req.params.address}:`, error);
    res.status(500).json({
      success: false,
      error: {
        code: 'ACHIEVEMENTS_ERROR',
        message: 'Failed to fetch user achievements',
        timestamp: new Date().toISOString()
      }
    });
  }
});

module.exports = router;
