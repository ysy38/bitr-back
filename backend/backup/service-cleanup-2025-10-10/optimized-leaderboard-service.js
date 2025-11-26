const EnhancedLeaderboardService = require('./enhanced-leaderboard-service');
const LeaderboardPerformanceMonitor = require('./leaderboard-performance-monitor');

/**
 * Optimized Leaderboard Service
 * 
 * Combines enhanced caching with performance monitoring
 * Provides comprehensive leaderboard functionality with optimization
 */
class OptimizedLeaderboardService extends EnhancedLeaderboardService {
  constructor() {
    super();
    this.performanceMonitor = new LeaderboardPerformanceMonitor();
    this.isInitialized = false;
  }

  /**
   * Initialize the optimized service
   */
  async initialize() {
    try {
      console.log('🚀 Initializing optimized leaderboard service...');
      
      // Initialize parent service
      await super.initialize();
      
      this.isInitialized = true;
      console.log('✅ Optimized leaderboard service initialized');
      
      return true;

    } catch (error) {
      console.error('❌ Failed to initialize optimized leaderboard service:', error.message);
      return false;
    }
  }

  /**
   * Get guided markets leaderboard with performance monitoring
   */
  async getGuidedMarketsLeaderboard(metric = 'total_staked', limit = 30, useCache = true) {
    const timingId = this.performanceMonitor.startTiming('guidedMarkets', { metric, limit, useCache });
    
    try {
      const result = await super.getGuidedMarketsLeaderboard(metric, limit, useCache);
      
      // Track cache operations
      if (useCache && this.redisEnabled) {
        this.performanceMonitor.trackCacheOperation('hit', `guided_markets:${metric}:${limit}`);
      }
      
      this.performanceMonitor.endTiming(timingId, { count: result.length });
      return result;

    } catch (error) {
      this.performanceMonitor.endTiming(timingId, null, error);
      throw error;
    }
  }

  /**
   * Get reputation leaderboard with performance monitoring
   */
  async getReputationLeaderboard(limit = 30, useCache = true) {
    const timingId = this.performanceMonitor.startTiming('reputation', { limit, useCache });
    
    try {
      const result = await super.getReputationLeaderboard(limit, useCache);
      
      // Track cache operations
      if (useCache && this.redisEnabled) {
        this.performanceMonitor.trackCacheOperation('hit', `reputation:${limit}`);
      }
      
      this.performanceMonitor.endTiming(timingId, { count: result.length });
      return result;

    } catch (error) {
      this.performanceMonitor.endTiming(timingId, null, error);
      throw error;
    }
  }

  /**
   * Get user rank with performance monitoring
   */
  async getUserRank(userAddress, leaderboardType, metric = 'total_staked') {
    const timingId = this.performanceMonitor.startTiming('userRank', { userAddress, leaderboardType, metric });
    
    try {
      const result = await super.getUserRank(userAddress, leaderboardType, metric);
      
      // Track cache operations
      if (this.redisEnabled) {
        this.performanceMonitor.trackCacheOperation('hit', `user_rank:${userAddress}:${leaderboardType}:${metric}`);
      }
      
      this.performanceMonitor.endTiming(timingId, result);
      return result;

    } catch (error) {
      this.performanceMonitor.endTiming(timingId, null, error);
      throw error;
    }
  }

  /**
   * Get user statistics with performance monitoring
   */
  async getUserStats(userAddress) {
    const timingId = this.performanceMonitor.startTiming('userStats', { userAddress });
    
    try {
      const result = await super.getUserStats(userAddress);
      
      // Track cache operations
      if (this.redisEnabled) {
        this.performanceMonitor.trackCacheOperation('hit', `user_stats:${userAddress}`);
      }
      
      this.performanceMonitor.endTiming(timingId, result);
      return result;

    } catch (error) {
      this.performanceMonitor.endTiming(timingId, null, error);
      throw error;
    }
  }

  /**
   * Refresh leaderboard cache with performance monitoring
   */
  async refreshLeaderboardCache(leaderboardType, metric, limit = 100) {
    const timingId = this.performanceMonitor.startTiming('cacheRefresh', { leaderboardType, metric, limit });
    
    try {
      await super.refreshLeaderboardCache(leaderboardType, metric, limit);
      
      // Track cache operations
      if (this.redisEnabled) {
        this.performanceMonitor.trackCacheOperation('delete', `${leaderboardType}:*`);
      }
      
      this.performanceMonitor.endTiming(timingId, { success: true });
      console.log(`✅ Optimized leaderboard cache refreshed: ${leaderboardType}:${metric}`);

    } catch (error) {
      this.performanceMonitor.endTiming(timingId, null, error);
      throw error;
    }
  }

  /**
   * Refresh user statistics with performance monitoring
   */
  async refreshUserStats() {
    const timingId = this.performanceMonitor.startTiming('cacheRefresh', { operation: 'userStats' });
    
    try {
      await super.refreshUserStats();
      
      // Track cache operations
      if (this.redisEnabled) {
        this.performanceMonitor.trackCacheOperation('delete', 'user_stats:*');
      }
      
      this.performanceMonitor.endTiming(timingId, { success: true });
      console.log('✅ Optimized user statistics refreshed');

    } catch (error) {
      this.performanceMonitor.endTiming(timingId, null, error);
      throw error;
    }
  }

  /**
   * Get comprehensive performance metrics
   */
  getPerformanceMetrics() {
    return {
      leaderboard: this.performanceMonitor.getStats(),
      cache: this.getCacheStats(),
      health: this.performanceMonitor.healthCheck(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get operation-specific performance metrics
   * @param {string} operation - Operation name
   */
  getOperationMetrics(operation) {
    return this.performanceMonitor.getOperationMetrics(operation);
  }

  /**
   * Get slowest operations
   * @param {number} limit - Number of operations to return
   */
  getSlowestOperations(limit = 10) {
    return this.performanceMonitor.getSlowestOperations(limit);
  }

  /**
   * Get recent activity
   * @param {number} limit - Number of activities to return
   */
  getRecentActivity(limit = 20) {
    return this.performanceMonitor.getRecentActivity(limit);
  }

  /**
   * Reset performance metrics
   */
  resetPerformanceMetrics() {
    this.performanceMonitor.reset();
    console.log('🔄 Performance metrics reset');
  }

  /**
   * Get comprehensive health status
   */
  async getComprehensiveHealth() {
    try {
      const baseHealth = await this.healthCheck();
      const performanceHealth = this.performanceMonitor.healthCheck();
      
      return {
        service: baseHealth,
        performance: performanceHealth,
        optimized: true,
        initialized: this.isInitialized,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      return {
        service: { status: 'unhealthy', error: error.message },
        performance: { status: 'unhealthy', error: error.message },
        optimized: true,
        initialized: this.isInitialized,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get optimization recommendations
   */
  getOptimizationRecommendations() {
    const metrics = this.performanceMonitor.getStats();
    const recommendations = [];

    // Check cache efficiency
    const cacheEfficiency = this.getCacheStats().performance;
    if (parseFloat(cacheEfficiency.hitRate) < 70) {
      recommendations.push({
        type: 'cache',
        priority: 'high',
        message: 'Cache hit rate is low. Consider increasing cache TTL or improving cache keys.',
        current: cacheEfficiency.hitRate,
        target: '>70%'
      });
    }

    // Check average response times
    Object.keys(metrics.averages).forEach(operation => {
      const avg = metrics.averages[operation];
      if (avg.avgDuration > 1000) { // More than 1 second
        recommendations.push({
          type: 'performance',
          priority: 'high',
          message: `${operation} operation is slow. Consider optimization.`,
          current: avg.avgDuration.toFixed(2) + 'ms',
          target: '<1000ms'
        });
      }
    });

    // Check error rate
    const errorRate = metrics.totals.queries > 0 ? (metrics.totals.errors / metrics.totals.queries * 100) : 0;
    if (errorRate > 5) {
      recommendations.push({
        type: 'reliability',
        priority: 'high',
        message: 'Error rate is high. Check system stability.',
        current: errorRate.toFixed(2) + '%',
        target: '<5%'
      });
    }

    return {
      recommendations,
      metrics: {
        cacheEfficiency: cacheEfficiency.hitRate,
        errorRate: errorRate.toFixed(2) + '%',
        totalQueries: metrics.totals.queries,
        avgResponseTime: metrics.totals.queries > 0 ? (metrics.totals.totalTime / metrics.totals.queries).toFixed(2) + 'ms' : '0ms'
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Close all connections and cleanup
   */
  async close() {
    try {
      await super.close();
      console.log('✅ Optimized leaderboard service closed');
    } catch (error) {
      console.error('❌ Error closing optimized leaderboard service:', error.message);
    }
  }
}

module.exports = OptimizedLeaderboardService;
