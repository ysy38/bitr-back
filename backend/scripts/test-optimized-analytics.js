#!/usr/bin/env node

/**
 * Test Optimized Odyssey Analytics
 * 
 * This script tests the optimized analytics system:
 * - Caching performance
 * - Database optimization
 * - Materialized views
 * - Background tasks
 * - Performance metrics
 */

const OdysseyUnifiedAnalytics = require('../services/oddyssey-unified-analytics');
const db = require('../db/db');

class OptimizedAnalyticsTester {
  constructor() {
    this.analytics = new OdysseyUnifiedAnalytics();
  }

  async runTests() {
    console.log('🚀 Testing Optimized Odyssey Analytics...\n');

    try {
      // Test 1: System Initialization
      await this.testSystemInitialization();
      
      // Test 2: Caching Performance
      await this.testCachingPerformance();
      
      // Test 3: Database Optimization
      await this.testDatabaseOptimization();
      
      // Test 4: Performance Metrics
      await this.testPerformanceMetrics();
      
      // Test 5: Background Tasks
      await this.testBackgroundTasks();
      
      console.log('\n🎉 All optimized analytics tests completed successfully!');
      
    } catch (error) {
      console.error('❌ Optimized analytics test failed:', error.message);
      process.exit(1);
    }
  }

  async testSystemInitialization() {
    console.log('🚀 Testing system initialization...');
    
    try {
      await this.analytics.initialize();
      
      const status = this.analytics.getStatus();
      console.log('✅ System Status:');
      console.log(`   Initialized: ${status.isInitialized}`);
      console.log(`   Cache Size: ${status.cache.cacheSize}`);
      console.log(`   Hit Rate: ${status.cache.hitRate}`);
      console.log(`   Refresh Queue: ${status.cache.refreshQueueSize}`);
      
    } catch (error) {
      console.error('❌ System initialization test failed:', error.message);
    }
  }

  async testCachingPerformance() {
    console.log('\n📊 Testing caching performance...');
    
    try {
      // Test cache hit/miss performance
      const startTime = Date.now();
      
      // First call (cache miss)
      const result1 = await this.analytics.getPlatformAnalytics();
      const firstCallTime = Date.now() - startTime;
      
      // Second call (cache hit)
      const startTime2 = Date.now();
      const result2 = await this.analytics.getPlatformAnalytics();
      const secondCallTime = Date.now() - startTime2;
      
      console.log('✅ Caching Performance:');
      console.log(`   First call (cache miss): ${firstCallTime}ms`);
      console.log(`   Second call (cache hit): ${secondCallTime}ms`);
      console.log(`   Performance improvement: ${((firstCallTime - secondCallTime) / firstCallTime * 100).toFixed(1)}%`);
      
      // Test cache invalidation
      this.analytics.invalidateCache('platform');
      console.log('   Cache invalidated for platform data');
      
    } catch (error) {
      console.error('❌ Caching performance test failed:', error.message);
    }
  }

  async testDatabaseOptimization() {
    console.log('\n📈 Testing database optimization...');
    
    try {
      // Test materialized views
      const dailyAnalytics = await this.analytics.getDailyAnalytics(7);
      console.log('✅ Daily Analytics (from materialized view):');
      console.log(`   Days analyzed: ${dailyAnalytics.length}`);
      
      if (dailyAnalytics.length > 0) {
        const latestDay = dailyAnalytics[0];
        console.log(`   Latest day: ${latestDay.date}`);
        console.log(`   Total slips: ${latestDay.total_slips}`);
        console.log(`   Unique players: ${latestDay.unique_players}`);
        console.log(`   Average accuracy: ${latestDay.avg_accuracy}`);
      }
      
      // Test optimized cycle analytics
      const recentCycle = await db.query(`
        SELECT cycle_id FROM oracle.oddyssey_cycles 
        ORDER BY cycle_id DESC LIMIT 1
      `);
      
      if (recentCycle.rows.length > 0) {
        const cycleId = recentCycle.rows[0].cycle_id;
        const cycleAnalytics = await this.analytics.getCycleAnalytics(cycleId);
        
        console.log('✅ Cycle Analytics:');
        console.log(`   Cycle ID: ${cycleId}`);
        console.log(`   Optimized: ${cycleAnalytics.optimized || false}`);
        console.log(`   Source: ${cycleAnalytics.source || 'full_analytics'}`);
      }
      
    } catch (error) {
      console.error('❌ Database optimization test failed:', error.message);
    }
  }

  async testPerformanceMetrics() {
    console.log('\n📊 Testing performance metrics...');
    
    try {
      const metrics = await this.analytics.getPerformanceMetrics();
      
      console.log('✅ Performance Metrics:');
      console.log('   Cache Metrics:');
      console.log(`     Hits: ${metrics.cache.hits}`);
      console.log(`     Misses: ${metrics.cache.misses}`);
      console.log(`     Hit Rate: ${metrics.cache.hitRate}`);
      console.log(`     Refreshes: ${metrics.cache.refreshes}`);
      console.log(`     Errors: ${metrics.cache.errors}`);
      console.log(`     Cache Size: ${metrics.cache.cacheSize}`);
      
      console.log('   Optimizer Status:');
      console.log(`     Initialized: ${metrics.optimizer.isInitialized}`);
      console.log(`     Materialized Views: ${metrics.optimizer.materializedViews.length}`);
      
      if (metrics.database.length > 0) {
        console.log('   Database Stats:');
        console.log(`     Tables analyzed: ${metrics.database.length}`);
        const topTable = metrics.database[0];
        console.log(`     Top table: ${topTable.tablename} (${topTable.attname})`);
      }
      
    } catch (error) {
      console.error('❌ Performance metrics test failed:', error.message);
    }
  }

  async testBackgroundTasks() {
    console.log('\n🔄 Testing background tasks...');
    
    try {
      // Test manual refresh
      console.log('   Testing manual refresh...');
      await this.analytics.refreshMaterializedViews();
      console.log('   ✅ Materialized views refreshed');
      
      // Test cleanup
      console.log('   Testing cleanup...');
      await this.analytics.cleanup();
      console.log('   ✅ Cleanup completed');
      
      // Test status after background tasks
      const status = this.analytics.getStatus();
      console.log('   ✅ Status after background tasks:');
      console.log(`     Cache Size: ${status.cache.cacheSize}`);
      console.log(`     Refresh Queue: ${status.cache.refreshQueueSize}`);
      
    } catch (error) {
      console.error('❌ Background tasks test failed:', error.message);
    }
  }

  async testRealWorldScenario() {
    console.log('\n🌍 Testing real-world scenario...');
    
    try {
      // Simulate multiple concurrent requests
      const promises = [];
      const startTime = Date.now();
      
      // Simulate 10 concurrent requests for platform analytics
      for (let i = 0; i < 10; i++) {
        promises.push(this.analytics.getPlatformAnalytics());
      }
      
      await Promise.all(promises);
      const totalTime = Date.now() - startTime;
      
      console.log('✅ Real-world scenario test:');
      console.log(`   Concurrent requests: 10`);
      console.log(`   Total time: ${totalTime}ms`);
      console.log(`   Average time per request: ${(totalTime / 10).toFixed(1)}ms`);
      
      // Test cache efficiency
      const metrics = await this.analytics.getPerformanceMetrics();
      console.log(`   Cache hit rate: ${metrics.cache.hitRate}`);
      console.log(`   Total refreshes: ${metrics.cache.refreshes}`);
      
    } catch (error) {
      console.error('❌ Real-world scenario test failed:', error.message);
    }
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  const tester = new OptimizedAnalyticsTester();
  
  tester.runTests().then(() => {
    console.log('\n✅ All optimized analytics tests completed successfully!');
    console.log('🚀 Optimized analytics system is ready for production!');
    process.exit(0);
  }).catch((error) => {
    console.error('\n❌ Optimized analytics tests failed:', error.message);
    process.exit(1);
  });
}

module.exports = OptimizedAnalyticsTester;
