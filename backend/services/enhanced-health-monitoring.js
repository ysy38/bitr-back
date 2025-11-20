const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

/**
 * Enhanced Service Health Monitoring
 * 
 * Comprehensive health monitoring system that extends existing system-monitor.js:
 * - Service-specific health checks
 * - Dependency health monitoring
 * - Performance metrics tracking
 * - Alerting and notification system
 * - Health history and trends
 * - Automated recovery suggestions
 */

class EnhancedHealthMonitoring extends EventEmitter {
  constructor() {
    super();
    this.serviceRegistry = require('./service-registry');
    this.dependencyGraph = require('./dependency-graph-service');
    this.systemMonitor = require('./system-monitor');
    
    this.isRunning = false;
    this.monitoringInterval = 30000; // 30 seconds
    this.monitoringTimer = null;
    this.healthHistory = new Map();
    this.alertThresholds = {
      responseTime: 5000, // 5 seconds
      errorRate: 0.1, // 10%
      consecutiveFailures: 3,
      memoryUsage: 0.8, // 80%
      cpuUsage: 0.8 // 80%
    };
    
    this.healthChecks = new Map();
    this.alerts = [];
    this.recoveryActions = new Map();
    
    // Don't auto-initialize to prevent loops
    // this.initialize();
  }

  /**
   * Initialize health monitoring
   */
  async initialize() {
    try {
      // Register health checks for all services
      await this.registerServiceHealthChecks();
      
      // Initialize recovery actions
      this.initializeRecoveryActions();
      
      console.log(`✅ Enhanced Health Monitoring initialized with ${this.healthChecks.size} health checks`);
    } catch (error) {
      console.error('❌ Failed to initialize enhanced health monitoring:', error);
    }
  }

  /**
   * Register health checks for all services
   */
  async registerServiceHealthChecks() {
    const services = this.serviceRegistry.getAllServices();
    
    for (const service of services) {
      await this.registerHealthCheck(service.name, {
        name: service.name,
        type: service.type,
        critical: this.isCriticalService(service.name),
        check: () => this.performHealthCheck(service.name),
        dependencies: this.serviceRegistry.getDependencies(service.name)
      });
    }
  }

  /**
   * Register a health check
   */
  async registerHealthCheck(serviceName, config) {
    const healthCheck = {
      name: config.name,
      type: config.type,
      critical: config.critical || false,
      check: config.check,
      dependencies: config.dependencies || [],
      interval: config.interval || this.monitoringInterval,
      timeout: config.timeout || 10000,
      retries: config.retries || 3,
      lastCheck: null,
      consecutiveFailures: 0,
      totalChecks: 0,
      successfulChecks: 0,
      averageResponseTime: 0,
      status: 'unknown'
    };
    
    this.healthChecks.set(serviceName, healthCheck);
    
    // Initialize health history
    if (!this.healthHistory.has(serviceName)) {
      this.healthHistory.set(serviceName, []);
    }
    
    console.log(`📝 Health check registered: ${serviceName}`);
  }

  /**
   * Perform health check for a service
   */
  async performHealthCheck(serviceName) {
    const healthCheck = this.healthChecks.get(serviceName);
    if (!healthCheck) {
      return { status: 'unknown', error: 'Health check not registered' };
    }
    
    const startTime = Date.now();
    let result = { status: 'unknown' };
    
    try {
      // Perform the actual health check
      result = await Promise.race([
        healthCheck.check(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Health check timeout')), healthCheck.timeout)
        )
      ]);
      
      const responseTime = Date.now() - startTime;
      
      // Update health check statistics
      healthCheck.lastCheck = new Date().toISOString();
      healthCheck.totalChecks++;
      healthCheck.averageResponseTime = 
        (healthCheck.averageResponseTime * (healthCheck.totalChecks - 1) + responseTime) / healthCheck.totalChecks;
      
      if (result.status === 'healthy') {
        healthCheck.successfulChecks++;
        healthCheck.consecutiveFailures = 0;
        healthCheck.status = 'healthy';
      } else {
        healthCheck.consecutiveFailures++;
        healthCheck.status = 'unhealthy';
      }
      
      // Record in health history
      this.recordHealthHistory(serviceName, {
        timestamp: new Date().toISOString(),
        status: result.status,
        responseTime: responseTime,
        details: result
      });
      
      // Update service registry
      await this.serviceRegistry.updateHealthStatus(serviceName, result.status, responseTime);
      
      // Check for alerts
      await this.checkAlerts(serviceName, result, responseTime);
      
      return result;
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      // Update health check statistics
      healthCheck.lastCheck = new Date().toISOString();
      healthCheck.totalChecks++;
      healthCheck.consecutiveFailures++;
      healthCheck.status = 'unhealthy';
      
      // Record in health history
      this.recordHealthHistory(serviceName, {
        timestamp: new Date().toISOString(),
        status: 'unhealthy',
        responseTime: responseTime,
        error: error.message
      });
      
      // Update service registry
      await this.serviceRegistry.updateHealthStatus(serviceName, 'unhealthy', responseTime);
      
      // Check for alerts
      await this.checkAlerts(serviceName, { status: 'unhealthy', error: error.message }, responseTime);
      
      return { status: 'unhealthy', error: error.message };
    }
  }

  /**
   * Record health history
   */
  recordHealthHistory(serviceName, healthData) {
    const history = this.healthHistory.get(serviceName) || [];
    
    // Keep only last 100 entries
    if (history.length >= 100) {
      history.shift();
    }
    
    history.push(healthData);
    this.healthHistory.set(serviceName, history);
  }

  /**
   * Check for alerts
   */
  async checkAlerts(serviceName, healthResult, responseTime) {
    const healthCheck = this.healthChecks.get(serviceName);
    if (!healthCheck) return;
    
    const alerts = [];
    
    // Check response time
    if (responseTime > this.alertThresholds.responseTime) {
      alerts.push({
        type: 'slow_response',
        severity: 'warning',
        service: serviceName,
        message: `Service ${serviceName} response time ${responseTime}ms exceeds threshold ${this.alertThresholds.responseTime}ms`,
        value: responseTime,
        threshold: this.alertThresholds.responseTime
      });
    }
    
    // Check consecutive failures
    if (healthCheck.consecutiveFailures >= this.alertThresholds.consecutiveFailures) {
      alerts.push({
        type: 'consecutive_failures',
        severity: 'critical',
        service: serviceName,
        message: `Service ${serviceName} has ${healthCheck.consecutiveFailures} consecutive failures`,
        value: healthCheck.consecutiveFailures,
        threshold: this.alertThresholds.consecutiveFailures
      });
    }
    
    // Check error rate
    const errorRate = (healthCheck.totalChecks - healthCheck.successfulChecks) / healthCheck.totalChecks;
    if (errorRate > this.alertThresholds.errorRate) {
      alerts.push({
        type: 'high_error_rate',
        severity: 'warning',
        service: serviceName,
        message: `Service ${serviceName} error rate ${(errorRate * 100).toFixed(2)}% exceeds threshold ${(this.alertThresholds.errorRate * 100).toFixed(2)}%`,
        value: errorRate,
        threshold: this.alertThresholds.errorRate
      });
    }
    
    // Process alerts
    for (const alert of alerts) {
      await this.processAlert(alert);
    }
  }

  /**
   * Process alert
   */
  async processAlert(alert) {
    // Add to alerts list
    this.alerts.push({
      ...alert,
      timestamp: new Date().toISOString(),
      id: `${alert.service}_${alert.type}_${Date.now()}`
    });
    
    // Emit alert event
    this.emit('alert', alert);
    
    // Log alert
    console.log(`🚨 ALERT [${alert.severity.toUpperCase()}] ${alert.message}`);
    
    // Check for recovery actions
    const recoveryAction = this.recoveryActions.get(alert.type);
    if (recoveryAction) {
      try {
        await recoveryAction(alert);
        console.log(`🔧 Recovery action executed for ${alert.type}`);
      } catch (error) {
        console.error(`❌ Recovery action failed for ${alert.type}:`, error);
      }
    }
  }

  /**
   * Initialize recovery actions
   */
  initializeRecoveryActions() {
    // Restart service recovery
    this.recoveryActions.set('consecutive_failures', async (alert) => {
      console.log(`🔄 Attempting to restart service ${alert.service}`);
      // Implementation would depend on service type
    });
    
    // Clear cache recovery
    this.recoveryActions.set('slow_response', async (alert) => {
      console.log(`🧹 Clearing cache for service ${alert.service}`);
      // Implementation would clear service-specific cache
    });
    
    // Scale up recovery
    this.recoveryActions.set('high_error_rate', async (alert) => {
      console.log(`📈 Scaling up service ${alert.service}`);
      // Implementation would scale up service instances
    });
  }

  /**
   * Check if service is critical
   */
  isCriticalService(serviceName) {
    const criticalServices = [
      'event-driven-pool-sync',
      'unified-pool-settlement-system',
      'cron-coordinator',
      'system-monitor',
      'shared-query-service'
    ];
    
    return criticalServices.includes(serviceName);
  }

  /**
   * Get service health status
   */
  getServiceHealthStatus(serviceName) {
    const healthCheck = this.healthChecks.get(serviceName);
    const history = this.healthHistory.get(serviceName) || [];
    
    if (!healthCheck) {
      return { status: 'unknown', error: 'Health check not registered' };
    }
    
    return {
      service: serviceName,
      status: healthCheck.status,
      lastCheck: healthCheck.lastCheck,
      consecutiveFailures: healthCheck.consecutiveFailures,
      totalChecks: healthCheck.totalChecks,
      successfulChecks: healthCheck.successfulChecks,
      successRate: healthCheck.totalChecks > 0 ? (healthCheck.successfulChecks / healthCheck.totalChecks) : 0,
      averageResponseTime: healthCheck.averageResponseTime,
      history: history.slice(-10), // Last 10 entries
      critical: healthCheck.critical
    };
  }

  /**
   * Get all health statuses
   */
  getAllHealthStatuses() {
    const statuses = [];
    
    for (const serviceName of this.healthChecks.keys()) {
      statuses.push(this.getServiceHealthStatus(serviceName));
    }
    
    return statuses;
  }

  /**
   * Get unhealthy services
   */
  getUnhealthyServices() {
    return this.getAllHealthStatuses().filter(status => status.status === 'unhealthy');
  }

  /**
   * Get critical services status
   */
  getCriticalServicesStatus() {
    return this.getAllHealthStatuses().filter(status => status.critical);
  }

  /**
   * Get health trends
   */
  getHealthTrends(serviceName, hours = 24) {
    const history = this.healthHistory.get(serviceName) || [];
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    const recentHistory = history.filter(entry => 
      new Date(entry.timestamp) > cutoffTime
    );
    
    const trends = {
      service: serviceName,
      period: `${hours} hours`,
      totalChecks: recentHistory.length,
      healthyChecks: recentHistory.filter(h => h.status === 'healthy').length,
      unhealthyChecks: recentHistory.filter(h => h.status === 'unhealthy').length,
      averageResponseTime: recentHistory.reduce((sum, h) => sum + (h.responseTime || 0), 0) / recentHistory.length || 0,
      uptime: recentHistory.length > 0 ? (recentHistory.filter(h => h.status === 'healthy').length / recentHistory.length) * 100 : 0
    };
    
    return trends;
  }

  /**
   * Get system health overview
   */
  getSystemHealthOverview() {
    const allStatuses = this.getAllHealthStatuses();
    const criticalStatuses = this.getCriticalServicesStatus();
    const unhealthyServices = this.getUnhealthyServices();
    
    return {
      totalServices: allStatuses.length,
      healthyServices: allStatuses.filter(s => s.status === 'healthy').length,
      unhealthyServices: unhealthyServices.length,
      criticalServices: criticalStatuses.length,
      criticalServicesHealthy: criticalStatuses.filter(s => s.status === 'healthy').length,
      overallHealth: this.calculateOverallHealth(allStatuses),
      recentAlerts: this.alerts.slice(-10),
      systemUptime: this.calculateSystemUptime(),
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Calculate overall system health
   */
  calculateOverallHealth(statuses) {
    if (statuses.length === 0) return 'unknown';
    
    const healthyCount = statuses.filter(s => s.status === 'healthy').length;
    const healthRatio = healthyCount / statuses.length;
    
    if (healthRatio >= 0.95) return 'excellent';
    if (healthRatio >= 0.85) return 'good';
    if (healthRatio >= 0.70) return 'fair';
    if (healthRatio >= 0.50) return 'poor';
    return 'critical';
  }

  /**
   * Calculate system uptime
   */
  calculateSystemUptime() {
    // This would be calculated based on service uptime
    // For now, return a placeholder
    return {
      uptime: '99.9%',
      lastDowntime: null,
      totalDowntime: '0 minutes'
    };
  }

  /**
   * Get alerts
   */
  getAlerts(limit = 50) {
    return this.alerts.slice(-limit);
  }

  /**
   * Clear alerts
   */
  clearAlerts() {
    this.alerts = [];
    console.log('🧹 Alerts cleared');
  }

  /**
   * Start health monitoring
   */
  async start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('🚀 Enhanced Health Monitoring started');
    
    // Start monitoring timer
    this.monitoringTimer = setInterval(async () => {
      await this.performAllHealthChecks();
    }, this.monitoringInterval);
    
    // Perform initial health checks
    await this.performAllHealthChecks();
    
    // Emit startup event
    this.emit('monitoringStarted');
  }

  /**
   * Stop health monitoring
   */
  async stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = null;
    }
    
    console.log('🛑 Enhanced Health Monitoring stopped');
    
    // Emit shutdown event
    this.emit('monitoringStopped');
  }

  /**
   * Perform all health checks
   */
  async performAllHealthChecks() {
    const healthChecks = Array.from(this.healthChecks.keys());
    
    // Perform health checks in parallel
    const results = await Promise.allSettled(
      healthChecks.map(serviceName => this.performHealthCheck(serviceName))
    );
    
    // Log results
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    
    console.log(`🔍 Health check completed: ${successful} successful, ${failed} failed`);
    
    // Emit monitoring event
    this.emit('healthChecksCompleted', {
      total: healthChecks.length,
      successful,
      failed,
      timestamp: new Date().toISOString()
    });
  }
}

// Export class instead of singleton to prevent auto-initialization
module.exports = EnhancedHealthMonitoring;
