/**
 * Daily Stats Service
 * Comprehensive daily statistics tracking for platform and user analytics
 * Integrates with existing analytics infrastructure
 */

require('dotenv').config();
const db = require('../db/db');

class DailyStatsService {
  constructor() {
    this.isRunning = false;
    this.batchSize = 100;
  }

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('📊 Daily Stats Service started');
  }

  async stop() {
    this.isRunning = false;
    console.log('🛑 Daily Stats Service stopped');
  }

  /**
   * Calculate and populate daily platform statistics
   */
  async calculateDailyPlatformStats(targetDate = null) {
    try {
      const date = targetDate || new Date().toISOString().split('T')[0];
      console.log(`📊 Calculating daily platform stats for ${date}...`);

      // Get pool statistics
      const poolStats = await db.query(`
        SELECT 
          COUNT(*) as pools_created,
          COUNT(CASE WHEN status = 'settled' THEN 1 END) as pools_settled,
          COUNT(CASE WHEN status = 'active' THEN 1 END) as pools_active,
          COUNT(CASE WHEN oracle_type = 0 THEN 1 END) as guided_pools,
          COUNT(CASE WHEN oracle_type = 1 THEN 1 END) as open_pools,
          COUNT(CASE WHEN category = 'football' THEN 1 END) as football_pools,
          COUNT(CASE WHEN category = 'crypto' THEN 1 END) as crypto_pools
        FROM oracle.pools 
        WHERE DATE(created_at) = $1
      `, [date]);

      // Get volume statistics
      const volumeStats = await db.query(`
        SELECT 
          SUM(CASE WHEN use_bitr = false THEN creator_stake ELSE 0 END) as volume_stt,
          SUM(CASE WHEN use_bitr = true THEN creator_stake ELSE 0 END) as volume_bitr,
          SUM(creator_stake) as total_volume,
          SUM(CASE WHEN oracle_type = 0 THEN creator_stake ELSE 0 END) as guided_volume,
          SUM(CASE WHEN oracle_type = 1 THEN creator_stake ELSE 0 END) as open_volume,
          SUM(CASE WHEN category = 'football' THEN creator_stake ELSE 0 END) as football_volume,
          SUM(CASE WHEN category = 'crypto' THEN creator_stake ELSE 0 END) as crypto_volume
        FROM oracle.pools 
        WHERE DATE(created_at) = $1
      `, [date]);

      // Get betting statistics
      const betStats = await db.query(`
        SELECT 
          COUNT(*) as bets_placed,
          COUNT(CASE WHEN result = 'won' THEN 1 END) as bets_won,
          COUNT(CASE WHEN result = 'lost' THEN 1 END) as bets_lost
        FROM oracle.bets 
        WHERE DATE(created_at) = $1
      `, [date]);

      // Get user statistics
      const userStats = await db.query(`
        SELECT 
          COUNT(DISTINCT creator_address) as active_users,
          COUNT(DISTINCT CASE WHEN DATE(joined_at) = $1 THEN address END) as new_users,
          COUNT(DISTINCT CASE WHEN DATE(last_active) = $1 THEN address END) as returning_users
        FROM (
          SELECT creator_address as address, created_at as joined_at, updated_at as last_active
          FROM oracle.pools 
          WHERE DATE(created_at) = $1
          UNION ALL
          SELECT bettor_address as address, created_at as joined_at, updated_at as last_active
          FROM oracle.bets 
          WHERE DATE(created_at) = $1
        ) user_activity
      `, [date]);

      // Get Oddyssey statistics
      const oddysseyStats = await db.query(`
        SELECT 
          COUNT(*) as oddyssey_slips,
          COUNT(DISTINCT player_address) as oddyssey_players,
          SUM(CASE WHEN prize_claimed = true THEN final_score ELSE 0 END) as oddyssey_prizes_claimed
        FROM oracle.oddyssey_slips 
        WHERE DATE(placed_at) = $1
      `, [date]);

      const poolData = poolStats.rows[0];
      const volumeData = volumeStats.rows[0];
      const betData = betStats.rows[0];
      const userData = userStats.rows[0];
      const oddysseyData = oddysseyStats.rows[0];

      // Calculate win rate
      const winRate = betData.bets_placed > 0 ? 
        (betData.bets_won / betData.bets_placed) * 100 : 0;

      // Insert or update daily platform stats
      await db.query(`
        INSERT INTO analytics.daily_platform_stats (
          date, pools_created, pools_settled, pools_active,
          volume_stt, volume_bitr, total_volume,
          bets_placed, bets_won, bets_lost, win_rate,
          active_users, new_users, returning_users,
          guided_pools, open_pools, guided_volume, open_volume,
          football_pools, crypto_pools, football_volume, crypto_volume,
          oddyssey_slips, oddyssey_players, oddyssey_prizes_claimed
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25
        )
        ON CONFLICT (date) DO UPDATE SET
          pools_created = EXCLUDED.pools_created,
          pools_settled = EXCLUDED.pools_settled,
          pools_active = EXCLUDED.pools_active,
          volume_stt = EXCLUDED.volume_stt,
          volume_bitr = EXCLUDED.volume_bitr,
          total_volume = EXCLUDED.total_volume,
          bets_placed = EXCLUDED.bets_placed,
          bets_won = EXCLUDED.bets_won,
          bets_lost = EXCLUDED.bets_lost,
          win_rate = EXCLUDED.win_rate,
          active_users = EXCLUDED.active_users,
          new_users = EXCLUDED.new_users,
          returning_users = EXCLUDED.returning_users,
          guided_pools = EXCLUDED.guided_pools,
          open_pools = EXCLUDED.open_pools,
          guided_volume = EXCLUDED.guided_volume,
          open_volume = EXCLUDED.open_volume,
          football_pools = EXCLUDED.football_pools,
          crypto_pools = EXCLUDED.crypto_pools,
          football_volume = EXCLUDED.football_volume,
          crypto_volume = EXCLUDED.crypto_volume,
          oddyssey_slips = EXCLUDED.oddyssey_slips,
          oddyssey_players = EXCLUDED.oddyssey_players,
          oddyssey_prizes_claimed = EXCLUDED.oddyssey_prizes_claimed,
          updated_at = NOW()
      `, [
        date,
        poolData.pools_created || 0,
        poolData.pools_settled || 0,
        poolData.pools_active || 0,
        volumeData.volume_stt || 0,
        volumeData.volume_bitr || 0,
        volumeData.total_volume || 0,
        betData.bets_placed || 0,
        betData.bets_won || 0,
        betData.bets_lost || 0,
        winRate,
        userData.active_users || 0,
        userData.new_users || 0,
        userData.returning_users || 0,
        poolData.guided_pools || 0,
        poolData.open_pools || 0,
        volumeData.guided_volume || 0,
        volumeData.open_volume || 0,
        poolData.football_pools || 0,
        poolData.crypto_pools || 0,
        volumeData.football_volume || 0,
        volumeData.crypto_volume || 0,
        oddysseyData.oddyssey_slips || 0,
        oddysseyData.oddyssey_players || 0,
        oddysseyData.oddyssey_prizes_claimed || 0
      ]);

      console.log(`✅ Daily platform stats calculated for ${date}`);
      return { success: true, date, stats: poolData };

    } catch (error) {
      console.error('❌ Error calculating daily platform stats:', error);
      throw error;
    }
  }

  /**
   * Calculate and populate daily user statistics
   */
  async calculateDailyUserStats(targetDate = null) {
    try {
      const date = targetDate || new Date().toISOString().split('T')[0];
      console.log(`👤 Calculating daily user stats for ${date}...`);

      // Get all active users for the date
      const activeUsers = await db.query(`
        SELECT DISTINCT user_address
        FROM (
          SELECT creator_address as user_address FROM oracle.pools WHERE DATE(created_at) = $1
          UNION
          SELECT bettor_address as user_address FROM oracle.bets WHERE DATE(created_at) = $1
          UNION
          SELECT player_address as user_address FROM oracle.oddyssey_slips WHERE DATE(placed_at) = $1
        ) users
      `, [date]);

      for (const user of activeUsers.rows) {
        const userAddress = user.user_address;

        // Get user pool statistics
        const userPoolStats = await db.query(`
          SELECT 
            COUNT(*) as pools_created,
            COUNT(CASE WHEN status = 'settled' AND creator_side_won = true THEN 1 END) as pools_won,
            COUNT(CASE WHEN status = 'settled' AND creator_side_won = false THEN 1 END) as pools_lost,
            COUNT(CASE WHEN oracle_type = 0 THEN 1 END) as guided_pools_created,
            COUNT(CASE WHEN oracle_type = 1 THEN 1 END) as open_pools_created,
            SUM(creator_stake) as total_volume,
            SUM(CASE WHEN use_bitr = false THEN creator_stake ELSE 0 END) as volume_stt,
            SUM(CASE WHEN use_bitr = true THEN creator_stake ELSE 0 END) as volume_bitr
          FROM oracle.pools 
          WHERE creator_address = $1 AND DATE(created_at) = $2
        `, [userAddress, date]);

        // Get user betting statistics
        const userBetStats = await db.query(`
          SELECT 
            COUNT(*) as bets_placed,
            COUNT(CASE WHEN result = 'won' THEN 1 END) as bets_won,
            COUNT(CASE WHEN result = 'lost' THEN 1 END) as bets_lost,
            COUNT(CASE WHEN pool_id IN (SELECT pool_id FROM oracle.pools WHERE oracle_type = 0) THEN 1 END) as guided_bets,
            COUNT(CASE WHEN pool_id IN (SELECT pool_id FROM oracle.pools WHERE oracle_type = 1) THEN 1 END) as open_bets,
            SUM(amount) as bet_volume,
            SUM(CASE WHEN result = 'won' THEN amount * odds / 100 ELSE -amount END) as net_profit
          FROM oracle.bets 
          WHERE bettor_address = $1 AND DATE(created_at) = $2
        `, [userAddress, date]);

        // Get user Oddyssey statistics
        const userOddysseyStats = await db.query(`
          SELECT 
            COUNT(*) as oddyssey_slips,
            COUNT(CASE WHEN final_score > 0 THEN 1 END) as oddyssey_wins,
            SUM(CASE WHEN prize_claimed = true THEN final_score ELSE 0 END) as oddyssey_prizes
          FROM oracle.oddyssey_slips 
          WHERE player_address = $1 AND DATE(placed_at) = $2
        `, [userAddress, date]);

        const poolData = userPoolStats.rows[0];
        const betData = userBetStats.rows[0];
        const oddysseyData = userOddysseyStats.rows[0];

        // Calculate win rates
        const poolWinRate = poolData.pools_created > 0 ? 
          (poolData.pools_won / poolData.pools_created) * 100 : 0;
        const betWinRate = betData.bets_placed > 0 ? 
          (betData.bets_won / betData.bets_placed) * 100 : 0;

        // Insert or update daily user stats
        await db.query(`
          INSERT INTO analytics.daily_user_stats (
            date, user_address, pools_created, pools_won, pools_lost, pool_win_rate,
            bets_placed, bets_won, bets_lost, bet_win_rate,
            volume_stt, volume_bitr, total_volume, net_profit,
            guided_pools_created, open_pools_created, guided_bets, open_bets,
            oddyssey_slips, oddyssey_wins, oddyssey_prizes
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
          )
          ON CONFLICT (date, user_address) DO UPDATE SET
            pools_created = EXCLUDED.pools_created,
            pools_won = EXCLUDED.pools_won,
            pools_lost = EXCLUDED.pools_lost,
            pool_win_rate = EXCLUDED.pool_win_rate,
            bets_placed = EXCLUDED.bets_placed,
            bets_won = EXCLUDED.bets_won,
            bets_lost = EXCLUDED.bets_lost,
            bet_win_rate = EXCLUDED.bet_win_rate,
            volume_stt = EXCLUDED.volume_stt,
            volume_bitr = EXCLUDED.volume_bitr,
            total_volume = EXCLUDED.total_volume,
            net_profit = EXCLUDED.net_profit,
            guided_pools_created = EXCLUDED.guided_pools_created,
            open_pools_created = EXCLUDED.open_pools_created,
            guided_bets = EXCLUDED.guided_bets,
            open_bets = EXCLUDED.open_bets,
            oddyssey_slips = EXCLUDED.oddyssey_slips,
            oddyssey_wins = EXCLUDED.oddyssey_wins,
            oddyssey_prizes = EXCLUDED.oddyssey_prizes,
            updated_at = NOW()
        `, [
          date, userAddress,
          poolData.pools_created || 0,
          poolData.pools_won || 0,
          poolData.pools_lost || 0,
          poolWinRate,
          betData.bets_placed || 0,
          betData.bets_won || 0,
          betData.bets_lost || 0,
          betWinRate,
          poolData.volume_stt || 0,
          poolData.volume_bitr || 0,
          poolData.total_volume || 0,
          betData.net_profit || 0,
          poolData.guided_pools_created || 0,
          poolData.open_pools_created || 0,
          betData.guided_bets || 0,
          betData.open_bets || 0,
          oddysseyData.oddyssey_slips || 0,
          oddysseyData.oddyssey_wins || 0,
          oddysseyData.oddyssey_prizes || 0
        ]);
      }

      console.log(`✅ Daily user stats calculated for ${date} (${activeUsers.rows.length} users)`);
      return { success: true, date, usersProcessed: activeUsers.rows.length };

    } catch (error) {
      console.error('❌ Error calculating daily user stats:', error);
      throw error;
    }
  }

  /**
   * Calculate and populate daily category statistics
   */
  async calculateDailyCategoryStats(targetDate = null) {
    try {
      const date = targetDate || new Date().toISOString().split('T')[0];
      console.log(`📂 Calculating daily category stats for ${date}...`);

      // Get categories
      const categories = await db.query(`
        SELECT DISTINCT category 
        FROM oracle.pools 
        WHERE DATE(created_at) = $1 AND category IS NOT NULL
      `, [date]);

      for (const category of categories.rows) {
        const categoryName = category.category;

        // Get category statistics
        const categoryStats = await db.query(`
          SELECT 
            COUNT(*) as pools_created,
            COUNT(CASE WHEN status = 'settled' AND creator_side_won = true THEN 1 END) as pools_won,
            COUNT(CASE WHEN status = 'settled' AND creator_side_won = false THEN 1 END) as pools_lost,
            SUM(creator_stake) as total_volume,
            SUM(CASE WHEN use_bitr = false THEN creator_stake ELSE 0 END) as volume_stt,
            SUM(CASE WHEN use_bitr = true THEN creator_stake ELSE 0 END) as volume_bitr,
            AVG(creator_stake) as avg_pool_size,
            AVG(odds) as avg_odds,
            COUNT(DISTINCT creator_address) as unique_users
          FROM oracle.pools 
          WHERE category = $1 AND DATE(created_at) = $2
        `, [categoryName, date]);

        // Get category betting statistics
        const categoryBetStats = await db.query(`
          SELECT 
            COUNT(*) as bets_placed,
            COUNT(CASE WHEN result = 'won' THEN 1 END) as bets_won,
            COUNT(CASE WHEN result = 'lost' THEN 1 END) as bets_lost,
            AVG(amount) as avg_bet_size,
            COUNT(DISTINCT bettor_address) as active_users
          FROM oracle.bets pb
          JOIN oracle.pools p ON pb.pool_id = p.pool_id
          WHERE p.category = $1 AND DATE(pb.created_at) = $2
        `, [categoryName, date]);

        const poolData = categoryStats.rows[0];
        const betData = categoryBetStats.rows[0];

        // Calculate win rates
        const poolWinRate = poolData.pools_created > 0 ? 
          (poolData.pools_won / poolData.pools_created) * 100 : 0;
        const betWinRate = betData.bets_placed > 0 ? 
          (betData.bets_won / betData.bets_placed) * 100 : 0;

        // Insert or update daily category stats
        await db.query(`
          INSERT INTO analytics.daily_category_stats (
            date, category, pools_created, pools_won, pools_lost, win_rate,
            volume_stt, volume_bitr, total_volume,
            bets_placed, bets_won, bets_lost, bet_win_rate,
            unique_users, active_users, avg_pool_size, avg_bet_size, avg_odds
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
          )
          ON CONFLICT (date, category) DO UPDATE SET
            pools_created = EXCLUDED.pools_created,
            pools_won = EXCLUDED.pools_won,
            pools_lost = EXCLUDED.pools_lost,
            win_rate = EXCLUDED.win_rate,
            volume_stt = EXCLUDED.volume_stt,
            volume_bitr = EXCLUDED.volume_bitr,
            total_volume = EXCLUDED.total_volume,
            bets_placed = EXCLUDED.bets_placed,
            bets_won = EXCLUDED.bets_won,
            bets_lost = EXCLUDED.bets_lost,
            bet_win_rate = EXCLUDED.bet_win_rate,
            unique_users = EXCLUDED.unique_users,
            active_users = EXCLUDED.active_users,
            avg_pool_size = EXCLUDED.avg_pool_size,
            avg_bet_size = EXCLUDED.avg_bet_size,
            avg_odds = EXCLUDED.avg_odds,
            updated_at = NOW()
        `, [
          date, categoryName,
          poolData.pools_created || 0,
          poolData.pools_won || 0,
          poolData.pools_lost || 0,
          poolWinRate,
          poolData.volume_stt || 0,
          poolData.volume_bitr || 0,
          poolData.total_volume || 0,
          betData.bets_placed || 0,
          betData.bets_won || 0,
          betData.bets_lost || 0,
          betWinRate,
          poolData.unique_users || 0,
          betData.active_users || 0,
          poolData.avg_pool_size || 0,
          betData.avg_bet_size || 0,
          poolData.avg_odds || 0
        ]);
      }

      console.log(`✅ Daily category stats calculated for ${date} (${categories.rows.length} categories)`);
      return { success: true, date, categoriesProcessed: categories.rows.length };

    } catch (error) {
      console.error('❌ Error calculating daily category stats:', error);
      throw error;
    }
  }

  /**
   * Calculate and populate daily oracle statistics
   */
  async calculateDailyOracleStats(targetDate = null) {
    try {
      const date = targetDate || new Date().toISOString().split('T')[0];
      console.log(`🔮 Calculating daily oracle stats for ${date}...`);

      const oracleTypes = [
        { type: 'GUIDED', value: 0 },
        { type: 'OPEN', value: 1 }
      ];

      for (const oracle of oracleTypes) {
        // Get oracle statistics
        const oracleStats = await db.query(`
          SELECT 
            COUNT(*) as pools_created,
            COUNT(CASE WHEN status = 'settled' AND creator_side_won = true THEN 1 END) as pools_won,
            COUNT(CASE WHEN status = 'settled' AND creator_side_won = false THEN 1 END) as pools_lost,
            SUM(creator_stake) as total_volume,
            SUM(CASE WHEN use_bitr = false THEN creator_stake ELSE 0 END) as volume_stt,
            SUM(CASE WHEN use_bitr = true THEN creator_stake ELSE 0 END) as volume_bitr,
            AVG(creator_stake) as avg_pool_size,
            AVG(odds) as avg_odds,
            COUNT(DISTINCT creator_address) as unique_users,
            AVG(EXTRACT(EPOCH FROM (settled_at - created_at)) / 3600) as avg_settlement_time_hours
          FROM oracle.pools 
          WHERE oracle_type = $1 AND DATE(created_at) = $2
        `, [oracle.value, date]);

        // Get oracle betting statistics
        const oracleBetStats = await db.query(`
          SELECT 
            COUNT(*) as bets_placed,
            COUNT(CASE WHEN result = 'won' THEN 1 END) as bets_won,
            COUNT(CASE WHEN result = 'lost' THEN 1 END) as bets_lost,
            AVG(amount) as avg_bet_size,
            COUNT(DISTINCT bettor_address) as active_users
          FROM oracle.bets pb
          JOIN oracle.pools p ON pb.pool_id = p.pool_id
          WHERE p.oracle_type = $1 AND DATE(pb.created_at) = $2
        `, [oracle.value, date]);

        const poolData = oracleStats.rows[0];
        const betData = oracleBetStats.rows[0];

        // Calculate win rates
        const poolWinRate = poolData.pools_created > 0 ? 
          (poolData.pools_won / poolData.pools_created) * 100 : 0;
        const betWinRate = betData.bets_placed > 0 ? 
          (betData.bets_won / betData.bets_placed) * 100 : 0;

        // Insert or update daily oracle stats
        await db.query(`
          INSERT INTO analytics.daily_oracle_stats (
            date, oracle_type, pools_created, pools_won, pools_lost, win_rate,
            volume_stt, volume_bitr, total_volume,
            bets_placed, bets_won, bets_lost, bet_win_rate,
            unique_users, active_users, avg_pool_size, avg_bet_size, avg_odds,
            avg_settlement_time_hours
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
          )
          ON CONFLICT (date, oracle_type) DO UPDATE SET
            pools_created = EXCLUDED.pools_created,
            pools_won = EXCLUDED.pools_won,
            pools_lost = EXCLUDED.pools_lost,
            win_rate = EXCLUDED.win_rate,
            volume_stt = EXCLUDED.volume_stt,
            volume_bitr = EXCLUDED.volume_bitr,
            total_volume = EXCLUDED.total_volume,
            bets_placed = EXCLUDED.bets_placed,
            bets_won = EXCLUDED.bets_won,
            bets_lost = EXCLUDED.bets_lost,
            bet_win_rate = EXCLUDED.bet_win_rate,
            unique_users = EXCLUDED.unique_users,
            active_users = EXCLUDED.active_users,
            avg_pool_size = EXCLUDED.avg_pool_size,
            avg_bet_size = EXCLUDED.avg_bet_size,
            avg_odds = EXCLUDED.avg_odds,
            avg_settlement_time_hours = EXCLUDED.avg_settlement_time_hours,
            updated_at = NOW()
        `, [
          date, oracle.type,
          poolData.pools_created || 0,
          poolData.pools_won || 0,
          poolData.pools_lost || 0,
          poolWinRate,
          poolData.volume_stt || 0,
          poolData.volume_bitr || 0,
          poolData.total_volume || 0,
          betData.bets_placed || 0,
          betData.bets_won || 0,
          betData.bets_lost || 0,
          betWinRate,
          poolData.unique_users || 0,
          betData.active_users || 0,
          poolData.avg_pool_size || 0,
          betData.avg_bet_size || 0,
          poolData.avg_odds || 0,
          poolData.avg_settlement_time_hours || 0
        ]);
      }

      console.log(`✅ Daily oracle stats calculated for ${date}`);
      return { success: true, date };

    } catch (error) {
      console.error('❌ Error calculating daily oracle stats:', error);
      throw error;
    }
  }

  /**
   * Calculate all daily statistics for a given date
   */
  async calculateAllDailyStats(targetDate = null) {
    try {
      console.log('📊 Calculating all daily statistics...');
      
      await this.calculateDailyPlatformStats(targetDate);
      await this.calculateDailyUserStats(targetDate);
      await this.calculateDailyCategoryStats(targetDate);
      await this.calculateDailyOracleStats(targetDate);
      
      console.log('✅ All daily statistics calculated successfully');
      return { success: true };

    } catch (error) {
      console.error('❌ Error calculating all daily stats:', error);
      throw error;
    }
  }

  /**
   * Get daily platform stats for a date range
   */
  async getDailyPlatformStats(startDate, endDate = null) {
    try {
      const end = endDate || new Date().toISOString().split('T')[0];
      
      const result = await db.query(`
        SELECT * FROM analytics.get_daily_platform_stats($1, $2)
      `, [startDate, end]);

      return { success: true, data: result.rows };

    } catch (error) {
      console.error('❌ Error fetching daily platform stats:', error);
      throw error;
    }
  }

  /**
   * Get daily user stats for a specific user
   */
  async getDailyUserStats(userAddress, startDate, endDate = null) {
    try {
      const end = endDate || new Date().toISOString().split('T')[0];
      
      const result = await db.query(`
        SELECT * FROM analytics.get_daily_user_stats($1, $2, $3)
      `, [userAddress, startDate, end]);

      return { success: true, data: result.rows };

    } catch (error) {
      console.error('❌ Error fetching daily user stats:', error);
      throw error;
    }
  }

  /**
   * Get category performance for a date range
   */
  async getCategoryPerformance(startDate, endDate = null) {
    try {
      const end = endDate || new Date().toISOString().split('T')[0];
      
      const result = await db.query(`
        SELECT * FROM analytics.get_category_performance($1, $2)
      `, [startDate, end]);

      return { success: true, data: result.rows };

    } catch (error) {
      console.error('❌ Error fetching category performance:', error);
      throw error;
    }
  }

  /**
   * Get oracle performance comparison
   */
  async getOraclePerformance(startDate, endDate = null) {
    try {
      const end = endDate || new Date().toISOString().split('T')[0];
      
      const result = await db.query(`
        SELECT * FROM analytics.get_oracle_performance($1, $2)
      `, [startDate, end]);

      return { success: true, data: result.rows };

    } catch (error) {
      console.error('❌ Error fetching oracle performance:', error);
      throw error;
    }
  }
}

module.exports = DailyStatsService;
