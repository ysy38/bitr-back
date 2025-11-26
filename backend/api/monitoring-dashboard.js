const express = require('express');
const SystemMonitor = require('../services/system-monitor');
const AlertHandler = require('../services/alert-handler');
const db = require('../db/db');

const router = express.Router();

// Initialize monitoring services
const systemMonitor = new SystemMonitor();
const alertHandler = new AlertHandler();

// Connect alert handler to system monitor
systemMonitor.on('alert', (alertData) => {
  alertHandler.handleAlert(alertData);
});

/**
 * GET /api/monitoring/status
 * Get overall system health status
 */
router.get('/status', async (req, res) => {
  try {
    const status = systemMonitor.getSystemStatus();
    
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('Error getting system status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/monitoring/health-checks
 * Get detailed health check status for all services
 */
router.get('/health-checks', async (req, res) => {
  try {
    const { category } = req.query;
    
    let healthChecks;
    if (category) {
      healthChecks = systemMonitor.getHealthChecksByCategory(category);
    } else {
      healthChecks = systemMonitor.getSystemStatus().healthChecks;
    }
    
    res.json({
      success: true,
      data: healthChecks
    });
  } catch (error) {
    console.error('Error getting health checks:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/monitoring/health-check/:id
 * Get detailed status for a specific health check
 */
router.get('/health-check/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const healthCheck = systemMonitor.getHealthCheckStatus(id);
    
    if (!healthCheck) {
      return res.status(404).json({
        success: false,
        error: 'Health check not found'
      });
    }
    
    res.json({
      success: true,
      data: healthCheck
    });
  } catch (error) {
    console.error('Error getting health check:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/monitoring/run-health-checks
 * Manually trigger health checks
 */
router.post('/run-health-checks', async (req, res) => {
  try {
    const results = await systemMonitor.runHealthChecks();
    
    res.json({
      success: true,
      data: {
        results,
        timestamp: new Date()
      }
    });
  } catch (error) {
    console.error('Error running health checks:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/monitoring/alerts
 * Get active alerts
 */
router.get('/alerts', async (req, res) => {
  try {
    const { resolved } = req.query;
    
    let query = 'SELECT * FROM oracle.system_alerts';
    const params = [];
    
    if (resolved === 'false') {
      query += ' WHERE resolved = false';
    } else if (resolved === 'true') {
      query += ' WHERE resolved = true';
    }
    
    query += ' ORDER BY created_at DESC LIMIT 100';
    
    const result = await db.query(query, params);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error getting alerts:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/monitoring/alerts/:id/resolve
 * Resolve an alert
 */
router.post('/alerts/:id/resolve', async (req, res) => {
  try {
    const { id } = req.params;
    const { alertType } = req.body;
    
    if (!alertType) {
      return res.status(400).json({
        success: false,
        error: 'alertType is required'
      });
    }
    
    await alertHandler.resolveAlert(id, alertType);
    
    res.json({
      success: true,
      message: 'Alert resolved successfully'
    });
  } catch (error) {
    console.error('Error resolving alert:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/monitoring/alerts/stats
 * Get alert statistics
 */
router.get('/alerts/stats', async (req, res) => {
  try {
    const stats = await alertHandler.getAlertStats();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error getting alert stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/monitoring/logs
 * Get recent system logs
 */
router.get('/logs', async (req, res) => {
  try {
    const { type, limit = 50 } = req.query;
    
    let query = '';
    const params = [];
    
    if (type === 'results-fetching') {
      query = `
        SELECT 
          'results-fetching' as log_type,
          operation_type,
          fixture_count,
          success,
          processing_time_ms,
          error_message,
          created_at
        FROM oracle.results_fetching_logs
        ORDER BY created_at DESC
        LIMIT $1
      `;
      params.push(parseInt(limit));
    } else if (type === 'cron-jobs') {
      query = `
        SELECT 
          'cron-job' as log_type,
          job_name as operation_type,
          NULL as fixture_count,
          success,
          execution_time_ms as processing_time_ms,
          error_message,
          executed_at as created_at
        FROM oracle.cron_job_logs
        ORDER BY executed_at DESC
        LIMIT $1
      `;
      params.push(parseInt(limit));
    } else {
      // Combined logs
      query = `
        (SELECT 
          'results-fetching' as log_type,
          operation_type,
          fixture_count,
          success,
          processing_time_ms,
          error_message,
          created_at
        FROM oracle.results_fetching_logs)
        UNION ALL
        (SELECT 
          'cron-job' as log_type,
          job_name as operation_type,
          NULL as fixture_count,
          success,
          execution_time_ms as processing_time_ms,
          error_message,
          executed_at as created_at
        FROM oracle.cron_job_logs)
        ORDER BY created_at DESC
        LIMIT $1
      `;
      params.push(parseInt(limit));
    }
    
    const result = await db.query(query, params);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error getting logs:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/monitoring/metrics
 * Get system metrics
 */
router.get('/metrics', async (req, res) => {
  try {
    const { period = '24h' } = req.query;
    
    // Get results fetching metrics
    const resultsMetrics = await db.query(`
      SELECT 
        COUNT(*) as total_operations,
        COUNT(*) FILTER (WHERE success = true) as successful_operations,
        COUNT(*) FILTER (WHERE success = false) as failed_operations,
        AVG(processing_time_ms) as avg_processing_time,
        MAX(processing_time_ms) as max_processing_time
      FROM oracle.results_fetching_logs
      WHERE created_at > NOW() - INTERVAL '${period}'
    `);
    
    // Get cron job metrics
    const cronMetrics = await db.query(`
      SELECT 
        job_name,
        COUNT(*) as total_executions,
        COUNT(*) FILTER (WHERE success = true) as successful_executions,
        COUNT(*) FILTER (WHERE success = false) as failed_executions,
        AVG(execution_time_ms) as avg_execution_time
      FROM oracle.cron_job_logs
      WHERE executed_at > NOW() - INTERVAL '${period}'
      GROUP BY job_name
    `);
    
    // Get alert metrics
    const alertMetrics = await db.query(`
      SELECT 
        severity,
        COUNT(*) as total_alerts,
        COUNT(*) FILTER (WHERE resolved = true) as resolved_alerts,
        COUNT(*) FILTER (WHERE resolved = false) as active_alerts
      FROM oracle.system_alerts
      WHERE created_at > NOW() - INTERVAL '${period}'
      GROUP BY severity
    `);
    
    res.json({
      success: true,
      data: {
        period,
        resultsFetching: resultsMetrics.rows[0],
        cronJobs: cronMetrics.rows,
        alerts: alertMetrics.rows
      }
    });
  } catch (error) {
    console.error('Error getting metrics:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/monitoring/start
 * Start system monitoring
 */
router.post('/start', async (req, res) => {
  try {
    await systemMonitor.start();
    
    res.json({
      success: true,
      message: 'System monitoring started'
    });
  } catch (error) {
    console.error('Error starting monitoring:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/monitoring/stop
 * Stop system monitoring
 */
router.post('/stop', async (req, res) => {
  try {
    systemMonitor.stop();
    
    res.json({
      success: true,
      message: 'System monitoring stopped'
    });
  } catch (error) {
    console.error('Error stopping monitoring:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/monitoring/configure
 * Configure monitoring settings
 */
router.post('/configure', async (req, res) => {
  try {
    const { 
      monitoringInterval, 
      alertCooldown, 
      notificationChannels,
      alertThresholds 
    } = req.body;
    
    // Update monitoring interval
    if (monitoringInterval) {
      systemMonitor.monitoringInterval = monitoringInterval;
    }
    
    // Update alert cooldown
    if (alertCooldown) {
      alertHandler.setCooldown(alertCooldown);
    }
    
    // Update notification channels
    if (notificationChannels) {
      alertHandler.configureChannels(notificationChannels);
    }
    
    // Update alert thresholds
    if (alertThresholds) {
      systemMonitor.alertThresholds = { ...systemMonitor.alertThresholds, ...alertThresholds };
    }
    
    res.json({
      success: true,
      message: 'Monitoring configuration updated'
    });
  } catch (error) {
    console.error('Error configuring monitoring:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;