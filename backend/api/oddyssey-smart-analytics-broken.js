const express = require('express');
const router = express.Router();
const OdysseyUnifiedAnalytics = require('../services/oddyssey-unified-analytics');

// Initialize unified analytics service
const analyticsService = new OdysseyUnifiedAnalytics();

/**
 * 🎯 GET /api/oddyssey/smart-analytics/slip/:slipId/probability
 * Get winning probability for a specific slip
 */
router.get('/slip/:slipId/probability', async (req, res) => {
  try {
    const { slipId } = req.params;
    const { cycleId } = req.query;
    
    if (!cycleId) {
      return res.status(400).json({
        success: false,
        error: 'cycleId is required'
      });
    }
    
    const probability = await analyticsService.getSlipWinningProbability(slipId, cycleId);
    
    res.json({
      success: true,
      data: probability,
      meta: {
        timestamp: new Date().toISOString(),
        source: 'smart_analytics'
      }
    });
  } catch (error) {
    console.error('❌ Error getting slip probability:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get slip probability'
    });
  }
});

/**
 * 📊 GET /api/oddyssey/smart-analytics/cycle/:cycleId/selections
 * Get most played selections for a cycle
 */
router.get('/cycle/:cycleId/selections', async (req, res) => {
  const { cycleId } = req.params;
  const { limit = 20 } = req.query;
  
  const selections = await analyticsService.getCycleMostPlayedSelections(cycleId);
  
  res.json({
    success: true,
    data: {
      cycleId: Number(cycleId),
      selections: selections.slice(0, Number(limit)),
      totalSelections: selections.length
    },
    meta: {
      timestamp: new Date().toISOString(),
      source: 'smart_analytics'
    }
  });
}));

/**
 * 🎲 GET /api/oddyssey/smart-analytics/match/:matchId/analytics
 * Get match-specific selection analytics
 */
router.get('/match/:matchId/analytics', async (req, res) => {
  const { matchId } = req.params;
  const { cycleId } = req.query;
  
  if (!cycleId) {
    return res.status(400).json({
      success: false,
      error: 'cycleId is required'
    });
  }
  
  const analytics = await analyticsService.getMatchSelectionAnalytics(matchId, cycleId);
  
  res.json({
    success: true,
    data: {
      matchId: Number(matchId),
      cycleId: Number(cycleId),
      analytics
    },
    meta: {
      timestamp: new Date().toISOString(),
      source: 'smart_analytics'
    }
  });
}));

/**
 * 📈 GET /api/oddyssey/smart-analytics/cycle/:cycleId/analytics
 * Get comprehensive cycle analytics
 */
router.get('/cycle/:cycleId/analytics', async (req, res) => {
  const { cycleId } = req.params;
  
  const analytics = await analyticsService.getCycleAnalytics(cycleId);
  
  res.json({
    success: true,
    data: analytics,
    meta: {
      timestamp: new Date().toISOString(),
      source: 'smart_analytics'
    }
  });
}));

/**
 * 🎯 GET /api/oddyssey/smart-analytics/user/:address/analytics
 * Get user performance analytics
 */
router.get('/user/:address/analytics', async (req, res) => {
  const { address } = req.params;
  
  const analytics = await analyticsService.getUserAnalytics(address);
  
  res.json({
    success: true,
    data: analytics,
    meta: {
      timestamp: new Date().toISOString(),
      source: 'smart_analytics'
    }
  });
}));

/**
 * 📊 GET /api/oddyssey/smart-analytics/platform/analytics
 * Get platform-wide analytics
 */
router.get('/platform/analytics', async (req, res) => {
  const analytics = await analyticsService.getPlatformAnalytics();
  
  res.json({
    success: true,
    data: analytics,
    meta: {
      timestamp: new Date().toISOString(),
      source: 'smart_analytics'
    }
  });
}));

/**
 * 🎲 GET /api/oddyssey/smart-analytics/cycle/:cycleId/matches
 * Get match analytics for a cycle
 */
router.get('/cycle/:cycleId/matches', async (req, res) => {
  const { cycleId } = req.params;
  
  const matchAnalytics = await analyticsService.getMatchAnalytics(cycleId);
  
  res.json({
    success: true,
    data: {
      cycleId: Number(cycleId),
      matches: matchAnalytics
    },
    meta: {
      timestamp: new Date().toISOString(),
      source: 'smart_analytics'
    }
  });
}));

/**
 * 🧠 GET /api/oddyssey/smart-analytics/insights
 * Get smart insights and recommendations
 */
router.get('/insights', async (req, res) => {
  const { type = 'all' } = req.query;
  
  let insights = {};
  
  if (type === 'all' || type === 'platform') {
    const platformAnalytics = await analyticsService.getPlatformAnalytics();
    insights.platform = platformAnalytics.insights;
  }
  
  if (type === 'all' || type === 'trends') {
    // Get recent cycle trends
    const recentCycles = await db.query(`
      SELECT cycle_id, COUNT(*) as slips_count, AVG(correct_count) as avg_accuracy
      FROM oracle.oddyssey_slips 
      WHERE placed_at >= NOW() - INTERVAL '7 days'
      GROUP BY cycle_id
      ORDER BY cycle_id DESC
      LIMIT 5
    `);
    
    insights.trends = {
      recentCycles: recentCycles.rows,
      message: 'Recent cycle performance trends'
    };
  }
  
  res.json({
    success: true,
    data: insights,
    meta: {
      timestamp: new Date().toISOString(),
      source: 'smart_analytics'
    }
  });
}));

/**
 * 📊 GET /api/oddyssey/smart-analytics/visualization/:cycleId
 * Get data formatted for infographics and visualizations
 */
router.get('/visualization/:cycleId', async (req, res) => {
  const { cycleId } = req.params;
  
  const visualizationData = await analyticsService.getVisualizationData(cycleId);
  
  res.json({
    success: true,
    data: visualizationData,
    meta: {
      timestamp: new Date().toISOString(),
      source: 'unified_analytics',
      visualization: true
    }
  });
}));

/**
 * 📊 GET /api/oddyssey/smart-analytics/performance
 * Get performance metrics and system status
 */
router.get('/performance', async (req, res) => {
  const metrics = await analyticsService.getPerformanceMetrics();
  
  res.json({
    success: true,
    data: metrics,
    meta: {
      timestamp: new Date().toISOString(),
      source: 'unified_analytics'
    }
  });
}));

/**
 * 🔄 POST /api/oddyssey/smart-analytics/refresh
 * Manually refresh materialized views and cache
 */
router.post('/refresh', async (req, res) => {
  await analyticsService.refreshMaterializedViews();
  
  res.json({
    success: true,
    message: 'Analytics refreshed successfully',
    meta: {
      timestamp: new Date().toISOString(),
      source: 'unified_analytics'
    }
  });
}));

/**
 * 🧹 POST /api/oddyssey/smart-analytics/cleanup
 * Clean up cache and expired data
 */
router.post('/cleanup', async (req, res) => {
  await analyticsService.cleanup();
  
  res.json({
    success: true,
    message: 'Analytics cleanup completed',
    meta: {
      timestamp: new Date().toISOString(),
      source: 'unified_analytics'
    }
  });
}));

/**
 * 📊 GET /api/oddyssey/smart-analytics/status
 * Get system status and health
 */
router.get('/status', async (req, res) => {
  const status = analyticsService.getStatus();
  
  res.json({
    success: true,
    data: status,
    meta: {
      timestamp: new Date().toISOString(),
      source: 'unified_analytics'
    }
  });
}));

module.exports = router;
