const prismaService = require('../services/prisma-service');
const redis = require('../config/redis');

class HealthMonitor {
  constructor() {
    this.startTime = Date.now();
    this.metrics = {
      requests: 0,
      errors: 0,
      dbQueries: 0,
      cacheHits: 0,
      cacheMisses: 0
    };
  }

  // Comprehensive health check
  async getHealthStatus() {
    const healthCheck = {
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      status: 'healthy',
      services: {},
      metrics: { ...this.metrics },
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    };

    try {
      // Database health (Prisma)
      const dbStart = Date.now();
      const dbHealth = await prismaService.healthCheck();
      const dbTime = Date.now() - dbStart;
      
      healthCheck.services.database = {
        status: dbHealth.status,
        responseTime: `${dbTime}ms`,
        connection: 'prisma',
        schemas: ['core', 'oracle', 'oddyssey', 'analytics']
      };

      // Redis health
      const redisStart = Date.now();
      try {
        const redisClient = await redis.createRedisClient();
        if (redisClient) {
          await redisClient.ping();
          const redisTime = Date.now() - redisStart;
          healthCheck.services.redis = {
            status: 'healthy',
            responseTime: `${redisTime}ms`,
            connection: 'connected'
          };
        } else {
          healthCheck.services.redis = {
            status: 'degraded',
            message: 'Redis client unavailable, falling back gracefully'
          };
        }
      } catch (redisError) {
        healthCheck.services.redis = {
          status: 'degraded',
          error: redisError.message,
          message: 'App continues without cache'
        };
      }

      // Blockchain connectivity test
      try {
        const blockchainTest = await prismaService.queryRaw`SELECT 1 as blockchain_test`;
        healthCheck.services.blockchain = {
          status: 'connected',
          rpc: process.env.RPC_URL || 'default',
          network: 'somnia'
        };
      } catch (error) {
        healthCheck.services.blockchain = {
          status: 'error',
          error: error.message
        };
        healthCheck.status = 'degraded';
      }

      // Memory and performance metrics
      const memUsage = process.memoryUsage();
      healthCheck.system = {
        memory: {
          used: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
          total: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
          external: `${Math.round(memUsage.external / 1024 / 1024)}MB`
        },
        cpu: process.cpuUsage(),
        uptime: process.uptime()
      };

      // Database table verification (critical for preventing crashes)
      const tableCheck = await this.verifyDatabaseTables();
      healthCheck.database_integrity = tableCheck;

      if (tableCheck.missing_tables > 0) {
        healthCheck.status = 'warning';
        healthCheck.warnings = [`${tableCheck.missing_tables} tables missing`];
      }

    } catch (error) {
      healthCheck.status = 'unhealthy';
      healthCheck.error = error.message;
      healthCheck.services.database = {
        status: 'error',
        error: error.message
      };
    }

    return healthCheck;
  }

  // Verify critical database tables that were causing crashes
  async verifyDatabaseTables() {
    try {
      const criticalTables = [
        'analytics.staking_events',
        'oracle.fixture_results', 
        'oracle.daily_game_matches',
        'core.users',
        'core.reputation_actions'
      ];

      const existingTables = await prismaService.queryRaw`
        SELECT table_schema || '.' || table_name as full_name
        FROM information_schema.tables 
        WHERE table_schema IN ('analytics', 'oracle', 'oddyssey', 'core')
      `;

      const existingTableNames = existingTables.map(t => t.full_name);
      const missingTables = criticalTables.filter(table => 
        !existingTableNames.includes(table)
      );

      return {
        total_expected: criticalTables.length,
        found: existingTableNames.length,
        missing_tables: missingTables.length,
        missing: missingTables,
        status: missingTables.length === 0 ? 'complete' : 'incomplete'
      };

    } catch (error) {
      return {
        status: 'error',
        error: error.message
      };
    }
  }

  // Performance metrics tracking
  incrementRequests() {
    this.metrics.requests++;
  }

  incrementErrors() {
    this.metrics.errors++;
  }

  incrementDbQueries() {
    this.metrics.dbQueries++;
  }

  incrementCacheHit() {
    this.metrics.cacheHits++;
  }

  incrementCacheMiss() {
    this.metrics.cacheMisses++;
  }

  // Get performance insights
  getPerformanceMetrics() {
    const uptime = Date.now() - this.startTime;
    const uptimeHours = uptime / (1000 * 60 * 60);

    return {
      uptime_ms: uptime,
      uptime_hours: Math.round(uptimeHours * 100) / 100,
      requests_per_hour: Math.round(this.metrics.requests / uptimeHours),
      error_rate: this.metrics.requests > 0 ? 
        Math.round((this.metrics.errors / this.metrics.requests) * 10000) / 100 : 0,
      cache_hit_rate: this.metrics.cacheHits + this.metrics.cacheMisses > 0 ?
        Math.round((this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses)) * 10000) / 100 : 0,
      db_queries_per_hour: Math.round(this.metrics.dbQueries / uptimeHours)
    };
  }

  // Cron job health monitoring
  async getCronJobStatus() {
    try {
      // Check recent reputation actions (indicates indexer is working)
      const recentActions = await prismaService.queryRaw`
        SELECT COUNT(*) as count 
        FROM core.reputation_actions 
        WHERE created_at > NOW() - INTERVAL '1 hour'
      `;

      // Check staking events (indicates analytics are working)
      const recentStaking = await prismaService.queryRaw`
        SELECT COUNT(*) as count 
        FROM analytics.staking_events 
        WHERE created_at > NOW() - INTERVAL '1 hour'
      `;

      return {
        indexer: {
          recent_actions: parseInt(recentActions[0]?.count || 0),
          status: parseInt(recentActions[0]?.count || 0) > 0 ? 'active' : 'idle'
        },
        analytics: {
          recent_staking_events: parseInt(recentStaking[0]?.count || 0),
          status: 'monitored'
        },
        last_check: new Date().toISOString()
      };

    } catch (error) {
      return {
        status: 'error',
        error: error.message
      };
    }
  }
}

// Export singleton
const healthMonitor = new HealthMonitor();

module.exports = {
  healthMonitor,
  
  // Express middleware for health endpoint
  healthEndpoint: async (req, res) => {
    try {
      healthMonitor.incrementRequests();
      
      const health = await healthMonitor.getHealthStatus();
      const performance = healthMonitor.getPerformanceMetrics();
      const cronStatus = await healthMonitor.getCronJobStatus();

      const response = {
        ...health,
        performance,
        cron_jobs: cronStatus
      };

      const statusCode = health.status === 'healthy' ? 200 : 
                        health.status === 'degraded' ? 200 : 503;

      res.status(statusCode).json(response);
      
    } catch (error) {
      healthMonitor.incrementErrors();
      res.status(503).json({
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  },

  // Middleware to track API performance
  performanceMiddleware: (req, res, next) => {
    healthMonitor.incrementRequests();
    
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      
      if (res.statusCode >= 400) {
        healthMonitor.incrementErrors();
      }
      
      // Log slow requests
      if (duration > 1000) {
        console.warn(`⚠️ Slow request: ${req.method} ${req.path} took ${duration}ms`);
      }
    });
    
    next();
  }
};

// Graceful shutdown monitoring
process.on('SIGTERM', async () => {
  console.log('🛑 Graceful shutdown initiated...');
  try {
    await prismaService.disconnect();
    await redis.closeRedisConnection();
    console.log('✅ All connections closed gracefully');
  } catch (error) {
    console.error('❌ Error during shutdown:', error.message);
  }
  process.exit(0);
});
