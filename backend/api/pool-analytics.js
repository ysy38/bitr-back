const express = require('express');
const router = express.Router();
const { ethers } = require('ethers');
const db = require('../db/db');
const Web3Service = require('../services/web3-service');
const optimizedCaching = require('../middleware/optimized-caching');
const { asyncHandler } = require('../utils/validation');

// Initialize Web3Service
const web3Service = new Web3Service();

/**
 * GET /api/pool-analytics/:poolId
 * Get comprehensive analytics for a specific pool
 */
router.get('/:poolId', optimizedCaching.cacheMiddleware(60), asyncHandler(async (req, res) => {
  try {
    const { poolId } = req.params;

    if (!poolId || isNaN(poolId)) {
      return res.status(400).json({
        success: false,
        error: 'Valid pool ID is required'
      });
    }

    console.log(`📊 Fetching analytics for pool ${poolId}...`);

    // Initialize Web3Service if not already done
    if (!web3Service.isInitialized) {
      await web3Service.initialize();
    }

    // Get contract analytics
    const contractAnalytics = await web3Service.getPoolAnalytics(poolId);

    // Get database analytics
    const dbResult = await db.query(`
      SELECT 
        p.pool_id,
        p.creator_address,
        p.total_creator_side_stake,
        p.total_bettor_stake,
        p.odds,
        p.event_start_time,
        p.event_end_time,
        p.betting_end_time,
        p.use_bitr,
        p.is_settled,
        p.creator_side_won,
        COUNT(DISTINCT b.bettor_address) as bettor_count,
        COUNT(DISTINCT lp.lp_address) as lp_count,
        COALESCE(SUM(b.amount::numeric), 0) as total_bet_amount,
        COALESCE(SUM(lp.amount::numeric), 0) as total_lp_amount
      FROM oracle.pools p
      LEFT JOIN oracle.bets b ON p.pool_id::text = b.pool_id
      LEFT JOIN oracle.pool_liquidity_providers lp ON p.pool_id::text = lp.pool_id
      WHERE p.pool_id = $1
      GROUP BY p.pool_id, p.creator_address, p.total_creator_side_stake, 
               p.total_bettor_stake, p.odds, p.event_start_time, p.event_end_time,
               p.betting_end_time, p.use_bitr, p.is_settled, p.creator_side_won
    `, [poolId]);

    if (dbResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Pool not found'
      });
    }

    const pool = dbResult.rows[0];
    const currentTime = Math.floor(Date.now() / 1000);

    // Calculate additional metrics
    const totalVolume = parseFloat(pool.total_creator_side_stake) + parseFloat(pool.total_bettor_stake);
    const timeSinceCreation = currentTime - pool.event_start_time;
    const timeUntilEvent = pool.event_start_time > currentTime ? pool.event_start_time - currentTime : 0;
    const timeUntilBettingEnd = pool.betting_end_time > currentTime ? pool.betting_end_time - currentTime : 0;

    // Calculate fill percentage
    const maxBettorStake = (parseFloat(pool.total_creator_side_stake) * 100) / (pool.odds - 100);
    const fillPercentage = maxBettorStake > 0 ? (parseFloat(pool.total_bettor_stake) * 10000) / maxBettorStake : 0;

    const analytics = {
      poolId: parseInt(poolId),
      contractAnalytics: {
        popularityScore: parseInt(contractAnalytics.popularityScore),
        riskLevel: contractAnalytics.riskLevel,
        riskFactors: contractAnalytics.riskFactors,
        efficiencyScore: parseInt(contractAnalytics.efficiencyScore),
        utilizationRate: parseInt(contractAnalytics.utilizationRate)
      },
      databaseAnalytics: {
        bettorCount: parseInt(pool.bettor_count),
        lpCount: parseInt(pool.lp_count),
        totalVolume: totalVolume,
        totalBetAmount: parseFloat(pool.total_bet_amount),
        totalLpAmount: parseFloat(pool.total_lp_amount),
        fillPercentage: Math.min(10000, Math.max(0, fillPercentage)),
        timeSinceCreation: timeSinceCreation,
        timeUntilEvent: timeUntilEvent,
        timeUntilBettingEnd: timeUntilBettingEnd,
        isSettled: pool.is_settled,
        creatorSideWon: pool.creator_side_won,
        useBitr: pool.use_bitr
      },
      calculatedMetrics: {
        volumePerParticipant: (pool.bettor_count + pool.lp_count) > 0 ? 
          totalVolume / (pool.bettor_count + pool.lp_count) : 0,
        averageBetSize: pool.bettor_count > 0 ? 
          parseFloat(pool.total_bet_amount) / pool.bettor_count : 0,
        averageLpSize: pool.lp_count > 0 ? 
          parseFloat(pool.total_lp_amount) / pool.lp_count : 0,
        creatorStakeRatio: parseFloat(pool.total_creator_side_stake) / totalVolume,
        bettorStakeRatio: parseFloat(pool.total_bettor_stake) / totalVolume
      }
    };

    console.log(`✅ Analytics fetched for pool ${poolId}`);

    res.json({
      success: true,
      data: analytics
    });

  } catch (error) {
    console.error('❌ Error fetching pool analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pool analytics',
      message: error.message
    });
  }
}));

/**
 * GET /api/pool-analytics/:poolId/potential-winnings
 * Get potential winnings for a bet
 */
router.get('/:poolId/potential-winnings', optimizedCaching.cacheMiddleware(30), asyncHandler(async (req, res) => {
  try {
    const { poolId } = req.params;
    const { betAmount, userAddress } = req.query;

    if (!poolId || isNaN(poolId)) {
      return res.status(400).json({
        success: false,
        error: 'Valid pool ID is required'
      });
    }

    if (!betAmount || isNaN(betAmount)) {
      return res.status(400).json({
        success: false,
        error: 'Valid bet amount is required'
      });
    }

    if (!userAddress || !ethers.isAddress(userAddress)) {
      return res.status(400).json({
        success: false,
        error: 'Valid user address is required'
      });
    }

    console.log(`💰 Calculating potential winnings for pool ${poolId}, bet ${betAmount}, user ${userAddress}...`);

    // Initialize Web3Service if not already done
    if (!web3Service.isInitialized) {
      await web3Service.initialize();
    }

    // Get potential winnings from contract
    const winnings = await web3Service.getPotentialWinnings(poolId, betAmount, userAddress);

    res.json({
      success: true,
      data: {
        poolId: parseInt(poolId),
        betAmount: betAmount,
        userAddress: userAddress,
        grossPayout: winnings.grossPayout,
        netPayout: winnings.netPayout,
        feeAmount: winnings.feeAmount,
        profit: (parseFloat(winnings.netPayout) - parseFloat(betAmount)).toString(),
        roi: ((parseFloat(winnings.netPayout) - parseFloat(betAmount)) / parseFloat(betAmount) * 100).toFixed(2) + '%'
      }
    });

  } catch (error) {
    console.error('❌ Error calculating potential winnings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate potential winnings',
      message: error.message
    });
  }
}));

/**
 * GET /api/pool-analytics/creator/:creatorAddress
 * Get creator reputation and analytics
 */
router.get('/creator/:creatorAddress', optimizedCaching.cacheMiddleware(300), asyncHandler(async (req, res) => {
  try {
    const { creatorAddress } = req.params;

    if (!creatorAddress || !ethers.isAddress(creatorAddress)) {
      return res.status(400).json({
        success: false,
        error: 'Valid creator address is required'
      });
    }

    console.log(`👤 Fetching creator analytics for ${creatorAddress}...`);

    // Initialize Web3Service if not already done
    if (!web3Service.isInitialized) {
      await web3Service.initialize();
    }

    // Get contract reputation
    const contractReputation = await web3Service.getCreatorReputation(creatorAddress);

    // Get database analytics
    const dbResult = await db.query(`
      SELECT 
        COUNT(*) as total_pools,
        COUNT(CASE WHEN is_settled = true THEN 1 END) as settled_pools,
        COUNT(CASE WHEN creator_side_won = true THEN 1 END) as won_pools,
        COALESCE(SUM(total_creator_side_stake + total_bettor_stake), 0) as total_volume,
        COALESCE(AVG(total_creator_side_stake + total_bettor_stake), 0) as avg_pool_size,
        COALESCE(SUM(creator_stake), 0) as total_creator_stake,
        COALESCE(SUM(total_bettor_stake), 0) as total_bettor_stake,
        MIN(created_at) as first_pool_created,
        MAX(created_at) as last_pool_created
      FROM oracle.pools 
      WHERE creator_address = $1
    `, [creatorAddress.toLowerCase()]);

    const stats = dbResult.rows[0];
    const winRate = stats.settled_pools > 0 ? (stats.won_pools / stats.settled_pools) * 100 : 0;

    const analytics = {
      creatorAddress: creatorAddress,
      contractReputation: {
        reputationScore: parseInt(contractReputation.reputationScore),
        totalPoolsCreated: parseInt(contractReputation.totalPoolsCreated),
        totalVolumeCreated: contractReputation.totalVolumeCreated,
        averagePoolSize: contractReputation.averagePoolSize
      },
      databaseStats: {
        totalPools: parseInt(stats.total_pools),
        settledPools: parseInt(stats.settled_pools),
        wonPools: parseInt(stats.won_pools),
        defeatedPools: parseInt(stats.settled_pools) - parseInt(stats.won_pools),
        winRate: winRate.toFixed(2),
        totalVolume: parseFloat(stats.total_volume),
        averagePoolSize: parseFloat(stats.avg_pool_size),
        totalCreatorStake: parseFloat(stats.total_creator_stake),
        totalBettorStake: parseFloat(stats.total_bettor_stake),
        firstPoolCreated: stats.first_pool_created,
        lastPoolCreated: stats.last_pool_created
      },
      calculatedMetrics: {
        successRate: winRate.toFixed(2) + '%',
        volumePerPool: stats.total_pools > 0 ? parseFloat(stats.total_volume) / stats.total_pools : 0,
        creatorStakeRatio: parseFloat(stats.total_creator_stake) / parseFloat(stats.total_volume),
        bettorAttractionRatio: parseFloat(stats.total_bettor_stake) / parseFloat(stats.total_creator_stake)
      }
    };

    console.log(`✅ Creator analytics fetched for ${creatorAddress}`);

    res.json({
      success: true,
      data: analytics
    });

  } catch (error) {
    console.error('❌ Error fetching creator analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch creator analytics',
      message: error.message
    });
  }
}));

/**
 * GET /api/pool-analytics/:poolId/market-trend
 * Get market trend for a pool
 */
router.get('/:poolId/market-trend', optimizedCaching.cacheMiddleware(60), asyncHandler(async (req, res) => {
  try {
    const { poolId } = req.params;

    if (!poolId || isNaN(poolId)) {
      return res.status(400).json({
        success: false,
        error: 'Valid pool ID is required'
      });
    }

    console.log(`📈 Fetching market trend for pool ${poolId}...`);

    // Get current pool volume
    const poolResult = await db.query(`
      SELECT total_creator_side_stake + total_bettor_stake as current_volume
      FROM oracle.pools 
      WHERE pool_id = $1
    `, [poolId]);

    if (poolResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Pool not found'
      });
    }

    const currentVolume = parseFloat(poolResult.rows[0].current_volume);

    // Calculate average volume across similar pools
    const avgResult = await db.query(`
      SELECT AVG(total_creator_side_stake + total_bettor_stake) as avg_volume
      FROM oracle.pools 
      WHERE pool_id != $1 AND is_settled = false
    `, [poolId]);

    const averageVolume = parseFloat(avgResult.rows[0].avg_volume) || currentVolume;

    // Initialize Web3Service if not already done
    if (!web3Service.isInitialized) {
      await web3Service.initialize();
    }

    // Get market trend from contract
    const trend = await web3Service.getMarketTrend(poolId, averageVolume.toString());

    const trendDirection = trend.trendDirection === 1 ? 'up' : 
                          trend.trendDirection === -1 ? 'down' : 'stable';

    res.json({
      success: true,
      data: {
        poolId: parseInt(poolId),
        currentVolume: currentVolume,
        averageVolume: averageVolume,
        trendDirection: trendDirection,
        trendStrength: parseInt(trend.trendStrength),
        volumeRatio: (currentVolume / averageVolume * 100).toFixed(2) + '%'
      }
    });

  } catch (error) {
    console.error('❌ Error fetching market trend:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch market trend',
      message: error.message
    });
  }
}));

module.exports = router;
