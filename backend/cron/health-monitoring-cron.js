const cron = require('node-cron');
const comprehensiveHealthService = require('../services/comprehensive-health-service');
const SystemMonitor = require('../services/system-monitor');

/**
 * Health Monitoring Cron Job
 * Runs comprehensive health checks and sends alerts if needed
 */
class HealthMonitoringCron {
  constructor() {
    this.healthService = comprehensiveHealthService;
    this.systemMonitor = new SystemMonitor();
    this.isRunning = false;
  }

  /**
   * Start health monitoring cron jobs
   */
  async start() {
    if (this.isRunning) {
      console.log('⚠️ Health monitoring cron is already running');
      return;
    }

    console.log('🏥 Starting health monitoring cron jobs...');

    // Comprehensive health check every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
      await this.runHealthCheck();
    }, {
      scheduled: true,
      timezone: 'UTC'
    });

    // System monitoring every minute
    cron.schedule('* * * * *', async () => {
      await this.runSystemMonitoring();
    }, {
      scheduled: true,
      timezone: 'UTC'
    });

    // Daily health report
    cron.schedule('0 8 * * *', async () => {
      await this.generateDailyHealthReport();
    }, {
      scheduled: true,
      timezone: 'UTC'
    });

    // Start the SystemMonitor
    await this.systemMonitor.start();
    
    this.isRunning = true;
    console.log('✅ Health monitoring cron jobs started');
  }

  /**
   * Run comprehensive health check
   */
  async runHealthCheck() {
    try {
      console.log('🔍 Running comprehensive health check...');
      
      const healthReport = await this.healthService.runComprehensiveHealthCheck();
      
      // Check for critical issues
      if (healthReport.criticalIssues && healthReport.criticalIssues.length > 0) {
        console.log('🚨 Critical health issues detected:', healthReport.criticalIssues);
      }
      
      // Check for warnings
      if (healthReport.warnings && healthReport.warnings.length > 0) {
        console.log('⚠️ Health warnings detected:', healthReport.warnings.length);
      }
      
      console.log(`✅ Health check completed - Overall status: ${healthReport.overallStatus}`);
      
    } catch (error) {
      console.error('❌ Health check failed:', error);
    }
  }

  /**
   * Run system monitoring
   */
  async runSystemMonitoring() {
    try {
      // Get system status instead of non-existent collectMetrics
      const systemStatus = this.systemMonitor.getSystemStatus();
      
      // Check for critical issues
      if (systemStatus.status === 'critical') {
        console.log('🚨 System status is critical:', systemStatus);
      } else if (systemStatus.status === 'degraded') {
        console.log('⚠️ System status is degraded:', systemStatus);
      }
      
      // Check for specific health check failures
      const criticalFailures = systemStatus.healthChecks ? systemStatus.healthChecks.filter(h => 
        h.critical && h.status !== 'healthy'
      ) : [];
      
      if (criticalFailures.length > 0) {
        console.log('⚠️ Critical health check failures:', criticalFailures.length);
      }
      
    } catch (error) {
      console.error('❌ System monitoring failed:', error);
    }
  }

  /**
   * Generate daily health report
   */
  async generateDailyHealthReport() {
    try {
      console.log('📊 Generating daily health report...');
      
      const report = await this.healthService.generateDailyReport();
      
      console.log('✅ Daily health report generated:', report.summary);
      
    } catch (error) {
      console.error('❌ Daily health report failed:', error);
    }
  }

  /**
   * Stop health monitoring
   */
  stop() {
    this.isRunning = false;
    console.log('🛑 Health monitoring cron jobs stopped');
  }
}

// Create and start the health monitoring cron
const healthMonitoringCron = new HealthMonitoringCron();

// Start if run directly
if (require.main === module) {
  (async () => {
    await healthMonitoringCron.start();
    
    // Keep the process alive
    console.log('🏥 Health monitoring cron job started');
  })();
  
  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('🛑 Received SIGTERM, shutting down health monitoring...');
    healthMonitoringCron.stop();
    process.exit(0);
  });
  
  process.on('SIGINT', () => {
    console.log('🛑 Received SIGINT, shutting down health monitoring...');
    healthMonitoringCron.stop();
    process.exit(0);
  });
}

module.exports = healthMonitoringCron;
