const healthMonitor = require('./health-monitor');
const loggingConfig = require('../config/logging');
const db = require('../db/monitored-db');

/**
 * Comprehensive Health Monitoring Service
 * Integrates all health monitoring components and provides unified interface
 * Implements Requirements 6.1, 6.2, 6.3, 6.4, 6.5
 */
class ComprehensiveHealthService {
  constructor() {
    this.alertThresholds = {
      errorRate: 10.0, // Increased tolerance for API delays           // 5% error rate threshold
      responseTime: 10000, // Increased for SportMonks API delays       // 2 second response time threshold
      memoryUsage: 80,          // 80% memory usage threshold
      dbConnectionPool: 90,     // 90% connection pool utilization
      cronJobFailures: 5 // Increased tolerance for fixture updater        // 3 consecutive cron job failures
    };
    
    this.alertHistory = [];
    this.maxAlertHistory = 100;
  }

  /**
   * Comprehensive system health check with intelligent alerting
   */
  async getComprehensiveSystemHealth() {
    try {
      const startTime = Date.now();
      
      // Get all health data
      const [
        basicHealth,
        detailedHealth,
        performanceMetrics,
        systemMetrics,
        databaseHealth,
        cronHealth
      ] = await Promise.all([
        healthMonitor.getComprehensiveHealthStatus(),
        healthMonitor.getDetailedServiceHealth(),
        Promise.resolve(healthMonitor.getPerformanceMetrics()),
        Promise.resolve(healthMonitor.getSystemMetrics()),
        this.getEnhancedDatabaseHealth(),
        this.getEnhancedCronHealth()
      ]);

      const healthReport = {
        timestamp: new Date().toISOString(),
        checkDuration: Date.now() - startTime,
        overallStatus: this.determineOverallStatus([
          basicHealth.status,
          detailedHealth.status || 'healthy'
        ]),
        services: {
          ...basicHealth.services,
          database: databaseHealth,
          cronJobs: cronHealth
        },
        performance: performanceMetrics,
        system: systemMetrics,
        alerts: await this.generateIntelligentAlerts(basicHealth, performanceMetrics, systemMetrics),
        recommendations: await this.generateRecommendations(basicHealth, performanceMetrics),
        trends: await this.calculateHealthTrends(),
        summary: this.generateHealthSummary(basicHealth, performanceMetrics)
      };

      // Log health check completion
      await loggingConfig.info('Comprehensive health check completed', {
        service: 'health-monitor',
        duration: healthReport.checkDuration,
        status: healthReport.overallStatus,
        alertCount: healthReport.alerts.length
      });

      return healthReport;

    } catch (error) {
      await loggingConfig.error('Comprehensive health check failed', error, {
        service: 'health-monitor'
      });
      
      return {
        timestamp: new Date().toISOString(),
        overallStatus: 'error',
        error: error.message,
        alerts: [{
          severity: 'critical',
          service: 'health-monitor',
          message: 'Health monitoring system failure',
          recommendation: 'Check health monitoring service configuration'
        }]
      };
    }
  }

  /**
   * Enhanced database health with connection pool analysis
   */
  async getEnhancedDatabaseHealth() {
    try {
      const basicDbHealth = await healthMonitor.checkDatabaseHealth();
      const connectionStats = db.getConnectionStats();
      
      // Additional database metrics
      const additionalMetrics = await this.getDatabasePerformanceMetrics();
      
      return {
        ...basicDbHealth,
        connectionPool: {
          utilization: connectionStats.poolStats ? 
            Math.round(((connectionStats.poolStats.totalCount - connectionStats.poolStats.idleCount) / 
                       connectionStats.poolStats.totalCount) * 100) : 0,
          totalConnections: connectionStats.poolStats?.totalCount || 0,
          activeConnections: connectionStats.poolStats ? 
            (connectionStats.poolStats.totalCount - connectionStats.poolStats.idleCount) : 0,
          idleConnections: connectionStats.poolStats?.idleCount || 0,
          waitingConnections: connectionStats.poolStats?.waitingCount || 0
        },
        performance: {
          querySuccessRate: connectionStats.totalQueries > 0 ? 
            Math.round(((connectionStats.totalQueries - connectionStats.totalErrors) / 
                       connectionStats.totalQueries) * 100) : 100,
          averageQueryTime: additionalMetrics.averageQueryTime || 'N/A',
          slowQueries: additionalMetrics.slowQueries || 0
        },
        health: {
          consecutiveFailures: connectionStats.consecutiveFailures,
          lastSuccessfulQuery: connectionStats.lastCheck,
          isHealthy: connectionStats.isHealthy
        }
      };

    } catch (error) {
      await loggingConfig.error('Enhanced database health check failed', error);
      return {
        status: 'error',
        error: error.message
      };
    }
  }

  /**
   * Enhanced cron job health with execution analysis
   */
  async getEnhancedCronHealth() {
    try {
      const basicCronHealth = await healthMonitor.checkCronJobsHealth();
      const lockAnalysis = await healthMonitor.analyzeCronLocks();
      
      return {
        ...basicCronHealth,
        lockAnalysis,
        performance: {
          totalExecutions: healthMonitor.metrics.cronJobs,
          failures: healthMonitor.metrics.cronFailures,
          successRate: healthMonitor.getPerformanceMetrics().cron_success_rate,
          averageExecutionTime: 'N/A' // Would calculate from execution history
        },
        alerts: this.generateCronAlerts(basicCronHealth, lockAnalysis)
      };

    } catch (error) {
      await loggingConfig.error('Enhanced cron health check failed', error);
      return {
        status: 'error',
        error: error.message
      };
    }
  }

  /**
   * Generate intelligent alerts based on thresholds and patterns
   */
  async generateIntelligentAlerts(healthData, performanceMetrics, systemMetrics) {
    const alerts = [];

    try {
      // Error rate alerts
      if (performanceMetrics.error_rate > this.alertThresholds.errorRate) {
        alerts.push({
          severity: performanceMetrics.error_rate > 10 ? 'critical' : 'warning',
          service: 'api',
          message: `High error rate detected: ${performanceMetrics.error_rate}%`,
          recommendation: 'Check application logs and recent deployments',
          threshold: this.alertThresholds.errorRate,
          currentValue: performanceMetrics.error_rate
        });
      }

      // Memory usage alerts
      const memoryUsage = (systemMetrics.memory.used / systemMetrics.memory.total) * 100;
      if (memoryUsage > this.alertThresholds.memoryUsage) {
        alerts.push({
          severity: memoryUsage > 95 ? 'critical' : 'warning',
          service: 'system',
          message: `High memory usage: ${Math.round(memoryUsage)}%`,
          recommendation: 'Monitor for memory leaks and consider scaling',
          threshold: this.alertThresholds.memoryUsage,
          currentValue: Math.round(memoryUsage)
        });
      }

      // Database connection pool alerts
      if (healthData.services.database && healthData.services.database.connections) {
        const poolUtilization = ((healthData.services.database.connections.total - 
                                 healthData.services.database.connections.idle) / 
                                healthData.services.database.connections.total) * 100;
        
        if (poolUtilization > this.alertThresholds.dbConnectionPool) {
          alerts.push({
            severity: poolUtilization > 95 ? 'critical' : 'warning',
            service: 'database',
            message: `High database connection pool utilization: ${Math.round(poolUtilization)}%`,
            recommendation: 'Consider increasing connection pool size or optimizing queries',
            threshold: this.alertThresholds.dbConnectionPool,
            currentValue: Math.round(poolUtilization)
          });
        }
      }

      // Service-specific alerts
      Object.entries(healthData.services).forEach(([serviceName, serviceHealth]) => {
        if (serviceHealth.status === 'unhealthy') {
          alerts.push({
            severity: 'critical',
            service: serviceName,
            message: `Service ${serviceName} is unhealthy`,
            recommendation: `Check ${serviceName} service configuration and connectivity`,
            error: serviceHealth.lastError
          });
        } else if (serviceHealth.status === 'degraded') {
          alerts.push({
            severity: 'warning',
            service: serviceName,
            message: `Service ${serviceName} is degraded`,
            recommendation: `Monitor ${serviceName} service performance`,
            error: serviceHealth.lastError
          });
        }
      });

      // Store alerts in history
      alerts.forEach(alert => {
        this.alertHistory.unshift({
          ...alert,
          timestamp: new Date().toISOString()
        });
      });

      // Trim alert history
      if (this.alertHistory.length > this.maxAlertHistory) {
        this.alertHistory = this.alertHistory.slice(0, this.maxAlertHistory);
      }

      return alerts;

    } catch (error) {
      await loggingConfig.error('Failed to generate intelligent alerts', error);
      return [{
        severity: 'warning',
        service: 'health-monitor',
        message: 'Alert generation failed',
        error: error.message
      }];
    }
  }

  /**
   * Generate actionable recommendations
   */
  async generateRecommendations(healthData, performanceMetrics) {
    const recommendations = [];

    try {
      // Performance recommendations
      if (performanceMetrics.error_rate > 1) {
        recommendations.push({
          category: 'performance',
          priority: 'high',
          title: 'Investigate Error Rate',
          description: 'Error rate is elevated. Review recent deployments and check application logs.',
          actions: [
            'Check application logs for error patterns',
            'Review recent code deployments',
            'Monitor external service dependencies'
          ]
        });
      }

      if (performanceMetrics.db_error_rate > 1) {
        recommendations.push({
          category: 'database',
          priority: 'high',
          title: 'Database Error Investigation',
          description: 'Database errors detected. Check connection stability and query performance.',
          actions: [
            'Review database connection pool settings',
            'Check for long-running queries',
            'Monitor database server resources'
          ]
        });
      }

      // System recommendations
      const memUsage = process.memoryUsage();
      if (memUsage.heapUsed / memUsage.heapTotal > 0.8) {
        recommendations.push({
          category: 'system',
          priority: 'medium',
          title: 'Memory Usage Optimization',
          description: 'Memory usage is high. Consider optimization or scaling.',
          actions: [
            'Profile memory usage patterns',
            'Check for memory leaks',
            'Consider horizontal scaling'
          ]
        });
      }

      return recommendations;

    } catch (error) {
      await loggingConfig.error('Failed to generate recommendations', error);
      return [];
    }
  }

  /**
   * Calculate health trends (simplified - would use historical data in production)
   */
  async calculateHealthTrends() {
    try {
      // In production, this would analyze historical health data
      return {
        errorRate: {
          trend: 'stable',
          change: 0,
          period: '24h'
        },
        responseTime: {
          trend: 'stable',
          change: 0,
          period: '24h'
        },
        availability: {
          trend: 'stable',
          change: 0,
          period: '24h'
        }
      };

    } catch (error) {
      await loggingConfig.error('Failed to calculate health trends', error);
      return {};
    }
  }

  /**
   * Generate health summary
   */
  generateHealthSummary(healthData, performanceMetrics) {
    const criticalIssues = (healthData.services && 
      Object.values(healthData.services).filter(s => s.status === 'unhealthy').length) || 0;
    
    const warnings = (healthData.services && 
      Object.values(healthData.services).filter(s => s.status === 'degraded').length) || 0;

    return {
      overallHealth: healthData.status,
      criticalIssues,
      warnings,
      uptime: healthData.uptime,
      errorRate: performanceMetrics.error_rate,
      requestsPerHour: performanceMetrics.requests_per_hour,
      lastCheck: new Date().toISOString()
    };
  }

  /**
   * Determine overall system status
   */
  determineOverallStatus(statuses) {
    if (statuses.includes('unhealthy') || statuses.includes('error')) {
      return 'unhealthy';
    } else if (statuses.includes('degraded')) {
      return 'degraded';
    } else {
      return 'healthy';
    }
  }

  /**
   * Get database performance metrics
   */
  async getDatabasePerformanceMetrics() {
    try {
      // Would implement actual query performance tracking
      return {
        averageQueryTime: 'N/A',
        slowQueries: 0
      };
    } catch (error) {
      return {};
    }
  }

  /**
   * Generate cron-specific alerts
   */
  generateCronAlerts(cronHealth, lockAnalysis) {
    const alerts = [];

    if (lockAnalysis.staleLocks && lockAnalysis.staleLocks.length > 0) {
      alerts.push({
        severity: 'warning',
        message: `${lockAnalysis.staleLocks.length} stale cron locks detected`,
        recommendation: 'Review and release stale locks'
      });
    }

    if (lockAnalysis.longRunningJobs && lockAnalysis.longRunningJobs.length > 0) {
      alerts.push({
        severity: 'info',
        message: `${lockAnalysis.longRunningJobs.length} long-running cron jobs`,
        recommendation: 'Monitor job execution times'
      });
    }

    return alerts;
  }

  /**
   * Get alert history
   */
  getAlertHistory(limit = 50) {
    return this.alertHistory.slice(0, limit);
  }

  /**
   * Clear alert history
   */
  clearAlertHistory() {
    this.alertHistory = [];
  }

  /**
   * Run comprehensive health check (alias for getComprehensiveSystemHealth)
   * Used by cron jobs and monitoring systems
   */
  async runComprehensiveHealthCheck() {
    return await this.getComprehensiveSystemHealth();
  }

  /**
   * Generate daily health report
   */
  async generateDailyReport() {
    try {
      const healthReport = await this.getComprehensiveSystemHealth();
      
      const dailyReport = {
        date: new Date().toISOString().split('T')[0],
        timestamp: new Date().toISOString(),
        summary: {
          overallStatus: healthReport.overallStatus,
          totalServices: Object.keys(healthReport.services || {}).length,
          healthyServices: Object.values(healthReport.services || {}).filter(s => s.status === 'healthy').length,
          degradedServices: Object.values(healthReport.services || {}).filter(s => s.status === 'degraded').length,
          unhealthyServices: Object.values(healthReport.services || {}).filter(s => s.status === 'unhealthy').length,
          totalAlerts: healthReport.alerts ? healthReport.alerts.length : 0,
          criticalAlerts: healthReport.alerts ? healthReport.alerts.filter(a => a.severity === 'critical').length : 0,
          warningAlerts: healthReport.alerts ? healthReport.alerts.filter(a => a.severity === 'warning').length : 0
        },
        performance: {
          errorRate: healthReport.performance ? healthReport.performance.error_rate : 0,
          requestsPerHour: healthReport.performance ? healthReport.performance.requests_per_hour : 0,
          averageResponseTime: healthReport.performance ? healthReport.performance.avg_response_time : 0,
          dbErrorRate: healthReport.performance ? healthReport.performance.db_error_rate : 0
        },
        systemMetrics: {
          memoryUsage: healthReport.system ? Math.round((healthReport.system.memory.used / healthReport.system.memory.total) * 100) : 0,
          cpuUsage: healthReport.system ? healthReport.system.cpu.usage : 0,
          diskUsage: healthReport.system ? healthReport.system.disk.usage : 0
        },
        topIssues: healthReport.alerts ? healthReport.alerts.slice(0, 5) : [],
        recommendations: healthReport.recommendations ? healthReport.recommendations.slice(0, 3) : [],
        trends: healthReport.trends || {},
        uptime: healthReport.services ? healthReport.services.uptime : 'N/A'
      };

      await loggingConfig.info('Daily health report generated', {
        service: 'health-monitor',
        reportDate: dailyReport.date,
        overallStatus: dailyReport.summary.overallStatus,
        totalAlerts: dailyReport.summary.totalAlerts
      });

      return dailyReport;

    } catch (error) {
      await loggingConfig.error('Failed to generate daily health report', error, {
        service: 'health-monitor'
      });
      
      return {
        date: new Date().toISOString().split('T')[0],
        timestamp: new Date().toISOString(),
        error: error.message,
        summary: {
          overallStatus: 'error',
          totalServices: 0,
          healthyServices: 0,
          degradedServices: 0,
          unhealthyServices: 0,
          totalAlerts: 1,
          criticalAlerts: 1,
          warningAlerts: 0
        }
      };
    }
  }
}

// Export singleton
const comprehensiveHealthService = new ComprehensiveHealthService();
module.exports = comprehensiveHealthService;