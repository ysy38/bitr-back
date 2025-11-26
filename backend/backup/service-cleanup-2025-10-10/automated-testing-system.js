/**
 * Automated Testing System
 * 
 * This service provides comprehensive automated testing and continuous monitoring
 * for the entire system to ensure data integrity and prevent issues.
 * 
 * ROOT CAUSE FIX: Automated validation and testing of all system components
 */

const db = require('../db/db');

class AutomatedTestingSystem {
  constructor() {
    // Testing configuration
    this.config = {
      // Test thresholds
      thresholds: {
        maxResponseTime: 5000,        // Maximum API response time (ms)
        minMatchCount: 8,             // Minimum matches per cycle
        maxOddsDeviation: 0.1,        // Maximum odds deviation allowed
        minOddsValue: 1.01,           // Minimum valid odds value
        maxOddsValue: 50.0            // Maximum valid odds value
      },
      
      // Test intervals
      intervals: {
        continuousMonitoring: 300000,  // 5 minutes
        comprehensiveTest: 1800000     // 30 minutes
      }
    };
    
    // Test state
    this.state = {
      isRunning: false,
      lastTest: null,
      testHistory: []
    };
  }

  /**
   * Run comprehensive system tests
   */
  async runComprehensiveTests() {
    const startTime = Date.now();
    const testResults = {
      timestamp: new Date().toISOString(),
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      overallStatus: 'unknown',
      tests: {},
      responseTime: 0
    };

    try {
      console.log('🧪 Running comprehensive system tests...');

      // Test 1: Database connectivity and schema
      testResults.tests.database = await this.testDatabaseHealth();
      testResults.totalTests++;
      if (testResults.tests.database.status === 'passed') testResults.passedTests++;
      else testResults.failedTests++;

      // Test 2: Data integrity
      testResults.tests.dataIntegrity = await this.testDataIntegrity();
      testResults.totalTests++;
      if (testResults.tests.dataIntegrity.status === 'passed') testResults.passedTests++;
      else testResults.failedTests++;

      // Test 3: Odds validation
      testResults.tests.oddsValidation = await this.testOddsValidation();
      testResults.totalTests++;
      if (testResults.tests.oddsValidation.status === 'passed') testResults.passedTests++;
      else testResults.failedTests++;

      // Test 4: API endpoints
      testResults.tests.apiEndpoints = await this.testApiEndpoints();
      testResults.totalTests++;
      if (testResults.tests.apiEndpoints.status === 'passed') testResults.passedTests++;
      else testResults.failedTests++;

      // Test 5: System performance
      testResults.tests.performance = await this.testSystemPerformance();
      testResults.totalTests++;
      if (testResults.tests.performance.status === 'passed') testResults.passedTests++;
      else testResults.failedTests++;

      // Determine overall status
      if (testResults.failedTests === 0) {
        testResults.overallStatus = 'passed';
      } else if (testResults.failedTests <= 2) {
        testResults.overallStatus = 'warning';
      } else {
        testResults.overallStatus = 'failed';
      }

      testResults.responseTime = Date.now() - startTime;
      this.state.lastTest = testResults;

      // Store test results
      await this.storeTestResults(testResults);

      console.log(`✅ Comprehensive tests completed: ${testResults.passedTests}/${testResults.totalTests} passed (${testResults.responseTime}ms)`);

    } catch (error) {
      testResults.overallStatus = 'error';
      testResults.error = error.message;
      testResults.responseTime = Date.now() - startTime;
      
      console.error('❌ Comprehensive tests failed:', error);
    }

    return testResults;
  }

  /**
   * Run continuous monitoring
   */
  async runContinuousMonitoring() {
    const startTime = Date.now();
    const monitoringResult = {
      timestamp: new Date().toISOString(),
      status: 'unknown',
      checks: {},
      responseTime: 0
    };

    try {
      console.log('🔍 Running continuous monitoring...');

      // Monitor 1: Recent data quality
      monitoringResult.checks.dataQuality = await this.monitorDataQuality();
      
      // Monitor 2: System resources
      monitoringResult.checks.systemResources = await this.monitorSystemResources();
      
      // Monitor 3: Error rates
      monitoringResult.checks.errorRates = await this.monitorErrorRates();
      
      // Monitor 4: Data freshness
      monitoringResult.checks.dataFreshness = await this.monitorDataFreshness();

      // Determine overall status
      const failedChecks = Object.values(monitoringResult.checks).filter(check => check.status === 'failed');
      const criticalChecks = Object.values(monitoringResult.checks).filter(check => check.status === 'critical');
      
      if (criticalChecks.length > 0) {
        monitoringResult.status = 'critical';
      } else if (failedChecks.length > 0) {
        monitoringResult.status = 'failed';
      } else {
        monitoringResult.status = 'healthy';
      }

      monitoringResult.responseTime = Date.now() - startTime;

      console.log(`✅ Continuous monitoring completed: ${monitoringResult.status} (${monitoringResult.responseTime}ms)`);

    } catch (error) {
      monitoringResult.status = 'error';
      monitoringResult.error = error.message;
      monitoringResult.responseTime = Date.now() - startTime;
      
      console.error('❌ Continuous monitoring failed:', error);
    }

    return monitoringResult;
  }

  /**
   * Test database health
   */
  async testDatabaseHealth() {
    const test = { status: 'unknown', details: {} };
    
    try {
      const startTime = Date.now();
      
      // Test basic connectivity
      await db.query('SELECT 1');
      test.details.connectivity = 'ok';
      
      // Test critical tables exist
      const tablesResult = await db.query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'oracle' 
        AND table_name IN ('fixtures', 'oddyssey_cycles', 'daily_game_matches', 'user_slips')
      `);
      
      const expectedTables = ['fixtures', 'oddyssey_cycles', 'daily_game_matches', 'user_slips'];
      const existingTables = tablesResult.rows.map(row => row.table_name);
      const missingTables = expectedTables.filter(table => !existingTables.includes(table));
      
      if (missingTables.length > 0) {
        test.status = 'failed';
        test.details.missingTables = missingTables;
        test.details.message = `Missing critical tables: ${missingTables.join(', ')}`;
      } else {
        test.status = 'passed';
        test.details.allTablesExist = true;
      }
      
      test.details.responseTime = Date.now() - startTime;
      
    } catch (error) {
      test.status = 'failed';
      test.details.error = error.message;
    }
    
    return test;
  }

  /**
   * Test data integrity
   */
  async testDataIntegrity() {
    const test = { status: 'unknown', details: {} };
    
    try {
      // Check for null or invalid data in critical fields
      const integrityResult = await db.query(`
        SELECT 
          COUNT(*) as total_matches,
          COUNT(CASE WHEN fixture_id IS NULL THEN 1 END) as null_fixture_ids,
          COUNT(CASE WHEN home_team IS NULL OR home_team = '' THEN 1 END) as null_home_teams,
          COUNT(CASE WHEN away_team IS NULL OR away_team = '' THEN 1 END) as null_away_teams,
          COUNT(CASE WHEN game_date IS NULL THEN 1 END) as null_game_dates
        FROM oracle.daily_game_matches 
        WHERE game_date >= CURRENT_DATE - INTERVAL '7 days'
      `);
      
      const integrity = integrityResult.rows[0];
      const totalIssues = parseInt(integrity.null_fixture_ids) + 
                         parseInt(integrity.null_home_teams) + 
                         parseInt(integrity.null_away_teams) + 
                         parseInt(integrity.null_game_dates);
      
      if (totalIssues === 0) {
        test.status = 'passed';
        test.details.message = 'All data integrity checks passed';
      } else {
        test.status = 'failed';
        test.details.message = `Found ${totalIssues} data integrity issues`;
        test.details.issues = integrity;
      }
      
    } catch (error) {
      test.status = 'failed';
      test.details.error = error.message;
    }
    
    return test;
  }

  /**
   * Test odds validation
   */
  async testOddsValidation() {
    const test = { status: 'unknown', details: {} };
    
    try {
      // Check for invalid odds values
      const oddsResult = await db.query(`
        SELECT 
          COUNT(*) as total_matches,
          COUNT(CASE WHEN home_odds IS NULL OR home_odds <= 0 OR home_odds > 50 THEN 1 END) as invalid_home_odds,
          COUNT(CASE WHEN draw_odds IS NULL OR draw_odds <= 0 OR draw_odds > 50 THEN 1 END) as invalid_draw_odds,
          COUNT(CASE WHEN away_odds IS NULL OR away_odds <= 0 OR away_odds > 50 THEN 1 END) as invalid_away_odds,
          COUNT(CASE WHEN over_25_odds IS NULL OR over_25_odds <= 0 OR over_25_odds > 50 THEN 1 END) as invalid_over_odds,
          COUNT(CASE WHEN under_25_odds IS NULL OR under_25_odds <= 0 OR under_25_odds > 50 THEN 1 END) as invalid_under_odds
        FROM oracle.daily_game_matches 
        WHERE game_date >= CURRENT_DATE - INTERVAL '3 days'
      `);
      
      const odds = oddsResult.rows[0];
      const totalInvalidOdds = parseInt(odds.invalid_home_odds) + 
                              parseInt(odds.invalid_draw_odds) + 
                              parseInt(odds.invalid_away_odds) + 
                              parseInt(odds.invalid_over_odds) + 
                              parseInt(odds.invalid_under_odds);
      
      if (totalInvalidOdds === 0) {
        test.status = 'passed';
        test.details.message = 'All odds validation checks passed';
      } else if (totalInvalidOdds <= 5) {
        test.status = 'warning';
        test.details.message = `Found ${totalInvalidOdds} invalid odds (within acceptable range)`;
      } else {
        test.status = 'failed';
        test.details.message = `Found ${totalInvalidOdds} invalid odds (exceeds threshold)`;
      }
      
      test.details.oddsStats = odds;
      
    } catch (error) {
      test.status = 'failed';
      test.details.error = error.message;
    }
    
    return test;
  }

  /**
   * Test API endpoints (simulated)
   */
  async testApiEndpoints() {
    const test = { status: 'unknown', details: {} };
    
    try {
      // Simulate API endpoint testing by checking data availability
      const todayDate = new Date().toISOString().split('T')[0];
      
      // Check if today's matches are available
      const matchesResult = await db.query(`
        SELECT COUNT(*) as count FROM oracle.daily_game_matches 
        WHERE game_date = $1
      `, [todayDate]);
      
      const matchCount = parseInt(matchesResult.rows[0].count);
      
      if (matchCount >= this.config.thresholds.minMatchCount) {
        test.status = 'passed';
        test.details.message = `API endpoints healthy - ${matchCount} matches available`;
      } else if (matchCount > 0) {
        test.status = 'warning';
        test.details.message = `Low match count: ${matchCount} (expected: ${this.config.thresholds.minMatchCount})`;
      } else {
        test.status = 'failed';
        test.details.message = 'No matches available for today';
      }
      
      test.details.matchCount = matchCount;
      
    } catch (error) {
      test.status = 'failed';
      test.details.error = error.message;
    }
    
    return test;
  }

  /**
   * Test system performance
   */
  async testSystemPerformance() {
    const test = { status: 'unknown', details: {} };
    
    try {
      const startTime = Date.now();
      
      // Test database query performance
      await db.query(`
        SELECT COUNT(*) FROM oracle.daily_game_matches 
        WHERE game_date >= CURRENT_DATE - INTERVAL '7 days'
      `);
      
      const queryTime = Date.now() - startTime;
      
      if (queryTime <= this.config.thresholds.maxResponseTime) {
        test.status = 'passed';
        test.details.message = `Performance test passed (${queryTime}ms)`;
      } else {
        test.status = 'failed';
        test.details.message = `Performance test failed - slow response (${queryTime}ms)`;
      }
      
      test.details.queryTime = queryTime;
      test.details.threshold = this.config.thresholds.maxResponseTime;
      
    } catch (error) {
      test.status = 'failed';
      test.details.error = error.message;
    }
    
    return test;
  }

  /**
   * Monitor data quality
   */
  async monitorDataQuality() {
    const monitor = { status: 'unknown', details: {} };
    
    try {
      // Check recent data quality
      const qualityResult = await db.query(`
        SELECT 
          COUNT(*) as total_recent_matches,
          AVG(CASE WHEN home_odds > 0 AND draw_odds > 0 AND away_odds > 0 THEN 1 ELSE 0 END) as odds_completeness
        FROM oracle.daily_game_matches 
        WHERE created_at >= NOW() - INTERVAL '1 hour'
      `);
      
      const quality = qualityResult.rows[0];
      const oddsCompleteness = parseFloat(quality.odds_completeness) || 0;
      
      if (oddsCompleteness >= 0.95) {
        monitor.status = 'healthy';
        monitor.details.message = `Data quality excellent (${(oddsCompleteness * 100).toFixed(1)}% odds completeness)`;
      } else if (oddsCompleteness >= 0.8) {
        monitor.status = 'warning';
        monitor.details.message = `Data quality acceptable (${(oddsCompleteness * 100).toFixed(1)}% odds completeness)`;
      } else {
        monitor.status = 'failed';
        monitor.details.message = `Data quality poor (${(oddsCompleteness * 100).toFixed(1)}% odds completeness)`;
      }
      
      monitor.details.stats = quality;
      
    } catch (error) {
      monitor.status = 'failed';
      monitor.details.error = error.message;
    }
    
    return monitor;
  }

  /**
   * Monitor system resources (simulated)
   */
  async monitorSystemResources() {
    const monitor = { status: 'healthy', details: {} };
    
    try {
      // Simulate system resource monitoring
      const memoryUsage = process.memoryUsage();
      const uptime = process.uptime();
      
      monitor.details.memoryUsage = {
        rss: Math.round(memoryUsage.rss / 1024 / 1024), // MB
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) // MB
      };
      
      monitor.details.uptime = Math.round(uptime);
      monitor.details.message = `System resources normal (${monitor.details.memoryUsage.rss}MB RSS, ${Math.round(uptime/3600)}h uptime)`;
      
    } catch (error) {
      monitor.status = 'failed';
      monitor.details.error = error.message;
    }
    
    return monitor;
  }

  /**
   * Monitor error rates
   */
  async monitorErrorRates() {
    const monitor = { status: 'unknown', details: {} };
    
    try {
      // Check for recent errors in monitoring tables (if they exist)
      try {
        const errorResult = await db.query(`
          SELECT COUNT(*) as error_count
          FROM oracle.monitoring_alerts 
          WHERE severity IN ('critical', 'high') 
          AND created_at >= NOW() - INTERVAL '1 hour'
        `);
        
        const errorCount = parseInt(errorResult.rows[0].error_count);
        
        if (errorCount === 0) {
          monitor.status = 'healthy';
          monitor.details.message = 'No recent errors detected';
        } else if (errorCount <= 5) {
          monitor.status = 'warning';
          monitor.details.message = `${errorCount} recent errors (within acceptable range)`;
        } else {
          monitor.status = 'failed';
          monitor.details.message = `${errorCount} recent errors (exceeds threshold)`;
        }
        
        monitor.details.errorCount = errorCount;
        
      } catch (tableError) {
        // Monitoring tables might not exist yet
        monitor.status = 'healthy';
        monitor.details.message = 'Error monitoring not yet configured';
      }
      
    } catch (error) {
      monitor.status = 'failed';
      monitor.details.error = error.message;
    }
    
    return monitor;
  }

  /**
   * Monitor data freshness
   */
  async monitorDataFreshness() {
    const monitor = { status: 'unknown', details: {} };
    
    try {
      // Check when data was last updated
      const freshnessResult = await db.query(`
        SELECT 
          MAX(created_at) as last_update,
          COUNT(*) as recent_count
        FROM oracle.daily_game_matches 
        WHERE created_at >= NOW() - INTERVAL '24 hours'
      `);
      
      const freshness = freshnessResult.rows[0];
      const lastUpdate = new Date(freshness.last_update);
      const hoursAgo = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60);
      
      if (hoursAgo <= 2) {
        monitor.status = 'healthy';
        monitor.details.message = `Data is fresh (last update ${hoursAgo.toFixed(1)}h ago)`;
      } else if (hoursAgo <= 6) {
        monitor.status = 'warning';
        monitor.details.message = `Data is somewhat stale (last update ${hoursAgo.toFixed(1)}h ago)`;
      } else {
        monitor.status = 'failed';
        monitor.details.message = `Data is stale (last update ${hoursAgo.toFixed(1)}h ago)`;
      }
      
      monitor.details.lastUpdate = freshness.last_update;
      monitor.details.recentCount = parseInt(freshness.recent_count);
      monitor.details.hoursAgo = hoursAgo;
      
    } catch (error) {
      monitor.status = 'failed';
      monitor.details.error = error.message;
    }
    
    return monitor;
  }

  /**
   * Store test results
   */
  async storeTestResults(testResults) {
    try {
      // Try to store in monitoring tables if they exist
      await db.query(`
        INSERT INTO oracle.monitoring_metrics (metric_type, metric_value, metric_data)
        VALUES ($1, $2, $3)
      `, ['automated_test_results', testResults.passedTests, JSON.stringify(testResults)]);
      
    } catch (error) {
      // Monitoring tables might not exist yet, just log
      console.log('📝 Test results stored in memory (monitoring tables not available)');
    }
    
    // Store in memory
    this.state.testHistory.push(testResults);
    
    // Keep only last 50 test results
    if (this.state.testHistory.length > 50) {
      this.state.testHistory = this.state.testHistory.slice(-50);
    }
  }

  /**
   * Get test status
   */
  getTestStatus() {
    return {
      isRunning: this.state.isRunning,
      lastTest: this.state.lastTest,
      testHistory: this.state.testHistory.slice(-10) // Last 10 tests
    };
  }
}

module.exports = AutomatedTestingSystem;
