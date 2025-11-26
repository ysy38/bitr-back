const OdysseySmartAnalytics = require('./oddyssey-smart-analytics');
const OdysseyAnalyticsCache = require('./oddyssey-analytics-cache');
const OdysseyDatabaseOptimizer = require('./oddyssey-database-optimizer');

/**
 * 🚀 Odyssey Unified Analytics Service
 * 
 * Combines smart analytics, caching, and database optimization:
 * - Prevents overcomputing with intelligent caching
 * - Uses materialized views for heavy queries
 * - Background refresh for hot data
 * - Performance monitoring and optimization
 * - Smart cache invalidation
 */
class OdysseyUnifiedAnalytics {
  constructor() {
    this.analytics = new OdysseySmartAnalytics();
    this.cache = new OdysseyAnalyticsCache();
    this.optimizer = new OdysseyDatabaseOptimizer();
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;
    
    try {
      console.log('🚀 Initializing Odyssey Unified Analytics...');
      
      // Initialize database optimizer
      await this.optimizer.initialize();
      
      // Start background optimization tasks
      this.optimizer.startBackgroundTasks();
      
      // Warm cache with predictable data
      await this.cache.warmCache();
      
      this.isInitialized = true;
      console.log('✅ Unified analytics initialized');
      
    } catch (error) {
      console.error('❌ Unified analytics initialization failed:', error);
      throw error;
    }
  }

  /**
   * 🎯 Get slip probability with full optimization
   */
  async getSlipWinningProbability(slipId, cycleId) {
    await this.initialize();
    return this.analytics.getSlipWinningProbability(slipId, cycleId);
  }

  /**
   * 📊 Get cycle selections with optimization
   */
  async getCycleMostPlayedSelections(cycleId) {
    await this.initialize();
    return this.analytics.getCycleMostPlayedSelections(cycleId);
  }

  /**
   * 🎲 Get match analytics with optimization
   */
  async getMatchSelectionAnalytics(matchId, cycleId) {
    await this.initialize();
    return this.analytics.getMatchSelectionAnalytics(matchId, cycleId);
  }

  /**
   * 📈 Get comprehensive cycle analytics with optimization
   */
  async getCycleAnalytics(cycleId) {
    await this.initialize();
    
    // Try to get from materialized view first
    const optimizedData = await this.optimizer.getOptimizedCycleAnalytics(cycleId);
    if (optimizedData) {
      return {
        ...optimizedData,
        source: 'materialized_view',
        optimized: true
      };
    }
    
    // Fallback to full analytics
    return this.analytics.getCycleAnalytics(cycleId);
  }

  /**
   * 🎯 Get user analytics with optimization
   */
  async getUserAnalytics(userAddress) {
    await this.initialize();
    
    // Try to get from materialized view first
    const optimizedData = await this.optimizer.getOptimizedPlayerAnalytics(userAddress);
    if (optimizedData) {
      return {
        ...optimizedData,
        source: 'materialized_view',
        optimized: true
      };
    }
    
    // Fallback to full analytics
    return this.analytics.getUserAnalytics(userAddress);
  }

  /**
   * 📊 Get platform analytics with optimization
   */
  async getPlatformAnalytics() {
    await this.initialize();
    return this.analytics.getPlatformAnalytics();
  }

  /**
   * 📈 Get daily analytics with optimization
   */
  async getDailyAnalytics(days = 7) {
    await this.initialize();
    return this.optimizer.getOptimizedDailyAnalytics(days);
  }

  /**
   * 🧠 Get smart insights with caching
   */
  async getSmartInsights(type = 'all') {
    await this.initialize();
    
    const insights = {};
    
    if (type === 'all' || type === 'platform') {
      const platformAnalytics = await this.getPlatformAnalytics();
      insights.platform = platformAnalytics.insights;
    }
    
    if (type === 'all' || type === 'trends') {
      const dailyAnalytics = await this.getDailyAnalytics(7);
      insights.trends = {
        recentDays: dailyAnalytics,
        message: 'Recent performance trends'
      };
    }
    
    return insights;
  }

  /**
   * 📊 Get visualization data with optimization
   */
  async getVisualizationData(cycleId) {
    await this.initialize();
    
    const cycleAnalytics = await this.getCycleAnalytics(cycleId);
    
    return {
      cycleId: Number(cycleId),
      summary: {
        totalSlips: cycleAnalytics.databaseAnalytics?.total_slips || 0,
        uniquePlayers: cycleAnalytics.databaseAnalytics?.unique_players || 0,
        avgAccuracy: cycleAnalytics.databaseAnalytics?.avg_correct_predictions || 0,
        maxAccuracy: cycleAnalytics.databaseAnalytics?.max_correct_predictions || 0
      },
      popularSelections: cycleAnalytics.popularSelections?.map(selection => ({
        selection: selection.prediction.selection,
        count: selection.playCount,
        percentage: (selection.playCount / (cycleAnalytics.databaseAnalytics?.total_slips || 1) * 100).toFixed(1)
      })) || [],
      matchBreakdown: cycleAnalytics.matchAnalytics?.map(match => ({
        matchId: match.matchId,
        teams: `${match.homeTeam} vs ${match.awayTeam}`,
        league: match.leagueName,
        totalSelections: match.selections.reduce((sum, sel) => sum + sel.selectionCount, 0),
        topSelection: match.selections[0] || null
      })) || [],
      insights: cycleAnalytics.insights || [],
      optimized: cycleAnalytics.optimized || false
    };
  }

  /**
   * 🚀 Invalidate cache for specific data
   */
  invalidateCache(pattern) {
    this.cache.invalidate(pattern);
  }

  /**
   * 📊 Get performance metrics
   */
  async getPerformanceMetrics() {
    await this.initialize();
    
    const cacheMetrics = this.cache.getMetrics();
    const optimizerStatus = this.optimizer.getStatus();
    const dbMetrics = await this.optimizer.getPerformanceMetrics();
    
    return {
      cache: cacheMetrics,
      optimizer: optimizerStatus,
      database: dbMetrics,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 🧹 Clean up resources
   */
  async cleanup() {
    try {
      this.cache.clear();
      await this.optimizer.cleanupAnalyticsCache();
      console.log('✅ Analytics cleanup completed');
    } catch (error) {
      console.error('❌ Analytics cleanup failed:', error);
    }
  }

  /**
   * 🔄 Refresh all materialized views
   */
  async refreshMaterializedViews() {
    await this.initialize();
    await this.optimizer.refreshMaterializedViews();
  }

  /**
   * 🚀 Get system status
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      cache: this.cache.getMetrics(),
      optimizer: this.optimizer.getStatus()
    };
  }
}

module.exports = OdysseyUnifiedAnalytics;
