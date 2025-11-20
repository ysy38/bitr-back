const express = require('express');
const router = express.Router();
const db = require('../db/db');

/**
 * GET /api/pool-bets/:poolId
 * Get all bets for a specific pool
 */
router.get('/:poolId', async (req, res) => {
  try {
    const { poolId } = req.params;
    const { page = 1, limit = 20, sortBy = 'created_at', sortOrder = 'desc' } = req.query;
    
    const offset = (page - 1) * limit;
    
    // Validate sortBy to prevent SQL injection
    const allowedSortFields = ['created_at', 'amount', 'bettor_address', 'block_number'];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
    const order = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    
    // Get bets with pagination
    const betsResult = await db.query(`
      SELECT 
        transaction_hash as bet_id,
        pool_id,
        bettor_address,
        amount,
        is_for_outcome,
        transaction_hash,
        block_number,
        event_start_time,
        event_end_time,
        betting_end_time,
        league,
        category,
        home_team,
        away_team,
        title,
        created_at
      FROM oracle.bets 
      WHERE pool_id = $1
      ORDER BY ${sortField} ${order}
      LIMIT $2 OFFSET $3
    `, [poolId, limit, offset]);
    
    // Get total count
    const countResult = await db.query(
      'SELECT COUNT(*) as total FROM oracle.bets WHERE pool_id = $1',
      [poolId]
    );
    
    const totalBets = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(totalBets / limit);
    
    res.json({
      success: true,
      data: {
        bets: betsResult.rows,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalBets,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching pool bets:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pool bets',
      message: error.message
    });
  }
});

/**
 * GET /api/pool-bets/:poolId/stats
 * Get betting statistics for a specific pool
 */
router.get('/:poolId/stats', async (req, res) => {
  try {
    const { poolId } = req.params;
    
    const statsResult = await db.query(`
      SELECT 
        COUNT(*) as total_bets,
        SUM(CAST(amount AS NUMERIC)) as total_volume,
        COUNT(DISTINCT bettor_address) as unique_bettors,
        AVG(CAST(amount AS NUMERIC)) as average_bet_size,
        MAX(CAST(amount AS NUMERIC)) as largest_bet,
        MIN(CAST(amount AS NUMERIC)) as smallest_bet
      FROM oracle.bets 
      WHERE pool_id = $1
    `, [poolId]);
    
    res.json({
      success: true,
      data: statsResult.rows[0]
    });
    
  } catch (error) {
    console.error('❌ Error fetching pool bet stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pool bet stats',
      message: error.message
    });
  }
});

/**
 * GET /api/pool-bets/user/:address
 * Get all bets by a specific user
 */
router.get('/user/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const { page = 1, limit = 20, sortBy = 'created_at', sortOrder = 'desc' } = req.query;
    
    const offset = (page - 1) * limit;
    
    // Validate sortBy to prevent SQL injection
    const allowedSortFields = ['created_at', 'amount', 'pool_id', 'block_number'];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
    const order = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    
    const lowerAddress = address.toLowerCase();
    
    // Get user bets with pagination
    // Cast pool_id correctly: bets.pool_id is VARCHAR, pools.pool_id is BIGINT
    const betsResult = await db.query(`
      SELECT 
        b.transaction_hash as bet_id,
        b.pool_id,
        b.bettor_address,
        b.amount,
        b.is_for_outcome,
        b.transaction_hash,
        b.block_number,
        b.event_start_time,
        b.event_end_time,
        b.betting_end_time,
        b.league,
        b.category,
        b.home_team,
        b.away_team,
        COALESCE(p.title, 'Pool #' || b.pool_id) as title,
        b.created_at,
        p.is_settled,
        p.creator_side_won,
        p.result,
        p.settled_at,
        p.use_bitr,
        p.odds
      FROM oracle.bets b
      LEFT JOIN oracle.pools p ON b.pool_id::bigint = p.pool_id
      WHERE LOWER(b.bettor_address) = $1
      ORDER BY ${sortField} ${order}
      LIMIT $2 OFFSET $3
    `, [lowerAddress, limit, offset]);
    
    // Get total count
    const countResult = await db.query(
      'SELECT COUNT(*) as total FROM oracle.bets WHERE LOWER(bettor_address) = $1',
      [lowerAddress]
    );
    
    const totalBets = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(totalBets / limit);
    
    res.json({
      success: true,
      data: {
        bets: betsResult.rows,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalBets,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching user bets:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user bets',
      message: error.message
    });
  }
});

/**
 * GET /api/pool-bets/recent
 * Get recent bets across all pools
 */
router.get('/recent', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    
    const betsResult = await db.query(`
      SELECT 
        b.transaction_hash as bet_id,
        b.pool_id,
        b.bettor_address,
        b.amount,
        b.is_for_outcome,
        b.transaction_hash,
        b.block_number,
        b.league,
        b.category,
        b.home_team,
        b.away_team,
        b.title,
        b.created_at,
        p.is_settled,
        p.creator_side_won,
        p.result
      FROM oracle.bets b
      LEFT JOIN oracle.pools p ON b.pool_id::bigint = p.pool_id
      ORDER BY b.created_at DESC
      LIMIT $1
    `, [limit]);
    
    res.json({
      success: true,
      data: betsResult.rows
    });
    
  } catch (error) {
    console.error('❌ Error fetching recent bets:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch recent bets',
      message: error.message
    });
  }
});

/**
 * GET /api/pool-bets/stats/global
 * Get global betting statistics
 */
router.get('/stats/global', async (req, res) => {
  try {
    const statsResult = await db.query(`
      SELECT 
        COUNT(*) as total_bets,
        SUM(CAST(amount AS NUMERIC)) as total_volume,
        COUNT(DISTINCT bettor_address) as unique_bettors,
        COUNT(DISTINCT pool_id) as pools_with_bets,
        AVG(CAST(amount AS NUMERIC)) as average_bet_size,
        MAX(CAST(amount AS NUMERIC)) as largest_bet,
        MIN(CAST(amount AS NUMERIC)) as smallest_bet
      FROM oracle.bets
    `);
    
    res.json({
      success: true,
      data: statsResult.rows[0]
    });
    
  } catch (error) {
    console.error('❌ Error fetching global bet stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch global bet stats',
      message: error.message
    });
  }
});

module.exports = router;
