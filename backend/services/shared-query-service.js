const db = require('../db/db');
const cache = require('../db/cache');

/**
 * Shared Query Service
 * 
 * Centralized database query service with:
 * - Query caching and optimization
 * - Connection pooling management
 * - Query performance monitoring
 * - Prepared statement reuse
 * - Global query patterns
 */

class SharedQueryService {
  constructor() {
    this.cache = cache;
    this.queryStats = new Map();
    this.preparedStatements = new Map();
    this.slowQueryThreshold = 1000; // 1 second
  }

  /**
   * Execute query with caching and performance monitoring
   */
  async query(sql, params = [], options = {}) {
    const startTime = Date.now();
    const cacheKey = this.generateCacheKey(sql, params);
    
    // Check cache first (if enabled)
    if (options.cache !== false) {
      const cached = this.cache.get(sql, params);
      if (cached) {
        this.recordQueryStats(sql, Date.now() - startTime, true);
        return cached;
      }
    }

    try {
      // Execute query
      const result = await db.query(sql, params);
      
      // Cache result if enabled
      if (options.cache !== false && options.ttl) {
        this.cache.set(sql, params, result, options.ttl);
      }
      
      // Record performance stats
      const duration = Date.now() - startTime;
      this.recordQueryStats(sql, duration, false);
      
      // Log slow queries
      if (duration > this.slowQueryThreshold) {
        console.warn(`🐌 Slow query detected (${duration}ms): ${sql.substring(0, 100)}...`);
      }
      
      return result;
    } catch (error) {
      console.error(`❌ Query failed: ${sql.substring(0, 100)}...`, error.message);
      throw error;
    }
  }

  /**
   * Generate cache key for query
   */
  generateCacheKey(sql, params) {
    return `${sql}:${JSON.stringify(params)}`;
  }

  /**
   * Record query performance statistics
   */
  recordQueryStats(sql, duration, fromCache) {
    const queryHash = this.hashQuery(sql);
    
    if (!this.queryStats.has(queryHash)) {
      this.queryStats.set(queryHash, {
        sql: sql.substring(0, 100),
        count: 0,
        totalDuration: 0,
        cacheHits: 0,
        avgDuration: 0,
        maxDuration: 0,
        minDuration: Infinity
      });
    }
    
    const stats = this.queryStats.get(queryHash);
    stats.count++;
    
    if (fromCache) {
      stats.cacheHits++;
    } else {
      stats.totalDuration += duration;
      stats.maxDuration = Math.max(stats.maxDuration, duration);
      stats.minDuration = Math.min(stats.minDuration, duration);
      stats.avgDuration = stats.totalDuration / (stats.count - stats.cacheHits);
    }
  }

  /**
   * Hash query for statistics tracking
   */
  hashQuery(sql) {
    // Simple hash - remove parameters and normalize whitespace
    return sql.replace(/\$\d+/g, '?').replace(/\s+/g, ' ').trim();
  }

  /**
   * Get query performance statistics
   */
  getQueryStats() {
    const stats = Array.from(this.queryStats.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 20); // Top 20 most frequent queries
    
    return {
      totalQueries: Array.from(this.queryStats.values()).reduce((sum, stat) => sum + stat.count, 0),
      slowQueries: Array.from(this.queryStats.values()).filter(stat => stat.avgDuration > this.slowQueryThreshold),
      topQueries: stats,
      cacheHitRate: this.calculateCacheHitRate()
    };
  }

  /**
   * Calculate overall cache hit rate
   */
  calculateCacheHitRate() {
    const stats = Array.from(this.queryStats.values());
    const totalQueries = stats.reduce((sum, stat) => sum + stat.count, 0);
    const totalCacheHits = stats.reduce((sum, stat) => sum + stat.cacheHits, 0);
    
    return totalQueries > 0 ? (totalCacheHits / totalQueries * 100).toFixed(2) : 0;
  }

  // ========================================
  // COMMON QUERY PATTERNS
  // ========================================

  /**
   * Get pool by ID with caching
   */
  async getPoolById(poolId, options = {}) {
    const sql = `
      SELECT 
        p.*,
        -- Calculate effective creator side stake (matches contract logic)
        CASE 
          WHEN p.total_bettor_stake = 0 OR p.total_bettor_stake > p.creator_stake THEN 
            p.total_creator_side_stake
          ELSE p.creator_stake
        END as effective_creator_side_stake,
        -- Calculate current max bettor stake dynamically (matches contract logic)
        CASE 
          WHEN p.total_bettor_stake = 0 OR p.total_bettor_stake > p.creator_stake THEN 
            (p.total_creator_side_stake::numeric * 100) / (p.odds - 100)
          ELSE 
            (p.creator_stake::numeric * 100) / (p.odds - 100)
        END as current_max_bettor_stake,
        -- Calculate fill percentage including creator stake and LP stakes
        CASE 
          WHEN (p.total_bettor_stake = 0 OR p.total_bettor_stake > p.creator_stake) AND p.total_creator_side_stake > 0 THEN 
            LEAST(100, ((p.total_creator_side_stake::numeric + p.total_bettor_stake::numeric) / (p.total_creator_side_stake::numeric + ((p.total_creator_side_stake::numeric * 100) / (p.odds - 100))) * 100))
          WHEN p.total_bettor_stake <= p.creator_stake AND p.creator_stake > 0 THEN 
            LEAST(100, ((p.creator_stake::numeric + p.total_bettor_stake::numeric) / (p.creator_stake::numeric + ((p.creator_stake::numeric * 100) / (p.odds - 100))) * 100))
          ELSE 0 
        END as fill_percentage,
        -- Calculate max pool size dynamically
        CASE 
          WHEN p.total_bettor_stake = 0 OR p.total_bettor_stake > p.creator_stake THEN 
            p.total_creator_side_stake::numeric + ((p.total_creator_side_stake::numeric * 100) / (p.odds - 100))
          ELSE 
            p.creator_stake::numeric + ((p.creator_stake::numeric * 100) / (p.odds - 100))
        END as max_pool_size
      FROM oracle.pools p
      WHERE p.pool_id = $1
    `;
    
    return this.query(sql, [poolId], { 
      cache: true, 
      ttl: 60000, // 1 minute cache
      ...options 
    });
  }

  /**
   * Get pools with filtering and pagination
   */
  async getPools(filters = {}, options = {}) {
    const {
      category = null,
      status = null,
      sortBy = 'newest',
      limit = 50,
      offset = 0
    } = filters;

    let whereClause = "WHERE p.status != 'deleted'";
    let queryParams = [];
    let paramCount = 0;

    // Add filters
    if (category && category !== 'all') {
      paramCount++;
      whereClause += ` AND p.category = $${paramCount}`;
      queryParams.push(category);
    }

    if (status && status !== 'all') {
      paramCount++;
      if (status === 'active') {
        whereClause += ` AND p.event_start_time > EXTRACT(EPOCH FROM NOW())`;
      } else if (status === 'settled') {
        whereClause += ` AND p.status = 'settled'`;
      } else if (status === 'filled') {
        whereClause += ` AND p.total_bettor_stake >= p.creator_stake`;
      }
    }

    // Add sorting
    let orderBy = 'ORDER BY p.pool_id DESC';
    switch (sortBy) {
      case 'oldest':
        orderBy = 'ORDER BY p.pool_id ASC';
        break;
      case 'highest_stake':
        orderBy = 'ORDER BY p.total_bettor_stake DESC';
        break;
      case 'ending_soon':
        orderBy = 'ORDER BY p.betting_end_time ASC';
        break;
    }

    const sql = `
      SELECT 
        p.*,
        -- Calculate effective creator side stake (matches contract logic)
        CASE 
          WHEN p.total_bettor_stake = 0 OR p.total_bettor_stake > p.creator_stake THEN 
            p.total_creator_side_stake
          ELSE p.creator_stake
        END as effective_creator_side_stake,
        -- Calculate current max bettor stake dynamically (matches contract logic)
        CASE 
          WHEN p.total_bettor_stake = 0 OR p.total_bettor_stake > p.creator_stake THEN 
            (p.total_creator_side_stake::numeric * 100) / (p.odds - 100)
          ELSE 
            (p.creator_stake::numeric * 100) / (p.odds - 100)
        END as current_max_bettor_stake,
        -- Calculate fill percentage including creator stake and LP stakes
        CASE 
          WHEN (p.total_bettor_stake = 0 OR p.total_bettor_stake > p.creator_stake) AND p.total_creator_side_stake > 0 THEN 
            LEAST(100, ((p.total_creator_side_stake::numeric + p.total_bettor_stake::numeric) / (p.total_creator_side_stake::numeric + ((p.total_creator_side_stake::numeric * 100) / (p.odds - 100))) * 100))
          WHEN p.total_bettor_stake <= p.creator_stake AND p.creator_stake > 0 THEN 
            LEAST(100, ((p.creator_stake::numeric + p.total_bettor_stake::numeric) / (p.creator_stake::numeric + ((p.creator_stake::numeric * 100) / (p.odds - 100))) * 100))
          ELSE 0 
        END as fill_percentage,
        -- Calculate max pool size dynamically
        CASE 
          WHEN p.total_bettor_stake = 0 OR p.total_bettor_stake > p.creator_stake THEN 
            p.total_creator_side_stake::numeric + ((p.total_creator_side_stake::numeric * 100) / (p.odds - 100))
          ELSE 
            p.creator_stake::numeric + ((p.creator_stake::numeric * 100) / (p.odds - 100))
        END as max_pool_size,
        -- Estimate participants (simplified)
        GREATEST(1, FLOOR(p.total_bettor_stake::numeric / 100)) as participants
      FROM oracle.pools p
      ${whereClause}
      ${orderBy}
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    queryParams.push(limit, offset);

    return this.query(sql, queryParams, { 
      cache: true, 
      ttl: 120000, // 2 minutes cache
      ...options 
    });
  }

  /**
   * Get user bets with pagination
   */
  async getUserBets(userAddress, limit = 20, offset = 0, options = {}) {
    const sql = `
      SELECT 
        b.transaction_hash as id,
        b.pool_id,
        b.bettor_address as bettor,
        b.amount,
        b.is_for_outcome,
        b.created_at as timestamp,
        p.title as pool_title,
        p.category,
        p.league,
        p.home_team,
        p.away_team,
        p.is_settled,
        p.creator_side_won,
        p.use_bitr
      FROM oracle.bets b
      JOIN oracle.pools p ON b.pool_id::bigint = p.pool_id
      WHERE LOWER(b.bettor_address) = LOWER($1)
      ORDER BY b.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    return this.query(sql, [userAddress, limit, offset], { 
      cache: true, 
      ttl: 60000, // 1 minute cache
      ...options 
    });
  }

  /**
   * Get recent bets with pagination
   */
  async getRecentBets(limit = 20, offset = 0, options = {}) {
    const sql = `
      SELECT 
        b.transaction_hash as id,
        b.pool_id,
        b.bettor_address as bettor,
        b.amount,
        b.is_for_outcome,
        b.created_at as timestamp,
        p.title as pool_title,
        p.category,
        p.league,
        p.home_team,
        p.away_team,
        p.is_settled,
        p.creator_side_won,
        p.use_bitr
      FROM oracle.bets b
      JOIN oracle.pools p ON b.pool_id::bigint = p.pool_id
      ORDER BY b.created_at DESC
      LIMIT $1 OFFSET $2
    `;

    return this.query(sql, [limit, offset], { 
      cache: true, 
      ttl: 60000, // 1 minute cache
      ...options 
    });
  }

  /**
   * Get pool analytics
   */
  async getPoolAnalytics(options = {}) {
    const sql = `
      SELECT 
        COUNT(*) as total_pools,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_pools,
        COUNT(CASE WHEN status = 'settled' THEN 1 END) as settled_pools,
        COALESCE(SUM(creator_stake), 0) as total_creator_stake,
        COALESCE(SUM(total_bettor_stake), 0) as total_bettor_stake,
        COALESCE(AVG(odds), 0) as avg_odds,
        COUNT(DISTINCT p.creator_address) as unique_creators,
        COUNT(DISTINCT b.bettor_address) as unique_bettors
      FROM oracle.pools p
      LEFT JOIN oracle.bets b ON p.pool_id = b.pool_id::bigint
    `;

    return this.query(sql, [], { 
      cache: true, 
      ttl: 300000, // 5 minutes cache
      ...options 
    });
  }

  /**
   * Get platform overview statistics
   */
  async getPlatformOverview(options = {}) {
    const [
      poolStats,
      userStats,
      financialStats,
      oddysseyStats,
      activityStats
    ] = await Promise.all([
      // Pool statistics
      this.query(`
        SELECT 
          COUNT(*) as total_pools,
          COUNT(CASE WHEN status = 'active' THEN 1 END) as active_pools,
          COUNT(CASE WHEN status = 'settled' THEN 1 END) as settled_pools,
          COALESCE(SUM(creator_stake), 0) as total_creator_stake,
          COALESCE(SUM(total_bettor_stake), 0) as total_bettor_stake,
          COALESCE(AVG(odds), 0) as avg_odds
        FROM oracle.pools
      `, [], { cache: true, ttl: 300000 }),
      
      // User statistics
      this.query(`
        SELECT 
          COUNT(DISTINCT p.creator_address) as total_creators,
          COUNT(DISTINCT b.bettor_address) as total_bettors,
          COUNT(DISTINCT COALESCE(p.creator_address, b.bettor_address)) as unique_users
        FROM oracle.pools p
        FULL OUTER JOIN oracle.bets b ON p.creator_address = b.bettor_address
      `, [], { cache: true, ttl: 300000 }),
      
      // Financial statistics
      this.query(`
        SELECT 
          COALESCE(SUM(CASE WHEN use_bitr THEN amount ELSE 0 END), 0) as bitr_volume,
          COALESCE(SUM(CASE WHEN NOT use_bitr THEN amount ELSE 0 END), 0) as stt_volume,
          COALESCE(SUM(amount), 0) as total_volume
        FROM oracle.bets
      `, [], { cache: true, ttl: 300000 }),
      
      // Oddyssey statistics
      this.query(`
        SELECT 
          COUNT(*) as total_cycles,
          COUNT(CASE WHEN is_resolved THEN 1 END) as resolved_cycles,
          COUNT(CASE WHEN evaluation_completed THEN 1 END) as evaluated_cycles,
          COALESCE(AVG(matches_count), 0) as avg_matches_per_cycle
        FROM oracle.oddyssey_cycles
      `, [], { cache: true, ttl: 300000 }),
      
      // Activity statistics (last 24 hours)
      this.query(`
        SELECT 
          COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as pools_last_24h,
          COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as bets_last_24h
        FROM (
          SELECT created_at FROM oracle.pools
          UNION ALL
          SELECT created_at FROM oracle.bets
        ) activity
      `, [], { cache: true, ttl: 300000 })
    ]);

    return {
      pools: poolStats.rows[0],
      users: userStats.rows[0],
      financial: financialStats.rows[0],
      oddyssey: oddysseyStats.rows[0],
      activity: activityStats.rows[0]
    };
  }

  /**
   * Clear cache for specific patterns
   */
  clearCache(pattern = null) {
    if (pattern) {
      // Clear specific pattern
      for (const [key] of this.cache.cache) {
        if (key.includes(pattern)) {
          this.cache.cache.delete(key);
        }
      }
    } else {
      // Clear all cache
      this.cache.cache.clear();
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.cache.size,
      hitRate: this.calculateCacheHitRate(),
      queryStats: this.getQueryStats()
    };
  }
}

// Export singleton instance
module.exports = new SharedQueryService();
