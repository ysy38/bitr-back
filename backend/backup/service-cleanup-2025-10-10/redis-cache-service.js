const Redis = require('ioredis');

/**
 * Redis Cache Service
 * 
 * Provides high-performance caching for leaderboard data using Redis
 * Implements cache-aside pattern with TTL and invalidation strategies
 */
class RedisCacheService {
  constructor() {
    this.redis = null;
    this.isConnected = false;
    this.defaultTTL = 300; // 5 minutes default TTL
    this.retryAttempts = 3;
    this.retryDelay = 1000; // 1 second
  }

  /**
   * Initialize Redis connection
   */
  async initialize() {
    try {
      // Skip Redis if no URL provided (local development)
      if (!process.env.REDIS_URL) {
        console.log('🔌 Redis disabled - continuing without cache');
        this.isConnected = false;
        return;
      }

      // Use Redis URL from environment
      const redisUrl = process.env.REDIS_URL;
      
      this.redis = new Redis(redisUrl, {
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: this.retryAttempts,
        lazyConnect: true,
        keepAlive: 30000,
        connectTimeout: 10000,
        commandTimeout: 5000,
        retryDelayOnClusterDown: 300,
        enableOfflineQueue: false,
        maxLoadingTimeout: 10000
      });

      // Handle connection events
      this.redis.on('connect', () => {
        console.log('✅ Redis connected successfully');
        this.isConnected = true;
      });

      this.redis.on('error', (error) => {
        console.error('❌ Redis connection error:', error.message);
        this.isConnected = false;
      });

      this.redis.on('close', () => {
        console.log('🔌 Redis connection closed');
        this.isConnected = false;
      });

      this.redis.on('reconnecting', () => {
        console.log('🔄 Redis reconnecting...');
      });

      // Connect to Redis
      await this.redis.connect();
      
      console.log('✅ Redis cache service initialized');
      return true;

    } catch (error) {
      console.error('❌ Failed to initialize Redis cache service:', error.message);
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Get value from cache
   * @param {string} key - Cache key
   * @param {boolean} parseJson - Whether to parse JSON (default: true)
   */
  async get(key, parseJson = true) {
    if (!this.isConnected) {
      return null;
    }

    try {
      const value = await this.redis.get(key);
      
      if (value === null) {
        return null;
      }

      return parseJson ? JSON.parse(value) : value;

    } catch (error) {
      console.error(`❌ Error getting cache key '${key}':`, error.message);
      return null;
    }
  }

  /**
   * Set value in cache
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in seconds (optional)
   */
  async set(key, value, ttl = null) {
    if (!this.isConnected) {
      return false;
    }

    try {
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      const actualTTL = ttl || this.defaultTTL;

      await this.redis.setex(key, actualTTL, stringValue);
      return true;

    } catch (error) {
      console.error(`❌ Error setting cache key '${key}':`, error.message);
      return false;
    }
  }

  /**
   * Delete value from cache
   * @param {string} key - Cache key
   */
  async del(key) {
    if (!this.isConnected) {
      return false;
    }

    try {
      await this.redis.del(key);
      return true;

    } catch (error) {
      console.error(`❌ Error deleting cache key '${key}':`, error.message);
      return false;
    }
  }

  /**
   * Delete multiple keys from cache
   * @param {string[]} keys - Array of cache keys
   */
  async delMultiple(keys) {
    if (!this.isConnected || keys.length === 0) {
      return false;
    }

    try {
      await this.redis.del(...keys);
      return true;

    } catch (error) {
      console.error(`❌ Error deleting multiple cache keys:`, error.message);
      return false;
    }
  }

  /**
   * Check if key exists in cache
   * @param {string} key - Cache key
   */
  async exists(key) {
    if (!this.isConnected) {
      return false;
    }

    try {
      const result = await this.redis.exists(key);
      return result === 1;

    } catch (error) {
      console.error(`❌ Error checking cache key '${key}':`, error.message);
      return false;
    }
  }

  /**
   * Set expiration for a key
   * @param {string} key - Cache key
   * @param {number} ttl - Time to live in seconds
   */
  async expire(key, ttl) {
    if (!this.isConnected) {
      return false;
    }

    try {
      await this.redis.expire(key, ttl);
      return true;

    } catch (error) {
      console.error(`❌ Error setting expiration for key '${key}':`, error.message);
      return false;
    }
  }

  /**
   * Get TTL for a key
   * @param {string} key - Cache key
   */
  async ttl(key) {
    if (!this.isConnected) {
      return -1;
    }

    try {
      return await this.redis.ttl(key);

    } catch (error) {
      console.error(`❌ Error getting TTL for key '${key}':`, error.message);
      return -1;
    }
  }

  /**
   * Clear all cache keys matching a pattern
   * @param {string} pattern - Pattern to match (e.g., 'leaderboard:*')
   */
  async clearPattern(pattern) {
    if (!this.isConnected) {
      return false;
    }

    try {
      const keys = await this.redis.keys(pattern);
      
      if (keys.length === 0) {
        return true;
      }

      await this.redis.del(...keys);
      console.log(`🧹 Cleared ${keys.length} cache keys matching pattern: ${pattern}`);
      return true;

    } catch (error) {
      console.error(`❌ Error clearing cache pattern '${pattern}':`, error.message);
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    if (!this.isConnected) {
      return null;
    }

    try {
      const info = await this.redis.info('memory');
      const keyspace = await this.redis.info('keyspace');
      
      return {
        connected: this.isConnected,
        memory: this.parseRedisInfo(info),
        keyspace: this.parseRedisInfo(keyspace),
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ Error getting cache stats:', error.message);
      return null;
    }
  }

  /**
   * Parse Redis INFO output
   * @param {string} info - Redis INFO output
   */
  parseRedisInfo(info) {
    const lines = info.split('\r\n');
    const result = {};

    lines.forEach(line => {
      if (line && !line.startsWith('#')) {
        const [key, value] = line.split(':');
        if (key && value) {
          result[key] = isNaN(value) ? value : parseInt(value);
        }
      }
    });

    return result;
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      if (!this.isConnected) {
        return { status: 'unhealthy', error: 'Not connected to Redis' };
      }

      await this.redis.ping();
      return { status: 'healthy', timestamp: new Date().toISOString() };

    } catch (error) {
      return { status: 'unhealthy', error: error.message, timestamp: new Date().toISOString() };
    }
  }

  /**
   * Close Redis connection
   */
  async close() {
    if (this.redis) {
      await this.redis.quit();
      this.isConnected = false;
      console.log('🔌 Redis connection closed');
    }
  }
}

module.exports = RedisCacheService;
