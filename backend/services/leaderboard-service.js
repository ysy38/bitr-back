const db = require('../db/db');
const reputationManager = require('../utils/reputationManager');

/**
 * Leaderboard Service
 * Handles all leaderboard-related operations for pools, Oddyssey, and reputation
 */

class LeaderboardService {
  /**
   * Get Oddyssey cycle leaderboard
   * @param {number} cycleId - Cycle ID
   * @param {number} limit - Number of top users to retrieve
   * @returns {Promise<Array>} Leaderboard entries
   */
  async getOddysseyCycleLeaderboard(cycleId, limit = 100) {
    try {
      const result = await db.query(
        `SELECT 
          player_address as user_address,
          slip_id,
          final_score as score,
          0 as prize_amount,
          prize_claimed as claimed,
          leaderboard_rank as rank
        FROM oracle.oddyssey_slips
        WHERE cycle_id = $1 AND final_score IS NOT NULL
        ORDER BY final_score DESC, placed_at ASC
        LIMIT $2`,
        [cycleId, limit]
      );

      return result.rows.map((row, index) => ({
        ...row,
        rank: index + 1
      }));
    } catch (error) {
      console.error(`❌ Error getting Oddyssey cycle ${cycleId} leaderboard:`, error.message);
      throw error;
    }
  }

  /**
   * Get Oddyssey all-time leaderboard
   * @param {number} limit - Number of top users to retrieve
   * @returns {Promise<Array>} All-time leaderboard entries
   */
  async getOddysseyAllTimeLeaderboard(limit = 100) {
    try {
      const result = await db.query(
        `SELECT 
          player_address as user_address,
          COUNT(*) as total_slips,
          SUM(CASE WHEN final_score IS NOT NULL THEN 1 ELSE 0 END) as evaluated_slips,
          AVG(final_score) as average_score,
          MAX(final_score) as best_score,
          0 as total_prizes,
          SUM(CASE WHEN prize_claimed THEN 1 ELSE 0 END) as prizes_claimed
        FROM oracle.oddyssey_slips
        GROUP BY player_address
        HAVING COUNT(*) > 0
        ORDER BY AVG(final_score) DESC NULLS LAST
        LIMIT $1`,
        [limit]
      );

      return result.rows.map((row, index) => ({
        ...row,
        rank: index + 1,
        average_score: row.average_score ? parseFloat(row.average_score).toFixed(2) : '0.00'
      }));
    } catch (error) {
      console.error('❌ Error getting Oddyssey all-time leaderboard:', error.message);
      throw error;
    }
  }

  /**
   * Get pool leaderboard for a specific market
   * @param {string} marketId - Market ID
   * @param {number} limit - Number of top users to retrieve
   * @returns {Promise<Array>} Pool leaderboard entries
   */
  async getPoolMarketLeaderboard(marketId, limit = 100) {
    try {
      const result = await db.query(
        `SELECT 
          p.participant_address as user_address,
          p.position_type,
          p.amount,
          p.shares,
          p.claimed,
          p.payout_amount,
          p.created_at,
          m.outcome,
          m.status
        FROM oracle.pool_participants p
        JOIN oracle.pool_markets m ON p.market_id = m.market_id
        WHERE p.market_id = $1
        ORDER BY p.shares DESC, p.created_at ASC
        LIMIT $2`,
        [marketId, limit]
      );

      return result.rows.map((row, index) => ({
        ...row,
        rank: index + 1
      }));
    } catch (error) {
      console.error(`❌ Error getting pool market ${marketId} leaderboard:`, error.message);
      throw error;
    }
  }

  /**
   * Get global pool leaderboard (most profitable users)
   * @param {number} limit - Number of top users to retrieve
   * @returns {Promise<Array>} Global pool leaderboard entries
   */
  async getGlobalPoolLeaderboard(limit = 100) {
    try {
      const result = await db.query(
        `SELECT 
          participant_address as user_address,
          COUNT(DISTINCT market_id) as total_markets,
          SUM(amount) as total_invested,
          SUM(payout_amount) as total_payouts,
          SUM(payout_amount) - SUM(amount) as net_profit,
          SUM(CASE WHEN claimed THEN 1 ELSE 0 END) as prizes_claimed,
          AVG(shares) as average_shares
        FROM oracle.pool_participants
        GROUP BY participant_address
        HAVING COUNT(*) > 0
        ORDER BY (SUM(payout_amount) - SUM(amount)) DESC NULLS LAST
        LIMIT $1`,
        [limit]
      );

      return result.rows.map((row, index) => ({
        ...row,
        rank: index + 1,
        roi_percentage: row.total_invested > 0 
          ? ((parseFloat(row.net_profit) / parseFloat(row.total_invested)) * 100).toFixed(2)
          : '0.00'
      }));
    } catch (error) {
      console.error('❌ Error getting global pool leaderboard:', error.message);
      throw error;
    }
  }

  /**
   * Get reputation leaderboard
   * @param {number} limit - Number of top users to retrieve
   * @param {boolean} useCache - Whether to use cache (ignored - always uses real-time data)
   * @returns {Promise<Array>} Reputation leaderboard entries
   */
  async getReputationLeaderboard(limit = 100, useCache = true) {
    try {
      const result = await db.query(
        `SELECT 
          address as user_address,
          reputation,
          total_bets,
          won_bets,
          total_pools_created,
          joined_at
        FROM core.users
        WHERE reputation > 0
        ORDER BY reputation DESC, total_bets DESC
        LIMIT $1`,
        [Math.min(limit, 500)]
      );

      return result.rows.map((row, index) => ({
        rank: index + 1,
        user_address: row.user_address,
        reputation: parseInt(row.reputation) || 40,
        total_bets: parseInt(row.total_bets) || 0,
        won_bets: parseInt(row.won_bets) || 0,
        total_pools_created: parseInt(row.total_pools_created) || 0,
        joined_at: row.joined_at
      }));
    } catch (error) {
      console.error('❌ Error getting reputation leaderboard:', error.message);
      throw error;
    }
  }

  /**
   * Get weekly reputation leaderboard (top gainers this week)
   * @param {number} limit - Number of top users to retrieve
   * @returns {Promise<Array>} Weekly reputation leaderboard entries
   */
  async getWeeklyReputationLeaderboard(limit = 100) {
    try {
      const result = await db.query(
        `SELECT 
          ra.user_address,
          SUM(ra.reputation_delta) as weekly_gain,
          u.reputation as current_reputation,
          COUNT(*) as actions_count
        FROM core.reputation_actions ra
        JOIN core.users u ON ra.user_address = u.address
        WHERE ra.timestamp >= NOW() - INTERVAL '7 days'
        GROUP BY ra.user_address, u.reputation
        HAVING SUM(ra.reputation_delta) > 0
        ORDER BY weekly_gain DESC
        LIMIT $1`,
        [Math.min(limit, 500)]
      );

      return result.rows.map((row, index) => ({
        rank: index + 1,
        user_address: row.user_address,
        weekly_gain: parseInt(row.weekly_gain) || 0,
        current_reputation: parseInt(row.current_reputation) || 40,
        actions_count: parseInt(row.actions_count) || 0
      }));
    } catch (error) {
      console.error('❌ Error getting weekly reputation leaderboard:', error.message);
      // Return empty array if reputation_actions table doesn't exist
      if (error.code === '42P01') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Get combined user stats across all systems
   * @param {string} userAddress - User's wallet address
   * @returns {Promise<Object>} Combined user statistics
   */
  async getUserCombinedStats(userAddress) {
    try {
      const normalizedAddress = userAddress.toLowerCase();

      // Get Oddyssey stats
      const oddysseyResult = await db.query(
        `SELECT 
          COUNT(*) as total_slips,
          SUM(CASE WHEN final_score IS NOT NULL THEN 1 ELSE 0 END) as evaluated_slips,
          AVG(final_score) as average_score,
          MAX(final_score) as best_score,
          0 as total_prizes,
          SUM(CASE WHEN prize_claimed THEN 1 ELSE 0 END) as prizes_claimed
        FROM oracle.oddyssey_slips
        WHERE player_address = $1`,
        [normalizedAddress]
      );

      // Get pool stats
      const poolResult = await db.query(
        `SELECT 
          COUNT(DISTINCT market_id) as total_markets,
          SUM(amount) as total_invested,
          SUM(payout_amount) as total_payouts,
          SUM(payout_amount) - SUM(amount) as net_profit,
          SUM(CASE WHEN claimed THEN 1 ELSE 0 END) as prizes_claimed
        FROM oracle.pool_participants
        WHERE participant_address = $1`,
        [normalizedAddress]
      );

      // Get reputation stats
      const reputation = await reputationManager.getUserReputation(normalizedAddress);

      return {
        user_address: normalizedAddress,
        oddyssey: oddysseyResult.rows[0],
        pools: poolResult.rows[0],
        reputation: reputation
      };
    } catch (error) {
      console.error(`❌ Error getting combined stats for ${userAddress}:`, error.message);
      throw error;
    }
  }

  /**
   * Get platform-wide leaderboard statistics
   * @returns {Promise<Object>} Platform-wide leaderboard stats
   */
  async getPlatformLeaderboardStats() {
    try {
      const oddysseyStats = await db.query(`
        SELECT 
          COUNT(DISTINCT player_address) as total_users,
          COUNT(*) as total_slips,
          AVG(final_score) as average_score,
          MAX(final_score) as max_score
        FROM oracle.oddyssey_slips
      `);

      // Get pool stats
      const poolStats = await db.query(`
        SELECT 
          COUNT(DISTINCT participant_address) as total_users,
          COUNT(DISTINCT market_id) as total_markets,
          SUM(amount) as total_volume,
          SUM(payout_amount) as total_payouts
        FROM oracle.pool_participants
      `);

      const reputationStats = await db.query(`
        SELECT 
          COUNT(*) as total_users,
          AVG(reputation) as avg_reputation,
          MAX(reputation) as max_reputation
        FROM core.users
        WHERE reputation > 0
      `);

      return {
        oddyssey: oddysseyStats.rows[0],
        pools: poolStats.rows[0],
        reputation: reputationStats.rows[0]
      };
    } catch (error) {
      console.error('❌ Error getting platform leaderboard stats:', error.message);
      throw error;
    }
  }

  /**
   * Get guided markets leaderboard
   * @param {string} metric - Sorting metric (ignored, uses real-time query)
   * @param {number} limit - Number of results
   * @param {boolean} useCache - Whether to use cache (ignored - always uses real-time data)
   * @returns {Promise<Array>} Guided markets leaderboard
   */
  async getGuidedMarketsLeaderboard(metric = 'total_staked', limit = 100, useCache = true) {
    // Always use real-time query - no caching
    return this.getGlobalPoolLeaderboard(limit);
  }


  /**
   * Get user rank in leaderboard
   * @param {string} address - User address
   * @param {string} leaderboardType - Type of leaderboard
   * @param {string} metric - Metric for ranking
   * @returns {Promise<Object>} User rank info
   */
  async getUserRank(address, leaderboardType = 'guided_markets', metric = 'total_staked') {
    try {
      const normalizedAddress = address.toLowerCase();
      
      if (leaderboardType === 'reputation') {
        const leaderboard = await this.getReputationLeaderboard(1000);
        const userEntry = leaderboard.find(entry => entry.user_address === normalizedAddress);
        return userEntry || null;
      }
      
      // For guided markets/pools
      const leaderboard = await this.getGlobalPoolLeaderboard(1000);
      const userEntry = leaderboard.find(entry => entry.user_address === normalizedAddress);
      return userEntry || null;
    } catch (error) {
      console.error(`❌ Error getting user rank for ${address}:`, error.message);
      throw error;
    }
  }

  /**
   * Get user stats across all leaderboards
   * @param {string} address - User address
   * @returns {Promise<Object>} User stats
   */
  async getUserStats(address) {
    return this.getUserCombinedStats(address);
  }

  /**
   * Refresh leaderboard cache
   * @param {string} leaderboardType - Type of leaderboard
   * @param {string} metric - Metric to cache
   * @param {number} limit - Number of entries
   * @returns {Promise<Object>} Cache refresh result
   * @deprecated No caching - always uses real-time data. Kept for API compatibility.
   */
  async refreshLeaderboardCache(leaderboardType, metric, limit = 100) {
    // No caching - always query real-time data
    console.log(`⚠️ refreshLeaderboardCache called but caching is disabled - always using real-time queries`);
    return { success: true, leaderboardType, metric, limit, note: 'No caching - always real-time' };
  }

  /**
   * Refresh user stats cache
   * @returns {Promise<Object>} Refresh result
   * @deprecated No caching - always uses real-time data. Kept for API compatibility.
   */
  async refreshUserStats() {
    // No caching - always query real-time data
    console.log('⚠️ refreshUserStats called but caching is disabled - always using real-time queries');
    return { success: true, note: 'No caching - always real-time' };
  }

  /**
   * Get leaderboard metrics summary
   * @returns {Promise<Object>} Leaderboard metrics
   */
  async getLeaderboardMetrics() {
    try {
      const stats = await this.getPlatformLeaderboardStats();
      
      return {
        oddyssey: {
          total_users: parseInt(stats.oddyssey.total_users) || 0,
          total_slips: parseInt(stats.oddyssey.total_slips) || 0,
          average_score: parseFloat(stats.oddyssey.average_score) || 0,
          max_score: parseFloat(stats.oddyssey.max_score) || 0
        },
        pools: {
          total_users: parseInt(stats.pools.total_users) || 0,
          total_markets: parseInt(stats.pools.total_markets) || 0,
          total_volume: parseFloat(stats.pools.total_volume) || 0,
          total_payouts: parseFloat(stats.pools.total_payouts) || 0
        },
        reputation: {
          total_users: parseInt(stats.reputation.total_users) || 0,
          avg_reputation: parseFloat(stats.reputation.avg_reputation) || 0,
          max_reputation: parseInt(stats.reputation.max_reputation) || 0
        }
      };
    } catch (error) {
      console.error('❌ Error getting leaderboard metrics:', error.message);
      throw error;
    }
  }

  /**
   * Refresh all leaderboard caches
   * @deprecated No caching - always uses real-time data. Kept for API compatibility.
   */
  async refreshAllLeaderboards() {
    // No caching - always query real-time data
    console.log('⚠️ refreshAllLeaderboards called but caching is disabled - always using real-time queries');
    return { success: true, note: 'No caching - always real-time' };
  }

  /**
   * Clear cache (no-op since we don't cache)
   * @deprecated No caching implemented
   */
  clearCache() {
    // No caching implemented
    console.log('⚠️ clearCache called but no caching is implemented');
  }

  /**
   * Health check (no-op since we don't cache)
   */
  async healthCheck() {
    return {
      status: 'healthy',
      caching: false,
      note: 'Real-time queries only - no caching'
    };
  }

  /**
   * Get operation metrics (no-op since we don't track performance)
   */
  getOperationMetrics(operation) {
    return null;
  }

  /**
   * Get slowest operations (no-op since we don't track performance)
   */
  getSlowestOperations(limit) {
    return [];
  }

  /**
   * Get recent activity (no-op since we don't track activity)
   */
  getRecentActivity(limit) {
    return [];
  }

  /**
   * Get optimization recommendations (no-op)
   */
  getOptimizationRecommendations() {
    return { recommendations: [] };
  }

  /**
   * Reset performance metrics (no-op)
   */
  resetPerformanceMetrics() {
    // No metrics to reset
  }

  /**
   * Get performance metrics (no-op)
   */
  getPerformanceMetrics() {
    return {
      leaderboard: { totals: { queries: 0, errors: 0, totalTime: 0 } },
      cache: { performance: { hitRate: 'N/A' } }
    };
  }
}

module.exports = new LeaderboardService();
