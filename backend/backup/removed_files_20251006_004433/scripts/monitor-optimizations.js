/**
 * Monitor Database Optimizations
 * Tracks cost savings and autosuspend effectiveness
 */

const db = require('../db/db');

class OptimizationMonitor {
  constructor() {
    this.startTime = Date.now();
    this.stats = {
      queriesExecuted: 0,
      cacheHits: 0,
      cacheMisses: 0,
      connectionsCreated: 0,
      connectionsClosed: 0,
      sleepModeActivations: 0
    };
  }

  /**
   * Get current optimization statistics
   */
  getStats() {
    const cacheStats = db.getCacheStats();
    const uptime = Date.now() - this.startTime;
    
    return {
      uptime: Math.floor(uptime / 1000), // seconds
      database: {
        queriesExecuted: this.stats.queriesExecuted,
        cacheHitRate: this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses) * 100 || 0,
        cacheHits: this.stats.cacheHits,
        cacheMisses: this.stats.cacheMisses,
        connectionsCreated: this.stats.connectionsCreated,
        connectionsClosed: this.stats.connectionsClosed
      },
      cache: cacheStats,
      costOptimization: {
        estimatedHourlySavings: this.calculateHourlySavings(),
        autosuspendEffectiveness: this.calculateAutosuspendEffectiveness()
      }
    };
  }

  /**
   * Calculate estimated hourly cost savings
   */
  calculateHourlySavings() {
    // Based on optimization report:
    // Current: 467.88 hours/month = $74.86
    // Target: 60-120 hours/month = $19.00
    // Savings: $55.86/month = $1.86/hour
    
    const cacheHitRate = this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses) || 0;
    const connectionEfficiency = this.stats.connectionsClosed / (this.stats.connectionsCreated || 1);
    
    // Estimate savings based on optimizations
    const baseSavings = 1.86; // $1.86/hour base savings
    const cacheBonus = cacheHitRate * 0.5; // Up to 50% bonus for good cache hit rate
    const connectionBonus = connectionEfficiency * 0.3; // Up to 30% bonus for efficient connections
    
    return Math.round((baseSavings + cacheBonus + connectionBonus) * 100) / 100;
  }

  /**
   * Calculate autosuspend effectiveness
   */
  calculateAutosuspendEffectiveness() {
    // Higher is better (0-100%)
    const connectionEfficiency = this.stats.connectionsClosed / (this.stats.connectionsCreated || 1);
    const cacheEffectiveness = this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses) || 0;
    
    return Math.round((connectionEfficiency * 0.6 + cacheEffectiveness * 0.4) * 100);
  }

  /**
   * Log optimization status
   */
  logStatus() {
    const stats = this.getStats();
    
    console.log('\n📊 OPTIMIZATION STATUS REPORT');
    console.log('================================');
    console.log(`⏱️  Uptime: ${stats.uptime} seconds`);
    console.log(`💾 Cache Hit Rate: ${stats.database.cacheHitRate.toFixed(1)}%`);
    console.log(`🔌 Connections: ${stats.database.connectionsCreated} created, ${stats.database.connectionsClosed} closed`);
    console.log(`💰 Estimated Hourly Savings: $${stats.costOptimization.estimatedHourlySavings}`);
    console.log(`🎯 Autosuspend Effectiveness: ${stats.costOptimization.autosuspendEffectiveness}%`);
    console.log(`📈 Cache Stats: ${stats.cache.active} active, ${stats.cache.expired} expired`);
    
    if (stats.costOptimization.autosuspendEffectiveness > 80) {
      console.log('✅ EXCELLENT: Autosuspend should work effectively');
    } else if (stats.costOptimization.autosuspendEffectiveness > 60) {
      console.log('⚠️  GOOD: Autosuspend should work, but could be better');
    } else {
      console.log('❌ POOR: Autosuspend may not work effectively');
    }
    
    console.log('================================\n');
  }

  /**
   * Start monitoring
   */
  start() {
    console.log('🔍 Starting optimization monitoring...');
    
    // Log status every 5 minutes
    setInterval(() => {
      this.logStatus();
    }, 5 * 60 * 1000);
    
    // Log initial status
    setTimeout(() => this.logStatus(), 10000);
  }
}

// Export singleton
const monitor = new OptimizationMonitor();

// Start monitoring if this is the main module
if (require.main === module) {
  monitor.start();
  
  // Keep process alive
  setInterval(() => {
    // Just keep the process running
  }, 1000);
}

module.exports = monitor;
