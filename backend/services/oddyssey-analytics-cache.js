const NodeCache = require('node-cache');
const db = require('../db/db');

/**
 * 🚀 Odyssey Analytics Cache Service
 * 
 * Smart caching system for analytics to prevent overcomputing:
 * - Multi-tier caching (memory, database, contract)
 * - Intelligent cache invalidation
 * - Background refresh for hot data
 * - Cache warming strategies
 * - Performance monitoring
 */
class OdysseyAnalyticsCache {
  constructor() {
    // Memory cache with different TTLs for different data types
    this.cache = new NodeCache({
      stdTTL: 300, // 5 minutes default
      checkperiod: 60, // Check for expired keys every minute
      useClones: false // Better performance for large objects
    });
    
    // Cache configuration for different data types
    this.cacheConfig = {
      // Hot data - refreshed frequently
      'slip_probability': { ttl: 60, priority: 'high' }, // 1 minute
      'cycle_selections': { ttl: 120, priority: 'high' }, // 2 minutes
      'match_analytics': { ttl: 180, priority: 'high' }, // 3 minutes
      
      // Warm data - moderate refresh
      'cycle_analytics': { ttl: 300, priority: 'medium' }, // 5 minutes
      'user_analytics': { ttl: 600, priority: 'medium' }, // 10 minutes
      'platform_analytics': { ttl: 900, priority: 'medium' }, // 15 minutes
      
      // Cold data - infrequent refresh
      'platform_stats': { ttl: 1800, priority: 'low' }, // 30 minutes
      'historical_trends': { ttl: 3600, priority: 'low' }, // 1 hour
      'user_cumulative': { ttl: 7200, priority: 'low' } // 2 hours
    };
    
    // Background refresh queue
    this.refreshQueue = new Map();
    this.isRefreshing = false;
    
    // Performance metrics
    this.metrics = {
      hits: 0,
      misses: 0,
      refreshes: 0,
      errors: 0
    };
    
    // Start background refresh process
    this.startBackgroundRefresh();
  }

  /**
   * 🎯 Get data with smart caching
   */
  async get(key, dataType, fetchFunction, options = {}) {
    const config = this.cacheConfig[dataType] || { ttl: 300, priority: 'medium' };
    const cacheKey = `${dataType}:${key}`;
    
    try {
      // Check memory cache first
      let data = this.cache.get(cacheKey);
      
      if (data) {
        this.metrics.hits++;
        return data;
      }
      
      this.metrics.misses++;
      
      // Fetch fresh data
      data = await fetchFunction();
      
      // Store in cache with appropriate TTL
      this.cache.set(cacheKey, data, config.ttl);
      
      // Schedule background refresh for high-priority data
      if (config.priority === 'high' && !this.refreshQueue.has(cacheKey)) {
        this.scheduleBackgroundRefresh(cacheKey, fetchFunction, config.ttl);
      }
      
      return data;
      
    } catch (error) {
      this.metrics.errors++;
      console.error(`❌ Cache error for ${cacheKey}:`, error.message);
      throw error;
    }
  }

  /**
   * 🔄 Schedule background refresh for hot data
   */
  scheduleBackgroundRefresh(cacheKey, fetchFunction, ttl) {
    const refreshTime = Math.max(ttl * 0.8, 30); // Refresh at 80% of TTL or 30s minimum
    
    const timeoutId = setTimeout(async () => {
      try {
        const freshData = await fetchFunction();
        this.cache.set(cacheKey, freshData, ttl);
        this.metrics.refreshes++;
        this.refreshQueue.delete(cacheKey);
      } catch (error) {
        console.error(`❌ Background refresh failed for ${cacheKey}:`, error.message);
        this.refreshQueue.delete(cacheKey);
      }
    }, refreshTime * 1000);
    
    this.refreshQueue.set(cacheKey, { timeoutId, fetchFunction, ttl });
  }

  /**
   * 🚀 Start background refresh process
   */
  startBackgroundRefresh() {
    // Refresh high-priority data every 30 seconds
    setInterval(() => {
      if (this.isRefreshing) return;
      
      this.isRefreshing = true;
      this.refreshHighPriorityData()
        .finally(() => {
          this.isRefreshing = false;
        });
    }, 30000);
    
    // Clean up expired refresh jobs every 5 minutes
    setInterval(() => {
      this.cleanupRefreshQueue();
    }, 300000);
  }

  /**
   * 🔥 Refresh high-priority data in background
   */
  async refreshHighPriorityData() {
    const highPriorityKeys = Array.from(this.refreshQueue.keys())
      .filter(key => key.includes('slip_probability') || key.includes('cycle_selections'));
    
    for (const cacheKey of highPriorityKeys) {
      const job = this.refreshQueue.get(cacheKey);
      if (job) {
        try {
          const freshData = await job.fetchFunction();
          this.cache.set(cacheKey, freshData, job.ttl);
          this.metrics.refreshes++;
        } catch (error) {
          console.error(`❌ Background refresh failed for ${cacheKey}:`, error.message);
        }
      }
    }
  }

  /**
   * 🧹 Clean up expired refresh jobs
   */
  cleanupRefreshQueue() {
    for (const [cacheKey, job] of this.refreshQueue.entries()) {
      if (!this.cache.has(cacheKey)) {
        clearTimeout(job.timeoutId);
        this.refreshQueue.delete(cacheKey);
      }
    }
  }

  /**
   * 🗑️ Invalidate cache for specific data
   */
  invalidate(pattern) {
    const keys = this.cache.keys();
    const matchingKeys = keys.filter(key => key.includes(pattern));
    
    matchingKeys.forEach(key => {
      this.cache.del(key);
      // Cancel any pending refresh for this key
      if (this.refreshQueue.has(key)) {
        const job = this.refreshQueue.get(key);
        clearTimeout(job.timeoutId);
        this.refreshQueue.delete(key);
      }
    });
    
    console.log(`🗑️ Invalidated ${matchingKeys.length} cache entries for pattern: ${pattern}`);
  }

  /**
   * 📊 Get cache performance metrics
   */
  getMetrics() {
    const hitRate = this.metrics.hits / (this.metrics.hits + this.metrics.misses) * 100;
    
    return {
      ...this.metrics,
      hitRate: hitRate.toFixed(2) + '%',
      cacheSize: this.cache.keys().length,
      refreshQueueSize: this.refreshQueue.size,
      memoryUsage: process.memoryUsage()
    };
  }

  /**
   * 🧠 Smart cache warming for predictable data
   */
  async warmCache() {
    console.log('🔥 Warming analytics cache...');
    
    try {
      // Warm platform stats (cold data)
      await this.get('platform', 'platform_stats', async () => {
        const result = await db.query(`
          SELECT 
            COUNT(DISTINCT cycle_id) as total_cycles,
            COUNT(*) as total_slips,
            COUNT(DISTINCT player_address) as unique_players,
            AVG(correct_count) as avg_accuracy
          FROM oracle.oddyssey_slips
        `);
        return result.rows[0] || {};
      });
      
      // Warm recent cycle data
      const recentCycles = await db.query(`
        SELECT cycle_id FROM oracle.oddyssey_cycles 
        ORDER BY cycle_id DESC LIMIT 3
      `);
      
      for (const cycle of recentCycles.rows) {
        await this.get(`cycle_${cycle.cycle_id}`, 'cycle_analytics', async () => {
          const result = await db.query(`
            SELECT 
              COUNT(*) as total_slips,
              COUNT(DISTINCT player_address) as unique_players,
              AVG(correct_count) as avg_accuracy
            FROM oracle.oddyssey_slips 
            WHERE cycle_id = $1
          `, [cycle.cycle_id]);
          return result.rows[0] || {};
        });
      }
      
      console.log('✅ Cache warming completed');
      
    } catch (error) {
      console.error('❌ Cache warming failed:', error.message);
    }
  }

  /**
   * 🎯 Get cached slip probability with smart refresh
   */
  async getSlipProbability(slipId, cycleId, fetchFunction) {
    return this.get(
      `slip_${slipId}_${cycleId}`,
      'slip_probability',
      fetchFunction,
      { ttl: 60 } // 1 minute for slip data
    );
  }

  /**
   * 📊 Get cached cycle selections with smart refresh
   */
  async getCycleSelections(cycleId, fetchFunction) {
    return this.get(
      `cycle_${cycleId}_selections`,
      'cycle_selections',
      fetchFunction,
      { ttl: 120 } // 2 minutes for selections
    );
  }

  /**
   * 🎲 Get cached match analytics with smart refresh
   */
  async getMatchAnalytics(matchId, cycleId, fetchFunction) {
    return this.get(
      `match_${matchId}_${cycleId}`,
      'match_analytics',
      fetchFunction,
      { ttl: 180 } // 3 minutes for match data
    );
  }

  /**
   * 📈 Get cached cycle analytics with smart refresh
   */
  async getCycleAnalytics(cycleId, fetchFunction) {
    return this.get(
      `cycle_${cycleId}_full`,
      'cycle_analytics',
      fetchFunction,
      { ttl: 300 } // 5 minutes for full cycle data
    );
  }

  /**
   * 🎯 Get cached user analytics with smart refresh
   */
  async getUserAnalytics(userAddress, fetchFunction) {
    return this.get(
      `user_${userAddress}`,
      'user_analytics',
      fetchFunction,
      { ttl: 600 } // 10 minutes for user data
    );
  }

  /**
   * 📊 Get cached platform analytics with smart refresh
   */
  async getPlatformAnalytics(fetchFunction) {
    return this.get(
      'platform_full',
      'platform_analytics',
      fetchFunction,
      { ttl: 900 } // 15 minutes for platform data
    );
  }

  /**
   * 🧹 Clear all cache
   */
  clear() {
    this.cache.flushAll();
    
    // Clear refresh queue
    for (const [cacheKey, job] of this.refreshQueue.entries()) {
      clearTimeout(job.timeoutId);
    }
    this.refreshQueue.clear();
    
    console.log('🧹 Cache cleared');
  }

  /**
   * 📊 Get cache statistics
   */
  getStats() {
    return {
      metrics: this.getMetrics(),
      config: this.cacheConfig,
      queue: Array.from(this.refreshQueue.keys())
    };
  }
}

module.exports = OdysseyAnalyticsCache;
