#!/usr/bin/env node

/**
 * Database Query Optimization Script
 * 
 * Analyzes and optimizes database queries:
 * - Identifies slow queries
 * - Recommends indexes
 * - Optimizes connection pool
 * - Tests query performance
 */

require('dotenv').config();
const db = require('../db/db');
const sharedQueryService = require('../services/shared-query-service');
const databaseOptimizationService = require('../services/database-optimization-service');

class DatabaseQueryOptimizer {
  constructor() {
    this.results = {
      slowQueries: [],
      indexRecommendations: [],
      poolOptimizations: [],
      performanceImprovements: []
    };
  }

  async run() {
    console.log('🚀 Starting Database Query Optimization...');
    
    try {
      // Connect to database
      await db.connect();
      console.log('✅ Database connected');
      
      // Initialize optimization service
      await databaseOptimizationService.start();
      console.log('✅ Optimization service started');
      
      // Run optimization analysis
      await this.analyzeSlowQueries();
      await this.analyzeIndexUsage();
      await this.analyzeConnectionPool();
      await this.testQueryPerformance();
      
      // Generate report
      this.generateReport();
      
      console.log('✅ Database optimization completed');
      
    } catch (error) {
      console.error('❌ Database optimization failed:', error);
      process.exit(1);
    } finally {
      await databaseOptimizationService.stop();
      if (db.end) await db.end();
    }
  }

  /**
   * Analyze slow queries
   */
  async analyzeSlowQueries() {
    console.log('🔍 Analyzing slow queries...');
    
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
          AND EXTRACT(EPOCH FROM (clock_timestamp() - query_start)) > 1
        ORDER BY duration DESC
        LIMIT 10
      `);
      
      this.results.slowQueries = slowQueries.rows;
      
      if (slowQueries.rows.length > 0) {
        console.log(`⚠️ Found ${slowQueries.rows.length} slow queries`);
        slowQueries.rows.forEach((query, index) => {
          console.log(`  ${index + 1}. ${query.duration.toFixed(2)}s - ${query.query.substring(0, 100)}...`);
        });
      } else {
        console.log('✅ No slow queries detected');
      }
      
    } catch (error) {
      console.error('❌ Slow query analysis failed:', error.message);
    }
  }

  /**
   * Analyze index usage
   */
  async analyzeIndexUsage() {
    console.log('🔍 Analyzing index usage...');
    
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
      
      // Get table sizes
      const tableSizes = await db.query(`
        SELECT 
          schemaname,
          tablename,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
        FROM pg_tables 
        WHERE schemaname IN ('oracle', 'analytics')
        ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
        LIMIT 10
      `);
      
      this.results.indexRecommendations = {
        topUsedIndexes: indexStats.rows,
        unusedIndexes: unusedIndexes.rows,
        tableSizes: tableSizes.rows,
        recommendations: this.generateIndexRecommendations(indexStats.rows, unusedIndexes.rows)
      };
      
      console.log(`📊 Index Analysis:`);
      console.log(`  - Top used indexes: ${indexStats.rows.length}`);
      console.log(`  - Unused indexes: ${unusedIndexes.rows.length}`);
      console.log(`  - Recommendations: ${this.results.indexRecommendations.recommendations.length}`);
      
    } catch (error) {
      console.error('❌ Index analysis failed:', error.message);
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
        reason: 'Common filter combination in pool queries'
      },
      {
        table: 'oracle.bets',
        columns: ['bettor_address', 'created_at'],
        reason: 'User bet history queries'
      },
      {
        table: 'oracle.pools',
        columns: ['category', 'status', 'created_at'],
        reason: 'Pool listing queries with filters'
      },
      {
        table: 'oracle.bets',
        columns: ['pool_id', 'created_at'],
        reason: 'Pool bet history queries'
      },
      {
        table: 'oracle.pools',
        columns: ['event_start_time', 'status'],
        reason: 'Active pool queries'
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
          columns: pattern.columns,
          sql: `CREATE INDEX CONCURRENTLY idx_${pattern.table.split('.')[1]}_${pattern.columns.join('_')} ON ${pattern.table} (${pattern.columns.join(', ')})`
        });
      }
    });
    
    return recommendations;
  }

  /**
   * Analyze connection pool
   */
  async analyzeConnectionPool() {
    console.log('🔍 Analyzing connection pool...');
    
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
      
      this.results.poolOptimizations = {
        current: connectionStats.rows[0],
        configured: poolConfig,
        recommendations: this.generatePoolRecommendations(connectionStats.rows[0], poolConfig)
      };
      
      console.log(`📊 Connection Pool Analysis:`);
      console.log(`  - Total connections: ${connectionStats.rows[0].total_connections}`);
      console.log(`  - Active connections: ${connectionStats.rows[0].active_connections}`);
      console.log(`  - Idle connections: ${connectionStats.rows[0].idle_connections}`);
      console.log(`  - Idle in transaction: ${connectionStats.rows[0].idle_in_transaction}`);
      
    } catch (error) {
      console.error('❌ Connection pool analysis failed:', error.message);
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
   * Test query performance
   */
  async testQueryPerformance() {
    console.log('🔍 Testing query performance...');
    
    try {
      // Test common queries
      const testQueries = [
        {
          name: 'Get pools with filters',
          query: () => sharedQueryService.getPools({ category: 'football', status: 'active', limit: 10 })
        },
        {
          name: 'Get pool by ID',
          query: () => sharedQueryService.getPoolById(1)
        },
        {
          name: 'Get user bets',
          query: () => sharedQueryService.getUserBets('0x1234567890123456789012345678901234567890', 10)
        },
        {
          name: 'Get recent bets',
          query: () => sharedQueryService.getRecentBets(10)
        },
        {
          name: 'Get pool analytics',
          query: () => sharedQueryService.getPoolAnalytics()
        }
      ];
      
      const performanceResults = [];
      
      for (const test of testQueries) {
        const startTime = Date.now();
        try {
          await test.query();
          const duration = Date.now() - startTime;
          performanceResults.push({
            name: test.name,
            duration,
            status: 'success'
          });
          console.log(`  ✅ ${test.name}: ${duration}ms`);
        } catch (error) {
          const duration = Date.now() - startTime;
          performanceResults.push({
            name: test.name,
            duration,
            status: 'error',
            error: error.message
          });
          console.log(`  ❌ ${test.name}: ${duration}ms (${error.message})`);
        }
      }
      
      this.results.performanceImprovements = performanceResults;
      
    } catch (error) {
      console.error('❌ Query performance testing failed:', error.message);
    }
  }

  /**
   * Generate optimization report
   */
  generateReport() {
    console.log('\n📊 DATABASE OPTIMIZATION REPORT');
    console.log('================================');
    
    // Slow queries
    console.log('\n🐌 SLOW QUERIES:');
    if (this.results.slowQueries.length > 0) {
      this.results.slowQueries.forEach((query, index) => {
        console.log(`  ${index + 1}. ${query.duration.toFixed(2)}s - ${query.query.substring(0, 80)}...`);
      });
    } else {
      console.log('  ✅ No slow queries detected');
    }
    
    // Index recommendations
    console.log('\n📈 INDEX RECOMMENDATIONS:');
    if (this.results.indexRecommendations && this.results.indexRecommendations.recommendations && this.results.indexRecommendations.recommendations.length > 0) {
      this.results.indexRecommendations.recommendations.forEach((rec, index) => {
        console.log(`  ${index + 1}. [${rec.priority.toUpperCase()}] ${rec.description}`);
        if (rec.sql) {
          console.log(`     SQL: ${rec.sql}`);
        }
      });
    } else {
      console.log('  ✅ No index recommendations');
    }
    
    // Connection pool optimizations
    console.log('\n🔗 CONNECTION POOL OPTIMIZATIONS:');
    if (this.results.poolOptimizations && this.results.poolOptimizations.recommendations && this.results.poolOptimizations.recommendations.length > 0) {
      this.results.poolOptimizations.recommendations.forEach((rec, index) => {
        console.log(`  ${index + 1}. [${rec.priority.toUpperCase()}] ${rec.description}`);
      });
    } else {
      console.log('  ✅ No connection pool optimizations needed');
    }
    
    // Performance improvements
    console.log('\n⚡ PERFORMANCE TEST RESULTS:');
    this.results.performanceImprovements.forEach((result, index) => {
      const status = result.status === 'success' ? '✅' : '❌';
      console.log(`  ${index + 1}. ${status} ${result.name}: ${result.duration}ms`);
      if (result.error) {
        console.log(`     Error: ${result.error}`);
      }
    });
    
    // Summary
    console.log('\n📋 SUMMARY:');
    console.log(`  - Slow queries: ${this.results.slowQueries.length}`);
    console.log(`  - Index recommendations: ${this.results.indexRecommendations?.recommendations?.length || 0}`);
    console.log(`  - Pool optimizations: ${this.results.poolOptimizations?.recommendations?.length || 0}`);
    console.log(`  - Performance tests: ${this.results.performanceImprovements.length}`);
    
    // Save report to file
    const fs = require('fs');
    const reportPath = './database-optimization-report.json';
    fs.writeFileSync(reportPath, JSON.stringify(this.results, null, 2));
    console.log(`\n💾 Report saved to: ${reportPath}`);
  }
}

// Run optimization if called directly
if (require.main === module) {
  const optimizer = new DatabaseQueryOptimizer();
  optimizer.run().catch(console.error);
}

module.exports = DatabaseQueryOptimizer;
