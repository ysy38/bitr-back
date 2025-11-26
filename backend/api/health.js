const express = require('express');
const healthMonitor = require('../services/system-monitor');
const LoggingMiddleware = require('../middleware/logging-middleware');

const router = express.Router();

/**
 * Health Check API Endpoints
 * Implements Requirement 6.1: Health check endpoints for all services
 */

/**
 * GET /api/health - Basic health check
 */
router.get('/', async (req, res) => {
  try {
    const health = await healthMonitor.getComprehensiveHealthStatus();
    const statusCode = health.status === 'healthy' ? 200 : 
                      health.status === 'degraded' ? 200 : 503;
    
    res.status(statusCode).json(health);
  } catch (error) {
    healthMonitor.logError('Health endpoint failed', error);
    res.status(503).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/health/detailed - Detailed health check with all services
 */
router.get('/detailed', async (req, res) => {
  try {
    const health = await healthMonitor.getComprehensiveHealthStatus();
    const performance = healthMonitor.getPerformanceMetrics();
    
    const detailedHealth = {
      ...health,
      performance,
      checks: {
        database: health.services.database,
        sportmonks: health.services.sportmonks,
        coinpaprika: health.services.coinpaprika,
        blockchain: health.services.blockchain,
        cronJobs: health.services.cronJobs,
        oddyssey: health.services.oddyssey,
        oracle: health.services.oracle
      }
    };

    const statusCode = health.status === 'healthy' ? 200 : 
                      health.status === 'degraded' ? 200 : 503;
    
    res.status(statusCode).json(detailedHealth);
  } catch (error) {
    healthMonitor.logError('Detailed health endpoint failed', error);
    res.status(503).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/health/database - Database-specific health check
 */
router.get('/database', async (req, res) => {
  try {
    const dbHealth = await healthMonitor.checkDatabaseHealth();
    const statusCode = dbHealth.status === 'healthy' ? 200 : 503;
    
    res.status(statusCode).json({
      status: dbHealth.status,
      database: dbHealth,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    healthMonitor.logError('Database health endpoint failed', error);
    res.status(503).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/health/services - External services health check
 */
router.get('/services', async (req, res) => {
  try {
    const [sportmonks, coinpaprika, blockchain] = await Promise.all([
      healthMonitor.checkSportMonksHealth(),
      healthMonitor.checkCoinpaprikaHealth(),
      healthMonitor.checkBlockchainHealth()
    ]);

    const servicesHealth = {
      sportmonks,
      coinpaprika,
      blockchain
    };

    const overallStatus = [sportmonks.status, coinpaprika.status, blockchain.status]
      .includes('unhealthy') ? 'unhealthy' : 
      [sportmonks.status, coinpaprika.status, blockchain.status]
      .includes('degraded') ? 'degraded' : 'healthy';

    const statusCode = overallStatus === 'healthy' ? 200 : 
                      overallStatus === 'degraded' ? 200 : 503;

    res.status(statusCode).json({
      status: overallStatus,
      services: servicesHealth,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    healthMonitor.logError('Services health endpoint failed', error);
    res.status(503).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/health/cron - Cron jobs health check
 */
router.get('/cron', async (req, res) => {
  try {
    const cronHealth = await healthMonitor.checkCronJobsHealth();
    const statusCode = cronHealth.status === 'healthy' ? 200 : 503;
    
    res.status(statusCode).json({
      status: cronHealth.status,
      cronJobs: cronHealth,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    healthMonitor.logError('Cron health endpoint failed', error);
    res.status(503).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/health/oddyssey - Oddyssey service health check
 */
router.get('/oddyssey', async (req, res) => {
  try {
    const oddysseyHealth = await healthMonitor.checkOddysseyHealth();
    const statusCode = oddysseyHealth.status === 'healthy' ? 200 : 
                      oddysseyHealth.status === 'degraded' ? 200 : 503;
    
    res.status(statusCode).json({
      status: oddysseyHealth.status,
      oddyssey: oddysseyHealth,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    healthMonitor.logError('Oddyssey health endpoint failed', error);
    res.status(503).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/health/oracle - Oracle services health check
 */
router.get('/oracle', async (req, res) => {
  try {
    const oracleHealth = await healthMonitor.checkOracleHealth();
    const statusCode = oracleHealth.status === 'healthy' ? 200 : 
                      oracleHealth.status === 'degraded' ? 200 : 503;
    
    res.status(statusCode).json({
      status: oracleHealth.status,
      oracle: oracleHealth,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    healthMonitor.logError('Oracle health endpoint failed', error);
    res.status(503).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/health/metrics - Performance metrics
 */
router.get('/metrics', (req, res) => {
  try {
    const performance = healthMonitor.getPerformanceMetrics();
    const system = healthMonitor.getSystemMetrics();
    
    res.json({
      status: 'healthy',
      performance,
      system,
      metrics: healthMonitor.metrics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    healthMonitor.logError('Metrics endpoint failed', error);
    res.status(500).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/health/detailed-services - Enhanced service monitoring
 * Implements comprehensive service health with alerts and recommendations
 */
router.get('/detailed-services', async (req, res) => {
  try {
    const detailedHealth = await healthMonitor.getDetailedServiceHealth();
    const statusCode = detailedHealth.alerts.some(alert => alert.severity === 'critical') ? 503 : 200;
    
    res.status(statusCode).json({
      status: statusCode === 200 ? 'healthy' : 'degraded',
      ...detailedHealth,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    healthMonitor.logError('Detailed services health endpoint failed', error);
    res.status(503).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/health/alerts - Current system alerts
 */
router.get('/alerts', async (req, res) => {
  try {
    const detailedHealth = await healthMonitor.getDetailedServiceHealth();
    
    res.json({
      status: 'healthy',
      alerts: detailedHealth.alerts || [],
      recommendations: detailedHealth.recommendations || [],
      alertCount: detailedHealth.alerts ? detailedHealth.alerts.length : 0,
      criticalAlerts: detailedHealth.alerts ? 
        detailedHealth.alerts.filter(alert => alert.severity === 'critical').length : 0,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    healthMonitor.logError('Alerts endpoint failed', error);
    res.status(500).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/health/readiness - Kubernetes readiness probe
 */
router.get('/readiness', async (req, res) => {
  try {
    const dbHealth = await healthMonitor.checkDatabaseHealth();
    
    if (dbHealth.status === 'healthy') {
      res.status(200).json({
        status: 'ready',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({
        status: 'not_ready',
        reason: 'Database not healthy',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    res.status(503).json({
      status: 'not_ready',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/health/liveness - Kubernetes liveness probe
 */
router.get('/liveness', (req, res) => {
  try {
    const uptime = Date.now() - healthMonitor.startTime;
    
    res.status(200).json({
      status: 'alive',
      uptime: uptime,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'not_alive',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/health/test - Test endpoint for health monitoring
 * (Admin only - for testing purposes)
 */
router.post('/test', async (req, res) => {
  try {
    const { testType } = req.body;
    
    switch (testType) {
      case 'error':
        throw new Error('Test error for health monitoring');
      
      case 'slow':
        await new Promise(resolve => setTimeout(resolve, 2000));
        res.json({ status: 'slow_test_completed' });
        break;
      
      case 'database':
        const dbHealth = await healthMonitor.checkDatabaseHealth();
        res.json({ status: 'database_test_completed', result: dbHealth });
        break;
      
      default:
        res.json({ 
          status: 'test_completed',
          availableTests: ['error', 'slow', 'database']
        });
    }
  } catch (error) {
    healthMonitor.logError('Health test endpoint failed', error);
    res.status(500).json({
      status: 'test_failed',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;