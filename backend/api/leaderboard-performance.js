const express = require('express');
const leaderboardService = require('../services/leaderboard-service');
const router = express.Router();

// Use the singleton leaderboard service instance
// (leaderboard-service.js exports an instance, not a class)

// Metrics endpoint removed - use /api/unified-stats/metrics instead

/**
 * @route GET /api/leaderboard-performance/operation/:operation
 * @desc Get operation-specific metrics
 * @param {string} operation - Operation name (guidedMarkets, reputation, userStats, userRank, cacheRefresh)
 */
router.get('/operation/:operation', async (req, res) => {
  try {
    const { operation } = req.params;

    console.log(`📊 Fetching metrics for operation: ${operation}`);

    const metrics = leaderboardService.getOperationMetrics(operation);

    if (!metrics) {
      return res.status(404).json({
        success: false,
        error: 'Operation not found or no data available'
      });
    }

    res.json({
      success: true,
      data: metrics
    });

  } catch (error) {
    console.error('❌ Error fetching operation metrics:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch operation metrics',
      details: error.message
    });
  }
});

/**
 * @route GET /api/leaderboard-performance/slowest
 * @desc Get slowest operations
 * @query {number} limit - Number of operations to return (default: 10)
 */
router.get('/slowest', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const limitNum = parseInt(limit);

    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        success: false,
        error: 'Limit must be a number between 1 and 100'
      });
    }

    console.log(`📊 Fetching slowest operations: limit=${limitNum}`);

    const slowest = leaderboardService.getSlowestOperations(limitNum);

    res.json({
      success: true,
      data: {
        operations: slowest,
        limit: limitNum,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Error fetching slowest operations:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch slowest operations',
      details: error.message
    });
  }
});

/**
 * @route GET /api/leaderboard-performance/recent
 * @desc Get recent activity
 * @query {number} limit - Number of activities to return (default: 20)
 */
router.get('/recent', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const limitNum = parseInt(limit);

    if (isNaN(limitNum) || limitNum < 1 || limitNum > 200) {
      return res.status(400).json({
        success: false,
        error: 'Limit must be a number between 1 and 200'
      });
    }

    console.log(`📊 Fetching recent activity: limit=${limitNum}`);

    const recent = leaderboardService.getRecentActivity(limitNum);

    res.json({
      success: true,
      data: {
        activities: recent,
        limit: limitNum,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Error fetching recent activity:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch recent activity',
      details: error.message
    });
  }
});

/**
 * @route GET /api/leaderboard-performance/recommendations
 * @desc Get optimization recommendations
 */
router.get('/recommendations', async (req, res) => {
  try {
    console.log('📊 Fetching optimization recommendations...');

    const recommendations = leaderboardService.getOptimizationRecommendations();

    res.json({
      success: true,
      data: recommendations
    });

  } catch (error) {
    console.error('❌ Error fetching recommendations:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch optimization recommendations',
      details: error.message
    });
  }
});

/**
 * @route POST /api/leaderboard-performance/reset
 * @desc Reset performance metrics
 */
router.post('/reset', async (req, res) => {
  try {
    console.log('🔄 Resetting performance metrics...');

    leaderboardService.resetPerformanceMetrics();

    res.json({
      success: true,
      message: 'Performance metrics reset successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error resetting performance metrics:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to reset performance metrics',
      details: error.message
    });
  }
});

// Health endpoint removed - use /api/unified-stats/health instead

/**
 * @route GET /api/leaderboard-performance/dashboard
 * @desc Get performance dashboard data
 */
router.get('/dashboard', async (req, res) => {
  try {
    console.log('📊 Fetching performance dashboard data...');

    const metrics = leaderboardService.getPerformanceMetrics();
    const recommendations = leaderboardService.getOptimizationRecommendations();
    const slowest = leaderboardService.getSlowestOperations(5);
    const recent = leaderboardService.getRecentActivity(10);

    res.json({
      success: true,
      data: {
        overview: {
          totalQueries: metrics.leaderboard.totals.queries,
          errorRate: metrics.leaderboard.totals.queries > 0 
            ? (metrics.leaderboard.totals.errors / metrics.leaderboard.totals.queries * 100).toFixed(2) + '%'
            : '0%',
          avgResponseTime: metrics.leaderboard.totals.queries > 0 
            ? (metrics.leaderboard.totals.totalTime / metrics.leaderboard.totals.queries).toFixed(2) + 'ms'
            : '0ms',
          cacheEfficiency: metrics.cache.performance.hitRate
        },
        recommendations: recommendations.recommendations,
        slowestOperations: slowest,
        recentActivity: recent,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Error fetching dashboard data:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard data',
      details: error.message
    });
  }
});

module.exports = router;
