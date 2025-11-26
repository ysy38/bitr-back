const readOnlyWeb3Service = require('./web3-service-readonly');
const db = require('../db/db');

/**
 * 📊 MARKET ANALYTICS SERVICE
 * 
 * Simplified from guided-market-service.js for the new architecture:
 * - REMOVED: All pool creation and transaction logic
 * - REMOVED: Betting and settlement functionality
 * - KEPT: Market analysis and fixture matching
 * - KEPT: Oracle data integration
 * - ENHANCED: AI-powered market intelligence
 */

class MarketAnalyticsService {
  constructor() {
    this.web3Service = readOnlyWeb3Service;
    this.isInitialized = false;
  }

  async initialize() {
    if (!this.web3Service.isInitialized) {
      await this.web3Service.initialize();
    }
    this.isInitialized = true;
    console.log('📊 Market Analytics Service initialized');
  }

  /**
   * 🔍 MARKET INTELLIGENCE ANALYTICS
   */
  async getMarketIntelligence(filters = {}) {
    try {
      const { category = null, timeRange = '7d', limit = 50 } = filters;
      
      // Get trending pools from analytics
      let query = `
        SELECT 
          p.pool_id,
          pm.title,
          pm.home_team,
          pm.away_team,
          pm.league_name,
          p.creator_stake,
          p.total_stake,
          p.odds,
          p.event_start_time,
          mi.hotness_score,
          mi.social_buzz,
          mi.success_probability,
          mi.viral_coefficient
        FROM oracle.pools p
        LEFT JOIN analytics.pool_complete_metadata pm ON p.pool_id = pm.pool_id
        LEFT JOIN analytics.market_intelligence mi ON p.pool_id = mi.pool_id
        WHERE p.event_start_time > EXTRACT(epoch FROM NOW())
      `;
      
      const params = [];
      let paramIndex = 1;
      
      if (category) {
        query += ` AND p.category = $${paramIndex}`;
        params.push(category);
        paramIndex++;
      }
      
      // Add time range filter
      const timeRangeHours = this.parseTimeRange(timeRange);
      query += ` AND p.event_start_time < EXTRACT(epoch FROM NOW() + INTERVAL '${timeRangeHours} hours')`;
      
      query += ` ORDER BY mi.hotness_score DESC NULLS LAST, p.creator_stake DESC LIMIT $${paramIndex}`;
      params.push(limit);
      
      const result = await db.query(query, params);
      
      return {
        pools: result.rows,
        metadata: {
          total: result.rows.length,
          category,
          timeRange,
          generated_at: new Date().toISOString()
        }
      };
      
    } catch (error) {
      console.error('❌ Error getting market intelligence:', error);
      return { pools: [], metadata: { error: error.message } };
    }
  }

  /**
   * 🔥 TRENDING POOLS ANALYTICS
   */
  async getTrendingPools(limit = 20) {
    try {
      const query = `
        SELECT 
          p.pool_id,
          pm.title,
          pm.home_team,
          pm.away_team,
          pm.league_name,
          p.creator_stake,
          p.total_stake,
          p.odds,
          mi.hotness_score,
          mi.social_buzz,
          mi.viral_coefficient,
          mi.engagement_rate
        FROM oracle.pools p
        LEFT JOIN analytics.pool_complete_metadata pm ON p.pool_id = pm.pool_id
        LEFT JOIN analytics.market_intelligence mi ON p.pool_id = mi.pool_id
        WHERE p.event_start_time > EXTRACT(epoch FROM NOW())
        AND mi.hotness_score > 50
        ORDER BY mi.hotness_score DESC, mi.social_buzz DESC
        LIMIT $1
      `;
      
      const result = await db.query(query, [limit]);
      
      // Enhance with real-time contract data
      const enhancedPools = await Promise.all(
        result.rows.map(async (pool) => {
          try {
            const contractData = await this.web3Service.getPoolAnalytics(pool.pool_id);
            return {
              ...pool,
              realtime_data: contractData,
              is_trending: true
            };
          } catch (error) {
            console.error(`❌ Failed to get contract data for pool ${pool.pool_id}:`, error);
            return pool;
          }
        })
      );
      
      return enhancedPools;
      
    } catch (error) {
      console.error('❌ Error getting trending pools:', error);
      return [];
    }
  }

  /**
   * 🎯 POOL SEARCH & DISCOVERY
   */
  async searchPools(searchParams) {
    try {
      const {
        query = '',
        category = null,
        league = null,
        minStake = null,
        maxStake = null,
        sortBy = 'hotness_score',
        sortOrder = 'DESC',
        limit = 50,
        offset = 0
      } = searchParams;
      
      let sql = `
        SELECT 
          p.pool_id,
          pm.title,
          pm.home_team,
          pm.away_team,
          pm.league_name,
          p.creator_address,
          p.creator_stake,
          p.total_stake,
          p.odds,
          p.event_start_time,
          p.event_end_time,
          mi.hotness_score,
          mi.social_buzz,
          mi.success_probability
        FROM oracle.pools p
        LEFT JOIN analytics.pool_complete_metadata pm ON p.pool_id = pm.pool_id
        LEFT JOIN analytics.market_intelligence mi ON p.pool_id = mi.pool_id
        WHERE p.event_start_time > EXTRACT(epoch FROM NOW())
      `;
      
      const params = [];
      let paramIndex = 1;
      
      // Text search
      if (query) {
        sql += ` AND (
          pm.title ILIKE $${paramIndex} OR 
          pm.home_team ILIKE $${paramIndex} OR 
          pm.away_team ILIKE $${paramIndex} OR 
          pm.league_name ILIKE $${paramIndex}
        )`;
        params.push(`%${query}%`);
        paramIndex++;
      }
      
      // Category filter
      if (category) {
        sql += ` AND p.category = $${paramIndex}`;
        params.push(category);
        paramIndex++;
      }
      
      // League filter
      if (league) {
        sql += ` AND pm.league_name = $${paramIndex}`;
        params.push(league);
        paramIndex++;
      }
      
      // Stake range filters
      if (minStake) {
        sql += ` AND p.creator_stake >= $${paramIndex}`;
        params.push(minStake);
        paramIndex++;
      }
      
      if (maxStake) {
        sql += ` AND p.creator_stake <= $${paramIndex}`;
        params.push(maxStake);
        paramIndex++;
      }
      
      // Sorting
      const validSortColumns = ['hotness_score', 'creator_stake', 'event_start_time', 'odds'];
      const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'hotness_score';
      const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
      
      sql += ` ORDER BY ${sortColumn} ${order} NULLS LAST`;
      sql += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);
      
      const result = await db.query(sql, params);
      
      return {
        pools: result.rows,
        pagination: {
          limit,
          offset,
          total: result.rows.length,
          has_more: result.rows.length === limit
        },
        filters: searchParams
      };
      
    } catch (error) {
      console.error('❌ Error searching pools:', error);
      return { pools: [], pagination: {}, filters: searchParams };
    }
  }

  /**
   * 📈 USER BEHAVIOR ANALYTICS
   */
  async getUserBehaviorInsights(userAddress, days = 30) {
    try {
      const query = `
        SELECT 
          date,
          pools_created,
          bets_placed,
          total_volume,
          avg_bet_size,
          win_rate,
          engagement_score,
          prediction_accuracy,
          social_influence,
          risk_preference
        FROM analytics.user_behavior_insights
        WHERE user_address = $1
        AND date >= CURRENT_DATE - INTERVAL '${days} days'
        ORDER BY date DESC
      `;
      
      const result = await db.query(query, [userAddress]);
      
      // Get real-time contract data
      const contractData = await this.web3Service.getUserAnalytics(userAddress);
      
      return {
        historical_insights: result.rows,
        realtime_stats: contractData,
        summary: this.calculateUserSummary(result.rows),
        generated_at: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('❌ Error getting user behavior insights:', error);
      return { historical_insights: [], realtime_stats: {}, summary: {} };
    }
  }

  /**
   * 🧠 AI-POWERED MARKET PREDICTIONS
   */
  async getMarketPredictions(poolId) {
    try {
      // Get pool analytics from contract
      const contractData = await this.web3Service.getPoolAnalytics(poolId);
      
      // Get market intelligence from database
      const query = `
        SELECT 
          mi.*,
          pm.title,
          pm.home_team,
          pm.away_team,
          pm.league_name
        FROM analytics.market_intelligence mi
        LEFT JOIN analytics.pool_complete_metadata pm ON mi.pool_id = pm.pool_id
        WHERE mi.pool_id = $1
      `;
      
      const result = await db.query(query, [poolId]);
      const marketData = result.rows[0];
      
      if (!marketData) {
        return { prediction: 'insufficient_data', confidence: 0 };
      }
      
      // AI prediction algorithm (simplified)
      const prediction = this.calculateAIPrediction(contractData, marketData);
      
      return {
        pool_id: poolId,
        prediction: prediction.outcome,
        confidence: prediction.confidence,
        factors: prediction.factors,
        market_data: marketData,
        contract_data: contractData,
        generated_at: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('❌ Error getting market predictions:', error);
      return { prediction: 'error', confidence: 0, error: error.message };
    }
  }

  /**
   * 🔧 UTILITY FUNCTIONS
   */
  parseTimeRange(timeRange) {
    const ranges = {
      '1h': 1,
      '6h': 6,
      '12h': 12,
      '1d': 24,
      '3d': 72,
      '7d': 168,
      '30d': 720
    };
    return ranges[timeRange] || 168; // Default to 7 days
  }

  calculateUserSummary(insights) {
    if (!insights.length) return {};
    
    const totals = insights.reduce((acc, day) => ({
      pools_created: acc.pools_created + (day.pools_created || 0),
      bets_placed: acc.bets_placed + (day.bets_placed || 0),
      total_volume: acc.total_volume + parseFloat(day.total_volume || 0),
      avg_engagement: acc.avg_engagement + (day.engagement_score || 0),
      avg_accuracy: acc.avg_accuracy + (day.prediction_accuracy || 0)
    }), { pools_created: 0, bets_placed: 0, total_volume: 0, avg_engagement: 0, avg_accuracy: 0 });
    
    const days = insights.length;
    return {
      ...totals,
      avg_engagement: totals.avg_engagement / days,
      avg_accuracy: totals.avg_accuracy / days,
      days_analyzed: days
    };
  }

  calculateAIPrediction(contractData, marketData) {
    // Simplified AI prediction algorithm
    let confidence = 0;
    let outcome = 'uncertain';
    const factors = [];
    
    // Factor 1: Social buzz
    if (marketData.social_buzz > 70) {
      confidence += 20;
      factors.push('high_social_engagement');
    }
    
    // Factor 2: Creator reputation (from contract)
    if (contractData?.pool?.creatorReputation > 80) {
      confidence += 25;
      factors.push('reputable_creator');
    }
    
    // Factor 3: Liquidity velocity
    if (marketData.liquidity_velocity > 50) {
      confidence += 15;
      factors.push('high_liquidity');
    }
    
    // Factor 4: Success probability
    if (marketData.success_probability > 60) {
      confidence += 30;
      outcome = 'favorable';
    } else if (marketData.success_probability < 40) {
      confidence += 20;
      outcome = 'unfavorable';
    }
    
    // Factor 5: Viral coefficient
    if (marketData.viral_coefficient > 1.5) {
      confidence += 10;
      factors.push('viral_potential');
    }
    
    return {
      outcome,
      confidence: Math.min(confidence, 100),
      factors
    };
  }

  /**
   * 🧹 CLEANUP
   */
  async shutdown() {
    console.log('📊 Shutting down Market Analytics Service');
    // Any cleanup needed
  }
}

module.exports = new MarketAnalyticsService();
