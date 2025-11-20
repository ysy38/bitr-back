const db = require('../db/db');
const sharedQueryService = require('./shared-query-service');
const queryCaching = require('../middleware/query-caching');

/**
 * Database Optimization Service
 * 
 * Provides database optimization features:
 * - Query performance analysis
 * - Index recommendations
 * - Connection pool optimization
 * - Query result caching
 * - Slow query detection
 * - Database health monitoring
 */

class DatabaseOptimizationService {
  constructor() {
    this.isRunning = false;
    this.optimizationInterval = 5 * 60 * 1000; // 5 minutes
    this.slowQueryThreshold = 1000; // 1 second
    this.optimizationTimer = null;
    
    this.stats = {
      totalQueries: 0,
      slowQueries: 0,
      cacheHits: 0,
      cacheMisses: 0,
      avgQueryTime: 0,
      lastOptimization: null
    };
  }

  /**
   * Start optimization service
   */
  async start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('🚀 Database Optimization Service started');
    
    // Initialize query caching
    await queryCaching.initialize();
    
    // Start optimization timer
    this.optimizationTimer = setInterval(() => {
      this.performOptimization();
    }, this.optimizationInterval);
    
    // Perform initial optimization
    await this.performOptimization();
  }

  /**
   * Stop optimization service
   */
  async stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    console.log('🛑 Database Optimization Service stopped');
    
    if (this.optimizationTimer) {
      clearInterval(this.optimizationTimer);
      this.optimizationTimer = null;
    }
  }

  /**
   * Perform database optimization
   */
  async performOptimization() {
    try {
      console.log('🔧 Performing database optimization...');
      
      // Analyze query performance
      const queryStats = await this.analyzeQueryPerformance();
      
      // Check for slow queries
      const slowQueries = await this.detectSlowQueries();
      
      // Analyze index usage
      const indexAnalysis = await this.analyzeIndexUsage();
      
      // Optimize connection pool
      const poolOptimization = await this.optimizeConnectionPool();
      
      // Update statistics
      this.stats.lastOptimization = new Date();
      this.stats.totalQueries = queryStats.totalQueries;
      this.stats.slowQueries = slowQueries.length;
      this.stats.avgQueryTime = queryStats.avgQueryTime;
      
      console.log('✅ Database optimization completed');
      
      return {
        queryStats,
        slowQueries,
        indexAnalysis,
        poolOptimization,
        timestamp: this.stats.lastOptimization
      };
      
    } catch (error) {
      console.error('❌ Database optimization failed:', error);
      throw error;
    }
  }

  /**
   * Analyze query performance
   */
  async analyzeQueryPerformance() {
    try {
      // Get query statistics from shared query service
      const queryStats = sharedQueryService.getQueryStats();
      
      // Get additional database statistics
      const dbStats = await db.query(`
        SELECT 
          COUNT(*) as total_queries,
          AVG(EXTRACT(EPOCH FROM (clock_timestamp() - query_start))) as avg_query_time,
          MAX(EXTRACT(EPOCH FROM (clock_timestamp() - query_start))) as max_query_time
        FROM pg_stat_activity 
        WHERE state = 'active' AND query_start IS NOT NULL
      `);
      
      return {
        ...queryStats,
        databaseStats: dbStats.rows[0],
        cacheHitRate: queryCaching.getStats().hitRate
      };
      
    } catch (error) {
      console.error('Query performance analysis failed:', error);
      return { error: error.message };
    }
  }

  /**
   * Detect slow queries
   */
  async detectSlowQueries() {
    try {
      // Get currently running slow queries
      const slowQueries = await db.query(`
        SELECT 
          pid,
          query,
          EXTRACT(EPOCH FROM (clock_timestamp() - query_start)) as duration,
          state,
          application_name
        FROM pg_stat_activity 
        WHERE state = 'active' 
          AND query_start IS NOT NULL
          AND EXTRACT(EPOCH FROM (clock_timestamp() - query_start)) > $1
        ORDER BY duration DESC
      `, [this.slowQueryThreshold / 1000]);
      
      return slowQueries.rows;
      
    } catch (error) {
      console.error('Slow query detection failed:', error);
      return [];
    }
  }

  /**
   * Analyze index usage
   */
  async analyzeIndexUsage() {
    try {
      // Get index usage statistics
      const indexStats = await db.query(`
        SELECT 
          schemaname,
          relname as tablename,
          indexrelname as indexname,
          idx_scan as index_scans,
          idx_tup_read as tuples_read,
          idx_tup_fetch as tuples_fetched
        FROM pg_stat_user_indexes 
        WHERE schemaname IN ('oracle', 'analytics')
        ORDER BY idx_scan DESC
        LIMIT 20
      `);
      
      // Get unused indexes
      const unusedIndexes = await db.query(`
        SELECT 
          schemaname,
          relname as tablename,
          indexrelname as indexname,
          idx_scan as index_scans
        FROM pg_stat_user_indexes 
        WHERE schemaname IN ('oracle', 'analytics')
          AND idx_scan = 0
        ORDER BY relname, indexrelname
      `);
      
      return {
        topUsedIndexes: indexStats.rows,
        unusedIndexes: unusedIndexes.rows,
        recommendations: this.generateIndexRecommendations(indexStats.rows, unusedIndexes.rows)
      };
      
    } catch (error) {
      console.error('Index usage analysis failed:', error);
      return { error: error.message };
    }
  }

  /**
   * Generate index recommendations
   */
  generateIndexRecommendations(usedIndexes, unusedIndexes) {
    const recommendations = [];
    
    // Recommend dropping unused indexes
    if (unusedIndexes.length > 0) {
      recommendations.push({
        type: 'drop_unused_index',
        priority: 'medium',
        description: `Consider dropping ${unusedIndexes.length} unused indexes to improve write performance`,
        indexes: unusedIndexes.map(idx => `${idx.schemaname}.${idx.tablename}.${idx.indexname}`)
      });
    }
    
    // Recommend creating indexes for common query patterns
    const commonPatterns = [
      {
        table: 'oracle.pools',
        columns: ['creator_address', 'status'],
        reason: 'Common filter combination'
      },
      {
        table: 'oracle.bets',
        columns: ['bettor_address', 'created_at'],
        reason: 'User bet history queries'
      },
      {
        table: 'oracle.pools',
        columns: ['category', 'status', 'created_at'],
        reason: 'Pool listing queries'
      }
    ];
    
    commonPatterns.forEach(pattern => {
      const existingIndex = usedIndexes.find(idx => 
        idx.tablename === pattern.table.split('.')[1] && 
        idx.indexname.includes(pattern.columns[0])
      );
      
      if (!existingIndex) {
        recommendations.push({
          type: 'create_index',
          priority: 'high',
          description: `Create index on ${pattern.table} (${pattern.columns.join(', ')}) - ${pattern.reason}`,
          table: pattern.table,
          columns: pattern.columns
        });
      }
    });
    
    return recommendations;
  }

  /**
   * Optimize connection pool
   */
  async optimizeConnectionPool() {
    try {
      // Get current connection statistics
      const connectionStats = await db.query(`
        SELECT 
          COUNT(*) as total_connections,
          COUNT(CASE WHEN state = 'active' THEN 1 END) as active_connections,
          COUNT(CASE WHEN state = 'idle' THEN 1 END) as idle_connections,
          COUNT(CASE WHEN state = 'idle in transaction' THEN 1 END) as idle_in_transaction
        FROM pg_stat_activity 
        WHERE application_name = 'bitredict-backend'
      `);
      
      // Get connection pool configuration
      const poolConfig = {
        max: 5,
        min: 0,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 30000
      };
      
      return {
        current: connectionStats.rows[0],
        configured: poolConfig,
        recommendations: this.generatePoolRecommendations(connectionStats.rows[0], poolConfig)
      };
      
    } catch (error) {
      console.error('Connection pool optimization failed:', error);
      return { error: error.message };
    }
  }

  /**
   * Generate connection pool recommendations
   */
  generatePoolRecommendations(current, configured) {
    const recommendations = [];
    
    // Check for idle connections
    if (current.idle_connections > 2) {
      recommendations.push({
        type: 'reduce_idle_timeout',
        priority: 'medium',
        description: 'Consider reducing idle timeout to close idle connections faster',
        current: configured.idleTimeoutMillis,
        recommended: 15000
      });
    }
    
    // Check for connections in transaction
    if (current.idle_in_transaction > 0) {
      recommendations.push({
        type: 'fix_idle_transactions',
        priority: 'high',
        description: 'Found connections idle in transaction - investigate and fix',
        count: current.idle_in_transaction
      });
    }
    
    // Check pool utilization
    const utilization = (current.active_connections / configured.max) * 100;
    if (utilization > 80) {
      recommendations.push({
        type: 'increase_pool_size',
        priority: 'medium',
        description: 'Pool utilization is high, consider increasing max connections',
        current: configured.max,
        recommended: configured.max + 2
      });
    }
    
    return recommendations;
  }

  /**
   * Get optimization status
   */
  getOptimizationStatus() {
    return {
      isRunning: this.isRunning,
      stats: this.stats,
      cacheStats: queryCaching.getStats(),
      queryStats: sharedQueryService.getQueryStats(),
      health: queryCaching.getHealthStatus()
    };
  }

  /**
   * Get optimization recommendations
   */
  async getOptimizationRecommendations() {
    try {
      const [
        queryAnalysis,
        indexAnalysis,
        poolAnalysis
      ] = await Promise.all([
        this.analyzeQueryPerformance(),
        this.analyzeIndexUsage(),
        this.optimizeConnectionPool()
      ]);
      
      return {
        query: queryAnalysis,
        index: indexAnalysis,
        pool: poolAnalysis,
        timestamp: new Date()
      };
      
    } catch (error) {
      console.error('Failed to get optimization recommendations:', error);
      return { error: error.message };
    }
  }

  /**
   * Execute optimization recommendation
   */
  async executeRecommendation(recommendation) {
    try {
      switch (recommendation.type) {
        case 'create_index':
          return await this.createIndex(recommendation.table, recommendation.columns);
          
        case 'drop_index':
          return await this.dropIndex(recommendation.index);
          
        case 'analyze_table':
          return await this.analyzeTable(recommendation.table);
          
        default:
          throw new Error(`Unknown recommendation type: ${recommendation.type}`);
      }
    } catch (error) {
      console.error('Failed to execute recommendation:', error);
      throw error;
    }
  }

  /**
   * Create index
   */
  async createIndex(table, columns) {
    const indexName = `idx_${table.split('.')[1]}_${columns.join('_')}`;
    const sql = `CREATE INDEX CONCURRENTLY ${indexName} ON ${table} (${columns.join(', ')})`;
    
    try {
      await db.query(sql);
      return { success: true, indexName, sql };
    } catch (error) {
      return { success: false, error: error.message, sql };
    }
  }

  /**
   * Drop index
   */
  async dropIndex(indexName) {
    const sql = `DROP INDEX CONCURRENTLY ${indexName}`;
    
    try {
      await db.query(sql);
      return { success: true, indexName, sql };
    } catch (error) {
      return { success: false, error: error.message, sql };
    }
  }

  /**
   * Analyze table
   */
  async analyzeTable(table) {
    const sql = `ANALYZE ${table}`;
    
    try {
      await db.query(sql);
      return { success: true, table, sql };
    } catch (error) {
      return { success: false, error: error.message, sql };
    }
  }
}

// Export singleton instance
module.exports = new DatabaseOptimizationService();
