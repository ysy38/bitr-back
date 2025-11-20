const db = require('../db/db');
const AlertHandler = require('./alert-handler');

/**
 * Cycle Monitor Service
 * 
 * Dedicated monitoring for Oddyssey cycles with specific alerts for:
 * - Missing cycles
 * - Off-schedule cycle creation
 * - Failed cycle transactions
 * - Cycle resolution issues
 * - Time window violations
 */
class CycleMonitor {
  constructor() {
    this.alertHandler = new AlertHandler();
    this.monitoringInterval = 15 * 60 * 1000; // 15 minutes
    this.monitoringTimer = null;
    this.isRunning = false;
    
    // Alert thresholds
    this.thresholds = {
      missingCycles: 1, // Alert if any cycles are missing
      offScheduleCreation: 1, // Alert if any cycles created outside 00:00-00:10 UTC
      failedTransactions: 1, // Alert if any cycles have no transaction hash
      resolutionDelay: 2 * 60 * 60 * 1000, // 2 hours after cycle end time
      consecutiveFailures: 2 // Alert after 2 consecutive failures
    };
    
    this.lastCheck = null;
    this.consecutiveFailures = 0;
  }

  /**
   * Start cycle monitoring
   */
  async start() {
    if (this.isRunning) {
      console.log('⚠️ Cycle monitor is already running');
      return;
    }

    console.log('🚀 Starting cycle monitor...');
    this.isRunning = true;

    // Run initial check
    await this.performCycleHealthCheck();

    // Schedule periodic checks
    this.monitoringTimer = setInterval(async () => {
      await this.performCycleHealthCheck();
    }, this.monitoringInterval);

    console.log(`✅ Cycle monitor started (checking every ${this.monitoringInterval / 60000} minutes)`);
  }

  /**
   * Stop cycle monitoring
   */
  stop() {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = null;
    }
    this.isRunning = false;
    console.log('⏹️ Cycle monitor stopped');
  }

  /**
   * Perform comprehensive cycle health check
   */
  async performCycleHealthCheck() {
    try {
      console.log('🔍 Performing cycle health check...');
      
      const healthCheck = {
        timestamp: new Date(),
        issues: [],
        status: 'healthy'
      };

      // Check for missing cycles
      const missingCycles = await this.checkForMissingCycles();
      if (missingCycles.length > 0) {
        healthCheck.issues.push({
          type: 'missing_cycles',
          severity: 'critical',
          message: `Found ${missingCycles.length} missing cycles: ${missingCycles.map(c => c.cycleId).join(', ')}`,
          details: missingCycles
        });
      }

      // Check for off-schedule cycle creation
      const offScheduleCycles = await this.checkOffScheduleCreation();
      if (offScheduleCycles.length > 0) {
        healthCheck.issues.push({
          type: 'off_schedule_creation',
          severity: 'warning',
          message: `Found ${offScheduleCycles.length} cycles created outside normal hours`,
          details: offScheduleCycles
        });
      }

      // Check for failed transactions
      const failedTransactions = await this.checkFailedTransactions();
      if (failedTransactions.length > 0) {
        healthCheck.issues.push({
          type: 'failed_transactions',
          severity: 'error',
          message: `Found ${failedTransactions.length} cycles without transaction hashes`,
          details: failedTransactions
        });
      }

      // Check for delayed resolutions
      const delayedResolutions = await this.checkDelayedResolutions();
      if (delayedResolutions.length > 0) {
        healthCheck.issues.push({
          type: 'delayed_resolutions',
          severity: 'warning',
          message: `Found ${delayedResolutions.length} cycles with delayed resolution`,
          details: delayedResolutions
        });
      }

      // Check for recent cycle creation failures
      const recentFailures = await this.checkRecentFailures();
      if (recentFailures) {
        healthCheck.issues.push({
          type: 'recent_failures',
          severity: 'critical',
          message: 'Recent cycle creation failures detected',
          details: recentFailures
        });
      }

      // Determine overall status
      if (healthCheck.issues.some(issue => issue.severity === 'critical')) {
        healthCheck.status = 'critical';
      } else if (healthCheck.issues.some(issue => issue.severity === 'error')) {
        healthCheck.status = 'error';
      } else if (healthCheck.issues.some(issue => issue.severity === 'warning')) {
        healthCheck.status = 'warning';
      }

      // Send alerts if issues found
      if (healthCheck.issues.length > 0) {
        await this.sendCycleAlerts(healthCheck);
        this.consecutiveFailures++;
      } else {
        this.consecutiveFailures = 0;
      }

      // Store health check in database
      await this.storeHealthCheck(healthCheck);

      this.lastCheck = healthCheck;
      
      console.log(`✅ Cycle health check completed: ${healthCheck.status} (${healthCheck.issues.length} issues)`);
      
      return healthCheck;

    } catch (error) {
      console.error('❌ Cycle health check failed:', error);
      this.consecutiveFailures++;
      
      // Alert on monitoring failure
      await this.alertHandler.handleAlert({
        healthCheckId: 'cycle-monitor',
        healthCheckName: 'Cycle Monitor',
        alerts: [{
          type: 'monitoring_failure',
          severity: 'critical',
          message: `Cycle monitoring failed: ${error.message}`,
          threshold: 'none',
          current: 'failed'
        }],
        timestamp: new Date()
      });
      
      throw error;
    }
  }

  /**
   * Check for missing cycles in sequence
   */
  async checkForMissingCycles() {
    try {
      const result = await db.query(`
        SELECT cycle_id, created_at, DATE(created_at) as date_created 
        FROM oracle.oddyssey_cycles 
        ORDER BY cycle_id
      `);

      const missingCycles = [];
      
      for (let i = 0; i < result.rows.length - 1; i++) {
        const currentCycle = parseInt(result.rows[i].cycle_id);
        const nextCycle = parseInt(result.rows[i + 1].cycle_id);
        
        if (nextCycle - currentCycle > 1) {
          for (let missing = currentCycle + 1; missing < nextCycle; missing++) {
            missingCycles.push({
              cycleId: missing,
              expectedDate: this.calculateExpectedDate(result.rows[i].date_created, missing - currentCycle),
              gapSize: nextCycle - currentCycle - 1
            });
          }
        }
      }

      return missingCycles;
    } catch (error) {
      console.error('❌ Error checking for missing cycles:', error);
      return [];
    }
  }

  /**
   * Check for cycles created outside normal hours
   */
  async checkOffScheduleCreation() {
    try {
      const result = await db.query(`
        SELECT 
          cycle_id,
          created_at,
          EXTRACT(HOUR FROM created_at) as hour_created,
          EXTRACT(MINUTE FROM created_at) as minute_created,
          DATE(created_at) as date_created
        FROM oracle.oddyssey_cycles 
        WHERE EXTRACT(HOUR FROM created_at) NOT BETWEEN 0 AND 2
        ORDER BY created_at
      `);

      return result.rows.map(row => ({
        cycleId: row.cycle_id,
        createdAt: row.created_at,
        hourCreated: parseInt(row.hour_created),
        minuteCreated: parseInt(row.minute_created),
        dateCreated: row.date_created
      }));
    } catch (error) {
      console.error('❌ Error checking off-schedule creation:', error);
      return [];
    }
  }

  /**
   * Check for cycles without transaction hashes
   */
  async checkFailedTransactions() {
    try {
      const result = await db.query(`
        SELECT cycle_id, created_at, tx_hash
        FROM oracle.oddyssey_cycles 
        WHERE tx_hash IS NULL OR tx_hash = ''
        ORDER BY created_at
      `);

      return result.rows.map(row => ({
        cycleId: row.cycle_id,
        createdAt: row.created_at,
        txHash: row.tx_hash
      }));
    } catch (error) {
      console.error('❌ Error checking failed transactions:', error);
      return [];
    }
  }

  /**
   * Check for cycles with delayed resolution
   */
  async checkDelayedResolutions() {
    try {
      const result = await db.query(`
        SELECT 
          cycle_id,
          created_at,
          cycle_end_time,
          resolved_at,
          is_resolved
        FROM oracle.oddyssey_cycles 
        WHERE is_resolved = false 
          AND cycle_end_time < NOW() - INTERVAL '2 hours'
        ORDER BY cycle_end_time
      `);

      return result.rows.map(row => ({
        cycleId: row.cycle_id,
        createdAt: row.created_at,
        endTime: row.cycle_end_time,
        resolvedAt: row.resolved_at,
        isResolved: row.is_resolved,
        delayHours: Math.floor((Date.now() - new Date(row.cycle_end_time).getTime()) / (1000 * 60 * 60))
      }));
    } catch (error) {
      console.error('❌ Error checking delayed resolutions:', error);
      return [];
    }
  }

  /**
   * Check for recent cycle creation failures
   */
  async checkRecentFailures() {
    try {
      // Check if we should have had a cycle today but didn't
      const today = new Date().toISOString().split('T')[0];
      const now = new Date();
      const hour = now.getUTCHours();
      
      // Only check if we're past the expected cycle creation time (10:50 UTC)
      if (hour >= 11) {
        const result = await db.query(`
          SELECT COUNT(*) as count
          FROM oracle.oddyssey_cycles 
          WHERE DATE(created_at) = $1
        `, [today]);

        if (parseInt(result.rows[0].count) === 0) {
          return {
            date: today,
            expectedTime: '10:50 UTC',
            currentTime: now.toISOString(),
            issue: 'No cycle created today'
          };
        }
      }

      return null;
    } catch (error) {
      console.error('❌ Error checking recent failures:', error);
      return null;
    }
  }

  /**
   * Send cycle-specific alerts
   */
  async sendCycleAlerts(healthCheck) {
    const alerts = healthCheck.issues.map(issue => ({
      type: issue.type,
      severity: issue.severity,
      message: issue.message,
      threshold: this.thresholds[issue.type] || 'none',
      current: issue.details?.length || 1
    }));

    await this.alertHandler.handleAlert({
      healthCheckId: 'cycle-monitor',
      healthCheckName: 'Cycle Monitor',
      alerts: alerts,
      timestamp: healthCheck.timestamp
    });
  }

  /**
   * Store health check in database
   */
  async storeHealthCheck(healthCheck) {
    try {
      await db.query(`
        INSERT INTO oracle.cycle_health_checks (
          timestamp, status, issues_count, issues_data
        ) VALUES ($1, $2, $3, $4)
      `, [
        healthCheck.timestamp,
        healthCheck.status,
        healthCheck.issues.length,
        JSON.stringify(healthCheck.issues)
      ]);
    } catch (error) {
      console.error('❌ Failed to store cycle health check:', error);
    }
  }

  /**
   * Calculate expected date for missing cycle
   */
  calculateExpectedDate(baseDate, daysOffset) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + daysOffset);
    return date.toISOString().split('T')[0];
  }

  /**
   * Get current cycle status
   */
  async getCurrentCycleStatus() {
    try {
      const result = await db.query(`
        SELECT 
          cycle_id,
          created_at,
          cycle_end_time,
          is_resolved,
          resolved_at,
          tx_hash
        FROM oracle.oddyssey_cycles 
        ORDER BY cycle_id DESC 
        LIMIT 1
      `);

      if (result.rows.length === 0) {
        return { status: 'no_cycles', message: 'No cycles found' };
      }

      const currentCycle = result.rows[0];
      const now = new Date();
      const endTime = new Date(currentCycle.cycle_end_time);

      let status = 'active';
      if (currentCycle.is_resolved) {
        status = 'resolved';
      } else if (now > endTime) {
        status = 'ended_unresolved';
      }

      return {
        status,
        cycleId: currentCycle.cycle_id,
        createdAt: currentCycle.created_at,
        endTime: currentCycle.cycle_end_time,
        isResolved: currentCycle.is_resolved,
        resolvedAt: currentCycle.resolved_at,
        hasTransaction: !!currentCycle.tx_hash
      };
    } catch (error) {
      console.error('❌ Error getting current cycle status:', error);
      return { status: 'error', message: error.message };
    }
  }

  /**
   * Manual trigger for cycle health check
   */
  async triggerHealthCheck() {
    console.log('🔍 Manual cycle health check triggered...');
    return await this.performCycleHealthCheck();
  }
}

module.exports = CycleMonitor;
