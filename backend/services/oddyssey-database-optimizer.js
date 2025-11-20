const db = require('../db/db');

/**
 * 🚀 Odyssey Database Optimizer
 * 
 * Prevents overcomputing by:
 * - Pre-computing analytics tables
 * - Using materialized views for complex queries
 * - Batch processing for heavy operations
 * - Smart indexing strategies
 * - Query optimization
 */
class OdysseyDatabaseOptimizer {
  constructor() {
    this.isInitialized = false;
    this.materializedViews = new Map();
  }

  async initialize() {
    if (this.isInitialized) return;
    
    try {
      console.log('🚀 Initializing Odyssey Database Optimizer...');
      
      // Create optimized indexes
      await this.createOptimizedIndexes();
      
      // Create materialized views for heavy analytics
      await this.createMaterializedViews();
      
      // Create pre-computed analytics tables
      await this.createAnalyticsTables();
      
      this.isInitialized = true;
      console.log('✅ Database optimizer initialized');
      
    } catch (error) {
      console.error('❌ Database optimizer initialization failed:', error);
      throw error;
    }
  }

  /**
   * 📊 Create optimized indexes for analytics queries
   */
  async createOptimizedIndexes() {
    const indexes = [
      // Slip analytics indexes
      {
        name: 'idx_oddyssey_slips_cycle_evaluated',
        query: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_oddyssey_slips_cycle_evaluated ON oracle.oddyssey_slips (cycle_id, is_evaluated) WHERE is_evaluated = true'
      },
      {
        name: 'idx_oddyssey_slips_player_cycle',
        query: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_oddyssey_slips_player_cycle ON oracle.oddyssey_slips (player_address, cycle_id)'
      },
      {
        name: 'idx_oddyssey_slips_placed_at',
        query: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_oddyssey_slips_placed_at ON oracle.oddyssey_slips (placed_at DESC)'
      },
      {
        name: 'idx_oddyssey_slips_correct_count',
        query: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_oddyssey_slips_correct_count ON oracle.oddyssey_slips (correct_count DESC) WHERE is_evaluated = true'
      },
      
      // Cycle analytics indexes
      {
        name: 'idx_oddyssey_cycles_status',
        query: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_oddyssey_cycles_status ON oracle.oddyssey_cycles (status, is_resolved)'
      },
      {
        name: 'idx_oddyssey_cycles_created_at',
        query: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_oddyssey_cycles_created_at ON oracle.oddyssey_cycles (created_at DESC)'
      }
    ];

    for (const index of indexes) {
      try {
        await db.query(index.query);
        console.log(`✅ Created index: ${index.name}`);
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log(`⏭️ Index already exists: ${index.name}`);
        } else {
          console.error(`❌ Failed to create index ${index.name}:`, error.message);
        }
      }
    }
  }

  /**
   * 📈 Create materialized views for heavy analytics
   */
  async createMaterializedViews() {
    const views = [
      {
        name: 'mv_oddyssey_cycle_stats',
        query: `
          CREATE MATERIALIZED VIEW IF NOT EXISTS oracle.mv_oddyssey_cycle_stats AS
          SELECT 
            cycle_id,
            COUNT(*) as total_slips,
            COUNT(DISTINCT player_address) as unique_players,
            AVG(correct_count) as avg_accuracy,
            MAX(correct_count) as max_accuracy,
            COUNT(CASE WHEN is_evaluated THEN 1 END) as evaluated_slips,
            COUNT(CASE WHEN prize_claimed THEN 1 END) as prizes_claimed
          FROM oracle.oddyssey_slips
          GROUP BY cycle_id
        `
      },
      {
        name: 'mv_oddyssey_player_stats',
        query: `
          CREATE MATERIALIZED VIEW IF NOT EXISTS oracle.mv_oddyssey_player_stats AS
          SELECT 
            player_address,
            COUNT(*) as total_slips,
            AVG(correct_count) as avg_accuracy,
            MAX(correct_count) as best_score,
            COUNT(CASE WHEN is_evaluated THEN 1 END) as evaluated_slips,
            COUNT(CASE WHEN prize_claimed THEN 1 END) as prizes_won,
            COUNT(DISTINCT cycle_id) as cycles_participated
          FROM oracle.oddyssey_slips
          GROUP BY player_address
        `
      },
      {
        name: 'mv_oddyssey_daily_stats',
        query: `
          CREATE MATERIALIZED VIEW IF NOT EXISTS oracle.mv_oddyssey_daily_stats AS
          SELECT 
            DATE(placed_at) as date,
            COUNT(*) as total_slips,
            COUNT(DISTINCT player_address) as unique_players,
            AVG(correct_count) as avg_accuracy,
            COUNT(CASE WHEN is_evaluated THEN 1 END) as evaluated_slips
          FROM oracle.oddyssey_slips
          WHERE placed_at >= CURRENT_DATE - INTERVAL '30 days'
          GROUP BY DATE(placed_at)
        `
      }
    ];

    for (const view of views) {
      try {
        await db.query(view.query);
        console.log(`✅ Created materialized view: ${view.name}`);
        
        // Create indexes on materialized views
        await this.createMaterializedViewIndexes(view.name);
        
        this.materializedViews.set(view.name, {
          lastRefresh: new Date(),
          refreshInterval: 300000 // 5 minutes
        });
        
      } catch (error) {
        console.error(`❌ Failed to create materialized view ${view.name}:`, error.message);
      }
    }
  }

  /**
   * 📊 Create indexes on materialized views
   */
  async createMaterializedViewIndexes(viewName) {
    const indexes = {
      'mv_oddyssey_cycle_stats': [
        'CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_mv_cycle_stats_cycle_id_unique ON oracle.mv_oddyssey_cycle_stats (cycle_id)',
        'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mv_cycle_stats_total_slips ON oracle.mv_oddyssey_cycle_stats (total_slips DESC)'
      ],
      'mv_oddyssey_player_stats': [
        'CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_mv_player_stats_player_unique ON oracle.mv_oddyssey_player_stats (player_address)',
        'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mv_player_stats_accuracy ON oracle.mv_oddyssey_player_stats (avg_accuracy DESC)'
      ],
      'mv_oddyssey_daily_stats': [
        'CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_mv_daily_stats_date_unique ON oracle.mv_oddyssey_daily_stats (date)',
        'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mv_daily_stats_date_desc ON oracle.mv_oddyssey_daily_stats (date DESC)'
      ]
    };

    const viewIndexes = indexes[viewName] || [];
    for (const indexQuery of viewIndexes) {
      try {
        await db.query(indexQuery);
        console.log(`✅ Created index for ${viewName}: ${indexQuery.split(' ')[4]}`);
      } catch (error) {
        console.error(`❌ Failed to create index on ${viewName}:`, error.message);
      }
    }
  }

  /**
   * 📈 Create pre-computed analytics tables
   */
  async createAnalyticsTables() {
    const tables = [
      {
        name: 'oddyssey_analytics_cache',
        query: `
          CREATE TABLE IF NOT EXISTS oracle.oddyssey_analytics_cache (
            cache_key VARCHAR(255) PRIMARY KEY,
            cache_data JSONB NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
            access_count INTEGER DEFAULT 0,
            last_accessed TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          )
        `
      },
      {
        name: 'oddyssey_performance_metrics',
        query: `
          CREATE TABLE IF NOT EXISTS oracle.oddyssey_performance_metrics (
            id SERIAL PRIMARY KEY,
            metric_name VARCHAR(100) NOT NULL,
            metric_value DECIMAL(15,4) NOT NULL,
            metric_unit VARCHAR(20),
            recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            cycle_id BIGINT,
            player_address VARCHAR(42)
          )
        `
      }
    ];

    for (const table of tables) {
      try {
        await db.query(table.query);
        console.log(`✅ Created analytics table: ${table.name}`);
      } catch (error) {
        console.error(`❌ Failed to create table ${table.name}:`, error.message);
      }
    }
  }

  /**
   * 🔄 Refresh materialized views
   */
  async refreshMaterializedViews() {
    console.log('🔄 Refreshing materialized views...');
    
    for (const [viewName, viewInfo] of this.materializedViews.entries()) {
      try {
        const now = new Date();
        const timeSinceLastRefresh = now - viewInfo.lastRefresh;
        
        if (timeSinceLastRefresh >= viewInfo.refreshInterval) {
          // Try concurrent refresh first, fallback to regular refresh if it fails
          try {
            await db.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY oracle.${viewName}`);
            console.log(`✅ Refreshed materialized view concurrently: ${viewName}`);
          } catch (concurrentError) {
            if (concurrentError.message.includes('cannot refresh materialized view') && 
                concurrentError.message.includes('concurrently')) {
              console.log(`⚠️ Concurrent refresh failed for ${viewName}, trying regular refresh...`);
              await db.query(`REFRESH MATERIALIZED VIEW oracle.${viewName}`);
              console.log(`✅ Refreshed materialized view: ${viewName}`);
            } else {
              throw concurrentError;
            }
          }
          viewInfo.lastRefresh = now;
        }
      } catch (error) {
        console.error(`❌ Failed to refresh ${viewName}:`, error.message);
      }
    }
  }

  /**
   * 📊 Get optimized cycle analytics using materialized views
   */
  async getOptimizedCycleAnalytics(cycleId) {
    try {
      const result = await db.query(`
        SELECT 
          c.cycle_id,
          c.total_slips,
          c.unique_players,
          c.avg_accuracy,
          c.max_accuracy,
          c.evaluated_slips,
          c.prizes_claimed,
          cy.created_at,
          cy.status,
          cy.prize_pool
        FROM oracle.mv_oddyssey_cycle_stats c
        LEFT JOIN oracle.oddyssey_cycles cy ON c.cycle_id = cy.cycle_id
        WHERE c.cycle_id = $1
      `, [cycleId]);
      
      const data = result.rows[0];
      if (!data) return null;
      
      // For recent cycles (< 24 hours old), return null to use full analytics with fresh data
      // Materialized views are best for historical data, not real-time
      const cycleCreatedAt = data.created_at ? new Date(data.created_at) : null;
      if (cycleCreatedAt && (Date.now() - cycleCreatedAt.getTime()) < 24 * 60 * 60 * 1000) {
        console.log(`⏭️  Cycle ${cycleId} is recent, skipping materialized view for real-time data`);
        return null;
      }
      
      // Transform to match OdysseySmartAnalytics format
      return {
        cycleId: Number(data.cycle_id),
        contractData: {
          exists: true,
          state: data.status === 'resolved' ? 3 : 1,
          endTime: '0',
          prizePool: data.prize_pool ? String(data.prize_pool) : '0',
          slipCount: Number(data.total_slips) || 0,
          hasWinner: false
        },
        databaseAnalytics: {
          total_slips: String(data.total_slips || 0),
          unique_players: String(data.unique_players || 0),
          avg_correct_predictions: data.avg_accuracy,
          max_correct_predictions: data.max_accuracy,
          evaluated_slips: String(data.evaluated_slips || 0),
          prizes_claimed: String(data.prizes_claimed || 0)
        },
        popularSelections: [],
        matchAnalytics: [],
        insights: []
      };
    } catch (error) {
      console.error('❌ Error getting optimized cycle analytics:', error);
      // Return null to fallback to full analytics
      return null;
    }
  }

  /**
   * 🎯 Get optimized player analytics using materialized views
   */
  async getOptimizedPlayerAnalytics(playerAddress) {
    try {
      const result = await db.query(`
        SELECT 
          player_address,
          total_slips,
          avg_accuracy,
          best_score,
          evaluated_slips,
          prizes_won,
          cycles_participated
        FROM oracle.mv_oddyssey_player_stats
        WHERE player_address = $1
      `, [playerAddress]);
      
      const data = result.rows[0];
      if (!data) return null;
      
      // Transform to match OdysseySmartAnalytics format
      return {
        userAddress: playerAddress,
        contractData: {
          totalSlips: String(data.total_slips || 0),
          totalWins: String(data.prizes_won || 0),
          bestScore: String(data.best_score || 0),
          averageScore: String(data.avg_accuracy || 0),
          winRate: '0',
          currentStreak: '0',
          bestStreak: '0',
          lastActiveCycle: '0',
          reputation: '0',
          correctPredictions: '0'
        },
        databaseAnalytics: {
          total_slips: data.total_slips,
          avg_accuracy: data.avg_accuracy,
          best_score: data.best_score,
          evaluated_slips: data.evaluated_slips,
          prizes_won: data.prizes_won,
          cycles_participated: data.cycles_participated
        },
        recentPerformance: [],
        insights: []
      };
    } catch (error) {
      console.error('❌ Error getting optimized player analytics:', error);
      // Return null to fallback to full analytics
      return null;
    }
  }

  /**
   * 📈 Get optimized daily analytics using materialized views
   */
  async getOptimizedDailyAnalytics(days = 7) {
    try {
      const result = await db.query(`
        SELECT 
          date,
          total_slips,
          unique_players,
          avg_accuracy,
          evaluated_slips
        FROM oracle.mv_oddyssey_daily_stats
        WHERE date >= CURRENT_DATE - INTERVAL '${days} days'
        ORDER BY date DESC
      `);
      
      return result.rows;
    } catch (error) {
      console.error('❌ Error getting optimized daily analytics:', error);
      throw error;
    }
  }

  /**
   * 🧹 Clean up old analytics cache
   */
  async cleanupAnalyticsCache() {
    try {
      const result = await db.query(`
        DELETE FROM oracle.oddyssey_analytics_cache 
        WHERE expires_at < NOW()
      `);
      
      console.log(`🧹 Cleaned up ${result.rowCount} expired cache entries`);
    } catch (error) {
      console.error('❌ Error cleaning up analytics cache:', error);
    }
  }

  /**
   * 📊 Get database performance metrics
   */
  async getPerformanceMetrics() {
    try {
      const result = await db.query(`
        SELECT 
          schemaname,
          tablename,
          attname,
          n_distinct,
          correlation
        FROM pg_stats 
        WHERE schemaname = 'oracle' 
        AND tablename LIKE 'oddyssey_%'
        ORDER BY n_distinct DESC
      `);
      
      return result.rows;
    } catch (error) {
      console.error('❌ Error getting performance metrics:', error);
      return [];
    }
  }

  /**
   * 🚀 Start background optimization tasks
   */
  startBackgroundTasks() {
    // Refresh materialized views every 5 minutes
    setInterval(() => {
      this.refreshMaterializedViews();
    }, 300000);
    
    // Clean up cache every hour
    setInterval(() => {
      this.cleanupAnalyticsCache();
    }, 3600000);
    
    console.log('🚀 Background optimization tasks started');
  }

  /**
   * 📊 Get optimizer status
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      materializedViews: Array.from(this.materializedViews.keys()),
      lastRefresh: Array.from(this.materializedViews.values()).map(v => v.lastRefresh)
    };
  }
}

module.exports = OdysseyDatabaseOptimizer;
