const LeaderboardService = require('./leaderboard-service');
const RedisCacheService = require('./redis-cache-service');

/**
 * Enhanced Leaderboard Service with Redis Caching
 * 
 * Extends the base leaderboard service with high-performance Redis caching
 * Implements multi-layer caching strategy for optimal performance
 */
class EnhancedLeaderboardService extends LeaderboardService {
  constructor() {
    super();
    this.redisCache = new RedisCacheService();
    this.cachePrefix = 'leaderboard:';
    this.redisEnabled = false;
    this.cacheStats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0
    };
  }

  /**
   * Initialize the enhanced service
   */
  async initialize() {
    try {
      console.log('🚀 Initializing enhanced leaderboard service...');
      
      // Initialize Redis cache
      this.redisEnabled = await this.redisCache.initialize();
      
      if (this.redisEnabled) {
        console.log('✅ Redis cache enabled for leaderboard service');
      } else {
        console.log('⚠️ Redis cache disabled, falling back to memory cache');
      }

      return true;

    } catch (error) {
      console.error('❌ Failed to initialize enhanced leaderboard service:', error.message);
      this.redisEnabled = false;
      return false;
    }
  }

  /**
   * Get guided markets leaderboard with Redis caching
   */
  async getGuidedMarketsLeaderboard(metric = 'total_staked', limit = 30, useCache = true) {
    const cacheKey = `${this.cachePrefix}guided_markets:${metric}:${limit}`;
    
    try {
      // Try Redis cache first if enabled
      if (useCache && this.redisEnabled) {
        const cached = await this.redisCache.get(cacheKey);
        if (cached) {
          this.cacheStats.hits++;
          console.log('📊 [REDIS] Cache hit for guided markets leaderboard');
          return cached;
        }
        this.cacheStats.misses++;
      }

      // Fallback to parent implementation
      const data = await super.getGuidedMarketsLeaderboard(metric, limit, false);

      // Cache the result in Redis
      if (useCache && this.redisEnabled) {
        await this.redisCache.set(cacheKey, data, 300); // 5 minutes TTL
        this.cacheStats.sets++;
        console.log('📊 [REDIS] Cached guided markets leaderboard');
      }

      return data;

    } catch (error) {
      console.error('❌ Error in enhanced guided markets leaderboard:', error.message);
      // Fallback to parent implementation without caching
      return await super.getGuidedMarketsLeaderboard(metric, limit, false);
    }
  }

  /**
   * Get reputation leaderboard with Redis caching
   */
  async getReputationLeaderboard(limit = 30, useCache = true) {
    const cacheKey = `${this.cachePrefix}reputation:${limit}`;
    
    try {
      // Try Redis cache first if enabled
      if (useCache && this.redisEnabled) {
        const cached = await this.redisCache.get(cacheKey);
        if (cached) {
          this.cacheStats.hits++;
          console.log('📊 [REDIS] Cache hit for reputation leaderboard');
          return cached;
        }
        this.cacheStats.misses++;
      }

      // Fallback to parent implementation
      const data = await super.getReputationLeaderboard(limit, false);

      // Cache the result in Redis
      if (useCache && this.redisEnabled) {
        await this.redisCache.set(cacheKey, data, 600); // 10 minutes TTL
        this.cacheStats.sets++;
        console.log('📊 [REDIS] Cached reputation leaderboard');
      }

      return data;

    } catch (error) {
      console.error('❌ Error in enhanced reputation leaderboard:', error.message);
      // Fallback to parent implementation without caching
      return await super.getReputationLeaderboard(limit, false);
    }
  }

  /**
   * Get user rank with Redis caching
   */
  async getUserRank(userAddress, leaderboardType, metric = 'total_staked') {
    const cacheKey = `${this.cachePrefix}user_rank:${userAddress}:${leaderboardType}:${metric}`;
    
    try {
      // Try Redis cache first if enabled
      if (this.redisEnabled) {
        const cached = await this.redisCache.get(cacheKey);
        if (cached) {
          this.cacheStats.hits++;
          return cached;
        }
        this.cacheStats.misses++;
      }

      // Fallback to parent implementation
      const data = await super.getUserRank(userAddress, leaderboardType, metric);

      // Cache the result in Redis
      if (this.redisEnabled && data) {
        await this.redisCache.set(cacheKey, data, 180); // 3 minutes TTL
        this.cacheStats.sets++;
      }

      return data;

    } catch (error) {
      console.error('❌ Error in enhanced user rank:', error.message);
      return await super.getUserRank(userAddress, leaderboardType, metric);
    }
  }

  /**
   * Get user statistics with Redis caching
   */
  async getUserStats(userAddress) {
    const cacheKey = `${this.cachePrefix}user_stats:${userAddress}`;
    
    try {
      // Try Redis cache first if enabled
      if (this.redisEnabled) {
        const cached = await this.redisCache.get(cacheKey);
        if (cached) {
          this.cacheStats.hits++;
          return cached;
        }
        this.cacheStats.misses++;
      }

      // Fallback to parent implementation
      const data = await super.getUserStats(userAddress);

      // Cache the result in Redis
      if (this.redisEnabled && data) {
        await this.redisCache.set(cacheKey, data, 120); // 2 minutes TTL
        this.cacheStats.sets++;
      }

      return data;

    } catch (error) {
      console.error('❌ Error in enhanced user stats:', error.message);
      return await super.getUserStats(userAddress);
    }
  }

  /**
   * Refresh leaderboard cache with Redis invalidation
   */
  async refreshLeaderboardCache(leaderboardType, metric, limit = 100) {
    try {
      // Clear Redis cache for this leaderboard type
      if (this.redisEnabled) {
        const pattern = `${this.cachePrefix}${leaderboardType}:*`;
        await this.redisCache.clearPattern(pattern);
        this.cacheStats.deletes++;
        console.log(`🧹 [REDIS] Cleared cache pattern: ${pattern}`);
      }

      // Call parent implementation
      await super.refreshLeaderboardCache(leaderboardType, metric, limit);

      console.log(`✅ Enhanced leaderboard cache refreshed: ${leaderboardType}:${metric}`);

    } catch (error) {
      console.error('❌ Error refreshing enhanced leaderboard cache:', error.message);
      throw error;
    }
  }

  /**
   * Refresh user statistics with Redis invalidation
   */
  async refreshUserStats() {
    try {
      // Clear Redis cache for user stats
      if (this.redisEnabled) {
        const pattern = `${this.cachePrefix}user_stats:*`;
        await this.redisCache.clearPattern(pattern);
        this.cacheStats.deletes++;
        console.log(`🧹 [REDIS] Cleared user stats cache pattern: ${pattern}`);
      }

      // Call parent implementation
      await super.refreshUserStats();

      console.log('✅ Enhanced user statistics refreshed');

    } catch (error) {
      console.error('❌ Error refreshing enhanced user stats:', error.message);
      throw error;
    }
  }

  /**
   * Clear all caches (memory + Redis)
   */
  async clearAllCaches() {
    try {
      // Clear memory cache
      this.clearCache();

      // Clear Redis cache
      if (this.redisEnabled) {
        await this.redisCache.clearPattern(`${this.cachePrefix}*`);
        this.cacheStats.deletes++;
        console.log('🧹 [REDIS] Cleared all leaderboard caches');
      }

      console.log('✅ All caches cleared successfully');

    } catch (error) {
      console.error('❌ Error clearing all caches:', error.message);
      throw error;
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      redisEnabled: this.redisEnabled,
      memoryCache: {
        size: this.memoryCache.size,
        timeout: this.cacheTimeout
      },
      redisCache: this.redisEnabled ? this.redisCache.getStats() : null,
      performance: {
        hits: this.cacheStats.hits,
        misses: this.cacheStats.misses,
        sets: this.cacheStats.sets,
        deletes: this.cacheStats.deletes,
        hitRate: this.cacheStats.hits + this.cacheStats.misses > 0 
          ? (this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses) * 100).toFixed(2) + '%'
          : '0%'
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Health check including Redis
   */
  async healthCheck() {
    try {
      const baseHealth = await super.healthCheck();
      const redisHealth = this.redisEnabled ? await this.redisCache.healthCheck() : { status: 'disabled' };

      return {
        leaderboardService: baseHealth,
        redisCache: redisHealth,
        enhanced: true,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      return {
        leaderboardService: { status: 'unhealthy', error: error.message },
        redisCache: { status: 'unhealthy', error: error.message },
        enhanced: true,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Close all connections
   */
  async close() {
    try {
      if (this.redisEnabled) {
        await this.redisCache.close();
      }
      await super.close();
      console.log('✅ Enhanced leaderboard service closed');
    } catch (error) {
      console.error('❌ Error closing enhanced leaderboard service:', error.message);
    }
  }
}

module.exports = EnhancedLeaderboardService;
