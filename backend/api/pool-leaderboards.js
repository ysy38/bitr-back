const express = require('express');
const poolLeaderboardService = require('../services/pool-leaderboard-service');
const router = express.Router();

/**
 * @route GET /api/leaderboards/pools/creators
 * @desc Get pool creators leaderboard
 * @query {string} sortBy - 'pools_created', 'volume', 'wins', 'losses', 'pnl' (default: 'volume')
 * @query {string} sortOrder - 'asc' or 'desc' (default: 'desc')
 * @query {number} limit - Number of results (default: 100, max: 500)
 * @query {number} offset - Offset for pagination (default: 0)
 */
router.get('/pools/creators', async (req, res) => {
  try {
    const { 
      sortBy = 'volume', 
      sortOrder = 'desc',
      limit = 100,
      offset = 0
    } = req.query;

    const limitNum = Math.min(parseInt(limit) || 100, 500);
    const offsetNum = Math.max(parseInt(offset) || 0, 0);

    console.log(`📊 Fetching creators leaderboard: sortBy=${sortBy}, sortOrder=${sortOrder}, limit=${limitNum}, offset=${offsetNum}`);

    const result = await poolLeaderboardService.getCreatorsLeaderboard(
      sortBy,
      sortOrder,
      limitNum,
      offsetNum
    );

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error fetching creators leaderboard:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch creators leaderboard',
      details: error.message
    });
  }
});

/**
 * @route GET /api/leaderboards/pools/challengers
 * @desc Get pool challengers (bettors) leaderboard
 * @query {string} sortBy - 'pools_challenged', 'volume', 'wins', 'losses', 'pnl' (default: 'volume')
 * @query {string} sortOrder - 'asc' or 'desc' (default: 'desc')
 * @query {number} limit - Number of results (default: 100, max: 500)
 * @query {number} offset - Offset for pagination (default: 0)
 */
router.get('/pools/challengers', async (req, res) => {
  try {
    const { 
      sortBy = 'volume', 
      sortOrder = 'desc',
      limit = 100,
      offset = 0
    } = req.query;

    const limitNum = Math.min(parseInt(limit) || 100, 500);
    const offsetNum = Math.max(parseInt(offset) || 0, 0);

    console.log(`📊 Fetching challengers leaderboard: sortBy=${sortBy}, sortOrder=${sortOrder}, limit=${limitNum}, offset=${offsetNum}`);

    const result = await poolLeaderboardService.getChallengersLeaderboard(
      sortBy,
      sortOrder,
      limitNum,
      offsetNum
    );

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error fetching challengers leaderboard:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch challengers leaderboard',
      details: error.message
    });
  }
});

/**
 * @route GET /api/leaderboards/pools/reputation
 * @desc Get reputation leaderboard
 * @query {string} sortBy - 'reputation', 'total_pools', 'total_bets' (default: 'reputation')
 * @query {string} sortOrder - 'asc' or 'desc' (default: 'desc')
 * @query {number} limit - Number of results (default: 100, max: 500)
 * @query {number} offset - Offset for pagination (default: 0)
 */
router.get('/pools/reputation', async (req, res) => {
  try {
    const { 
      sortBy = 'reputation', 
      sortOrder = 'desc',
      limit = 100,
      offset = 0
    } = req.query;

    const limitNum = Math.min(parseInt(limit) || 100, 500);
    const offsetNum = Math.max(parseInt(offset) || 0, 0);

    console.log(`📊 Fetching reputation leaderboard: sortBy=${sortBy}, sortOrder=${sortOrder}, limit=${limitNum}, offset=${offsetNum}`);

    const result = await poolLeaderboardService.getReputationLeaderboard(
      sortBy,
      sortOrder,
      limitNum,
      offsetNum
    );

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error fetching reputation leaderboard:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch reputation leaderboard',
      details: error.message
    });
  }
});

module.exports = router;

