const redis = require('redis');

class OptimizedCaching {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  async initialize() {
    try {
      // Skip Redis if not configured
      if (!process.env.REDIS_URL) {
        console.log('⚠️ Redis URL not configured, optimized caching disabled');
        console.log('💡 Set REDIS_URL environment variable to enable caching');
        this.isConnected = false;
        return;
      }
      
      this.client = redis.createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379'
      });
      
      this.client.on('error', (err) => {
        console.error('Redis Client Error:', err);
        this.isConnected = false;
      });
      
      this.client.on('connect', () => {
        console.log('✅ Redis connected for optimized caching');
        this.isConnected = true;
      });
      
      await this.client.connect();
    } catch (error) {
      console.error('Failed to initialize Redis:', error);
      console.log('⚠️ Continuing without Redis caching');
      this.isConnected = false;
    }
  }

  /**
   * Cache middleware for optimized pool endpoints
   */
  cacheMiddleware(ttl = 120) { // 2 minutes default TTL
    return async (req, res, next) => {
      if (!this.isConnected || !this.client) {
        return next();
      }

      try {
        const cacheKey = `optimized:${req.originalUrl}:${JSON.stringify(req.query)}`;
        
        // Try to get from cache
        const cached = await this.client.get(cacheKey);
        if (cached) {
          console.log(`🚀 Cache HIT for ${req.originalUrl}`);
          return res.json(JSON.parse(cached));
        }

        // Store original json method
        const originalJson = res.json;
        
        // Override json method to cache response
        res.json = (data) => {
          // Cache the response
          this.client.setEx(cacheKey, ttl, JSON.stringify(data))
            .catch(err => console.error('Cache set error:', err));
          
          console.log(`💾 Cached response for ${req.originalUrl} (TTL: ${ttl}s)`);
          
          // Call original json method
          return originalJson.call(res, data);
        };

        next();
      } catch (error) {
        console.error('Cache middleware error:', error);
        next();
      }
    };
  }

  /**
   * Invalidate cache for specific patterns
   */
  async invalidatePattern(pattern) {
    if (!this.isConnected || !this.client) {
      return;
    }

    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
        console.log(`🗑️ Invalidated ${keys.length} cache entries for pattern: ${pattern}`);
      }
    } catch (error) {
      console.error('Cache invalidation error:', error);
    }
  }

  /**
   * Invalidate pool-related caches
   */
  async invalidatePoolCaches(poolId = null) {
    const patterns = [
      'optimized:/api/optimized-pools/pools*',
      'optimized:/api/optimized-pools/recent-bets*',
      'optimized:/api/optimized-pools/analytics*'
    ];

    if (poolId) {
      patterns.push(`optimized:/api/optimized-pools/pools/${poolId}*`);
      patterns.push(`optimized:/api/optimized-pools/pools/${poolId}/progress*`);
    }

    for (const pattern of patterns) {
      await this.invalidatePattern(pattern);
    }
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    if (!this.isConnected || !this.client) {
      return { connected: false };
    }

    try {
      const info = await this.client.info('memory');
      const keys = await this.client.keys('optimized:*');
      
      return {
        connected: true,
        totalKeys: keys.length,
        memoryInfo: info
      };
    } catch (error) {
      console.error('Cache stats error:', error);
      return { connected: false, error: error.message };
    }
  }
}

module.exports = new OptimizedCaching();
