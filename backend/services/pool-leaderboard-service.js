/**
 * Pool Leaderboard Service
 * Handles pool-specific leaderboards: creators, challengers (bettors), and reputation
 */

const db = require('../db/db');

class PoolLeaderboardService {
  /**
   * Get Creators Leaderboard
   * Shows users who created pools with stats: pools created, volume, wins, losses, PnL
   * @param {string} sortBy - Column to sort by (pools_created, volume, wins, losses, pnl)
   * @param {string} sortOrder - 'asc' or 'desc'
   * @param {number} limit - Number of results
   * @param {number} offset - Offset for pagination
   * @returns {Promise<Array>} Creators leaderboard entries
   */
  async getCreatorsLeaderboard(sortBy = 'volume', sortOrder = 'desc', limit = 100, offset = 0) {
    try {
      // Validate sortBy
      const validSortColumns = ['pools_created', 'volume', 'wins', 'losses', 'pnl'];
      if (!validSortColumns.includes(sortBy)) {
        sortBy = 'volume';
      }

      // Validate sortOrder
      const order = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

      // Map sortBy to SQL column
      const sortColumnMap = {
        'pools_created': 'pools_created',
        'volume': 'total_volume',
        'wins': 'wins',
        'losses': 'losses',
        'pnl': 'pnl'
      };

      const sortColumn = sortColumnMap[sortBy];

      const query = `
        WITH creator_stats AS (
          SELECT 
            p.creator_address as address,
            COUNT(DISTINCT p.pool_id) as pools_created,
            COALESCE(SUM(
              COALESCE(p.total_creator_side_stake, p.creator_stake, 0) + 
              COALESCE(p.total_bettor_stake, 0)
            ), 0) as total_volume,
            COUNT(DISTINCT CASE 
              WHEN p.is_settled = true AND p.creator_side_won = true 
              THEN p.pool_id 
            END) as wins,
            COUNT(DISTINCT CASE 
              WHEN p.is_settled = true AND p.creator_side_won = false 
              THEN p.pool_id 
            END) as losses,
            -- Calculate PnL: creator wins = bettor_stake they won, creator loses = creator_stake they lost
            COALESCE(SUM(
              CASE 
                WHEN p.is_settled = true AND p.creator_side_won = true 
                THEN COALESCE(p.total_bettor_stake, 0)
                WHEN p.is_settled = true AND p.creator_side_won = false 
                THEN -COALESCE(p.total_creator_side_stake, p.creator_stake, 0)
                ELSE 0
              END
            ), 0) as pnl
          FROM oracle.pools p
          WHERE p.status != 'deleted' OR p.status IS NULL
          GROUP BY p.creator_address
        )
        SELECT 
          cs.*,
          COALESCE(u.reputation, 40) as reputation,
          COALESCE(u.total_pools_created, 0) as user_total_pools_created
        FROM creator_stats cs
        LEFT JOIN core.users u ON LOWER(cs.address) = LOWER(u.address)
        WHERE cs.pools_created > 0
        ORDER BY cs.${sortColumn} ${order}, cs.pools_created DESC
        LIMIT $1 OFFSET $2
      `;

      const result = await db.query(query, [limit, offset]);

      // Get total count for pagination
      const countResult = await db.query(`
        SELECT COUNT(DISTINCT creator_address) as total
        FROM oracle.pools
        WHERE (status != 'deleted' OR status IS NULL)
      `);

      return {
        data: result.rows.map((row, index) => ({
          rank: offset + index + 1,
          address: row.address.toLowerCase(),
          poolsCreated: parseInt(row.pools_created) || 0,
          volume: parseFloat(row.total_volume) / 1e18 || 0,
          wins: parseInt(row.wins) || 0,
          losses: parseInt(row.losses) || 0,
          pnl: parseFloat(row.pnl) / 1e18 || 0,
          reputation: parseInt(row.reputation) || 40
        })),
        pagination: {
          total: parseInt(countResult.rows[0]?.total || 0),
          limit,
          offset,
          hasMore: result.rows.length === limit
        }
      };
    } catch (error) {
      console.error('❌ Error getting creators leaderboard:', error);
      throw error;
    }
  }

  /**
   * Get Challengers (Bettors) Leaderboard
   * Shows users who bet on pools with stats: pools challenged, volume, wins, losses, PnL
   * @param {string} sortBy - Column to sort by (pools_challenged, volume, wins, losses, pnl)
   * @param {string} sortOrder - 'asc' or 'desc'
   * @param {number} limit - Number of results
   * @param {number} offset - Offset for pagination
   * @returns {Promise<Array>} Challengers leaderboard entries
   */
  async getChallengersLeaderboard(sortBy = 'volume', sortOrder = 'desc', limit = 100, offset = 0) {
    try {
      // Validate sortBy
      const validSortColumns = ['pools_challenged', 'volume', 'wins', 'losses', 'pnl'];
      if (!validSortColumns.includes(sortBy)) {
        sortBy = 'volume';
      }

      // Validate sortOrder
      const order = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

      // Map sortBy to SQL column
      const sortColumnMap = {
        'pools_challenged': 'pools_challenged',
        'volume': 'total_volume',
        'wins': 'wins',
        'losses': 'losses',
        'pnl': 'pnl'
      };

      const sortColumn = sortColumnMap[sortBy];

      const query = `
        WITH bettor_stats AS (
          SELECT 
            b.bettor_address as address,
            COUNT(DISTINCT b.pool_id) as pools_challenged,
            COALESCE(SUM(b.amount::numeric), 0) as total_volume,
            COUNT(DISTINCT CASE 
              WHEN p.is_settled = true 
              AND p.creator_side_won = false 
              AND b.is_for_outcome = true
              THEN b.pool_id 
            END) as wins,
            COUNT(DISTINCT CASE 
              WHEN p.is_settled = true 
              AND p.creator_side_won = true 
              AND b.is_for_outcome = true
              THEN b.pool_id 
            END) as losses,
            -- Calculate PnL: bettor wins = potential winnings - stake, bettor loses = -stake
            -- Win: (amount * (odds - 100) / 100) - amount = amount * (odds - 200) / 100
            -- Loss: -amount
            COALESCE(SUM(
              CASE 
                WHEN p.is_settled = true AND p.creator_side_won = false AND b.is_for_outcome = true
                THEN (b.amount::numeric * (p.odds - 200) / 100)
                WHEN p.is_settled = true AND p.creator_side_won = true AND b.is_for_outcome = true
                THEN -b.amount::numeric
                ELSE 0
              END
            ), 0) as pnl
          FROM oracle.bets b
          INNER JOIN oracle.pools p ON b.pool_id::text = p.pool_id::text
          WHERE b.is_for_outcome = true
          AND (p.status != 'deleted' OR p.status IS NULL)
          GROUP BY b.bettor_address
        )
        SELECT 
          bs.*,
          COALESCE(u.reputation, 40) as reputation,
          COALESCE(u.total_bets, 0) as user_total_bets
        FROM bettor_stats bs
        LEFT JOIN core.users u ON LOWER(bs.address) = LOWER(u.address)
        WHERE bs.pools_challenged > 0
        ORDER BY bs.${sortColumn} ${order}, bs.pools_challenged DESC
        LIMIT $1 OFFSET $2
      `;

      const result = await db.query(query, [limit, offset]);

      // Get total count for pagination
      const countResult = await db.query(`
        SELECT COUNT(DISTINCT bettor_address) as total
        FROM oracle.bets
        WHERE is_for_outcome = true
      `);

      return {
        data: result.rows.map((row, index) => ({
          rank: offset + index + 1,
          address: row.address.toLowerCase(),
          poolsChallenged: parseInt(row.pools_challenged) || 0,
          volume: parseFloat(row.total_volume) / 1e18 || 0,
          wins: parseInt(row.wins) || 0,
          losses: parseInt(row.losses) || 0,
          pnl: parseFloat(row.pnl) / 1e18 || 0,
          reputation: parseInt(row.reputation) || 40
        })),
        pagination: {
          total: parseInt(countResult.rows[0]?.total || 0),
          limit,
          offset,
          hasMore: result.rows.length === limit
        }
      };
    } catch (error) {
      console.error('❌ Error getting challengers leaderboard:', error);
      throw error;
    }
  }

  /**
   * Get Reputation Leaderboard
   * Shows users ranked by reputation
   * @param {string} sortBy - Column to sort by (reputation, total_pools, total_bets)
   * @param {string} sortOrder - 'asc' or 'desc'
   * @param {number} limit - Number of results
   * @param {number} offset - Offset for pagination
   * @returns {Promise<Array>} Reputation leaderboard entries
   */
  async getReputationLeaderboard(sortBy = 'reputation', sortOrder = 'desc', limit = 100, offset = 0) {
    try {
      // Validate sortBy
      const validSortColumns = ['reputation', 'total_pools', 'total_bets'];
      if (!validSortColumns.includes(sortBy)) {
        sortBy = 'reputation';
      }

      // Validate sortOrder
      const order = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

      // Map sortBy to SQL column
      const sortColumnMap = {
        'reputation': 'reputation',
        'total_pools': 'total_pools_created',
        'total_bets': 'total_bets'
      };

      const sortColumn = sortColumnMap[sortBy];

      const query = `
        SELECT 
          u.address,
          COALESCE(u.reputation, 40) as reputation,
          COALESCE(u.total_pools_created, 0) as total_pools_created,
          COALESCE(u.total_bets, 0) as total_bets,
          COALESCE(u.won_bets, 0) as won_bets,
          COALESCE(u.total_volume, 0) as total_volume,
          COALESCE(u.profit_loss, 0) as profit_loss,
          u.joined_at
        FROM core.users u
        WHERE u.reputation > 0 OR u.total_pools_created > 0 OR u.total_bets > 0
        ORDER BY u.${sortColumn} ${order}, u.reputation DESC, u.total_bets DESC
        LIMIT $1 OFFSET $2
      `;

      const result = await db.query(query, [limit, offset]);

      // Get total count for pagination
      const countResult = await db.query(`
        SELECT COUNT(*) as total
        FROM core.users
        WHERE reputation > 0 OR total_pools_created > 0 OR total_bets > 0
      `);

      return {
        data: result.rows.map((row, index) => ({
          rank: offset + index + 1,
          address: row.address.toLowerCase(),
          reputation: parseInt(row.reputation) || 40,
          totalPools: parseInt(row.total_pools_created) || 0,
          totalBets: parseInt(row.total_bets) || 0,
          wonBets: parseInt(row.won_bets) || 0,
          totalVolume: parseFloat(row.total_volume) / 1e18 || 0,
          profitLoss: parseFloat(row.profit_loss) / 1e18 || 0,
          joinedAt: row.joined_at
        })),
        pagination: {
          total: parseInt(countResult.rows[0]?.total || 0),
          limit,
          offset,
          hasMore: result.rows.length === limit
        }
      };
    } catch (error) {
      console.error('❌ Error getting reputation leaderboard:', error);
      throw error;
    }
  }
}

module.exports = new PoolLeaderboardService();

