const db = require('../db/db');
const config = require('../config');

/**
 * Comprehensive Health Monitoring Service
 * Implements Requirements 6.1, 6.2, 6.3, 6.4, 6.5
 */
class HealthMonitor {
  constructor() {
    this.startTime = Date.now();
    this.metrics = {
      requests: 0,
      errors: 0,
      dbQueries: 0,
      dbErrors: 0,
      apiCalls: 0,
      cronJobs: 0,
      cronFailures: 0
    };
    this.serviceStatus = new Map();
    this.lastHealthCheck = null;
  }

  /**
   * Requirement 6.1: Health check endpoints for all services
   */
  async getComprehensiveHealthStatus() {
    const healthCheck = {
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      status: 'healthy',
      services: {},
      metrics: { ...this.metrics },
      system: this.getSystemMetrics(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    };

    try {
      // Database health check
      healthCheck.services.database = await this.checkDatabaseHealth();
      
      // SportMonks API health check
      healthCheck.services.sportmonks = await this.checkSportMonksHealth();
      
      // Coinpaprika API health check
      healthCheck.services.coinpaprika = await this.checkCoinpaprikaHealth();
      
      // Blockchain connectivity check
      healthCheck.services.blockchain = await this.checkBlockchainHealth();
      
      // Cron jobs health check
      healthCheck.services.cronJobs = await this.checkCronJobsHealth();
      
      // Oddyssey service health check
      healthCheck.services.oddyssey = await this.checkOddysseyHealth();
      
      // Oracle services health check
      healthCheck.services.oracle = await this.checkOracleHealth();

      // Determine overall status
      healthCheck.status = this.determineOverallStatus(healthCheck.services);
      
      this.lastHealthCheck = healthCheck;
      return healthCheck;

    } catch (error) {
      this.logError('Health check failed', error);
      return {
        ...healthCheck,
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Requirement 6.3: Database connection monitoring
   */
  async checkDatabaseHealth() {
    const dbHealth = {
      status: 'unknown',
      responseTime: null,
      connections: null,
      schemas: [],
      tables: {},
      lastError: null
    };

    try {
      const start = Date.now();
      
      // Test basic connectivity
      await db.query('SELECT NOW() as current_time');
      dbHealth.responseTime = Date.now() - start;
      
      // Check connection pool status
      if (db.pool) {
        dbHealth.connections = {
          total: db.pool.totalCount,
          idle: db.pool.idleCount,
          waiting: db.pool.waitingCount
        };
      }

      // Verify critical schemas exist
      const schemaResult = await db.query(`
        SELECT schema_name 
        FROM information_schema.schemata 
        WHERE schema_name IN ('core', 'oracle', 'oddyssey', 'analytics', 'system')
      `);
      dbHealth.schemas = schemaResult.rows.map(row => row.schema_name);

      // Check critical tables
      const criticalTables = [
        'core.users',
        'core.reputation_log',
        'oracle.fixtures',
        'oracle.fixture_odds',
        'oracle.daily_game_matches',
        'system.cron_locks'
      ];

      for (const table of criticalTables) {
        try {
          const [schema, tableName] = table.split('.');
          const result = await db.query(`
            SELECT COUNT(*) as count 
            FROM information_schema.tables 
            WHERE table_schema = $1 AND table_name = $2
          `, [schema, tableName]);
          
          dbHealth.tables[table] = {
            exists: parseInt(result.rows[0].count) > 0,
            status: parseInt(result.rows[0].count) > 0 ? 'ok' : 'missing'
          };
        } catch (error) {
          dbHealth.tables[table] = {
            exists: false,
            status: 'error',
            error: error.message
          };
        }
      }

      dbHealth.status = 'healthy';
      this.metrics.dbQueries++;

    } catch (error) {
      dbHealth.status = 'unhealthy';
      dbHealth.lastError = error.message;
      this.metrics.dbErrors++;
      this.logError('Database health check failed', error);
    }

    return dbHealth;
  }

  /**
   * Check SportMonks API health
   */
  async checkSportMonksHealth() {
    const sportmonksHealth = {
      status: 'unknown',
      responseTime: null,
      apiKey: !!config.sportmonks.apiToken,
      lastError: null
    };

    try {
      if (!config.sportmonks.apiToken) {
        sportmonksHealth.status = 'degraded';
        sportmonksHealth.lastError = 'API token not configured';
        return sportmonksHealth;
      }

      const start = Date.now();
      const axios = require('axios');
      
      // Test API connectivity with a simple request
      const response = await axios.get(`${config.sportmonks.baseUrl}/leagues`, {
        params: { api_token: config.sportmonks.apiToken },
        timeout: 5000
      });

      sportmonksHealth.responseTime = Date.now() - start;
      sportmonksHealth.status = response.status === 200 ? 'healthy' : 'degraded';
      sportmonksHealth.rateLimit = response.headers['x-ratelimit-remaining'] || 'unknown';

    } catch (error) {
      sportmonksHealth.status = 'unhealthy';
      sportmonksHealth.lastError = error.message;
      this.logError('SportMonks health check failed', error);
    }

    return sportmonksHealth;
  }

  /**
   * Check Coinpaprika API health
   */
  async checkCoinpaprikaHealth() {
    const coinpaprikaHealth = {
      status: 'unknown',
      responseTime: null,
      lastError: null
    };

    try {
      const start = Date.now();
      const axios = require('axios');
      
      // Test API connectivity
      const response = await axios.get(`${config.coinpaprika.baseUrl}/global`, {
        timeout: 5000
      });

      coinpaprikaHealth.responseTime = Date.now() - start;
      coinpaprikaHealth.status = response.status === 200 ? 'healthy' : 'degraded';

    } catch (error) {
      coinpaprikaHealth.status = 'unhealthy';
      coinpaprikaHealth.lastError = error.message;
      this.logError('Coinpaprika health check failed', error);
    }

    return coinpaprikaHealth;
  }

  /**
   * Check blockchain connectivity
   */
  async checkBlockchainHealth() {
    const blockchainHealth = {
      status: 'unknown',
      responseTime: null,
      network: 'somnia',
      rpcUrl: config.blockchain.rpcUrl,
      lastError: null
    };

    try {
      const start = Date.now();
      const { ethers } = require('ethers');
      
      const provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
      const blockNumber = await provider.getBlockNumber();
      
      blockchainHealth.responseTime = Date.now() - start;
      blockchainHealth.status = 'healthy';
      blockchainHealth.latestBlock = blockNumber;

    } catch (error) {
      blockchainHealth.status = 'unhealthy';
      blockchainHealth.lastError = error.message;
      this.logError('Blockchain health check failed', error);
    }

    return blockchainHealth;
  }

  /**
   * Check cron jobs health
   */
  async checkCronJobsHealth() {
    const cronHealth = {
      status: 'unknown',
      jobs: {},
      locks: {},
      lastError: null
    };

    try {
      // Check if cron_locks table exists and get current locks
      const locksResult = await db.query(`
        SELECT job_name, locked_at, locked_by, expires_at
        FROM system.cron_locks
        WHERE expires_at > NOW()
      `);

      cronHealth.locks = {};
      locksResult.rows.forEach(lock => {
        cronHealth.locks[lock.job_name] = {
          lockedAt: lock.locked_at,
          lockedBy: lock.locked_by,
          expiresAt: lock.expires_at
        };
      });

      // Check recent cron job activity
      const recentActivity = await db.query(`
        SELECT 
          'fixtures' as job_type,
          COUNT(*) as recent_count,
          MAX(created_at) as last_run
        FROM oracle.fixtures 
        WHERE created_at > NOW() - INTERVAL '1 hour'
        UNION ALL
        SELECT 
          'oddyssey' as job_type,
          COUNT(*) as recent_count,
          MAX(created_at) as last_run
        FROM oracle.daily_game_matches 
        WHERE created_at > NOW() - INTERVAL '24 hours'
      `);

      recentActivity.rows.forEach(activity => {
        cronHealth.jobs[activity.job_type] = {
          recentActivity: parseInt(activity.recent_count),
          lastRun: activity.last_run,
          status: parseInt(activity.recent_count) > 0 ? 'active' : 'idle'
        };
      });

      cronHealth.status = 'healthy';

    } catch (error) {
      cronHealth.status = 'unhealthy';
      cronHealth.lastError = error.message;
      this.logError('Cron jobs health check failed', error);
    }

    return cronHealth;
  }

  /**
   * Check Oddyssey service health
   */
  async checkOddysseyHealth() {
    const oddysseyHealth = {
      status: 'unknown',
      dailyMatches: {},
      lastError: null
    };

    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Check if today's matches exist
      const todayMatches = await db.query(`
        SELECT COUNT(*) as count
        FROM oracle.daily_game_matches
        WHERE game_date = $1
      `, [today]);

      oddysseyHealth.dailyMatches.today = {
        count: parseInt(todayMatches.rows[0].count),
        expected: 10,
        status: parseInt(todayMatches.rows[0].count) === 10 ? 'complete' : 'incomplete'
      };

      // Check recent match selections
      const recentMatches = await db.query(`
        SELECT game_date, COUNT(*) as count
        FROM oracle.daily_game_matches
        WHERE game_date >= CURRENT_DATE - INTERVAL '7 days'
        GROUP BY game_date
        ORDER BY game_date DESC
      `);

      oddysseyHealth.dailyMatches.recent = recentMatches.rows.map(row => ({
        date: row.game_date,
        count: parseInt(row.count)
      }));

      oddysseyHealth.status = oddysseyHealth.dailyMatches.today.status === 'complete' ? 'healthy' : 'degraded';

    } catch (error) {
      oddysseyHealth.status = 'unhealthy';
      oddysseyHealth.lastError = error.message;
      this.logError('Oddyssey health check failed', error);
    }

    return oddysseyHealth;
  }

  /**
   * Check Oracle services health
   */
  async checkOracleHealth() {
    const oracleHealth = {
      status: 'unknown',
      fixtures: {},
      results: {},
      lastError: null
    };

    try {
      // Check fixture data freshness
      const fixtureStats = await db.query(`
        SELECT 
          COUNT(*) as total_fixtures,
          COUNT(CASE WHEN DATE(match_date) = CURRENT_DATE THEN 1 END) as today_fixtures,
          MAX(created_at) as last_fixture_added
        FROM oracle.fixtures
      `);

      oracleHealth.fixtures = {
        total: parseInt(fixtureStats.rows[0].total_fixtures),
        today: parseInt(fixtureStats.rows[0].today_fixtures),
        lastAdded: fixtureStats.rows[0].last_fixture_added
      };

      // Check odds data
      const oddsStats = await db.query(`
        SELECT COUNT(*) as total_odds
        FROM oracle.fixture_odds
      `);

      oracleHealth.fixtures.totalOdds = parseInt(oddsStats.rows[0].total_odds);

      oracleHealth.status = oracleHealth.fixtures.total > 0 ? 'healthy' : 'degraded';

    } catch (error) {
      oracleHealth.status = 'unhealthy';
      oracleHealth.lastError = error.message;
      this.logError('Oracle health check failed', error);
    }

    return oracleHealth;
  }

  /**
   * Get system metrics
   */
  getSystemMetrics() {
    const memUsage = process.memoryUsage();
    const uptime = Date.now() - this.startTime;
    
    return {
      memory: {
        used: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
        total: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
        external: `${Math.round(memUsage.external / 1024 / 1024)}MB`,
        rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`
      },
      cpu: process.cpuUsage(),
      uptime: {
        ms: uptime,
        hours: Math.round((uptime / (1000 * 60 * 60)) * 100) / 100
      },
      nodeVersion: process.version,
      platform: process.platform
    };
  }

  /**
   * Determine overall system status
   */
  determineOverallStatus(services) {
    const statuses = Object.values(services).map(service => service.status);
    
    if (statuses.includes('unhealthy')) {
      return 'unhealthy';
    } else if (statuses.includes('degraded')) {
      return 'degraded';
    } else {
      return 'healthy';
    }
  }

  /**
   * Requirement 6.2: Structured logging with context information
   */
  logInfo(message, context = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message,
      context,
      service: 'health-monitor'
    };
    console.log(JSON.stringify(logEntry));
  }

  logError(message, error, context = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      message,
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name
      },
      context,
      service: 'health-monitor'
    };
    console.error(JSON.stringify(logEntry));
    this.metrics.errors++;
  }

  logWarning(message, context = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: 'WARNING',
      message,
      context,
      service: 'health-monitor'
    };
    console.warn(JSON.stringify(logEntry));
  }

  /**
   * Track metrics
   */
  incrementRequests() {
    this.metrics.requests++;
  }

  incrementApiCalls() {
    this.metrics.apiCalls++;
  }

  incrementCronJobs() {
    this.metrics.cronJobs++;
  }

  incrementCronFailures() {
    this.metrics.cronFailures++;
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    const uptime = Date.now() - this.startTime;
    const uptimeHours = uptime / (1000 * 60 * 60);

    return {
      uptime_ms: uptime,
      uptime_hours: Math.round(uptimeHours * 100) / 100,
      requests_per_hour: uptimeHours > 0 ? Math.round(this.metrics.requests / uptimeHours) : 0,
      error_rate: this.metrics.requests > 0 ? 
        Math.round((this.metrics.errors / this.metrics.requests) * 10000) / 100 : 0,
      db_queries_per_hour: uptimeHours > 0 ? Math.round(this.metrics.dbQueries / uptimeHours) : 0,
      db_error_rate: this.metrics.dbQueries > 0 ?
        Math.round((this.metrics.dbErrors / this.metrics.dbQueries) * 10000) / 100 : 0,
      cron_success_rate: this.metrics.cronJobs > 0 ?
        Math.round(((this.metrics.cronJobs - this.metrics.cronFailures) / this.metrics.cronJobs) * 10000) / 100 : 100,
      api_calls_per_hour: uptimeHours > 0 ? Math.round(this.metrics.apiCalls / uptimeHours) : 0
    };
  }

  /**
   * Enhanced service health monitoring with detailed context
   * Requirement 6.5: Detailed execution logging for monitoring
   */
  async getDetailedServiceHealth() {
    const detailedHealth = {
      timestamp: new Date().toISOString(),
      services: {},
      alerts: [],
      recommendations: []
    };

    try {
      // Enhanced database monitoring
      const dbHealth = await this.checkDatabaseHealth();
      detailedHealth.services.database = {
        ...dbHealth,
        performance: {
          avgResponseTime: dbHealth.responseTime,
          connectionPoolUtilization: dbHealth.connections ? 
            Math.round((dbHealth.connections.total - dbHealth.connections.idle) / dbHealth.connections.total * 100) : 0
        }
      };

      // Add alerts based on database health
      if (dbHealth.responseTime > 1000) {
        detailedHealth.alerts.push({
          severity: 'warning',
          service: 'database',
          message: `Database response time is high: ${dbHealth.responseTime}ms`,
          recommendation: 'Check database performance and connection pool settings'
        });
      }

      // Enhanced external API monitoring
      const [sportmonks, coinpaprika, blockchain] = await Promise.all([
        this.checkSportMonksHealth(),
        this.checkCoinpaprikaHealth(),
        this.checkBlockchainHealth()
      ]);

      detailedHealth.services.externalApis = {
        sportmonks: {
          ...sportmonks,
          rateLimitStatus: sportmonks.rateLimit || 'unknown'
        },
        coinpaprika,
        blockchain
      };

      // Add API-specific alerts
      if (sportmonks.status === 'unhealthy') {
        detailedHealth.alerts.push({
          severity: 'critical',
          service: 'sportmonks',
          message: 'SportMonks API is unavailable',
          recommendation: 'Check API key and network connectivity'
        });
      }

      // Enhanced cron job monitoring
      const cronHealth = await this.checkCronJobsHealth();
      detailedHealth.services.cronJobs = {
        ...cronHealth,
        lockAnalysis: await this.analyzeCronLocks()
      };

      // Add cron-specific alerts
      if (Object.keys(cronHealth.locks).length > 3) {
        detailedHealth.alerts.push({
          severity: 'warning',
          service: 'cron',
          message: `Multiple cron jobs are locked: ${Object.keys(cronHealth.locks).join(', ')}`,
          recommendation: 'Check for stuck cron jobs and consider releasing locks'
        });
      }

      return detailedHealth;

    } catch (error) {
      this.logError('Detailed health check failed', error);
      return {
        ...detailedHealth,
        status: 'error',
        error: error.message
      };
    }
  }

  /**
   * Analyze cron job locks for potential issues
   */
  async analyzeCronLocks() {
    try {
      const locksResult = await db.query(`
        SELECT 
          job_name,
          locked_at,
          locked_by,
          expires_at,
          EXTRACT(EPOCH FROM (NOW() - locked_at)) as lock_duration_seconds
        FROM system.cron_locks
        WHERE expires_at > NOW()
        ORDER BY locked_at DESC
      `);

      const analysis = {
        totalLocks: locksResult.rows.length,
        staleLocks: [],
        longRunningJobs: []
      };

      locksResult.rows.forEach(lock => {
        const durationMinutes = lock.lock_duration_seconds / 60;
        
        // Check for stale locks (older than 30 minutes)
        if (durationMinutes > 30) {
          analysis.staleLocks.push({
            jobName: lock.job_name,
            duration: `${Math.round(durationMinutes)}m`,
            lockedBy: lock.locked_by
          });
        }

        // Check for long-running jobs (over 10 minutes)
        if (durationMinutes > 10 && durationMinutes <= 30) {
          analysis.longRunningJobs.push({
            jobName: lock.job_name,
            duration: `${Math.round(durationMinutes)}m`
          });
        }
      });

      return analysis;

    } catch (error) {
      this.logError('Failed to analyze cron locks', error);
      return { error: error.message };
    }
  }
}

// Export singleton
const healthMonitor = new HealthMonitor();
module.exports = healthMonitor;