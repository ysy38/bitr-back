const express = require('express');
const leaderboardService = require('../services/leaderboard-service');
const router = express.Router();

/**
 * @route GET /api/leaderboards/guided-markets
 * @desc Get guided markets leaderboard
 * @query {string} metric - 'total_staked', 'total_won', 'success_rate', 'volume_generated'
 * @query {number} limit - Number of results (default: 30, max: 100)
 * @query {boolean} useCache - Whether to use cached results (default: true)
 */
router.get('/guided-markets', async (req, res) => {
  try {
    const { 
      metric = 'total_staked', 
      limit = 30, 
      useCache = 'true' 
    } = req.query;

    // Validate metric
    const validMetrics = ['total_staked', 'total_won', 'success_rate', 'volume_generated'];
    if (!validMetrics.includes(metric)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid metric. Must be one of: ' + validMetrics.join(', ')
      });
    }

    // Validate limit
    const limitNum = parseInt(limit);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        success: false,
        error: 'Limit must be a number between 1 and 100'
      });
    }

    const useCacheBool = useCache === 'true';

    console.log(`📊 Fetching guided markets leaderboard: metric=${metric}, limit=${limitNum}, useCache=${useCacheBool}`);

    const leaderboard = await leaderboardService.getGuidedMarketsLeaderboard(
      metric, 
      limitNum, 
      useCacheBool
    );

    res.json({
      success: true,
      data: {
        leaderboard,
        metric,
        limit: limitNum,
        total: leaderboard.length,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Error fetching guided markets leaderboard:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch guided markets leaderboard',
      details: error.message
    });
  }
});

/**
 * @route GET /api/leaderboards/reputation
 * @desc Get reputation leaderboard
 * @query {number} limit - Number of results (default: 30, max: 100)
 * @query {boolean} useCache - Whether to use cached results (default: true)
 */
router.get('/reputation', async (req, res) => {
  try {
    const { 
      limit = 30, 
      useCache = 'true' 
    } = req.query;

    // Validate limit
    const limitNum = parseInt(limit);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        success: false,
        error: 'Limit must be a number between 1 and 100'
      });
    }

    const useCacheBool = useCache === 'true';

    console.log(`📊 Fetching reputation leaderboard: limit=${limitNum}, useCache=${useCacheBool}`);

    const leaderboard = await leaderboardService.getReputationLeaderboard(
      limitNum, 
      useCacheBool
    );

    res.json({
      success: true,
      data: {
        leaderboard,
        limit: limitNum,
        total: leaderboard.length,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Error fetching reputation leaderboard:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch reputation leaderboard',
      details: error.message
    });
  }
});

/**
 * @route GET /api/leaderboards/user/:address/rank
 * @desc Get user's rank in leaderboards
 * @param {string} address - User's wallet address
 * @query {string} leaderboardType - 'guided_markets' or 'reputation'
 * @query {string} metric - Metric for guided markets leaderboard
 */
router.get('/user/:address/rank', async (req, res) => {
  try {
    const { address } = req.params;
    const { 
      leaderboardType = 'guided_markets', 
      metric = 'total_staked' 
    } = req.query;

    // Validate leaderboard type
    const validTypes = ['guided_markets', 'reputation'];
    if (!validTypes.includes(leaderboardType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid leaderboard type. Must be one of: ' + validTypes.join(', ')
      });
    }

    // Validate metric for guided markets
    if (leaderboardType === 'guided_markets') {
      const validMetrics = ['total_staked', 'total_won', 'success_rate', 'volume_generated'];
      if (!validMetrics.includes(metric)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid metric. Must be one of: ' + validMetrics.join(', ')
        });
      }
    }

    console.log(`📊 Fetching user rank: address=${address}, type=${leaderboardType}, metric=${metric}`);

    const userRank = await leaderboardService.getUserRank(address, leaderboardType, metric);

    if (!userRank) {
      return res.status(404).json({
        success: false,
        error: 'User not found in leaderboard'
      });
    }

    res.json({
      success: true,
      data: {
        address,
        leaderboardType,
        metric,
        ...userRank,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Error fetching user rank:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user rank',
      details: error.message
    });
  }
});

/**
 * @route GET /api/leaderboards/user/:address/stats
 * @desc Get user's aggregated statistics
 * @param {string} address - User's wallet address
 */
router.get('/user/:address/stats', async (req, res) => {
  try {
    const { address } = req.params;

    console.log(`📊 Fetching user stats: address=${address}`);

    const userStats = await leaderboardService.getUserStats(address);

    if (!userStats) {
      return res.status(404).json({
        success: false,
        error: 'User statistics not found'
      });
    }

    res.json({
      success: true,
      data: {
        address,
        ...userStats,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Error fetching user stats:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user statistics',
      details: error.message
    });
  }
});

/**
 * @route POST /api/leaderboards/refresh
 * @desc Refresh leaderboard caches
 * @body {string} leaderboardType - 'guided_markets', 'reputation', or 'all'
 * @body {string} metric - Metric for guided markets (optional)
 * @body {number} limit - Number of entries to cache (optional)
 */
router.post('/refresh', async (req, res) => {
  try {
    const { 
      leaderboardType = 'all', 
      metric = 'total_staked', 
      limit = 100 
    } = req.body;

    console.log(`🔄 Refreshing leaderboard caches: type=${leaderboardType}, metric=${metric}, limit=${limit}`);

    if (leaderboardType === 'all') {
      // Refresh all leaderboards
      await Promise.all([
        leaderboardService.refreshLeaderboardCache('guided_markets', 'total_staked', limit),
        leaderboardService.refreshLeaderboardCache('guided_markets', 'total_won', limit),
        leaderboardService.refreshLeaderboardCache('guided_markets', 'success_rate', limit),
        leaderboardService.refreshLeaderboardCache('guided_markets', 'volume_generated', limit),
        leaderboardService.refreshLeaderboardCache('reputation', 'reputation', limit)
      ]);
      
      // Also refresh user stats
      await leaderboardService.refreshUserStats();
      
    } else if (leaderboardType === 'guided_markets') {
      await leaderboardService.refreshLeaderboardCache('guided_markets', metric, limit);
    } else if (leaderboardType === 'reputation') {
      await leaderboardService.refreshLeaderboardCache('reputation', 'reputation', limit);
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid leaderboard type. Must be one of: guided_markets, reputation, all'
      });
    }

    res.json({
      success: true,
      message: `Leaderboard cache refreshed successfully`,
      data: {
        leaderboardType,
        metric: leaderboardType === 'guided_markets' ? metric : 'reputation',
        limit,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Error refreshing leaderboard cache:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh leaderboard cache',
      details: error.message
    });
  }
});

/**
 * @route GET /api/leaderboards/metrics
 * @desc Get leaderboard metrics summary
 */
router.get('/metrics', async (req, res) => {
  try {
    console.log('📊 Fetching leaderboard metrics...');

    const metrics = await leaderboardService.getLeaderboardMetrics();

    res.json({
      success: true,
      data: {
        metrics,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Error fetching leaderboard metrics:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch leaderboard metrics',
      details: error.message
    });
  }
});

// Health endpoint removed - use /api/unified-stats/health instead

module.exports = router;
