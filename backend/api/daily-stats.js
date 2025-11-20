/**
 * Daily Stats API - Comprehensive Daily Analytics
 * 
 * Provides detailed daily statistics for platform and user analytics
 * Integrates with existing analytics infrastructure
 */

const express = require('express');
const router = express.Router();
const db = require('../db/db');
const DailyStatsService = require('../services/daily-stats-service');
const { cacheMiddleware } = require('../config/redis');

const dailyStatsService = new DailyStatsService();

/**
 * GET /api/daily-stats/platform
 * Get daily platform statistics
 */
router.get('/platform', cacheMiddleware(300), async (req, res) => {
  try {
    const { start_date, end_date, limit = 30 } = req.query;
    
    let dateFilter = '';
    let params = [];
    
    if (start_date && end_date) {
      dateFilter = 'WHERE date BETWEEN $1 AND $2';
      params = [start_date, end_date];
    } else if (start_date) {
      dateFilter = 'WHERE date >= $1';
      params = [start_date];
    } else {
      dateFilter = 'WHERE date >= CURRENT_DATE - INTERVAL \'30 days\'';
    }

    const result = await db.query(`
      SELECT 
        date,
        pools_created,
        pools_settled,
        pools_active,
        volume_stt,
        volume_bitr,
        total_volume,
        bets_placed,
        bets_won,
        bets_lost,
        win_rate,
        active_users,
        new_users,
        returning_users,
        guided_pools,
        open_pools,
        guided_volume,
        open_volume,
        football_pools,
        crypto_pools,
        football_volume,
        crypto_volume,
        oddyssey_slips,
        oddyssey_players,
        oddyssey_prizes_claimed,
        created_at,
        updated_at
      FROM analytics.daily_platform_stats
      ${dateFilter}
      ORDER BY date DESC
      LIMIT $${params.length + 1}
    `, [...params, parseInt(limit)]);

    // Calculate summary statistics
    const summary = await db.query(`
      SELECT 
        COUNT(*) as total_days,
        SUM(pools_created) as total_pools,
        SUM(total_volume) as total_volume,
        AVG(active_users) as avg_daily_users,
        AVG(win_rate) as avg_win_rate,
        SUM(oddyssey_slips) as total_oddyssey_slips
      FROM analytics.daily_platform_stats
      ${dateFilter}
    `, params);

    res.json({
      success: true,
      data: {
        daily_stats: result.rows,
        summary: summary.rows[0],
        timeframe: {
          start_date: start_date || '30 days ago',
          end_date: end_date || 'today'
        }
      },
      meta: {
        count: result.rows.length,
        generated_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error fetching daily platform stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch daily platform stats',
      details: error.message
    });
  }
});

/**
 * GET /api/daily-stats/user/:address
 * Get daily user statistics for a specific user
 */
router.get('/user/:address', cacheMiddleware(300), async (req, res) => {
  try {
    const { address } = req.params;
    const { start_date, end_date, limit = 30 } = req.query;
    
    let dateFilter = '';
    let params = [address];
    
    if (start_date && end_date) {
      dateFilter = 'AND date BETWEEN $2 AND $3';
      params = [address, start_date, end_date];
    } else if (start_date) {
      dateFilter = 'AND date >= $2';
      params = [address, start_date];
    } else {
      dateFilter = 'AND date >= CURRENT_DATE - INTERVAL \'30 days\'';
    }

    const result = await db.query(`
      SELECT 
        date,
        pools_created,
        pools_won,
        pools_lost,
        pool_win_rate,
        bets_placed,
        bets_won,
        bets_lost,
        bet_win_rate,
        volume_stt,
        volume_bitr,
        total_volume,
        net_profit,
        guided_pools_created,
        open_pools_created,
        guided_bets,
        open_bets,
        oddyssey_slips,
        oddyssey_wins,
        oddyssey_prizes,
        created_at,
        updated_at
      FROM analytics.daily_user_stats
      WHERE user_address = $1 ${dateFilter}
      ORDER BY date DESC
      LIMIT $${params.length + 1}
    `, [...params, parseInt(limit)]);

    // Calculate user summary
    const summary = await db.query(`
      SELECT 
        COUNT(*) as active_days,
        SUM(pools_created) as total_pools_created,
        SUM(bets_placed) as total_bets,
        SUM(total_volume) as total_volume,
        SUM(net_profit) as total_profit,
        AVG(pool_win_rate) as avg_pool_win_rate,
        AVG(bet_win_rate) as avg_bet_win_rate,
        SUM(oddyssey_slips) as total_oddyssey_slips,
        SUM(oddyssey_prizes) as total_oddyssey_prizes
      FROM analytics.daily_user_stats
      WHERE user_address = $1 ${dateFilter}
    `, params.slice(0, -1));

    res.json({
      success: true,
      data: {
        user_address: address,
        daily_stats: result.rows,
        summary: summary.rows[0],
        timeframe: {
          start_date: start_date || '30 days ago',
          end_date: end_date || 'today'
        }
      },
      meta: {
        count: result.rows.length,
        generated_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error fetching daily user stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch daily user stats',
      details: error.message
    });
  }
});

/**
 * GET /api/daily-stats/categories
 * Get daily category performance
 */
router.get('/categories', cacheMiddleware(300), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    
    let dateFilter = '';
    let params = [];
    
    if (start_date && end_date) {
      dateFilter = 'WHERE date BETWEEN $1 AND $2';
      params = [start_date, end_date];
    } else if (start_date) {
      dateFilter = 'WHERE date >= $1';
      params = [start_date];
    } else {
      dateFilter = 'WHERE date >= CURRENT_DATE - INTERVAL \'30 days\'';
    }

    const result = await db.query(`
      SELECT 
        category,
        SUM(pools_created) as total_pools,
        SUM(total_volume) as total_volume,
        AVG(win_rate) as avg_win_rate,
        SUM(active_users) as total_active_users,
        AVG(avg_pool_size) as avg_pool_size,
        AVG(avg_odds) as avg_odds,
        COUNT(DISTINCT date) as active_days
      FROM analytics.daily_category_stats
      ${dateFilter}
      GROUP BY category
      ORDER BY total_volume DESC
    `, params);

    res.json({
      success: true,
      data: {
        categories: result.rows,
        timeframe: {
          start_date: start_date || '30 days ago',
          end_date: end_date || 'today'
        }
      },
      meta: {
        count: result.rows.length,
        generated_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error fetching category stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch category stats',
      details: error.message
    });
  }
});

/**
 * GET /api/daily-stats/oracles
 * Get daily oracle performance comparison
 */
router.get('/oracles', cacheMiddleware(300), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    
    let dateFilter = '';
    let params = [];
    
    if (start_date && end_date) {
      dateFilter = 'WHERE date BETWEEN $1 AND $2';
      params = [start_date, end_date];
    } else if (start_date) {
      dateFilter = 'WHERE date >= $1';
      params = [start_date];
    } else {
      dateFilter = 'WHERE date >= CURRENT_DATE - INTERVAL \'30 days\'';
    }

    const result = await db.query(`
      SELECT 
        oracle_type,
        SUM(pools_created) as total_pools,
        SUM(total_volume) as total_volume,
        AVG(win_rate) as avg_win_rate,
        AVG(avg_settlement_time_hours) as avg_settlement_time,
        SUM(active_users) as total_active_users,
        AVG(avg_pool_size) as avg_pool_size,
        AVG(avg_odds) as avg_odds,
        COUNT(DISTINCT date) as active_days
      FROM analytics.daily_oracle_stats
      ${dateFilter}
      GROUP BY oracle_type
      ORDER BY total_volume DESC
    `, params);

    res.json({
      success: true,
      data: {
        oracles: result.rows,
        timeframe: {
          start_date: start_date || '30 days ago',
          end_date: end_date || 'today'
        }
      },
      meta: {
        count: result.rows.length,
        generated_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error fetching oracle stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch oracle stats',
      details: error.message
    });
  }
});

// Overview endpoint removed - use /api/unified-stats/overview instead

/**
 * POST /api/daily-stats/calculate
 * Manually trigger daily stats calculation
 */
router.post('/calculate', async (req, res) => {
  try {
    const { date } = req.body;
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    console.log(`📊 Manual daily stats calculation triggered for ${targetDate}`);
    
    await dailyStatsService.calculateAllDailyStats(targetDate);
    
    res.json({
      success: true,
      message: `Daily stats calculated successfully for ${targetDate}`,
      date: targetDate
    });

  } catch (error) {
    console.error('Error calculating daily stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate daily stats',
      details: error.message
    });
  }
});

// Health endpoint removed - use /api/unified-stats/health instead

module.exports = router;
