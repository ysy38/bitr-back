const express = require('express');
const router = express.Router();
const databaseOptimizationService = require('../services/database-optimization-service');
const sharedQueryService = require('../services/shared-query-service');
const queryCaching = require('../middleware/query-caching');

/**
 * Database Optimization API
 * 
 * Provides endpoints for database optimization:
 * - Query performance monitoring
 * - Cache management
 * - Optimization recommendations
 * - Performance statistics
 */

/**
 * GET /api/database-optimization/status
 * Get database optimization status
 */
router.get('/status', async (req, res) => {
  try {
    const status = databaseOptimizationService.getOptimizationStatus();
    
    res.json({
      success: true,
      data: {
        status
      }
    });
  } catch (error) {
    console.error('Error getting optimization status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get optimization status'
    });
  }
});

/**
 * GET /api/database-optimization/recommendations
 * Get optimization recommendations
 */
router.get('/recommendations', async (req, res) => {
  try {
    const recommendations = await databaseOptimizationService.getOptimizationRecommendations();
    
    res.json({
      success: true,
      data: {
        recommendations
      }
    });
  } catch (error) {
    console.error('Error getting optimization recommendations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get optimization recommendations'
    });
  }
});

/**
 * POST /api/database-optimization/execute
 * Execute optimization recommendation
 */
router.post('/execute', async (req, res) => {
  try {
    const { recommendation } = req.body;
    
    if (!recommendation) {
      return res.status(400).json({
        success: false,
        error: 'Recommendation is required'
      });
    }
    
    const result = await databaseOptimizationService.executeRecommendation(recommendation);
    
    res.json({
      success: true,
      data: {
        result
      }
    });
  } catch (error) {
    console.error('Error executing recommendation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to execute recommendation'
    });
  }
});

/**
 * GET /api/database-optimization/query-stats
 * Get query performance statistics
 */
router.get('/query-stats', async (req, res) => {
  try {
    const queryStats = sharedQueryService.getQueryStats();
    
    res.json({
      success: true,
      data: {
        queryStats
      }
    });
  } catch (error) {
    console.error('Error getting query stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get query stats'
    });
  }
});

/**
 * GET /api/database-optimization/cache-stats
 * Get cache performance statistics
 */
router.get('/cache-stats', async (req, res) => {
  try {
    const cacheStats = queryCaching.getStats();
    
    res.json({
      success: true,
      data: {
        cacheStats
      }
    });
  } catch (error) {
    console.error('Error getting cache stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get cache stats'
    });
  }
});

/**
 * POST /api/database-optimization/clear-cache
 * Clear query cache
 */
router.post('/clear-cache', async (req, res) => {
  try {
    const { pattern } = req.body;
    
    if (pattern) {
      await queryCaching.invalidatePattern(pattern);
      sharedQueryService.clearCache(pattern);
    } else {
      await queryCaching.clearAll();
      sharedQueryService.clearCache();
    }
    
    res.json({
      success: true,
      data: {
        message: pattern ? `Cache cleared for pattern: ${pattern}` : 'All cache cleared'
      }
    });
  } catch (error) {
    console.error('Error clearing cache:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear cache'
    });
  }
});

/**
 * GET /api/database-optimization/slow-queries
 * Get currently running slow queries
 */
router.get('/slow-queries', async (req, res) => {
  try {
    const slowQueries = await databaseOptimizationService.detectSlowQueries();
    
    res.json({
      success: true,
      data: {
        slowQueries
      }
    });
  } catch (error) {
    console.error('Error getting slow queries:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get slow queries'
    });
  }
});

/**
 * GET /api/database-optimization/index-analysis
 * Get index usage analysis
 */
router.get('/index-analysis', async (req, res) => {
  try {
    const indexAnalysis = await databaseOptimizationService.analyzeIndexUsage();
    
    res.json({
      success: true,
      data: {
        indexAnalysis
      }
    });
  } catch (error) {
    console.error('Error getting index analysis:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get index analysis'
    });
  }
});

/**
 * GET /api/database-optimization/connection-pool
 * Get connection pool analysis
 */
router.get('/connection-pool', async (req, res) => {
  try {
    const poolAnalysis = await databaseOptimizationService.optimizeConnectionPool();
    
    res.json({
      success: true,
      data: {
        poolAnalysis
      }
    });
  } catch (error) {
    console.error('Error getting connection pool analysis:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get connection pool analysis'
    });
  }
});

/**
 * POST /api/database-optimization/start
 * Start optimization service
 */
router.post('/start', async (req, res) => {
  try {
    await databaseOptimizationService.start();
    
    res.json({
      success: true,
      data: {
        message: 'Database optimization service started'
      }
    });
  } catch (error) {
    console.error('Error starting optimization service:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start optimization service'
    });
  }
});

/**
 * POST /api/database-optimization/stop
 * Stop optimization service
 */
router.post('/stop', async (req, res) => {
  try {
    await databaseOptimizationService.stop();
    
    res.json({
      success: true,
      data: {
        message: 'Database optimization service stopped'
      }
    });
  } catch (error) {
    console.error('Error stopping optimization service:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to stop optimization service'
    });
  }
});

/**
 * GET /api/database-optimization/health
 * Get database optimization health status
 */
router.get('/health', async (req, res) => {
  try {
    const status = databaseOptimizationService.getOptimizationStatus();
    const cacheHealth = queryCaching.getHealthStatus();
    
    const health = {
      status: status.isRunning ? 'healthy' : 'stopped',
      optimization: {
        running: status.isRunning,
        lastOptimization: status.stats.lastOptimization
      },
      cache: cacheHealth,
      queryStats: status.queryStats,
      timestamp: new Date().toISOString()
    };
    
    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json({
      success: true,
      data: {
        health
      }
    });
  } catch (error) {
    console.error('Error getting optimization health:', error);
    res.status(503).json({
      success: false,
      error: 'Optimization health check failed'
    });
  }
});

module.exports = router;
