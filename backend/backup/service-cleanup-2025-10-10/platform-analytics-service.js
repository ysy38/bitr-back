/**
 * Platform Analytics Service
 * 
 * Transforms raw database data into meaningful statistics and insights
 */

const db = require('../db/db.js');

class PlatformAnalyticsService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get comprehensive platform statistics
   */
  async getPlatformStats() {
    try {
      const cacheKey = 'platform_stats';
      const cached = this.getCached(cacheKey);
      if (cached) return cached;

      const [
        oddysseyStats,
        poolStats,
        userStats,
        financialStats,
        activityStats
      ] = await Promise.all([
        this.getOddysseyStats(),
        this.getPoolStats(),
        this.getUserStats(),
        this.getFinancialStats(),
        this.getActivityStats()
      ]);

      const stats = {
        oddyssey: oddysseyStats,
        pools: poolStats,
        users: userStats,
        financial: financialStats,
        activity: activityStats,
        timestamp: new Date().toISOString()
      };

      this.setCached(cacheKey, stats);
      return stats;

    } catch (error) {
      console.error('❌ Error getting platform stats:', error);
      throw error;
    }
  }

  /**
   * Get Oddyssey-specific statistics
   */
  async getOddysseyStats() {
    try {
      const result = await db.query(`
        SELECT 
          COUNT(*) as total_cycles,
          COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved_cycles,
          COUNT(CASE WHEN status = 'active' THEN 1 END) as active_cycles,
                  AVG(prize_pool) as avg_prize_pool,
        SUM(prize_pool) as total_prize_pools,
        MAX(prize_pool) as max_prize_pool
        FROM oracle.oddyssey_cycles
      `);

      const slipStats = await db.query(`
        SELECT 
          COUNT(*) as total_slips,
          COUNT(CASE WHEN is_evaluated = true THEN 1 END) as evaluated_slips,
          COUNT(DISTINCT player_address) as unique_players,
          AVG(final_score) as avg_score,
          MAX(final_score) as max_score,
          COUNT(CASE WHEN final_score = 10 THEN 1 END) as perfect_scores
        FROM oracle.oddyssey_slips
      `);

      const leaderboardStats = await db.query(`
        SELECT 
          COUNT(DISTINCT player_address) as total_players,
          AVG(leaderboard_rank) as avg_rank,
          COUNT(CASE WHEN leaderboard_rank = 1 THEN 1 END) as winners
        FROM oracle.oddyssey_slips
        WHERE is_evaluated = true
      `);

      return {
        cycles: result.rows[0],
        slips: slipStats.rows[0],
        leaderboard: leaderboardStats.rows[0]
      };

    } catch (error) {
      console.error('❌ Error getting Oddyssey stats:', error);
      throw error;
    }
  }

  /**
   * Get pool-specific statistics
   */
  async getPoolStats() {
    try {
      const result = await db.query(`
        SELECT 
          COUNT(*) as total_pools,
          COUNT(CASE WHEN status = 'active' THEN 1 END) as active_pools,
          COUNT(CASE WHEN status = 'settled' THEN 1 END) as settled_pools,
          SUM(creator_stake) as total_stake,
          AVG(creator_stake) as avg_stake,
          COUNT(DISTINCT creator_address) as unique_creators
        FROM oracle.pools
      `);

      const betStats = await db.query(`
        SELECT 
          COUNT(*) as total_bets,
          SUM(amount) as total_bet_amount,
          COUNT(DISTINCT bettor_address) as unique_bettors,
          AVG(amount) as avg_bet_amount,
          MAX(amount) as max_bet_amount
        FROM oracle.bets
      `);

      return {
        pools: result.rows[0],
        bets: betStats.rows[0]
      };

    } catch (error) {
      console.error('❌ Error getting pool stats:', error);
      throw error;
    }
  }

  /**
   * Get user statistics
   */
  async getUserStats() {
    try {
      const result = await db.query(`
        SELECT 
          COUNT(DISTINCT player_address) as total_oddyssey_users,
          COUNT(DISTINCT bettor_address) as total_pool_users,
          COUNT(DISTINCT creator_address) as total_pool_creators
        FROM (
          SELECT player_address FROM oracle.oddyssey_slips
          UNION
          SELECT bettor_address FROM oracle.bets
          UNION
          SELECT creator_address FROM oracle.pools
        ) all_users
      `);

      const activeUsers = await db.query(`
        SELECT 
          COUNT(DISTINCT player_address) as active_oddyssey_users
        FROM oracle.oddyssey_slips
        WHERE placed_at >= NOW() - INTERVAL '7 days'
      `);

      return {
        total: result.rows[0],
        active: activeUsers.rows[0]
      };

    } catch (error) {
      console.error('❌ Error getting user stats:', error);
      throw error;
    }
  }

  /**
   * Get financial statistics
   */
  async getFinancialStats() {
    try {
      const result = await db.query(`
        SELECT 
                  SUM(prize_pool) as total_oddyssey_prizes,
        SUM(creator_stake) as total_pool_stakes,
        SUM(amount) as total_bet_amount
      FROM (
        SELECT prize_pool, 0 as creator_stake, 0 as amount FROM oracle.oddyssey_cycles
        UNION ALL
        SELECT 0, creator_stake, 0 FROM oracle.pools
        UNION ALL
        SELECT 0, 0, amount FROM oracle.pool_bets
      ) financial_data
      `);

      return result.rows[0];

    } catch (error) {
      console.error('❌ Error getting financial stats:', error);
      throw error;
    }
  }

  /**
   * Get activity statistics
   */
  async getActivityStats() {
    try {
      const dailyActivity = await db.query(`
        SELECT 
          DATE(placed_at) as date,
          COUNT(*) as slips_placed,
          COUNT(DISTINCT player_address) as active_players
        FROM oracle.oddyssey_slips
        WHERE placed_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(placed_at)
        ORDER BY date DESC
        LIMIT 30
      `);

      const hourlyActivity = await db.query(`
        SELECT 
          EXTRACT(HOUR FROM placed_at) as hour,
          COUNT(*) as slips_placed
        FROM oracle.oddyssey_slips
        WHERE placed_at >= NOW() - INTERVAL '7 days'
        GROUP BY EXTRACT(HOUR FROM placed_at)
        ORDER BY hour
      `);

      return {
        daily: dailyActivity.rows,
        hourly: hourlyActivity.rows
      };

    } catch (error) {
      console.error('❌ Error getting activity stats:', error);
      throw error;
    }
  }

  /**
   * Get user performance analytics
   */
  async getUserPerformance(userAddress) {
    try {
      const oddysseyStats = await db.query(`
        SELECT 
          COUNT(*) as total_slips,
          AVG(final_score) as avg_score,
          MAX(final_score) as best_score,
          COUNT(CASE WHEN final_score = 10 THEN 1 END) as perfect_scores,
          COUNT(CASE WHEN leaderboard_rank = 1 THEN 1 END) as wins,
          AVG(leaderboard_rank) as avg_rank
        FROM oracle.oddyssey_slips
        WHERE player_address = $1 AND is_evaluated = true
      `, [userAddress]);

      const poolStats = await db.query(`
        SELECT 
          COUNT(*) as total_bets,
          SUM(amount) as total_bet_amount,
          AVG(amount) as avg_bet_amount,
          COUNT(DISTINCT pool_id) as pools_participated
        FROM oracle.bets
        WHERE bettor_address = $1
      `, [userAddress]);

      const createdPools = await db.query(`
        SELECT 
          COUNT(*) as pools_created,
          SUM(creator_stake) as total_stake,
          COUNT(CASE WHEN status = 'settled' THEN 1 END) as settled_pools
        FROM oracle.pools
        WHERE creator_address = $1
      `, [userAddress]);

      return {
        oddyssey: oddysseyStats.rows[0],
        pools: poolStats.rows[0],
        created: createdPools.rows[0]
      };

    } catch (error) {
      console.error('❌ Error getting user performance:', error);
      throw error;
    }
  }

  /**
   * Get cycle performance analytics
   */
  async getCyclePerformance(cycleId) {
    try {
      const cycleStats = await db.query(`
        SELECT 
          cycle_id,
          is_resolved as status,
          prize_pool,
          created_at,
          resolved_at
        FROM oracle.oddyssey_cycles
        WHERE cycle_id = $1
      `, [cycleId]);

      const slipStats = await db.query(`
        SELECT 
          COUNT(*) as total_slips,
          COUNT(CASE WHEN is_evaluated = true THEN 1 END) as evaluated_slips,
          COUNT(DISTINCT player_address) as unique_players,
          AVG(final_score) as avg_score,
          MAX(final_score) as max_score,
          COUNT(CASE WHEN final_score = 10 THEN 1 END) as perfect_scores
        FROM oracle.oddyssey_slips
        WHERE cycle_id = $1
      `, [cycleId]);

      const leaderboard = await db.query(`
        SELECT 
          player_address,
          final_score as score,
          leaderboard_rank,
          placed_at
        FROM oracle.oddyssey_slips
        WHERE cycle_id = $1 AND is_evaluated = true
        ORDER BY leaderboard_rank ASC
        LIMIT 10
      `, [cycleId]);

      return {
        cycle: cycleStats.rows[0],
        slips: slipStats.rows[0],
        leaderboard: leaderboard.rows
      };

    } catch (error) {
      console.error('❌ Error getting cycle performance:', error);
      throw error;
    }
  }

  /**
   * Get trending statistics
   */
  async getTrendingStats() {
    try {
      const topPlayers = await db.query(`
        SELECT 
          player_address,
          COUNT(*) as total_slips,
          AVG(final_score) as avg_score,
          COUNT(CASE WHEN final_score = 10 THEN 1 END) as perfect_scores,
          COUNT(CASE WHEN leaderboard_rank = 1 THEN 1 END) as wins
        FROM oracle.oddyssey_slips
        WHERE is_evaluated = true
        GROUP BY player_address
        HAVING COUNT(*) >= 5
        ORDER BY avg_score DESC, wins DESC
        LIMIT 10
      `);

      const topPools = await db.query(`
        SELECT 
          pool_id,
          creator_address,
          predicted_outcome,
          creator_stake,
          COUNT(pb.pool_id) as total_bets,
          SUM(pb.amount) as total_bet_amount
        FROM oracle.pools p
        LEFT JOIN oracle.bets pb ON p.pool_id = pb.pool_id
        WHERE p.pool_id IS NOT NULL
        GROUP BY p.pool_id, p.creator_address, p.predicted_outcome, p.creator_stake
        ORDER BY total_bet_amount DESC
        LIMIT 10
      `);

      return {
        topPlayers: topPlayers.rows,
        topPools: topPools.rows
      };

    } catch (error) {
      console.error('❌ Error getting trending stats:', error);
      throw error;
    }
  }

  /**
   * Get prediction accuracy analytics
   */
  async getPredictionAccuracy() {
    try {
      const result = await db.query(`
        SELECT 
          COUNT(*) as total_predictions,
          COUNT(CASE WHEN is_correct = true THEN 1 END) as correct_predictions,
          ROUND(
            (COUNT(CASE WHEN is_correct = true THEN 1 END)::DECIMAL / COUNT(*)) * 100, 2
          ) as accuracy_percentage
        FROM (
          SELECT 
            CASE 
              WHEN prediction_type = 'moneyline' AND prediction_value = result_moneyline THEN true
              WHEN prediction_type = 'overunder' AND prediction_value = result_overunder THEN true
              ELSE false
            END as is_correct
          FROM oracle.oddyssey_slips os
          JOIN oracle.oddyssey_cycles oc ON os.cycle_id = oc.cycle_id
          WHERE os.is_evaluated = true AND oc.status = 'resolved'
        ) predictions
      `);

      return result.rows[0];

    } catch (error) {
      console.error('❌ Error getting prediction accuracy:', error);
      throw error;
    }
  }

  /**
   * Cache management
   */
  getCached(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    return null;
  }

  setCached(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  clearCache() {
    this.cache.clear();
  }
}

module.exports = PlatformAnalyticsService;
