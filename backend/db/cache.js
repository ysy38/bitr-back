/**
 * Simple in-memory cache for database queries
 * Reduces database load and enables autosuspend
 */

class QueryCache {
  constructor() {
    this.cache = new Map();
    this.defaultTTL = 5 * 60 * 1000; // 5 minutes default TTL
  }

  /**
   * Generate cache key from query and parameters
   */
  generateKey(query, params = []) {
    return `${query}:${JSON.stringify(params)}`;
  }

  /**
   * Get cached result if available and not expired
   */
  get(query, params = []) {
    const key = this.generateKey(query, params);
    const cached = this.cache.get(key);
    
    if (!cached) return null;
    
    // Check if expired
    if (Date.now() > cached.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    
    console.log(`🎯 Cache HIT for query: ${query.substring(0, 50)}...`);
    return cached.data;
  }

  /**
   * Store result in cache
   */
  set(query, params = [], data, ttl = null) {
    const key = this.generateKey(query, params);
    const expiresAt = Date.now() + (ttl || this.defaultTTL);
    
    this.cache.set(key, {
      data,
      expiresAt,
      createdAt: Date.now()
    });
    
    console.log(`💾 Cached query: ${query.substring(0, 50)}... (TTL: ${ttl || this.defaultTTL}ms)`);
  }

  /**
   * Clear cache for specific pattern or all
   */
  clear(pattern = null) {
    if (!pattern) {
      this.cache.clear();
      console.log('🗑️ Cleared all cache');
      return;
    }
    
    let cleared = 0;
    for (const [key] of this.cache) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
        cleared++;
      }
    }
    
    console.log(`🗑️ Cleared ${cleared} cache entries matching: ${pattern}`);
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const now = Date.now();
    let total = 0;
    let expired = 0;
    let active = 0;
    
    for (const [key, value] of this.cache) {
      total++;
      if (now > value.expiresAt) {
        expired++;
      } else {
        active++;
      }
    }
    
    return {
      total,
      active,
      expired,
      memoryUsage: process.memoryUsage().heapUsed
    };
  }

  /**
   * Clean up expired entries
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, value] of this.cache) {
      if (now > value.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} expired cache entries`);
    }
    
    return cleaned;
  }
}

// Export singleton instance
const cache = new QueryCache();

// Cleanup expired entries every 5 minutes
setInterval(() => {
  cache.cleanup();
}, 5 * 60 * 1000);

module.exports = cache;
