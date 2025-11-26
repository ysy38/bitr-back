const db = require('../db/db');
const systemMonitor = require('./system-monitor');
const { EventEmitter } = require('events');

/**
 * Comprehensive Health Service
 * 
 * Provides comprehensive health checks for all system components
 * and generates detailed health reports.
 */
class ComprehensiveHealthService extends EventEmitter {
  constructor() {
    super();
    this.systemMonitor = systemMonitor;
    this.healthChecks = new Map();
    this.lastHealthReport = null;
    this.isRunning = false;
  }

  /**
   * Initialize the health service
   */
  async initialize() {
    console.log('🏥 Initializing Comprehensive Health Service...');
    
    // Register core health checks
    this.registerHealthCheck('database', {
      name: 'Database Connection',
      critical: true,
      check: async () => {
        try {
          const result = await db.query('SELECT 1 as test');
          return { status: 'healthy', message: 'Database connection active' };
        } catch (error) {
          return { status: 'unhealthy', message: `Database error: ${error.message}` };
        }
      }
    });

    this.registerHealthCheck('web3-service', {
      name: 'Web3 Service',
      critical: true,
      check: async () => {
        try {
          const Web3Service = require('./web3-service');
          const service = new Web3Service();
          
          if (!service.isInitialized) {
            return { status: 'unhealthy', message: 'Web3 service not initialized' };
          }
          
          return { status: 'healthy', message: 'Web3 service operational' };
        } catch (error) {
          return { status: 'unhealthy', message: `Web3 service error: ${error.message}` };
        }
      }
    });

    this.registerHealthCheck('event-driven-pool-sync', {
      name: 'Event-Driven Pool Sync',
      critical: true,
      check: async () => {
        try {
          const EventDrivenPoolSync = require('./event-driven-pool-sync');
          const service = new EventDrivenPoolSync();
          
          if (!service.isRunning) {
            return { status: 'unhealthy', message: 'Pool sync service not running' };
          }
          
          return { status: 'healthy', message: 'Pool sync service operational' };
        } catch (error) {
          return { status: 'unhealthy', message: `Pool sync error: ${error.message}` };
        }
      }
    });

    this.registerHealthCheck('event-driven-bet-sync', {
      name: 'Event-Driven Bet Sync',
      critical: true,
      check: async () => {
        try {
          const EventDrivenBetSync = require('./event-driven-bet-sync');
          const service = new EventDrivenBetSync();
          
          if (!service.isRunning) {
            return { status: 'unhealthy', message: 'Bet sync service not running' };
          }
          
          return { status: 'healthy', message: 'Bet sync service operational' };
        } catch (error) {
          return { status: 'unhealthy', message: `Bet sync error: ${error.message}` };
        }
      }
    });

    this.isRunning = true;
    console.log('✅ Comprehensive Health Service initialized');
  }

  /**
   * Register a health check
   */
  registerHealthCheck(name, config) {
    this.healthChecks.set(name, {
      ...config,
      lastCheck: null,
      lastResult: null,
      consecutiveFailures: 0
    });
  }

  /**
   * Run comprehensive health check
   */
  async runComprehensiveHealthCheck() {
    console.log('🔍 Running comprehensive health check...');
    
    const results = {};
    const criticalIssues = [];
    const warnings = [];
    let overallStatus = 'healthy';

    for (const [name, check] of this.healthChecks.entries()) {
      try {
        const result = await check.check();
        results[name] = {
          ...result,
          timestamp: new Date().toISOString(),
          critical: check.critical
        };

        check.lastCheck = new Date();
        check.lastResult = result;

        if (result.status === 'unhealthy') {
          if (check.critical) {
            criticalIssues.push({
              service: name,
              message: result.message,
              timestamp: new Date().toISOString()
            });
            overallStatus = 'critical';
          } else {
            warnings.push({
              service: name,
              message: result.message,
              timestamp: new Date().toISOString()
            });
            if (overallStatus === 'healthy') {
              overallStatus = 'degraded';
            }
          }
          check.consecutiveFailures++;
        } else {
          check.consecutiveFailures = 0;
        }

      } catch (error) {
        const errorResult = {
          status: 'unhealthy',
          message: `Health check failed: ${error.message}`,
          timestamp: new Date().toISOString(),
          critical: check.critical
        };
        
        results[name] = errorResult;
        
        if (check.critical) {
          criticalIssues.push({
            service: name,
            message: errorResult.message,
            timestamp: new Date().toISOString()
          });
          overallStatus = 'critical';
        } else {
          warnings.push({
            service: name,
            message: errorResult.message,
            timestamp: new Date().toISOString()
          });
          if (overallStatus === 'healthy') {
            overallStatus = 'degraded';
          }
        }
        
        check.consecutiveFailures++;
      }
    }

    const healthReport = {
      overallStatus,
      timestamp: new Date().toISOString(),
      criticalIssues,
      warnings,
      results,
      summary: {
        totalChecks: this.healthChecks.size,
        healthy: Object.values(results).filter(r => r.status === 'healthy').length,
        unhealthy: Object.values(results).filter(r => r.status === 'unhealthy').length,
        critical: criticalIssues.length,
        warnings: warnings.length
      }
    };

    this.lastHealthReport = healthReport;
    this.emit('healthCheck', healthReport);

    return healthReport;
  }

  /**
   * Generate daily health report
   */
  async generateDailyReport() {
    console.log('📊 Generating daily health report...');
    
    const healthReport = await this.runComprehensiveHealthCheck();
    
    // Get system metrics
    const systemStatus = this.systemMonitor.getSystemStatus();
    
    const dailyReport = {
      date: new Date().toISOString().split('T')[0],
      timestamp: new Date().toISOString(),
      health: healthReport,
      system: systemStatus,
      summary: {
        overallHealth: healthReport.overallStatus,
        criticalIssues: healthReport.criticalIssues.length,
        warnings: healthReport.warnings.length,
        systemStatus: systemStatus.status
      }
    };

    return dailyReport;
  }

  /**
   * Get last health report
   */
  getLastHealthReport() {
    return this.lastHealthReport;
  }

  /**
   * Get health check status for a specific service
   */
  getServiceHealth(serviceName) {
    const check = this.healthChecks.get(serviceName);
    if (!check) {
      return null;
    }
    
    return {
      name: check.name,
      critical: check.critical,
      lastCheck: check.lastCheck,
      lastResult: check.lastResult,
      consecutiveFailures: check.consecutiveFailures
    };
  }

  /**
   * Stop the health service
   */
  stop() {
    this.isRunning = false;
    console.log('🛑 Comprehensive Health Service stopped');
  }
}

module.exports = new ComprehensiveHealthService();
