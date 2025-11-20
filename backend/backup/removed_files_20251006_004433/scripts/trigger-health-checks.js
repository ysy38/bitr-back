#!/usr/bin/env node

/**
 * Manual Health Check Trigger
 * 
 * This script manually triggers all health checks to update the system status
 */

const SystemMonitor = require('../services/system-monitor');

async function triggerHealthChecks() {
  console.log('🔍 Manually triggering health checks...');
  
  try {
    const systemMonitor = new SystemMonitor();
    
    // Run all health checks
    const results = await systemMonitor.runHealthChecks();
    
    console.log('✅ Health checks completed:');
    results.forEach(result => {
      const status = result.status === 'healthy' ? '✅' : 
                    result.status === 'degraded' ? '⚠️' : 
                    result.status === 'critical' ? '🚨' : '❌';
      console.log(`   ${status} ${result.name}: ${result.status} (${result.responseTime}ms)`);
    });
    
    // Get system status
    const systemStatus = systemMonitor.getSystemStatus();
    console.log('\n📊 System Status:');
    console.log(`   Overall: ${systemStatus.status}`);
    console.log(`   Critical Health: ${systemStatus.summary.criticalHealth}`);
    console.log(`   Healthy Checks: ${systemStatus.summary.healthyChecks}/${systemStatus.summary.totalChecks}`);
    
  } catch (error) {
    console.error('❌ Error triggering health checks:', error);
  }
  
  process.exit(0);
}

// Run if executed directly
if (require.main === module) {
  triggerHealthChecks();
}

module.exports = triggerHealthChecks;
