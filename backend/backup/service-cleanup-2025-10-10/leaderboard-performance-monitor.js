const { performance } = require('perf_hooks');

/**
 * Leaderboard Performance Monitor
 * 
 * Monitors and tracks performance metrics for leaderboard operations
 * Provides insights into query performance, cache efficiency, and bottlenecks
 */
class LeaderboardPerformanceMonitor {
  constructor() {
    this.metrics = {
      queries: new Map(),
      cacheOperations: new Map(),
      errors: new Map(),
      timings: {
        guidedMarkets: [],
        reputation: [],
        userStats: [],
        userRank: [],
        cacheRefresh: []
      },
      totals: {
        queries: 0,
        cacheHits: 0,
        cacheMisses: 0,
        errors: 0,
        totalTime: 0
      }
    };
    this.maxTimingsHistory = 1000; // Keep last 1000 timing records
  }

  /**
   * Start timing an operation
   * @param {string} operation - Operation name
   * @param {Object} metadata - Additional metadata
   */
  startTiming(operation, metadata = {}) {
    const timingId = `${operation}_${Date.now()}_${Math.random()}`;
    const startTime = performance.now();
    
    this.metrics.queries.set(timingId, {
      operation,
      startTime,
      metadata,
      status: 'running'
    });

    return timingId;
  }

  /**
   * End timing an operation
   * @param {string} timingId - Timing ID from startTiming
   * @param {Object} result - Operation result
   * @param {Error} error - Error if operation failed
   */
  endTiming(timingId, result = null, error = null) {
    const endTime = performance.now();
    const query = this.metrics.queries.get(timingId);

    if (!query) {
      console.warn(`⚠️ Timing ID not found: ${timingId}`);
      return;
    }

    const duration = endTime - query.startTime;
    const operation = query.operation;

    // Update query record
    query.endTime = endTime;
    query.duration = duration;
    query.status = error ? 'error' : 'success';
    query.result = result;
    query.error = error;

    // Update totals
    this.metrics.totals.queries++;
    this.metrics.totals.totalTime += duration;

    // Add to timing history
    this.addTimingRecord(operation, {
      duration,
      metadata: query.metadata,
      status: query.status,
      timestamp: new Date().toISOString()
    });

    // Track errors
    if (error) {
      this.trackError(operation, error, query.metadata);
    }

    // Clean up old queries (keep last 100)
    if (this.metrics.queries.size > 100) {
      const oldestKey = this.metrics.queries.keys().next().value;
      this.metrics.queries.delete(oldestKey);
    }

    console.log(`⏱️ [PERF] ${operation}: ${duration.toFixed(2)}ms`);
  }

  /**
   * Add timing record to history
   * @param {string} operation - Operation name
   * @param {Object} record - Timing record
   */
  addTimingRecord(operation, record) {
    const timingArray = this.metrics.timings[operation];
    if (timingArray) {
      timingArray.push(record);
      
      // Keep only recent records
      if (timingArray.length > this.maxTimingsHistory) {
        timingArray.shift();
      }
    }
  }

  /**
   * Track cache operation
   * @param {string} operation - Cache operation (hit, miss, set, delete)
   * @param {string} key - Cache key
   * @param {number} duration - Operation duration
   */
  trackCacheOperation(operation, key, duration = 0) {
    const cacheKey = `${operation}_${key}`;
    const existing = this.metrics.cacheOperations.get(cacheKey) || {
      operation,
      key,
      count: 0,
      totalDuration: 0,
      avgDuration: 0
    };

    existing.count++;
    existing.totalDuration += duration;
    existing.avgDuration = existing.totalDuration / existing.count;

    this.metrics.cacheOperations.set(cacheKey, existing);

    // Update totals
    if (operation === 'hit') {
      this.metrics.totals.cacheHits++;
    } else if (operation === 'miss') {
      this.metrics.totals.cacheMisses++;
    }
  }

  /**
   * Track error
   * @param {string} operation - Operation that failed
   * @param {Error} error - Error object
   * @param {Object} metadata - Additional metadata
   */
  trackError(operation, error, metadata = {}) {
    const errorKey = `${operation}_${error.name}`;
    const existing = this.metrics.errors.get(errorKey) || {
      operation,
      errorName: error.name,
      count: 0,
      lastOccurrence: null,
      messages: new Set()
    };

    existing.count++;
    existing.lastOccurrence = new Date().toISOString();
    existing.messages.add(error.message);

    this.metrics.errors.set(errorKey, existing);
    this.metrics.totals.errors++;

    console.error(`❌ [PERF] Error in ${operation}: ${error.message}`);
  }

  /**
   * Get performance statistics
   */
  getStats() {
    const stats = {
      totals: { ...this.metrics.totals },
      averages: {},
      errors: Array.from(this.metrics.errors.values()),
      cacheEfficiency: this.getCacheEfficiency(),
      slowestOperations: this.getSlowestOperations(),
      recentActivity: this.getRecentActivity(),
      timestamp: new Date().toISOString()
    };

    // Calculate averages for each operation type
    Object.keys(this.metrics.timings).forEach(operation => {
      const timings = this.metrics.timings[operation];
      if (timings.length > 0) {
        const totalDuration = timings.reduce((sum, t) => sum + t.duration, 0);
        stats.averages[operation] = {
          count: timings.length,
          avgDuration: totalDuration / timings.length,
          minDuration: Math.min(...timings.map(t => t.duration)),
          maxDuration: Math.max(...timings.map(t => t.duration))
        };
      }
    });

    return stats;
  }

  /**
   * Get cache efficiency metrics
   */
  getCacheEfficiency() {
    const total = this.metrics.totals.cacheHits + this.metrics.totals.cacheMisses;
    return {
      hitRate: total > 0 ? (this.metrics.totals.cacheHits / total * 100).toFixed(2) + '%' : '0%',
      totalHits: this.metrics.totals.cacheHits,
      totalMisses: this.metrics.totals.cacheMisses,
      totalOperations: total
    };
  }

  /**
   * Get slowest operations
   */
  getSlowestOperations(limit = 10) {
    const allTimings = [];
    
    Object.keys(this.metrics.timings).forEach(operation => {
      this.metrics.timings[operation].forEach(timing => {
        allTimings.push({
          operation,
          duration: timing.duration,
          timestamp: timing.timestamp,
          status: timing.status
        });
      });
    });

    return allTimings
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }

  /**
   * Get recent activity
   */
  getRecentActivity(limit = 20) {
    const recent = [];
    
    this.metrics.queries.forEach((query, id) => {
      if (query.status === 'success' || query.status === 'error') {
        recent.push({
          id,
          operation: query.operation,
          duration: query.duration,
          status: query.status,
          timestamp: new Date(query.startTime).toISOString()
        });
      }
    });

    return recent
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit);
  }

  /**
   * Get operation-specific metrics
   * @param {string} operation - Operation name
   */
  getOperationMetrics(operation) {
    const timings = this.metrics.timings[operation] || [];
    
    if (timings.length === 0) {
      return null;
    }

    const durations = timings.map(t => t.duration);
    const successCount = timings.filter(t => t.status === 'success').length;
    const errorCount = timings.filter(t => t.status === 'error').length;

    return {
      operation,
      totalCalls: timings.length,
      successCount,
      errorCount,
      successRate: (successCount / timings.length * 100).toFixed(2) + '%',
      avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      p50Duration: this.percentile(durations, 50),
      p95Duration: this.percentile(durations, 95),
      p99Duration: this.percentile(durations, 99)
    };
  }

  /**
   * Calculate percentile
   * @param {number[]} values - Array of values
   * @param {number} percentile - Percentile to calculate
   */
  percentile(values, percentile) {
    const sorted = values.slice().sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index] || 0;
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.metrics = {
      queries: new Map(),
      cacheOperations: new Map(),
      errors: new Map(),
      timings: {
        guidedMarkets: [],
        reputation: [],
        userStats: [],
        userRank: [],
        cacheRefresh: []
      },
      totals: {
        queries: 0,
        cacheHits: 0,
        cacheMisses: 0,
        errors: 0,
        totalTime: 0
      }
    };
    console.log('🔄 Performance metrics reset');
  }

  /**
   * Health check
   */
  healthCheck() {
    const stats = this.getStats();
    const errorRate = stats.totals.queries > 0 ? (stats.totals.errors / stats.totals.queries * 100) : 0;
    
    return {
      status: errorRate > 10 ? 'unhealthy' : 'healthy',
      errorRate: errorRate.toFixed(2) + '%',
      totalQueries: stats.totals.queries,
      avgResponseTime: stats.totals.queries > 0 ? (stats.totals.totalTime / stats.totals.queries).toFixed(2) + 'ms' : '0ms',
      cacheEfficiency: stats.cacheEfficiency,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = LeaderboardPerformanceMonitor;
