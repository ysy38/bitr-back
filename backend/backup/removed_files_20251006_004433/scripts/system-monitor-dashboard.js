#!/usr/bin/env node

/**
 * System Monitor Dashboard
 * 
 * This script provides real-time monitoring of the production system:
 * 1. Health check status
 * 2. Performance metrics
 * 3. Error rates
 * 4. System alerts
 * 5. Recommendations
 */

const db = require('../db/db');

class SystemMonitorDashboard {
  constructor() {
    this.isRunning = false;
    this.monitoringInterval = 30000; // 30 seconds
    this.monitoringTimer = null;
    this.stats = {
      healthChecks: { total: 0, healthy: 0, degraded: 0, critical: 0, error: 0 },
      performance: { avgResponseTime: 0, throughput: 0, errorRate: 0 },
      alerts: { total: 0, critical: 0, warning: 0, resolved: 0 },
      recommendations: []
    };
  }

  async start() {
    if (this.isRunning) {
      console.log('⚠️ System monitor dashboard already running');
      return;
    }

    this.isRunning = true;
    console.log('📊 Starting system monitor dashboard...');
    console.log('🔄 Monitoring every 30 seconds');
    console.log('Press Ctrl+C to stop\n');

    // Initial status check
    await this.checkSystemStatus();

    // Start periodic monitoring
    this.monitoringTimer = setInterval(async () => {
      await this.checkSystemStatus();
    }, this.monitoringInterval);

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Stopping system monitor dashboard...');
      this.stop();
    });

    process.on('SIGTERM', () => {
      console.log('\n🛑 Stopping system monitor dashboard...');
      this.stop();
    });
  }

  stop() {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = null;
    }
    this.isRunning = false;
    console.log('✅ System monitor dashboard stopped');
    process.exit(0);
  }

  async checkSystemStatus() {
    try {
      console.clear();
      console.log('🔍 SYSTEM MONITOR DASHBOARD');
      console.log('='.repeat(60));
      console.log(`📅 ${new Date().toLocaleString()}`);
      console.log('');

      // Check health status
      await this.checkHealthStatus();
      
      // Check performance metrics
      await this.checkPerformanceMetrics();
      
      // Check system alerts
      await this.checkSystemAlerts();
      
      // Generate recommendations
      await this.generateRecommendations();
      
      // Display dashboard
      this.displayDashboard();

    } catch (error) {
      console.error('❌ Error checking system status:', error);
    }
  }

  async checkHealthStatus() {
    try {
      // Get recent health check results
      const result = await db.query(`
        SELECT 
          status,
          COUNT(*) as count,
          AVG(response_time_ms) as avg_response_time
        FROM oracle.health_check_logs 
        WHERE created_at > NOW() - INTERVAL '5 minutes'
        GROUP BY status
      `);

      this.stats.healthChecks = { total: 0, healthy: 0, degraded: 0, critical: 0, error: 0 };
      
      result.rows.forEach(row => {
        this.stats.healthChecks.total += parseInt(row.count);
        this.stats.healthChecks[row.status] = parseInt(row.count);
      });

    } catch (error) {
      console.error('❌ Error checking health status:', error);
    }
  }

  async checkPerformanceMetrics() {
    try {
      // Get performance metrics
      const result = await db.query(`
        SELECT 
          AVG(response_time_ms) as avg_response_time,
          COUNT(*) as total_requests,
          COUNT(*) FILTER (WHERE status = 'error') as error_count
        FROM oracle.health_check_logs 
        WHERE created_at > NOW() - INTERVAL '5 minutes'
      `);

      const row = result.rows[0];
      this.stats.performance = {
        avgResponseTime: parseFloat(row.avg_response_time) || 0,
        throughput: parseInt(row.total_requests) || 0,
        errorRate: row.total_requests > 0 ? (parseInt(row.error_count) / parseInt(row.total_requests)) * 100 : 0
      };

    } catch (error) {
      console.error('❌ Error checking performance metrics:', error);
    }
  }

  async checkSystemAlerts() {
    try {
      // Get system alerts
      const result = await db.query(`
        SELECT 
          severity,
          COUNT(*) as count
        FROM oracle.system_alerts 
        WHERE created_at > NOW() - INTERVAL '1 hour'
        GROUP BY severity
      `);

      this.stats.alerts = { total: 0, critical: 0, warning: 0, resolved: 0 };
      
      result.rows.forEach(row => {
        this.stats.alerts.total += parseInt(row.count);
        this.stats.alerts[row.severity] = parseInt(row.count);
      });

    } catch (error) {
      console.error('❌ Error checking system alerts:', error);
    }
  }

  async generateRecommendations() {
    this.stats.recommendations = [];

    // Health check recommendations
    if (this.stats.healthChecks.critical > 0) {
      this.stats.recommendations.push('🚨 CRITICAL: Address failing health checks immediately');
    }
    
    if (this.stats.healthChecks.degraded > 0) {
      this.stats.recommendations.push('⚠️ WARNING: Some services are degraded - monitor closely');
    }

    // Performance recommendations
    if (this.stats.performance.avgResponseTime > 5000) {
      this.stats.recommendations.push('🐌 SLOW: Average response time is high - consider optimization');
    }
    
    if (this.stats.performance.errorRate > 10) {
      this.stats.recommendations.push('❌ ERRORS: High error rate detected - investigate issues');
    }

    // Alert recommendations
    if (this.stats.alerts.critical > 0) {
      this.stats.recommendations.push('🚨 ALERTS: Critical alerts require immediate attention');
    }

    // System stability recommendations
    if (this.stats.healthChecks.healthy / this.stats.healthChecks.total < 0.8) {
      this.stats.recommendations.push('📊 STABILITY: System stability is below 80% - review configuration');
    }
  }

  displayDashboard() {
    // Health Status Section
    console.log('🏥 HEALTH STATUS');
    console.log('─'.repeat(20));
    console.log(`✅ Healthy: ${this.stats.healthChecks.healthy}`);
    console.log(`⚠️  Degraded: ${this.stats.healthChecks.degraded}`);
    console.log(`🚨 Critical: ${this.stats.healthChecks.critical}`);
    console.log(`❌ Error: ${this.stats.healthChecks.error}`);
    console.log(`📊 Total: ${this.stats.healthChecks.total}`);
    console.log('');

    // Performance Metrics Section
    console.log('📈 PERFORMANCE METRICS');
    console.log('─'.repeat(20));
    console.log(`⏱️  Avg Response Time: ${this.stats.performance.avgResponseTime.toFixed(2)}ms`);
    console.log(`🔄 Throughput: ${this.stats.performance.throughput} requests/5min`);
    console.log(`❌ Error Rate: ${this.stats.performance.errorRate.toFixed(2)}%`);
    console.log('');

    // System Alerts Section
    console.log('🚨 SYSTEM ALERTS');
    console.log('─'.repeat(20));
    console.log(`🚨 Critical: ${this.stats.alerts.critical}`);
    console.log(`⚠️  Warning: ${this.stats.alerts.warning}`);
    console.log(`✅ Resolved: ${this.stats.alerts.resolved}`);
    console.log(`📊 Total: ${this.stats.alerts.total}`);
    console.log('');

    // Recommendations Section
    if (this.stats.recommendations.length > 0) {
      console.log('💡 RECOMMENDATIONS');
      console.log('─'.repeat(20));
      this.stats.recommendations.forEach(rec => console.log(rec));
      console.log('');
    }

    // System Status Summary
    const overallStatus = this.getOverallStatus();
    console.log('🎯 SYSTEM STATUS');
    console.log('─'.repeat(20));
    console.log(`Status: ${overallStatus.status}`);
    console.log(`Score: ${overallStatus.score}/100`);
    console.log(`Next Check: ${new Date(Date.now() + this.monitoringInterval).toLocaleTimeString()}`);
    console.log('');
  }

  getOverallStatus() {
    let score = 100;
    let status = '🟢 HEALTHY';

    // Deduct points for issues
    if (this.stats.healthChecks.critical > 0) {
      score -= 40;
      status = '🔴 CRITICAL';
    } else if (this.stats.healthChecks.degraded > 0) {
      score -= 20;
      status = '🟡 DEGRADED';
    }

    if (this.stats.performance.errorRate > 10) {
      score -= 20;
    }

    if (this.stats.performance.avgResponseTime > 5000) {
      score -= 10;
    }

    if (this.stats.alerts.critical > 0) {
      score -= 30;
    }

    return { status, score: Math.max(0, score) };
  }
}

// Run the dashboard if this file is executed directly
if (require.main === module) {
  const dashboard = new SystemMonitorDashboard();
  dashboard.start().catch(error => {
    console.error('System monitor dashboard failed:', error);
    process.exit(1);
  });
}

module.exports = SystemMonitorDashboard;
