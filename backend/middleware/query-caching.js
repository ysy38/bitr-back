const redis = require('redis');
const crypto = require('crypto');

/**
 * Advanced Query Caching Middleware
 * 
 * Provides intelligent caching for database queries with:
 * - Redis-based distributed caching
 * - In-memory fallback cache
 * - Query result compression
 * - Cache invalidation strategies
 * - Performance monitoring
 */

class QueryCachingMiddleware {
  constructor() {
    this.redisClient = null;
    this.memoryCache = new Map();
    this.isRedisConnected = false;
    this.defaultTTL = 300; // 5 minutes
    this.maxMemoryCacheSize = 1000; // Max items in memory cache
    this.compressionEnabled = true;
    
    this.stats = {
      hits: 0,
      misses: 0,
      redisHits: 0,
      memoryHits: 0,
      compressions: 0,
      decompressions: 0
    };
  }

  /**
   * Initialize Redis connection
   */
  async initialize() {
    try {
      if (!process.env.REDIS_URL) {
        console.log('⚠️ Redis URL not configured, using memory cache only');
        return;
      }

      this.redisClient = redis.createClient({
        url: process.env.REDIS_URL,
        socket: {
          connectTimeout: 5000,
          lazyConnect: true
        }
      });

      this.redisClient.on('error', (err) => {
        console.error('Redis Client Error:', err);
        this.isRedisConnected = false;
      });

      this.redisClient.on('connect', () => {
        console.log('✅ Redis connected for query caching');
        this.isRedisConnected = true;
      });

      await this.redisClient.connect();
    } catch (error) {
      console.error('Failed to initialize Redis:', error);
      this.isRedisConnected = false;
    }
  }

  /**
   * Generate cache key from query and parameters
   */
  generateCacheKey(query, params = []) {
    const normalizedQuery = query.replace(/\s+/g, ' ').trim();
    const keyString = `${normalizedQuery}:${JSON.stringify(params)}`;
    return crypto.createHash('sha256').update(keyString).digest('hex');
  }

  /**
   * Compress data for storage
   */
  compress(data) {
    if (!this.compressionEnabled) return data;
    
    try {
      const jsonString = JSON.stringify(data);
      // Simple compression - in production, use zlib or similar
      this.stats.compressions++;
      return Buffer.from(jsonString).toString('base64');
    } catch (error) {
      console.warn('Compression failed, storing uncompressed:', error.message);
      return data;
    }
  }

  /**
   * Decompress data from storage
   */
  decompress(compressedData) {
    if (!this.compressionEnabled) return compressedData;
    
    try {
      this.stats.decompressions++;
      const jsonString = Buffer.from(compressedData, 'base64').toString();
      return JSON.parse(jsonString);
    } catch (error) {
      console.warn('Decompression failed, returning as-is:', error.message);
      return compressedData;
    }
  }

  /**
   * Get cached result
   */
  async get(query, params = []) {
    const cacheKey = this.generateCacheKey(query, params);
    
    // Try Redis first
    if (this.isRedisConnected && this.redisClient) {
      try {
        const redisResult = await this.redisClient.get(cacheKey);
        if (redisResult) {
          this.stats.hits++;
          this.stats.redisHits++;
          console.log(`🎯 Redis cache HIT for query: ${query.substring(0, 50)}...`);
          return this.decompress(redisResult);
        }
      } catch (error) {
        console.warn('Redis get failed:', error.message);
      }
    }

    // Try memory cache
    const memoryResult = this.memoryCache.get(cacheKey);
    if (memoryResult) {
      // Check if expired
      if (Date.now() > memoryResult.expiresAt) {
        this.memoryCache.delete(cacheKey);
        this.stats.misses++;
        return null;
      }
      
      this.stats.hits++;
      this.stats.memoryHits++;
      console.log(`🎯 Memory cache HIT for query: ${query.substring(0, 50)}...`);
      return memoryResult.data;
    }

    this.stats.misses++;
    return null;
  }

  /**
   * Store result in cache
   */
  async set(query, params = [], data, ttl = null) {
    const cacheKey = this.generateCacheKey(query, params);
    const expiresAt = Date.now() + ((ttl || this.defaultTTL) * 1000);
    const compressedData = this.compress(data);

    // Store in Redis
    if (this.isRedisConnected && this.redisClient) {
      try {
        await this.redisClient.setEx(cacheKey, ttl || this.defaultTTL, compressedData);
      } catch (error) {
        console.warn('Redis set failed:', error.message);
      }
    }

    // Store in memory cache (with size limit)
    if (this.memoryCache.size >= this.maxMemoryCacheSize) {
      // Remove oldest entry
      const oldestKey = this.memoryCache.keys().next().value;
      this.memoryCache.delete(oldestKey);
    }

    this.memoryCache.set(cacheKey, {
      data: compressedData,
      expiresAt,
      createdAt: Date.now()
    });
  }

  /**
   * Cache middleware for Express routes
   */
  cacheMiddleware(ttl = null) {
    return async (req, res, next) => {
      // Skip caching for non-GET requests
      if (req.method !== 'GET') {
        return next();
      }

      // Generate cache key from request
      const cacheKey = this.generateCacheKey(req.originalUrl, req.query);
      
      try {
        // Try to get from cache
        const cached = await this.get(req.originalUrl, req.query);
        if (cached) {
          return res.json(cached);
        }

        // Store original res.json
        const originalJson = res.json.bind(res);
        
        // Override res.json to cache the response
        res.json = (data) => {
          // Cache the response
          this.set(req.originalUrl, req.query, data, ttl);
          return originalJson(data);
        };

        next();
      } catch (error) {
        console.error('Cache middleware error:', error);
        next();
      }
    };
  }

  /**
   * Query caching wrapper for database queries
   */
  async cachedQuery(query, params = [], ttl = null) {
    // Try to get from cache first
    const cached = await this.get(query, params);
    if (cached) {
      return cached;
    }

    // If not cached, execute query and cache result
    const db = require('../db/db');
    const result = await db.query(query, params);
    
    // Cache the result
    await this.set(query, params, result, ttl);
    
    return result;
  }

  /**
   * Invalidate cache by pattern
   */
  async invalidatePattern(pattern) {
    // Clear memory cache
    for (const [key] of this.memoryCache) {
      if (key.includes(pattern)) {
        this.memoryCache.delete(key);
      }
    }

    // Clear Redis cache
    if (this.isRedisConnected && this.redisClient) {
      try {
        const keys = await this.redisClient.keys(`*${pattern}*`);
        if (keys.length > 0) {
          await this.redisClient.del(keys);
        }
      } catch (error) {
        console.warn('Redis pattern invalidation failed:', error.message);
      }
    }
  }

  /**
   * Clear all cache
   */
  async clearAll() {
    // Clear memory cache
    this.memoryCache.clear();

    // Clear Redis cache
    if (this.isRedisConnected && this.redisClient) {
      try {
        await this.redisClient.flushAll();
      } catch (error) {
        console.warn('Redis clear all failed:', error.message);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests * 100).toFixed(2) : 0;
    
    return {
      ...this.stats,
      totalRequests,
      hitRate: `${hitRate}%`,
      memoryCacheSize: this.memoryCache.size,
      redisConnected: this.isRedisConnected,
      compressionEnabled: this.compressionEnabled
    };
  }

  /**
   * Get cache health status
   */
  getHealthStatus() {
    return {
      status: this.isRedisConnected ? 'healthy' : 'degraded',
      redis: {
        connected: this.isRedisConnected,
        status: this.isRedisConnected ? 'healthy' : 'disconnected'
      },
      memory: {
        size: this.memoryCache.size,
        maxSize: this.maxMemoryCacheSize,
        status: this.memoryCache.size < this.maxMemoryCacheSize ? 'healthy' : 'full'
      },
      stats: this.getStats()
    };
  }
}

// Export singleton instance
module.exports = new QueryCachingMiddleware();
