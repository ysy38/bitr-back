/**
 * Monitoring and Alerting System for Data Inconsistencies
 * 
 * This service provides real-time monitoring and alerting for data inconsistencies
 * across the entire system to prevent issues before they affect users.
 * 
 * ROOT CAUSE FIX: Proactive detection and prevention of data issues
 */

const AutomatedTestingSystem = require('./automated-testing-system');
const StandardizedDataFlow = require('./standardized-data-flow');
const db = require('../db/db');

class MonitoringAlertingSystem {
  constructor() {
    this.testingSystem = new AutomatedTestingSystem();
    this.dataFlow = new StandardizedDataFlow();
    
    // Monitoring configuration
    this.config = {
      // Alert thresholds
      thresholds: {
        maxFailedTests: 2,           // Maximum failed tests before alert
        maxOddsErrors: 1,            // Maximum odds validation errors
        maxScientificNotation: 0,    // No scientific notation allowed
        minMatchCount: 8,            // Minimum matches per cycle
        maxResponseTime: 5000        // Maximum API response time (ms)
      },
      
      // Monitoring intervals
      intervals: {
        healthCheck: 60000,          // 1 minute
        dataValidation: 300000,      // 5 minutes
        fullSystemTest: 1800000      // 30 minutes
      },
      
      // Alert channels
      alertChannels: {
        console: true,               // Console logging
        database: true,              // Database logging
        webhook: false               // Webhook notifications (configure URL)
      }
    };
    
    // Monitoring state
    this.state = {
      isRunning: false,
      lastHealthCheck: null,
      lastFullTest: null,
      consecutiveFailures: 0,
      alertHistory: []
    };
    
    // Performance metrics
    this.metrics = {
      apiResponseTimes: [],
      oddsValidationResults: [],
      dataTransformationResults: [],
      systemHealthHistory: []
    };
  }

  /**
   * Start continuous monitoring
   */
  async startMonitoring() {
    if (this.state.isRunning) {
      console.log('⚠️ Monitoring system is already running');
      return;
    }

    this.state.isRunning = true;
    console.log('🔍 Starting continuous monitoring system...');

    // Initialize monitoring database tables
    await this.initializeMonitoringTables();

    // Start monitoring intervals
    this.healthCheckInterval = setInterval(() => {
      this.runHealthCheck().catch(error => {
        console.error('❌ Health check error:', error);
      });
    }, this.config.intervals.healthCheck);

    this.dataValidationInterval = setInterval(() => {
      this.runDataValidation().catch(error => {
        console.error('❌ Data validation error:', error);
      });
    }, this.config.intervals.dataValidation);

    this.fullSystemTestInterval = setInterval(() => {
      this.runFullSystemTest().catch(error => {
        console.error('❌ Full system test error:', error);
      });
    }, this.config.intervals.fullSystemTest);

    // Run initial checks
    await this.runHealthCheck();
    await this.runDataValidation();

    console.log('✅ Monitoring system started successfully');
  }

  /**
   * Stop continuous monitoring
   */
  stopMonitoring() {
    if (!this.state.isRunning) {
      console.log('⚠️ Monitoring system is not running');
      return;
    }

    this.state.isRunning = false;
    
    if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);
    if (this.dataValidationInterval) clearInterval(this.dataValidationInterval);
    if (this.fullSystemTestInterval) clearInterval(this.fullSystemTestInterval);

    console.log('🛑 Monitoring system stopped');
  }

  /**
   * Initialize monitoring database tables
   */
  async initializeMonitoringTables() {
    try {
      // Create monitoring tables if they don't exist
      await db.query(`
        CREATE TABLE IF NOT EXISTS oracle.monitoring_alerts (
          id SERIAL PRIMARY KEY,
          alert_type VARCHAR(50) NOT NULL,
          severity VARCHAR(20) NOT NULL,
          message TEXT NOT NULL,
          details JSONB,
          created_at TIMESTAMP DEFAULT NOW(),
          resolved_at TIMESTAMP,
          is_resolved BOOLEAN DEFAULT FALSE
        )
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS oracle.monitoring_metrics (
          id SERIAL PRIMARY KEY,
          metric_type VARCHAR(50) NOT NULL,
          metric_value NUMERIC,
          metric_data JSONB,
          recorded_at TIMESTAMP DEFAULT NOW()
        )
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS oracle.system_health_checks (
          id SERIAL PRIMARY KEY,
          check_type VARCHAR(50) NOT NULL,
          status VARCHAR(20) NOT NULL,
          details JSONB,
          response_time_ms INTEGER,
          checked_at TIMESTAMP DEFAULT NOW()
        )
      `);

      console.log('✅ Monitoring tables initialized');
    } catch (error) {
      console.error('❌ Error initializing monitoring tables:', error);
      throw error;
    }
  }

  /**
   * Run health check
   */
  async runHealthCheck() {
    const startTime = Date.now();
    const healthResult = {
      timestamp: new Date().toISOString(),
      status: 'unknown',
      checks: {},
      responseTime: 0
    };

    try {
      console.log('🔍 Running health check...');

      // Check 1: Database connectivity
      healthResult.checks.database = await this.checkDatabaseHealth();
      
      // Check 2: API endpoints
      healthResult.checks.api = await this.checkApiHealth();
      
      // Check 3: Data pipeline
      healthResult.checks.dataPipeline = await this.checkDataPipelineHealth();
      
      // Check 4: Odds validation
      healthResult.checks.oddsValidation = await this.checkOddsValidationHealth();

      // Determine overall status
      const failedChecks = Object.values(healthResult.checks).filter(check => check.status === 'failed');
      const criticalChecks = Object.values(healthResult.checks).filter(check => check.status === 'critical');
      
      if (criticalChecks.length > 0) {
        healthResult.status = 'critical';
        this.state.consecutiveFailures++;
      } else if (failedChecks.length > 0) {
        healthResult.status = 'warning';
        this.state.consecutiveFailures++;
      } else {
        healthResult.status = 'healthy';
        this.state.consecutiveFailures = 0;
      }

      healthResult.responseTime = Date.now() - startTime;
      this.state.lastHealthCheck = healthResult;

      // Record metrics
      await this.recordMetric('health_check', healthResult.responseTime, healthResult);
      
      // Check for alerts
      await this.checkForAlerts(healthResult);

      console.log(`✅ Health check completed: ${healthResult.status} (${healthResult.responseTime}ms)`);

    } catch (error) {
      healthResult.status = 'error';
      healthResult.error = error.message;
      healthResult.responseTime = Date.now() - startTime;
      
      console.error('❌ Health check failed:', error);
      await this.triggerAlert('health_check_failed', 'critical', `Health check failed: ${error.message}`, { error: error.message });
    }

    return healthResult;
  }

  /**
   * Check database health
   */
  async checkDatabaseHealth() {
    const check = { status: 'unknown', details: {} };
    
    try {
      const startTime = Date.now();
      
      // Test basic connectivity
      await db.query('SELECT 1');
      check.details.connectivity = 'ok';
      
      // Check key tables exist
      const tablesResult = await db.query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'oracle' 
        AND table_name IN ('fixtures', 'oddyssey_cycles', 'daily_game_matches')
      `);
      
      const expectedTables = ['fixtures', 'oddyssey_cycles', 'daily_game_matches'];
      const existingTables = tablesResult.rows.map(row => row.table_name);
      const missingTables = expectedTables.filter(table => !existingTables.includes(table));
      
      if (missingTables.length > 0) {
        check.status = 'failed';
        check.details.missingTables = missingTables;
      } else {
        check.status = 'healthy';
        check.details.allTablesExist = true;
      }
      
      check.details.responseTime = Date.now() - startTime;
      
    } catch (error) {
      check.status = 'critical';
      check.details.error = error.message;
    }
    
    return check;
  }

  /**
   * Check API health
   */
  async checkApiHealth() {
    const check = { status: 'unknown', details: {} };
    
    try {
      // This would typically make HTTP requests to API endpoints
      // For now, we'll simulate API health checks
      
      const startTime = Date.now();
      
      // Simulate checking /api/oddyssey/matches endpoint
      const todayDate = new Date().toISOString().split('T')[0];
      const matchesResult = await db.query(`
        SELECT COUNT(*) as count FROM oracle.daily_game_matches 
        WHERE game_date = $1
      `, [todayDate]);
      
      const matchCount = parseInt(matchesResult.rows[0].count);
      
      if (matchCount >= this.config.thresholds.minMatchCount) {
        check.status = 'healthy';
        check.details.matchCount = matchCount;
      } else if (matchCount > 0) {
        check.status = 'warning';
        check.details.matchCount = matchCount;
        check.details.message = `Low match count: ${matchCount} (expected: ${this.config.thresholds.minMatchCount})`;
      } else {
        check.status = 'failed';
        check.details.matchCount = matchCount;
        check.details.message = 'No matches found for today';
      }
      
      check.details.responseTime = Date.now() - startTime;
      
    } catch (error) {
      check.status = 'critical';
      check.details.error = error.message;
    }
    
    return check;
  }

  /**
   * Check data pipeline health
   */
  async checkDataPipelineHealth() {
    const check = { status: 'unknown', details: {} };
    
    try {
      const healthReport = await this.dataFlow.generateHealthReport();
      
      if (healthReport.dataFlowHealth === 'healthy') {
        check.status = 'healthy';
      } else if (healthReport.dataFlowHealth === 'warning') {
        check.status = 'warning';
      } else {
        check.status = 'failed';
      }
      
      check.details = healthReport;
      
    } catch (error) {
      check.status = 'critical';
      check.details.error = error.message;
    }
    
    return check;
  }

  /**
   * Check odds validation health
   */
  async checkOddsValidationHealth() {
    const check = { status: 'unknown', details: {} };
    
    try {
      // Check for recent odds validation issues
      const recentOddsResult = await db.query(`
        SELECT 
          COUNT(*) as total_matches,
          COUNT(CASE WHEN home_odds IS NULL OR home_odds <= 0 THEN 1 END) as invalid_home_odds,
          COUNT(CASE WHEN draw_odds IS NULL OR draw_odds <= 0 THEN 1 END) as invalid_draw_odds,
          COUNT(CASE WHEN away_odds IS NULL OR away_odds <= 0 THEN 1 END) as invalid_away_odds,
          COUNT(CASE WHEN over_25_odds IS NULL OR over_25_odds <= 0 THEN 1 END) as invalid_over_odds,
          COUNT(CASE WHEN under_25_odds IS NULL OR under_25_odds <= 0 THEN 1 END) as invalid_under_odds
        FROM oracle.daily_game_matches 
        WHERE game_date >= CURRENT_DATE - INTERVAL '1 day'
      `);
      
      const oddsStats = recentOddsResult.rows[0];
      const totalInvalidOdds = parseInt(oddsStats.invalid_home_odds) + 
                              parseInt(oddsStats.invalid_draw_odds) + 
                              parseInt(oddsStats.invalid_away_odds) + 
                              parseInt(oddsStats.invalid_over_odds) + 
                              parseInt(oddsStats.invalid_under_odds);
      
      if (totalInvalidOdds === 0) {
        check.status = 'healthy';
      } else if (totalInvalidOdds <= this.config.thresholds.maxOddsErrors) {
        check.status = 'warning';
      } else {
        check.status = 'failed';
      }
      
      check.details = {
        totalMatches: parseInt(oddsStats.total_matches),
        invalidOddsCount: totalInvalidOdds,
        breakdown: oddsStats
      };
      
    } catch (error) {
      check.status = 'critical';
      check.details.error = error.message;
    }
    
    return check;
  }

  /**
   * Run data validation
   */
  async runDataValidation() {
    console.log('🔍 Running data validation...');
    
    try {
      // Run continuous monitoring from testing system
      const monitoringResult = await this.testingSystem.runContinuousMonitoring();
      
      // Record results
      await this.recordMetric('data_validation', null, monitoringResult);
      
      // Check for issues
      if (monitoringResult.status === 'critical' || monitoringResult.status === 'failed') {
        await this.triggerAlert('data_validation_failed', 'high', 
          `Data validation failed: ${monitoringResult.status}`, monitoringResult);
      }
      
      console.log(`✅ Data validation completed: ${monitoringResult.status}`);
      
    } catch (error) {
      console.error('❌ Data validation error:', error);
      await this.triggerAlert('data_validation_error', 'critical', 
        `Data validation error: ${error.message}`, { error: error.message });
    }
  }

  /**
   * Run full system test
   */
  async runFullSystemTest() {
    console.log('🧪 Running full system test...');
    
    try {
      const testResults = await this.testingSystem.runComprehensiveTests();
      
      // Record results
      await this.recordMetric('full_system_test', testResults.passedTests, testResults);
      
      this.state.lastFullTest = testResults;
      
      // Check for failures
      if (testResults.failedTests > this.config.thresholds.maxFailedTests) {
        await this.triggerAlert('system_test_failures', 'high', 
          `System test failures: ${testResults.failedTests}/${testResults.totalTests}`, testResults);
      }
      
      console.log(`✅ Full system test completed: ${testResults.passedTests}/${testResults.totalTests} passed`);
      
    } catch (error) {
      console.error('❌ Full system test error:', error);
      await this.triggerAlert('system_test_error', 'critical', 
        `Full system test error: ${error.message}`, { error: error.message });
    }
  }

  /**
   * Check for alerts based on health results
   */
  async checkForAlerts(healthResult) {
    // Check consecutive failures
    if (this.state.consecutiveFailures >= 3) {
      await this.triggerAlert('consecutive_failures', 'critical', 
        `${this.state.consecutiveFailures} consecutive health check failures`, 
        { consecutiveFailures: this.state.consecutiveFailures, lastResult: healthResult });
    }
    
    // Check response time
    if (healthResult.responseTime > this.config.thresholds.maxResponseTime) {
      await this.triggerAlert('slow_response', 'medium', 
        `Slow health check response: ${healthResult.responseTime}ms`, 
        { responseTime: healthResult.responseTime, threshold: this.config.thresholds.maxResponseTime });
    }
    
    // Check specific component failures
    for (const [component, check] of Object.entries(healthResult.checks)) {
      if (check.status === 'critical') {
        await this.triggerAlert(`${component}_critical`, 'critical', 
          `Critical failure in ${component}`, check);
      } else if (check.status === 'failed') {
        await this.triggerAlert(`${component}_failed`, 'high', 
          `Failure in ${component}`, check);
      }
    }
  }

  /**
   * Trigger an alert
   */
  async triggerAlert(alertType, severity, message, details = {}) {
    const alert = {
      alertType,
      severity,
      message,
      details,
      timestamp: new Date().toISOString()
    };
    
    console.log(`🚨 [${severity.toUpperCase()}] ${alertType}: ${message}`);
    
    // Store in database
    if (this.config.alertChannels.database) {
      try {
        await db.query(`
          INSERT INTO oracle.monitoring_alerts (alert_type, severity, message, details)
          VALUES ($1, $2, $3, $4)
        `, [alertType, severity, message, JSON.stringify(details)]);
      } catch (error) {
        console.error('❌ Error storing alert in database:', error);
      }
    }
    
    // Add to alert history
    this.state.alertHistory.push(alert);
    
    // Keep only last 100 alerts in memory
    if (this.state.alertHistory.length > 100) {
      this.state.alertHistory = this.state.alertHistory.slice(-100);
    }
  }

  /**
   * Record a metric
   */
  async recordMetric(metricType, metricValue, metricData = {}) {
    try {
      await db.query(`
        INSERT INTO oracle.monitoring_metrics (metric_type, metric_value, metric_data)
        VALUES ($1, $2, $3)
      `, [metricType, metricValue, JSON.stringify(metricData)]);
    } catch (error) {
      console.error('❌ Error recording metric:', error);
    }
  }

  /**
   * Get monitoring dashboard data
   */
  async getDashboardData() {
    try {
      // Get recent alerts
      const alertsResult = await db.query(`
        SELECT * FROM oracle.monitoring_alerts 
        WHERE created_at >= NOW() - INTERVAL '24 hours'
        ORDER BY created_at DESC
        LIMIT 50
      `);
      
      // Get recent metrics
      const metricsResult = await db.query(`
        SELECT * FROM oracle.monitoring_metrics 
        WHERE recorded_at >= NOW() - INTERVAL '24 hours'
        ORDER BY recorded_at DESC
        LIMIT 100
      `);
      
      // Get recent health checks
      const healthResult = await db.query(`
        SELECT * FROM oracle.system_health_checks 
        WHERE checked_at >= NOW() - INTERVAL '24 hours'
        ORDER BY checked_at DESC
        LIMIT 50
      `);
      
      return {
        status: this.state.isRunning ? 'running' : 'stopped',
        lastHealthCheck: this.state.lastHealthCheck,
        lastFullTest: this.state.lastFullTest,
        consecutiveFailures: this.state.consecutiveFailures,
        recentAlerts: alertsResult.rows,
        recentMetrics: metricsResult.rows,
        recentHealthChecks: healthResult.rows,
        alertHistory: this.state.alertHistory.slice(-20) // Last 20 alerts
      };
    } catch (error) {
      console.error('❌ Error getting dashboard data:', error);
      throw error;
    }
  }
}

module.exports = MonitoringAlertingSystem;
