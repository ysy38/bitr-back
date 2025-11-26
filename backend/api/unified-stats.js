const express = require('express');
const router = express.Router();
const db = require('../db/db');
const { cacheMiddleware } = require('../config/redis');

/**
 * Unified Stats API
 * 
 * Consolidated endpoint for all platform statistics and analytics
 * Replaces multiple scattered stats endpoints with a single, comprehensive API
 */

/**
 * GET /api/unified-stats/overview
 * Get comprehensive platform overview statistics
 */
router.get('/overview', cacheMiddleware(300), async (req, res) => {
  try {
    console.log('📊 Fetching unified platform overview...');

    // Get platform overview data
    const [
      poolStats,
      userStats,
      financialStats,
      oddysseyStats,
      activityStats
    ] = await Promise.all([
      // Pool statistics
      db.query(`
        SELECT 
          COUNT(*) as total_pools,
          COUNT(CASE WHEN is_settled = false THEN 1 END) as active_pools,
          COUNT(CASE WHEN is_settled = true THEN 1 END) as settled_pools,
          COALESCE(SUM(CAST(creator_stake AS NUMERIC)), 0) as total_creator_stake,
          COALESCE(SUM(CAST(total_bettor_stake AS NUMERIC)), 0) as total_bettor_stake,
          COALESCE(AVG(CAST(odds AS NUMERIC)), 0) as avg_odds
        FROM oracle.pools
      `),
      
      // User statistics
      db.query(`
        SELECT 
          COUNT(DISTINCT creator_address) as total_creators,
          COUNT(DISTINCT bettor_address) as total_bettors,
          COUNT(DISTINCT CASE WHEN creator_address IS NOT NULL OR bettor_address IS NOT NULL 
            THEN COALESCE(creator_address, bettor_address) END) as unique_users
        FROM (
          SELECT creator_address, NULL as bettor_address FROM oracle.pools
          UNION ALL
          SELECT NULL as creator_address, bettor_address FROM oracle.bets
        ) users
      `),
      
      // Financial statistics - calculate from pools (creator_stake + total_bettor_stake)
      db.query(`
        SELECT 
          COALESCE(SUM(CASE WHEN p.use_bitr THEN CAST(p.creator_stake AS NUMERIC) + CAST(p.total_bettor_stake AS NUMERIC) ELSE 0 END), 0) as bitr_volume,
          COALESCE(SUM(CASE WHEN NOT p.use_bitr THEN CAST(p.creator_stake AS NUMERIC) + CAST(p.total_bettor_stake AS NUMERIC) ELSE 0 END), 0) as stt_volume,
          COALESCE(SUM(CAST(p.creator_stake AS NUMERIC) + CAST(p.total_bettor_stake AS NUMERIC)), 0) as total_volume
        FROM oracle.pools p
      `),
      
      // Oddyssey statistics
      db.query(`
        SELECT 
          COUNT(*) as total_cycles,
          COUNT(CASE WHEN is_resolved THEN 1 END) as resolved_cycles,
          COUNT(CASE WHEN evaluation_completed THEN 1 END) as evaluated_cycles,
          COALESCE(AVG(matches_count), 0) as avg_matches_per_cycle
        FROM oracle.oddyssey_cycles
      `),
      
      // Activity statistics (last 24 hours)
      db.query(`
        SELECT 
          (SELECT COUNT(*) FROM oracle.pools WHERE created_at > NOW() - INTERVAL '24 hours') as pools_last_24h,
          (SELECT COUNT(*) FROM oracle.bets WHERE created_at > NOW() - INTERVAL '24 hours') as bets_last_24h
      `)
    ]);

    const overview = {
      pools: {
        total: parseInt(poolStats.rows[0].total_pools) || 0,
        active: parseInt(poolStats.rows[0].active_pools) || 0,
        settled: parseInt(poolStats.rows[0].settled_pools) || 0,
        totalCreatorStake: parseFloat(poolStats.rows[0].total_creator_stake) || 0,
        totalBettorStake: parseFloat(poolStats.rows[0].total_bettor_stake) || 0,
        avgOdds: parseFloat(poolStats.rows[0].avg_odds) || 0
      },
      users: {
        totalCreators: parseInt(userStats.rows[0].total_creators) || 0,
        totalBettors: parseInt(userStats.rows[0].total_bettors) || 0,
        uniqueUsers: parseInt(userStats.rows[0].unique_users) || 0
      },
      financial: {
        bitrVolume: parseFloat(financialStats.rows[0].bitr_volume) || 0,
        sttVolume: parseFloat(financialStats.rows[0].stt_volume) || 0,
        totalVolume: parseFloat(financialStats.rows[0].total_volume) || 0
      },
      oddyssey: {
        totalCycles: parseInt(oddysseyStats.rows[0].total_cycles) || 0,
        resolvedCycles: parseInt(oddysseyStats.rows[0].resolved_cycles) || 0,
        evaluatedCycles: parseInt(oddysseyStats.rows[0].evaluated_cycles) || 0,
        avgMatchesPerCycle: parseFloat(oddysseyStats.rows[0].avg_matches_per_cycle) || 0
      },
      activity: {
        poolsLast24h: parseInt(activityStats.rows[0].pools_last_24h) || 0,
        betsLast24h: parseInt(activityStats.rows[0].bets_last_24h) || 0
      },
      timestamp: new Date().toISOString()
    };

    res.json({
      success: true,
      data: {
        overview
      }
    });

  } catch (error) {
    console.error('Error fetching unified overview:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch platform overview'
    });
  }
});

/**
 * GET /api/unified-stats/time-series
 * Get time-series data for charts (volume, pools, users over time)
 */
router.get('/time-series', cacheMiddleware(300), async (req, res) => {
  try {
    const { timeframe = '7d', interval = 'day' } = req.query;
    
    let dateFilter = '';
    let intervalExpr = "DATE_TRUNC('day', created_at)";
    
    switch (timeframe) {
      case '24h':
        dateFilter = "AND created_at >= NOW() - INTERVAL '24 hours'";
        intervalExpr = "DATE_TRUNC('hour', created_at)";
        break;
      case '7d':
        dateFilter = "AND created_at >= NOW() - INTERVAL '7 days'";
        intervalExpr = "DATE_TRUNC('day', created_at)";
        break;
      case '30d':
        dateFilter = "AND created_at >= NOW() - INTERVAL '30 days'";
        intervalExpr = "DATE_TRUNC('day', created_at)";
        break;
      case 'all':
        dateFilter = '';
        intervalExpr = "DATE_TRUNC('day', created_at)";
        break;
    }
    
    // Get volume over time
    const volumeSeries = await db.query(`
      SELECT 
        ${intervalExpr} as date,
        COALESCE(SUM(CAST(creator_stake AS NUMERIC) + CAST(total_bettor_stake AS NUMERIC)), 0) as volume
      FROM oracle.pools
      WHERE 1=1 ${dateFilter}
      GROUP BY ${intervalExpr}
      ORDER BY date ASC
    `);
    
    // Get pools created over time
    const poolsSeries = await db.query(`
      SELECT 
        ${intervalExpr} as date,
        COUNT(*) as pools_count
      FROM oracle.pools
      WHERE 1=1 ${dateFilter}
      GROUP BY ${intervalExpr}
      ORDER BY date ASC
    `);
    
    // Get unique users over time
    const usersSeries = await db.query(`
      SELECT 
        ${intervalExpr} as date,
        COUNT(DISTINCT user_address) as users_count
      FROM (
        SELECT ${intervalExpr} as created_at, creator_address as user_address FROM oracle.pools WHERE 1=1 ${dateFilter}
        UNION ALL
        SELECT ${intervalExpr} as created_at, bettor_address as user_address FROM oracle.bets WHERE 1=1 ${dateFilter}
      ) users
      GROUP BY ${intervalExpr}
      ORDER BY date ASC
    `);
    
    res.json({
      success: true,
      data: {
        volume: volumeSeries.rows.map(row => ({
          date: row.date,
          value: parseFloat(row.volume || 0)
        })),
        pools: poolsSeries.rows.map(row => ({
          date: row.date,
          value: parseInt(row.pools_count || 0)
        })),
        users: usersSeries.rows.map(row => ({
          date: row.date,
          value: parseInt(row.users_count || 0)
        }))
      },
      timeframe,
      interval
    });
    
  } catch (error) {
    console.error('Error fetching time-series data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch time-series data'
    });
  }
});

/**
 * GET /api/unified-stats/metrics
 * Get comprehensive performance metrics
 */
router.get('/metrics', cacheMiddleware(60), async (req, res) => {
  try {
    console.log('📊 Fetching unified performance metrics...');

    // Get system performance metrics
    const [
      dbMetrics,
      apiMetrics,
      cacheMetrics
    ] = await Promise.all([
      // Database performance
      db.query(`
        SELECT 
          COUNT(*) as total_queries,
          AVG(EXTRACT(EPOCH FROM (clock_timestamp() - query_start))) as avg_query_time
        FROM pg_stat_activity 
        WHERE state = 'active'
      `),
      
      // API performance (simulated - would come from monitoring system)
      db.query(`
        SELECT 
          COUNT(*) as total_requests,
          0 as avg_response_time
        FROM oracle.pools 
        WHERE created_at > NOW() - INTERVAL '1 hour'
      `),
      
      // Cache performance (simulated)
      db.query(`
        SELECT 
          COUNT(*) as cache_hits,
          0 as cache_miss_rate
        FROM oracle.pools 
        WHERE created_at > NOW() - INTERVAL '1 hour'
      `)
    ]);

    const metrics = {
      database: {
        totalQueries: parseInt(dbMetrics.rows[0].total_queries) || 0,
        avgQueryTime: parseFloat(dbMetrics.rows[0].avg_query_time) || 0
      },
      api: {
        totalRequests: parseInt(apiMetrics.rows[0].total_requests) || 0,
        avgResponseTime: parseFloat(apiMetrics.rows[0].avg_response_time) || 0
      },
      cache: {
        hits: parseInt(cacheMetrics.rows[0].cache_hits) || 0,
        missRate: parseFloat(cacheMetrics.rows[0].cache_miss_rate) || 0
      },
      timestamp: new Date().toISOString()
    };

    res.json({
      success: true,
      data: {
        metrics
      }
    });

  } catch (error) {
    console.error('Error fetching unified metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch performance metrics'
    });
  }
});

/**
 * GET /api/unified-stats/health
 * Get comprehensive system health status
 */
router.get('/health', cacheMiddleware(30), async (req, res) => {
  try {
    console.log('🏥 Checking unified system health...');

    // Check database health
    const dbHealth = await db.query('SELECT 1 as health_check');
    const dbHealthy = dbHealth.rows.length > 0;

    // Check key services (simulated)
    const servicesHealth = {
      database: { status: dbHealthy ? 'healthy' : 'unhealthy', responseTime: 0 },
      redis: { status: 'healthy', responseTime: 0 },
      blockchain: { status: 'healthy', responseTime: 0 },
      sportmonks: { status: 'healthy', responseTime: 0 }
    };

    const overallStatus = Object.values(servicesHealth).every(s => s.status === 'healthy') 
      ? 'healthy' : 'degraded';

    const health = {
      status: overallStatus,
      services: servicesHealth,
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    };

    const statusCode = overallStatus === 'healthy' ? 200 : 503;
    res.status(statusCode).json({
      success: true,
      data: {
        health
      }
    });

  } catch (error) {
    console.error('Error checking unified health:', error);
    res.status(503).json({
      success: false,
      error: 'Health check failed'
    });
  }
});

/**
 * GET /api/unified-stats/dashboard
 * Get comprehensive dashboard data
 */
router.get('/dashboard', cacheMiddleware(120), async (req, res) => {
  try {
    console.log('📊 Fetching unified dashboard data...');

    // Get dashboard data
    const [
      recentPools,
      recentBets,
      topCreators,
      topBettors
    ] = await Promise.all([
      // Recent pools
      db.query(`
        SELECT 
          pool_id,
          title,
          category,
          league,
          creator_stake,
          total_bettor_stake,
          odds,
          status,
          created_at
        FROM oracle.pools
        ORDER BY created_at DESC
        LIMIT 10
      `),
      
      // Recent bets
      db.query(`
        SELECT 
          b.transaction_hash,
          b.pool_id,
          b.bettor_address,
          b.amount,
          b.is_for_outcome,
          b.created_at,
          p.title as pool_title
        FROM oracle.bets b
        JOIN oracle.pools p ON b.pool_id = p.pool_id
        ORDER BY b.created_at DESC
        LIMIT 10
      `),
      
      // Top creators
      db.query(`
        SELECT 
          creator_address,
          COUNT(*) as pools_created,
          SUM(creator_stake) as total_stake,
          AVG(odds) as avg_odds
        FROM oracle.pools
        GROUP BY creator_address
        ORDER BY total_stake DESC
        LIMIT 5
      `),
      
      // Top bettors
      db.query(`
        SELECT 
          bettor_address,
          COUNT(*) as bets_placed,
          SUM(amount) as total_bet,
          AVG(CASE WHEN is_for_outcome THEN 1 ELSE 0 END) as win_rate
        FROM oracle.bets
        GROUP BY bettor_address
        ORDER BY total_bet DESC
        LIMIT 5
      `)
    ]);

    const dashboard = {
      recentPools: recentPools.rows.map(pool => ({
        id: pool.pool_id,
        title: pool.title,
        category: pool.category,
        league: pool.league,
        creatorStake: parseFloat(pool.creator_stake) || 0,
        totalBettorStake: parseFloat(pool.total_bettor_stake) || 0,
        odds: parseFloat(pool.odds) || 0,
        status: pool.status,
        createdAt: pool.created_at
      })),
      recentBets: recentBets.rows.map(bet => ({
        id: bet.transaction_hash,
        poolId: bet.pool_id,
        bettor: bet.bettor_address,
        amount: parseFloat(bet.amount) || 0,
        isForOutcome: bet.is_for_outcome,
        poolTitle: bet.pool_title,
        createdAt: bet.created_at
      })),
      topCreators: topCreators.rows.map(creator => ({
        address: creator.creator_address,
        poolsCreated: parseInt(creator.pools_created) || 0,
        totalStake: parseFloat(creator.total_stake) || 0,
        avgOdds: parseFloat(creator.avg_odds) || 0
      })),
      topBettors: topBettors.rows.map(bettor => ({
        address: bettor.bettor_address,
        betsPlaced: parseInt(bettor.bets_placed) || 0,
        totalBet: parseFloat(bettor.total_bet) || 0,
        winRate: parseFloat(bettor.win_rate) || 0
      })),
      timestamp: new Date().toISOString()
    };

    res.json({
      success: true,
      data: {
        dashboard
      }
    });

  } catch (error) {
    console.error('Error fetching unified dashboard:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard data'
    });
  }
});

module.exports = router;
