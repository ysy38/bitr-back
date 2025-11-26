const express = require('express');
const CycleMonitor = require('../services/cycle-monitor');
const db = require('../db/db');

const router = express.Router();

// Initialize cycle monitor
const cycleMonitor = new CycleMonitor();

/**
 * GET /api/cycle-monitoring/status
 * Get current cycle status and health
 */
router.get('/status', async (req, res) => {
  try {
    const currentStatus = await cycleMonitor.getCurrentCycleStatus();
    const healthCheck = await cycleMonitor.performCycleHealthCheck();
    
    res.json({
      success: true,
      data: {
        currentCycle: currentStatus,
        healthCheck: healthCheck,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error getting cycle status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/cycle-monitoring/cycles
 * Get all cycles with their status
 */
router.get('/cycles', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    
    const result = await db.query(`
      SELECT 
        cycle_id,
        created_at,
        cycle_start_time,
        cycle_end_time,
        is_resolved,
        resolved_at,
        tx_hash,
        resolution_tx_hash,
        matches_count,
        ready_for_resolution
      FROM oracle.oddyssey_cycles 
      ORDER BY cycle_id DESC
      LIMIT $1 OFFSET $2
    `, [parseInt(limit), parseInt(offset)]);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error getting cycles:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/cycle-monitoring/issues
 * Get current cycle issues
 */
router.get('/issues', async (req, res) => {
  try {
    const healthCheck = await cycleMonitor.performCycleHealthCheck();
    
    res.json({
      success: true,
      data: {
        status: healthCheck.status,
        issues: healthCheck.issues,
        timestamp: healthCheck.timestamp
      }
    });
  } catch (error) {
    console.error('Error getting cycle issues:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/cycle-monitoring/missing-cycles
 * Get missing cycles analysis
 */
router.get('/missing-cycles', async (req, res) => {
  try {
    const missingCycles = await cycleMonitor.checkForMissingCycles();
    
    res.json({
      success: true,
      data: {
        missingCycles: missingCycles,
        count: missingCycles.length,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error getting missing cycles:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/cycle-monitoring/off-schedule
 * Get cycles created outside normal hours
 */
router.get('/off-schedule', async (req, res) => {
  try {
    const offScheduleCycles = await cycleMonitor.checkOffScheduleCreation();
    
    res.json({
      success: true,
      data: {
        offScheduleCycles: offScheduleCycles,
        count: offScheduleCycles.length,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error getting off-schedule cycles:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/cycle-monitoring/failed-transactions
 * Get cycles without transaction hashes
 */
router.get('/failed-transactions', async (req, res) => {
  try {
    const failedTransactions = await cycleMonitor.checkFailedTransactions();
    
    res.json({
      success: true,
      data: {
        failedTransactions: failedTransactions,
        count: failedTransactions.length,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error getting failed transactions:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/cycle-monitoring/delayed-resolutions
 * Get cycles with delayed resolution
 */
router.get('/delayed-resolutions', async (req, res) => {
  try {
    const delayedResolutions = await cycleMonitor.checkDelayedResolutions();
    
    res.json({
      success: true,
      data: {
        delayedResolutions: delayedResolutions,
        count: delayedResolutions.length,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error getting delayed resolutions:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/cycle-monitoring/health-history
 * Get cycle health check history
 */
router.get('/health-history', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    
    const result = await db.query(`
      SELECT 
        timestamp,
        status,
        issues_count,
        issues_data
      FROM oracle.cycle_health_checks 
      ORDER BY timestamp DESC
      LIMIT $1
    `, [parseInt(limit)]);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error getting health history:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/cycle-monitoring/trigger-check
 * Manually trigger cycle health check
 */
router.post('/trigger-check', async (req, res) => {
  try {
    const healthCheck = await cycleMonitor.triggerHealthCheck();
    
    res.json({
      success: true,
      data: healthCheck,
      message: 'Cycle health check triggered successfully'
    });
  } catch (error) {
    console.error('Error triggering cycle health check:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/cycle-monitoring/start
 * Start cycle monitoring
 */
router.post('/start', async (req, res) => {
  try {
    await cycleMonitor.start();
    
    res.json({
      success: true,
      message: 'Cycle monitoring started successfully'
    });
  } catch (error) {
    console.error('Error starting cycle monitoring:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/cycle-monitoring/stop
 * Stop cycle monitoring
 */
router.post('/stop', async (req, res) => {
  try {
    cycleMonitor.stop();
    
    res.json({
      success: true,
      message: 'Cycle monitoring stopped successfully'
    });
  } catch (error) {
    console.error('Error stopping cycle monitoring:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/cycle-monitoring/stats
 * Get cycle monitoring statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const { period = '24h' } = req.query;
    
    // Get cycle creation stats
    const cycleStats = await db.query(`
      SELECT 
        COUNT(*) as total_cycles,
        COUNT(*) FILTER (WHERE is_resolved = true) as resolved_cycles,
        COUNT(*) FILTER (WHERE is_resolved = false) as active_cycles,
        COUNT(*) FILTER (WHERE tx_hash IS NULL OR tx_hash = '') as cycles_without_tx,
        AVG(EXTRACT(EPOCH FROM (cycle_end_time - created_at))/3600) as avg_cycle_duration_hours
      FROM oracle.oddyssey_cycles
      WHERE created_at > NOW() - INTERVAL '${period}'
    `);
    
    // Get health check stats
    const healthStats = await db.query(`
      SELECT 
        status,
        COUNT(*) as count,
        AVG(issues_count) as avg_issues
      FROM oracle.cycle_health_checks
      WHERE timestamp > NOW() - INTERVAL '${period}'
      GROUP BY status
    `);
    
    // Get alert stats for cycle-related alerts
    const alertStats = await db.query(`
      SELECT 
        severity,
        COUNT(*) as total_alerts,
        COUNT(*) FILTER (WHERE resolved = true) as resolved_alerts
      FROM oracle.system_alerts
      WHERE health_check_id = 'cycle-monitor'
      AND created_at > NOW() - INTERVAL '${period}'
      GROUP BY severity
    `);
    
    res.json({
      success: true,
      data: {
        period,
        cycles: cycleStats.rows[0],
        healthChecks: healthStats.rows,
        alerts: alertStats.rows
      }
    });
  } catch (error) {
    console.error('Error getting cycle stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
