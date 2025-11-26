const db = require('../db/db');
const { EventEmitter } = require('events');

/**
 * System Monitor Service
 * 
 * Monitors the health of all resolution services, cron jobs, and result fetching operations.
 * Provides real-time status, failure detection, and alerting capabilities.
 */
class SystemMonitor extends EventEmitter {
  constructor() {
    super();
    this.isRunning = false;
    this.monitoringInterval = 5 * 60 * 1000; // 5 minutes
    this.monitoringTimer = null;
    this.healthChecks = new Map();
    this.alertThresholds = {
      resultsFetching: {
        consecutiveFailures: 3,
        maxProcessingTime: 10 * 60 * 1000, // 10 minutes
        minSuccessRate: 0.8 // 80%
      },
      resolutionServices: {
        consecutiveFailures: 2,
        maxProcessingTime: 5 * 60 * 1000, // 5 minutes
        minSuccessRate: 0.9 // 90%
      },
      cronJobs: {
        maxMissedRuns: 2,
        maxExecutionTime: 15 * 60 * 1000, // 15 minutes
        minUptime: 0.95 // 95%
      }
    };
    
    // Initialize health check registry
    this.initializeHealthChecks();
  }

  /**
   * Initialize all health checks for CURRENT services only
   */
  initializeHealthChecks() {
    // Event-Driven Pool Sync (Critical)
    this.registerHealthCheck('event-driven-pool-sync', {
      name: 'Event-Driven Pool Sync Service',
      category: 'sync',
      check: () => this.checkEventDrivenPoolSyncHealth(),
      critical: true
    });

    // Unified Pool Settlement System (Critical)
    this.registerHealthCheck('unified-pool-settlement-system', {
      name: 'Unified Pool Settlement System',
      category: 'settlement',
      check: () => this.checkPoolSettlementServiceHealth(),
      critical: true
    });

    // Event-Driven Bet Sync (Critical)
    this.registerHealthCheck('event-driven-bet-sync', {
      name: 'Event-Driven Bet Sync Service',
      category: 'sync',
      check: () => this.checkEventDrivenBetSyncHealth(),
      critical: true
    });

    // Oddyssey Oracle Bot (Critical)
    this.registerHealthCheck('oddyssey-oracle-bot', {
      name: 'Oddyssey Oracle Bot Service',
      category: 'oracle',
      check: () => this.checkOddysseyOracleBotHealth(),
      critical: true
    });

    // Cycle Monitor (Critical)
    this.registerHealthCheck('cycle-monitor', {
      name: 'Cycle Monitor Service',
      category: 'cycle',
      check: () => this.checkCycleMonitorHealth(),
      critical: true
    });

    // Football Scheduler (Non-Critical)
    this.registerHealthCheck('football-scheduler', {
      name: 'Football Oracle Bot & Scheduler',
      category: 'oracle',
      check: () => this.checkFootballSchedulerHealth(),
      critical: false
    });

    // Football Oracle Bot (Critical)
    this.registerHealthCheck('football-oracle-bot', {
      name: 'Football Oracle Bot',
      category: 'oracle',
      check: () => this.checkFootballOracleBotHealth(),
      critical: true
    });

    // Crypto Scheduler (Non-Critical)
    this.registerHealthCheck('crypto-scheduler', {
      name: 'Crypto Oracle Bot & Scheduler',
      category: 'oracle',
      check: () => this.checkCryptoSchedulerHealth(),
      critical: false
    });

    // Database Health Check (Critical)
    this.registerHealthCheck('database-connection', {
      name: 'Database Connection',
      category: 'infrastructure',
      check: () => this.checkDatabaseHealth(),
      critical: true
    });

    // API Health Checks (Non-Critical)
    this.registerHealthCheck('sportmonks-api', {
      name: 'SportMonks API',
      category: 'external',
      check: () => this.checkSportMonksAPIHealth(),
      critical: false
    });

    console.log(`✅ Initialized ${this.healthChecks.size} health checks for current services`);
  }

  /**
   * Check Event-Driven Pool Sync Service Health
   */
  async checkEventDrivenPoolSyncHealth() {
    try {
      // Check if the service is processing pools correctly
      const result = await db.query(`
        SELECT COUNT(*) as total_pools
        FROM oracle.pools 
        WHERE created_at > NOW() - INTERVAL '1 hour'
      `);

      const recentPools = parseInt(result.rows[0].total_pools);
      
      return {
        status: 'healthy',
        details: {
          recentPools,
          message: `Event-driven pool sync is active (${recentPools} pools in last hour)`
        }
      };

    } catch (error) {
      return {
        status: 'error',
        details: { error: error.message }
      };
    }
  }

  /**
   * Check Pool Settlement Service Health
   */
  async checkPoolSettlementServiceHealth() {
    try {
      // Check if pools are being settled
      const result = await db.query(`
        SELECT 
          COUNT(*) as total_pools,
          COUNT(*) FILTER (WHERE status = 'settled') as settled_pools,
          COUNT(*) FILTER (WHERE status = 'active' AND betting_end_time < EXTRACT(EPOCH FROM NOW())) as pending_settlement
        FROM oracle.pools
      `);

      const { total_pools, settled_pools, pending_settlement } = result.rows[0];
      
      if (parseInt(pending_settlement) > 5) {
        return {
          status: 'degraded',
          details: {
            totalPools: total_pools,
            settledPools: settled_pools,
            pendingSettlement: pending_settlement,
            message: `${pending_settlement} pools pending settlement`
          }
        };
      }

      return {
        status: 'healthy',
        details: {
          totalPools: total_pools,
          settledPools: settled_pools,
          pendingSettlement: pending_settlement,
          message: 'Pool settlement service is working correctly'
        }
      };

    } catch (error) {
      return {
        status: 'error',
        details: { error: error.message }
      };
    }
  }

  /**
   * Check Event-Driven Bet Sync Service Health
   */
  async checkEventDrivenBetSyncHealth() {
    try {
      // Check if bets are being synced
      const result = await db.query(`
        SELECT COUNT(*) as total_bets
        FROM oracle.bets 
        WHERE created_at > NOW() - INTERVAL '1 hour'
      `);

      const recentBets = parseInt(result.rows[0].total_bets);
      
      return {
        status: 'healthy',
        details: {
          recentBets,
          message: `Event-driven bet sync is active (${recentBets} bets in last hour)`
        }
      };

    } catch (error) {
      return {
        status: 'error',
        details: { error: error.message }
      };
    }
  }

  /**
   * Check Oddyssey Oracle Bot Health
   */
  async checkOddysseyOracleBotHealth() {
    try {
      // Check recent cycle resolutions
      const result = await db.query(`
        SELECT 
          COUNT(*) as total_cycles,
          COUNT(*) FILTER (WHERE is_resolved = true) as resolved_cycles,
          MAX(resolved_at) as last_resolution
        FROM oracle.oddyssey_cycles
        WHERE created_at > NOW() - INTERVAL '7 days'
      `);

      const { total_cycles, resolved_cycles, last_resolution } = result.rows[0];
      
      return {
        status: 'healthy',
        details: {
          totalCycles: total_cycles,
          resolvedCycles: resolved_cycles,
          lastResolution: last_resolution,
          message: 'Oddyssey Oracle Bot is working correctly'
        }
      };

    } catch (error) {
      return {
        status: 'error',
        details: { error: error.message }
      };
    }
  }

  /**
   * Check Cycle Monitor Health
   */
  async checkCycleMonitorHealth() {
    try {
      // Check if cycles are being monitored
      const result = await db.query(`
        SELECT COUNT(*) as active_cycles
        FROM oracle.oddyssey_cycles 
        WHERE is_resolved = false
      `);

      const activeCycles = parseInt(result.rows[0].active_cycles);
      
      return {
        status: 'healthy',
        details: {
          activeCycles,
          message: `Cycle monitor is active (${activeCycles} active cycles)`
        }
      };

    } catch (error) {
      return {
        status: 'error',
        details: { error: error.message }
      };
    }
  }

  /**
   * Check Football Scheduler Health
   */
  async checkFootballSchedulerHealth() {
    try {
      // Check recent football market activity
      const result = await db.query(`
        SELECT COUNT(*) as total_markets
        FROM oracle.football_prediction_markets 
        WHERE created_at > NOW() - INTERVAL '1 day'
      `);

      const recentMarkets = parseInt(result.rows[0].total_markets);
      
      return {
        status: 'healthy',
        details: {
          recentMarkets,
          message: `Football scheduler is active (${recentMarkets} markets in last day)`
        }
      };

    } catch (error) {
      return {
        status: 'error',
        details: { error: error.message }
      };
    }
  }

  /**
   * Check Football Oracle Bot Health
   */
  async checkFootballOracleBotHealth() {
    try {
      // Check recent oracle submissions
      const result = await db.query(`
        SELECT COUNT(*) as total_submissions
        FROM public.oracle_submissions 
        WHERE submitted_at > NOW() - INTERVAL '1 day'
      `);

      const recentSubmissions = parseInt(result.rows[0].total_submissions);
      
      return {
        status: 'healthy',
        details: {
          recentSubmissions,
          message: `Football Oracle Bot is active (${recentSubmissions} submissions in last day)`
        }
      };

    } catch (error) {
      return {
        status: 'error',
        details: { error: error.message }
      };
    }
  }

  /**
   * Check Crypto Scheduler Health
   */
  async checkCryptoSchedulerHealth() {
    try {
      // Check recent crypto price updates
      const result = await db.query(`
        SELECT COUNT(*) as price_updates
        FROM oracle.crypto_price_snapshots 
        WHERE created_at > NOW() - INTERVAL '1 hour'
      `);

      const recentUpdates = parseInt(result.rows[0].price_updates);
      
      return {
        status: 'healthy',
        details: {
          recentUpdates,
          message: `Crypto scheduler is active (${recentUpdates} price updates in last hour)`
        }
      };

    } catch (error) {
      return {
        status: 'error',
        details: { error: error.message }
      };
    }
  }

  // ==========================================
  // LEGACY METHODS - REMOVED FOR CLEANUP
  // The old health check methods have been removed
  // as they checked outdated services that no longer exist
  // ==========================================

  /**
   * Register a health check
   */
  registerHealthCheck(id, config) {
    this.healthChecks.set(id, {
      ...config,
      id,
      status: 'unknown',
      lastCheck: null,
      lastSuccess: null,
      lastFailure: null,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      totalChecks: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      averageResponseTime: 0,
      alerts: []
    });
  }

  /**
   * Start monitoring
   */
  async start() {
    if (this.isRunning) {
      console.log('⚠️ System monitor already running');
      return;
    }

    this.isRunning = true;
    console.log('🔍 Starting system monitor...');

    // Run initial health check
    await this.runHealthChecks();

    // Start periodic monitoring
    this.monitoringTimer = setInterval(async () => {
      if (this.isRunning) {
        await this.runHealthChecks();
      }
    }, this.monitoringInterval);

    console.log('✅ System monitor started successfully');
  }

  /**
   * Stop monitoring
   */
  stop() {
    this.isRunning = false;
    
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = null;
    }

    console.log('⏹️ System monitor stopped');
  }

  /**
   * Run all health checks
   */
  async runHealthChecks() {
    console.log('🔍 Running system health checks...');
    
    const results = [];
    const startTime = Date.now();

    for (const [id, healthCheck] of this.healthChecks) {
      try {
        const checkStartTime = Date.now();
        const result = await healthCheck.check();
        const responseTime = Date.now() - checkStartTime;

        // Update health check status
        this.updateHealthCheckStatus(id, result, responseTime);
        
        results.push({
          id,
          name: healthCheck.name,
          status: result.status,
          responseTime,
          details: result.details,
          timestamp: new Date()
        });

      } catch (error) {
        console.error(`❌ Health check failed for ${id}:`, error);
        
        // Update health check status as failed
        this.updateHealthCheckStatus(id, {
          status: 'error',
          details: { error: error.message }
        }, 0);
        
        results.push({
          id,
          name: this.healthChecks.get(id)?.name || id,
          status: 'error',
          responseTime: 0,
          details: { error: error.message },
          timestamp: new Date()
        });
      }
    }

    const totalTime = Date.now() - startTime;
    console.log(`✅ Health checks completed in ${totalTime}ms`);

    // Emit monitoring event
    this.emit('healthChecksCompleted', {
      results,
      totalTime,
      timestamp: new Date()
    });

    return results;
  }

  /**
   * Update health check status
   */
  updateHealthCheckStatus(id, result, responseTime) {
    const healthCheck = this.healthChecks.get(id);
    if (!healthCheck) return;

    const now = new Date();
    healthCheck.lastCheck = now;
    healthCheck.totalChecks++;

    if (result.status === 'healthy') {
      healthCheck.status = 'healthy';
      healthCheck.lastSuccess = now;
      healthCheck.consecutiveSuccesses++;
      healthCheck.consecutiveFailures = 0;
      healthCheck.totalSuccesses++;
    } else {
      healthCheck.status = result.status;
      healthCheck.lastFailure = now;
      healthCheck.consecutiveFailures++;
      healthCheck.consecutiveSuccesses = 0;
      healthCheck.totalFailures++;
    }

    // Update average response time
    healthCheck.averageResponseTime = 
      (healthCheck.averageResponseTime * (healthCheck.totalChecks - 1) + responseTime) / healthCheck.totalChecks;

    // Check for alerts
    this.checkForAlerts(id, healthCheck, result);
  }

  /**
   * Check for alerts based on thresholds
   */
  checkForAlerts(id, healthCheck, result) {
    const alerts = [];

    // Check consecutive failures
    if (healthCheck.category === 'results') {
      const threshold = this.alertThresholds.resultsFetching.consecutiveFailures;
      if (healthCheck.consecutiveFailures >= threshold) {
        alerts.push({
          type: 'consecutive_failures',
          severity: 'critical',
          message: `${healthCheck.name} has failed ${healthCheck.consecutiveFailures} consecutive times`,
          threshold,
          current: healthCheck.consecutiveFailures
        });
      }
    } else if (healthCheck.category === 'resolution') {
      const threshold = this.alertThresholds.resolutionServices.consecutiveFailures;
      if (healthCheck.consecutiveFailures >= threshold) {
        alerts.push({
          type: 'consecutive_failures',
          severity: 'critical',
          message: `${healthCheck.name} has failed ${healthCheck.consecutiveFailures} consecutive times`,
          threshold,
          current: healthCheck.consecutiveFailures
        });
      }
    }

    // Check response time
    if (healthCheck.averageResponseTime > this.alertThresholds.resultsFetching.maxProcessingTime) {
      alerts.push({
        type: 'slow_response',
        severity: 'warning',
        message: `${healthCheck.name} is responding slowly (${Math.round(healthCheck.averageResponseTime)}ms)`,
        threshold: this.alertThresholds.resultsFetching.maxProcessingTime,
        current: healthCheck.averageResponseTime
      });
    }

    // Check success rate
    const successRate = healthCheck.totalSuccesses / healthCheck.totalChecks;
    const minSuccessRate = this.alertThresholds.resultsFetching.minSuccessRate;
    if (successRate < minSuccessRate && healthCheck.totalChecks > 10) {
      alerts.push({
        type: 'low_success_rate',
        severity: 'warning',
        message: `${healthCheck.name} has low success rate (${(successRate * 100).toFixed(1)}%)`,
        threshold: minSuccessRate * 100,
        current: successRate * 100
      });
    }

    // Store alerts
    healthCheck.alerts = alerts;

    // Emit alerts
    if (alerts.length > 0) {
      this.emit('alert', {
        healthCheckId: id,
        healthCheckName: healthCheck.name,
        alerts,
        timestamp: new Date()
      });
    }
  }

  /**
   * Check results fetching health
   */
  async checkResultsFetchingHealth() {
    try {
      // Check recent results fetching activity
      const result = await db.query(`
        SELECT 
          COUNT(*) as total_operations,
          COUNT(*) FILTER (WHERE success = true) as successful_operations,
          COUNT(*) FILTER (WHERE success = false) as failed_operations,
          AVG(processing_time_ms) as avg_processing_time,
          MAX(created_at) as last_operation
        FROM oracle.results_fetching_logs
        WHERE created_at > NOW() - INTERVAL '1 hour'
      `);

      const stats = result.rows[0];
      const successRate = stats.total_operations > 0 ? 
        stats.successful_operations / stats.total_operations : 1;

      // Check if there are pending results to fetch
      const pendingResult = await db.query(`
        SELECT COUNT(*) as pending_count
        FROM oracle.fixtures f
        LEFT JOIN oracle.fixture_results fr ON f.id::VARCHAR = fr.fixture_id::VARCHAR
        WHERE f.match_date < NOW() - INTERVAL '1 hour'
        AND fr.fixture_id IS NULL
        AND f.status NOT IN ('NS', 'CANC', 'POST')
      `);

      const pendingCount = parseInt(pendingResult.rows[0].pending_count);

      return {
        status: successRate >= 0.8 ? 'healthy' : 'degraded',
        details: {
          totalOperations: parseInt(stats.total_operations),
          successfulOperations: parseInt(stats.successful_operations),
          failedOperations: parseInt(stats.failed_operations),
          successRate: successRate,
          averageProcessingTime: parseFloat(stats.avg_processing_time) || 0,
          lastOperation: stats.last_operation,
          pendingResults: pendingCount
        }
      };

    } catch (error) {
      return {
        status: 'error',
        details: { error: error.message }
      };
    }
  }

  /**
   * Check Oddyssey resolution health
   */
  async checkOddysseyResolutionHealth() {
    try {
      // Check recent resolution activity
      const result = await db.query(`
        SELECT 
          COUNT(*) as total_cycles,
          COUNT(*) FILTER (WHERE is_resolved = true) as resolved_cycles,
          COUNT(*) FILTER (WHERE is_resolved = false AND cycle_end_time < NOW()) as pending_resolution,
          MAX(resolved_at) as last_resolution
        FROM oracle.oddyssey_cycles
        WHERE created_at > NOW() - INTERVAL '24 hours'
      `);

      const stats = result.rows[0];
      const resolutionRate = stats.total_cycles > 0 ? 
        stats.resolved_cycles / stats.total_cycles : 1;

      return {
        status: resolutionRate >= 0.9 ? 'healthy' : 'degraded',
        details: {
          totalCycles: parseInt(stats.total_cycles),
          resolvedCycles: parseInt(stats.resolved_cycles),
          pendingResolution: parseInt(stats.pending_resolution),
          resolutionRate: resolutionRate,
          lastResolution: stats.last_resolution
        }
      };

    } catch (error) {
      return {
        status: 'error',
        details: { error: error.message }
      };
    }
  }

  /**
   * Check football resolution health
   */
  async checkFootballResolutionHealth() {
    try {
      // Check recent football market resolution activity
      const result = await db.query(`
        SELECT 
          COUNT(*) as total_markets,
          COUNT(*) FILTER (WHERE resolved = true) as resolved_markets,
          COUNT(*) FILTER (WHERE resolved = false AND end_time < NOW()) as pending_resolution,
          MAX(resolved_at) as last_resolution
        FROM oracle.football_prediction_markets
        WHERE created_at > NOW() - INTERVAL '24 hours'
      `);

      const stats = result.rows[0];
      const resolutionRate = stats.total_markets > 0 ? 
        stats.resolved_markets / stats.total_markets : 1;

      return {
        status: resolutionRate >= 0.9 ? 'healthy' : 'degraded',
        details: {
          totalMarkets: parseInt(stats.total_markets),
          resolvedMarkets: parseInt(stats.resolved_markets),
          pendingResolution: parseInt(stats.pending_resolution),
          resolutionRate: resolutionRate,
          lastResolution: stats.last_resolution
        }
      };

    } catch (error) {
      return {
        status: 'error',
        details: { error: error.message }
      };
    }
  }

  /**
   * Check crypto resolution health
   */
  async checkCryptoResolutionHealth() {
    try {
      // Check recent crypto market resolution activity
      const result = await db.query(`
        SELECT 
          COUNT(*) as total_markets,
          COUNT(*) FILTER (WHERE resolved = true) as resolved_markets,
          COUNT(*) FILTER (WHERE resolved = false AND end_time < NOW()) as pending_resolution,
          MAX(resolved_at) as last_resolution
        FROM oracle.crypto_prediction_markets
        WHERE created_at > NOW() - INTERVAL '24 hours'
      `);

      const stats = result.rows[0];
      const resolutionRate = stats.total_markets > 0 ? 
        stats.resolved_markets / stats.total_markets : 1;

      return {
        status: resolutionRate >= 0.9 ? 'healthy' : 'degraded',
        details: {
          totalMarkets: parseInt(stats.total_markets),
          resolvedMarkets: parseInt(stats.resolved_markets),
          pendingResolution: parseInt(stats.pending_resolution),
          resolutionRate: resolutionRate,
          lastResolution: stats.last_resolution
        }
      };

    } catch (error) {
      return {
        status: 'error',
        details: { error: error.message }
      };
    }
  }

  /**
   * Check cron job health
   */
  async checkCronJobHealth(jobName) {
    try {
      // Check recent cron job execution logs
      const result = await db.query(`
        SELECT 
          COUNT(*) as total_executions,
          COUNT(*) FILTER (WHERE success = true) as successful_executions,
          COUNT(*) FILTER (WHERE success = false) as failed_executions,
          AVG(execution_time_ms) as avg_execution_time,
          MAX(executed_at) as last_execution
        FROM oracle.cron_job_logs
        WHERE job_name = $1
        AND executed_at > NOW() - INTERVAL '1 hour'
      `, [jobName]);

      const stats = result.rows[0];
      const successRate = stats.total_executions > 0 ? 
        stats.successful_executions / stats.total_executions : 1;

      // Check if job is running too frequently or not frequently enough
      const expectedRuns = jobName === 'results-fetching' ? 12 : 60; // 5min vs 1min intervals
      const actualRuns = parseInt(stats.total_executions);
      const runRate = actualRuns / expectedRuns;

      let status = 'healthy';
      if (successRate < 0.9) status = 'degraded';
      if (successRate < 0.7) status = 'critical';
      if (runRate < 0.5) status = 'critical'; // Too few runs

      return {
        status,
        details: {
          totalExecutions: parseInt(stats.total_executions),
          successfulExecutions: parseInt(stats.successful_executions),
          failedExecutions: parseInt(stats.failed_executions),
          successRate: successRate,
          averageExecutionTime: parseFloat(stats.avg_execution_time) || 0,
          lastExecution: stats.last_execution,
          expectedRuns,
          actualRuns,
          runRate
        }
      };

    } catch (error) {
      return {
        status: 'error',
        details: { error: error.message }
      };
    }
  }

  /**
   * Check database health
   */
  async checkDatabaseHealth() {
    try {
      const startTime = Date.now();
      
      // Simple query to test connection
      await db.query('SELECT 1 as test');
      
      const responseTime = Date.now() - startTime;

      return {
        status: 'healthy',
        details: {
          responseTime,
          connection: 'active'
        }
      };

    } catch (error) {
      return {
        status: 'error',
        details: { error: error.message }
      };
    }
  }

  /**
   * Check SportMonks API health
   */
  async checkSportMonksAPIHealth() {
    try {
      const startTime = Date.now();
      
      // Test API with a simple request
      const response = await fetch(`https://api.sportmonks.com/v3/football/leagues?api_token=${process.env.SPORTMONKS_API_TOKEN}`);

      const responseTime = Date.now() - startTime;

      return {
        status: response.ok ? 'healthy' : 'degraded',
        details: {
          responseTime,
          statusCode: response.status,
          statusText: response.statusText
        }
      };

    } catch (error) {
      return {
        status: 'error',
        details: { error: error.message }
      };
    }
  }

  /**
   * Check Coinpaprika API health
   */
  async checkCoinpaprikaAPIHealth() {
    try {
      const startTime = Date.now();
      
      // Test API with a simple request
      const response = await fetch('https://api.coinpaprika.com/v1/coins/btc-bitcoin');
      const responseTime = Date.now() - startTime;

      return {
        status: response.ok ? 'healthy' : 'degraded',
        details: {
          responseTime,
          statusCode: response.status,
          statusText: response.statusText
        }
      };

    } catch (error) {
      return {
        status: 'error',
        details: { error: error.message }
      };
    }
  }

  /**
   * Get overall system status
   */
  getSystemStatus() {
    const healthChecks = Array.from(this.healthChecks.values());
    const criticalChecks = healthChecks.filter(h => h.critical);
    const healthyCritical = criticalChecks.filter(h => h.status === 'healthy').length;
    const totalCritical = criticalChecks.length;

    let overallStatus = 'healthy';
    if (healthyCritical < totalCritical * 0.8) overallStatus = 'degraded';
    if (healthyCritical < totalCritical * 0.5) overallStatus = 'critical';

    return {
      status: overallStatus,
      timestamp: new Date(),
      summary: {
        totalChecks: healthChecks.length,
        healthyChecks: healthChecks.filter(h => h.status === 'healthy').length,
        degradedChecks: healthChecks.filter(h => h.status === 'degraded').length,
        criticalChecks: healthChecks.filter(h => h.status === 'critical').length,
        errorChecks: healthChecks.filter(h => h.status === 'error').length,
        criticalHealth: `${healthyCritical}/${totalCritical}`
      },
      healthChecks: healthChecks.map(h => ({
        id: h.id,
        name: h.name,
        category: h.category,
        status: h.status,
        lastCheck: h.lastCheck,
        consecutiveFailures: h.consecutiveFailures,
        averageResponseTime: h.averageResponseTime,
        alerts: h.alerts
      }))
    };
  }

  /**
   * Get detailed health check status
   */
  getHealthCheckStatus(id) {
    return this.healthChecks.get(id);
  }

  /**
   * Check cycle health using dedicated cycle monitor
   */
  async checkCycleHealth() {
    try {
      const CycleMonitor = require('./cycle-monitor');
      const cycleMonitor = new CycleMonitor();
      
      const healthCheck = await cycleMonitor.performCycleHealthCheck();
      
      return {
        status: healthCheck.status,
        details: {
          issuesCount: healthCheck.issues.length,
          issues: healthCheck.issues.map(issue => ({
            type: issue.type,
            severity: issue.severity,
            message: issue.message
          }))
        }
      };
    } catch (error) {
      return {
        status: 'error',
        details: { error: error.message }
      };
    }
  }

  /**
   * Get all health checks by category
   */
  getHealthChecksByCategory(category) {
    return Array.from(this.healthChecks.values())
      .filter(h => h.category === category)
      .map(h => ({
        id: h.id,
        name: h.name,
        status: h.status,
        lastCheck: h.lastCheck,
        consecutiveFailures: h.consecutiveFailures,
        averageResponseTime: h.averageResponseTime,
        alerts: h.alerts
      }));
  }
}

module.exports = SystemMonitor;
