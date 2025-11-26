#!/usr/bin/env node

/**
 * SYSTEM HEALTH MONITOR
 * 
 * Comprehensive monitoring script to prevent Oracle timeout issues
 * and ensure all cron jobs run smoothly without conflicts
 */

const db = require('../db/db');
const fs = require('fs').promises;
const path = require('path');

class SystemHealthMonitor {
  constructor() {
    this.healthChecks = new Map();
    this.criticalThresholds = {
      dbResponseTime: 5000, // 5 seconds
      memoryUsage: 0.85, // 85%
      cpuUsage: 0.90, // 90%
      diskUsage: 0.90, // 90%
      activeProcesses: 50
    };
  }

  async runComprehensiveHealthCheck() {
    console.log('🏥 Starting comprehensive system health check...');
    
    const healthReport = {
      timestamp: new Date().toISOString(),
      status: 'healthy',
      checks: {},
      recommendations: [],
      criticalIssues: []
    };

    try {
      // 1. Database Health Check
      healthReport.checks.database = await this.checkDatabaseHealth();
      
      // 2. Memory Usage Check
      healthReport.checks.memory = await this.checkMemoryUsage();
      
      // 3. Process Health Check
      healthReport.checks.processes = await this.checkProcessHealth();
      
      // 4. Cron Job Conflicts Check
      healthReport.checks.cronConflicts = await this.checkCronConflicts();
      
      // 5. Oracle Service Health
      healthReport.checks.oracleService = await this.checkOracleServiceHealth();
      
      // 6. File System Health
      healthReport.checks.filesystem = await this.checkFileSystemHealth();

      // Determine overall status
      healthReport.status = this.determineOverallStatus(healthReport.checks);
      
      // Generate recommendations
      healthReport.recommendations = this.generateRecommendations(healthReport.checks);
      
      // Log critical issues
      healthReport.criticalIssues = this.identifyCriticalIssues(healthReport.checks);
      
      console.log(`📊 Health Check Complete - Status: ${healthReport.status.toUpperCase()}`);
      
      if (healthReport.criticalIssues.length > 0) {
        console.log('🚨 CRITICAL ISSUES FOUND:');
        healthReport.criticalIssues.forEach(issue => console.log(`   - ${issue}`));
      }
      
      if (healthReport.recommendations.length > 0) {
        console.log('💡 RECOMMENDATIONS:');
        healthReport.recommendations.forEach(rec => console.log(`   - ${rec}`));
      }
      
      return healthReport;
      
    } catch (error) {
      console.error('❌ Health check failed:', error.message);
      healthReport.status = 'critical';
      healthReport.criticalIssues.push(`Health check system failure: ${error.message}`);
      return healthReport;
    }
  }

  async checkDatabaseHealth() {
    const startTime = Date.now();
    
    try {
      // Test basic connectivity
      await Promise.race([
        db.query('SELECT 1 as test'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('DB timeout')), this.criticalThresholds.dbResponseTime))
      ]);
      
      const responseTime = Date.now() - startTime;
      
      // Test connection pool
      const poolStatus = await db.query(`
        SELECT 
          count(*) as total_connections,
          count(*) filter (where state = 'active') as active_connections,
          count(*) filter (where state = 'idle') as idle_connections
        FROM pg_stat_activity 
        WHERE datname = current_database()
      `);
      
      const connections = poolStatus.rows[0];
      
      return {
        status: responseTime < this.criticalThresholds.dbResponseTime ? 'healthy' : 'degraded',
        responseTime,
        connections: {
          total: parseInt(connections.total_connections),
          active: parseInt(connections.active_connections),
          idle: parseInt(connections.idle_connections)
        }
      };
      
    } catch (error) {
      return {
        status: 'critical',
        error: error.message,
        responseTime: Date.now() - startTime
      };
    }
  }

  async checkMemoryUsage() {
    try {
      const memInfo = await fs.readFile('/proc/meminfo', 'utf8');
      const lines = memInfo.split('\n');
      
      const getMemValue = (key) => {
        const line = lines.find(l => l.startsWith(key));
        return line ? parseInt(line.split(/\s+/)[1]) * 1024 : 0; // Convert KB to bytes
      };
      
      const totalMem = getMemValue('MemTotal');
      const availableMem = getMemValue('MemAvailable');
      const usedMem = totalMem - availableMem;
      const usageRatio = usedMem / totalMem;
      
      return {
        status: usageRatio < this.criticalThresholds.memoryUsage ? 'healthy' : 'critical',
        totalMB: Math.round(totalMem / 1024 / 1024),
        usedMB: Math.round(usedMem / 1024 / 1024),
        availableMB: Math.round(availableMem / 1024 / 1024),
        usagePercent: Math.round(usageRatio * 100)
      };
      
    } catch (error) {
      return {
        status: 'unknown',
        error: error.message
      };
    }
  }

  async checkProcessHealth() {
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      // Check for Node.js processes
      const { stdout } = await execAsync("ps aux | grep -E '(node|npm)' | grep -v grep | wc -l");
      const nodeProcesses = parseInt(stdout.trim());
      
      // Check for zombie processes
      const { stdout: zombies } = await execAsync("ps aux | awk '$8 ~ /^Z/ { print $2 }' | wc -l");
      const zombieProcesses = parseInt(zombies.trim());
      
      return {
        status: nodeProcesses < this.criticalThresholds.activeProcesses && zombieProcesses === 0 ? 'healthy' : 'degraded',
        nodeProcesses,
        zombieProcesses,
        threshold: this.criticalThresholds.activeProcesses
      };
      
    } catch (error) {
      return {
        status: 'unknown',
        error: error.message
      };
    }
  }

  async checkCronConflicts() {
    try {
      // Define all known cron schedules
      const cronSchedules = [
        { name: 'master-consolidated-cron:oracle_health_check', schedule: '*/20 * * * *' },
        { name: 'master-consolidated-cron:auto_evaluation', schedule: '0,30 * * * *' },
        { name: 'master-consolidated-cron:football_health_check', schedule: '0 * * * *' },
        { name: 'master-consolidated-cron:crypto_scheduler', schedule: '5 */30 * * * *' },
        { name: 'oracle-cron:resolve_cycles', schedule: '5 * * * *' },
        { name: 'oracle-cron:health_check', schedule: '7,32,57 * * * *' },
        { name: 'oracle-cron:cleanup', schedule: '0 2 * * *' }
      ];
      
      // Check for potential conflicts (same minute execution)
      const conflicts = [];
      const scheduleMap = new Map();
      
      cronSchedules.forEach(cron => {
        const key = cron.schedule;
        if (scheduleMap.has(key)) {
          conflicts.push({
            schedule: key,
            conflicting: [scheduleMap.get(key), cron.name]
          });
        } else {
          scheduleMap.set(key, cron.name);
        }
      });
      
      return {
        status: conflicts.length === 0 ? 'healthy' : 'warning',
        totalSchedules: cronSchedules.length,
        conflicts: conflicts.length,
        conflictDetails: conflicts
      };
      
    } catch (error) {
      return {
        status: 'unknown',
        error: error.message
      };
    }
  }

  async checkOracleServiceHealth() {
    try {
      // Check if Oracle environment variables are set
      const oracleKey = process.env.ORACLE_SIGNER_PRIVATE_KEY;
      const hasOracleKey = !!oracleKey;
      
      // Check recent Oracle health check logs
      const recentLogs = await db.query(`
        SELECT 
          COUNT(*) as total_checks,
          COUNT(*) FILTER (WHERE success = true) as successful_checks,
          MAX(executed_at) as last_check
        FROM oracle.cron_job_logs 
        WHERE job_name = 'oracle_health_check' 
        AND executed_at > NOW() - INTERVAL '2 hours'
      `);
      
      const logStats = recentLogs.rows[0];
      const successRate = logStats.total_checks > 0 ? 
        logStats.successful_checks / logStats.total_checks : 0;
      
      return {
        status: hasOracleKey && successRate > 0.8 ? 'healthy' : 'degraded',
        hasOracleKey,
        recentChecks: parseInt(logStats.total_checks),
        successfulChecks: parseInt(logStats.successful_checks),
        successRate: Math.round(successRate * 100),
        lastCheck: logStats.last_check
      };
      
    } catch (error) {
      return {
        status: 'unknown',
        error: error.message
      };
    }
  }

  async checkFileSystemHealth() {
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      // Check disk usage
      const { stdout } = await execAsync("df -h / | tail -1 | awk '{print $5}' | sed 's/%//'");
      const diskUsagePercent = parseInt(stdout.trim()) / 100;
      
      // Check log file sizes
      const logDir = path.join(__dirname, '../logs');
      let totalLogSize = 0;
      
      try {
        const logFiles = await fs.readdir(logDir);
        for (const file of logFiles) {
          const stats = await fs.stat(path.join(logDir, file));
          totalLogSize += stats.size;
        }
      } catch (logError) {
        // Log directory might not exist
      }
      
      return {
        status: diskUsagePercent < this.criticalThresholds.diskUsage ? 'healthy' : 'critical',
        diskUsagePercent: Math.round(diskUsagePercent * 100),
        totalLogSizeMB: Math.round(totalLogSize / 1024 / 1024)
      };
      
    } catch (error) {
      return {
        status: 'unknown',
        error: error.message
      };
    }
  }

  determineOverallStatus(checks) {
    const statuses = Object.values(checks).map(check => check.status);
    
    if (statuses.includes('critical')) return 'critical';
    if (statuses.includes('degraded')) return 'degraded';
    if (statuses.includes('warning')) return 'warning';
    if (statuses.includes('unknown')) return 'unknown';
    return 'healthy';
  }

  generateRecommendations(checks) {
    const recommendations = [];
    
    if (checks.database?.status === 'degraded') {
      recommendations.push('Database response time is slow - consider connection pool optimization');
    }
    
    if (checks.memory?.usagePercent > 80) {
      recommendations.push('Memory usage is high - consider restarting services or increasing memory');
    }
    
    if (checks.processes?.nodeProcesses > 30) {
      recommendations.push('High number of Node.js processes - check for memory leaks or stuck processes');
    }
    
    if (checks.cronConflicts?.conflicts > 0) {
      recommendations.push('Cron schedule conflicts detected - stagger job execution times');
    }
    
    if (checks.oracleService?.successRate < 80) {
      recommendations.push('Oracle service health checks failing - investigate timeout issues');
    }
    
    if (checks.filesystem?.diskUsagePercent > 85) {
      recommendations.push('Disk usage is high - clean up old logs and temporary files');
    }
    
    return recommendations;
  }

  identifyCriticalIssues(checks) {
    const issues = [];
    
    if (checks.database?.status === 'critical') {
      issues.push('Database connectivity is failing');
    }
    
    if (checks.memory?.status === 'critical') {
      issues.push(`Memory usage critical: ${checks.memory.usagePercent}%`);
    }
    
    if (checks.processes?.zombieProcesses > 0) {
      issues.push(`${checks.processes.zombieProcesses} zombie processes detected`);
    }
    
    if (checks.filesystem?.status === 'critical') {
      issues.push(`Disk usage critical: ${checks.filesystem.diskUsagePercent}%`);
    }
    
    return issues;
  }
}

// Run if called directly
if (require.main === module) {
  const monitor = new SystemHealthMonitor();
  
  monitor.runComprehensiveHealthCheck()
    .then(report => {
      console.log('\n📋 HEALTH REPORT SUMMARY:');
      console.log(`Status: ${report.status.toUpperCase()}`);
      console.log(`Timestamp: ${report.timestamp}`);
      
      if (report.status === 'critical') {
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('❌ Health monitor failed:', error.message);
      process.exit(1);
    });
}

module.exports = SystemHealthMonitor;
