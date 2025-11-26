const express = require('express');
const router = express.Router();
const { ethers } = require('ethers');
const config = require('../config');
const db = require('../db/db');

// Staking contract ABI (simplified)
const STAKING_ABI = [
  "function totalStaked() external view returns (uint256)",
  "function totalRewardsPaid() external view returns (uint256)",
  "function getUserStakes(address user) external view returns (tuple(uint256 amount, uint256 startTime, uint8 tierId, uint8 durationOption, uint256 claimedRewardBITR, uint256 rewardDebtBITR, uint256 rewardDebtSTT)[])",
  "function getTiers() external view returns (tuple(uint256 baseAPY, uint256 minStake, uint256 revenueShareRate)[])",
  "function getContractStats() external view returns (uint256 _totalStaked, uint256 _totalRewardsPaid, uint256 _totalRevenuePaid, uint256 _contractBITRBalance, uint256 _contractSTTBalance)",
  "function getDurationOptions() external view returns (uint256[] memory)",
  "function calculateRewards(address user, uint256 stakeIndex) external view returns (uint256 bitrRewards, uint256 sttRewards)"
];

/**
 * GET /api/staking/statistics
 * Get overall staking statistics
 */
router.get('/statistics', async (req, res) => {
  try {
    // Check if staking contract address is configured
    if (!config.blockchain.contractAddresses.stakingContract) {
      console.warn('⚠️ Staking contract address not configured');
      return res.json({
        totalStaked: '0',
        totalRewardsPaid: '0',
        totalRevenuePaid: '0',
        uniqueStakers: 0,
        tiers: [],
        message: 'Staking contract not configured'
      });
    }

    const provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    const stakingContract = new ethers.Contract(
      config.blockchain.contractAddresses.stakingContract,
      STAKING_ABI,
      provider
    );

    // Get contract data with error handling
    let totalStaked = BigInt(0);
    let totalRewardsPaid = BigInt(0);
    let totalRevenuePaid = BigInt(0);
    let tiers = [];
    let durationOptions = [];
    let analytics = {};

    try {
      const totalStakedResult = await stakingContract.totalStaked();
      const totalRewardsPaidResult = await stakingContract.totalRewardsPaid();
      const totalRevenuePaidResult = await stakingContract.totalRevenuePaid();
      const tiersResult = await stakingContract.getTiers();
      const durationOptionsResult = await stakingContract.getDurationOptions();
      
      // Safely convert to BigInt
      totalStaked = typeof totalStakedResult === 'bigint' ? totalStakedResult : BigInt(totalStakedResult.toString());
      totalRewardsPaid = typeof totalRewardsPaidResult === 'bigint' ? totalRewardsPaidResult : BigInt(totalRewardsPaidResult.toString());
      totalRevenuePaid = typeof totalRevenuePaidResult === 'bigint' ? totalRevenuePaidResult : BigInt(totalRevenuePaidResult.toString());
      
      // Ensure arrays
      tiers = Array.isArray(tiersResult) ? tiersResult : [];
      durationOptions = Array.isArray(durationOptionsResult) ? durationOptionsResult : [];
    } catch (contractError) {
      console.warn('⚠️ Contract calls failed for statistics:', contractError.message);
      // Continue with default values if contract calls fail
      totalStaked = BigInt(0);
      totalRewardsPaid = BigInt(0);
      totalRevenuePaid = BigInt(0);
      tiers = [];
      durationOptions = [];
    }

    // Get analytics from database with error handling
    try {
      const analyticsQuery = await db.query(`
        SELECT 
          COUNT(DISTINCT user_address) as unique_stakers,
          COUNT(*) as total_stakes,
          AVG(CAST(amount AS DECIMAL)) as avg_stake_amount,
          MIN(timestamp) as first_stake_time,
          MAX(timestamp) as last_activity,
          COUNT(CASE WHEN timestamp >= NOW() - INTERVAL '24 hours' THEN 1 END) as stakes_24h,
          COUNT(CASE WHEN action_type = 'UNSTAKE' AND timestamp >= NOW() - INTERVAL '24 hours' THEN 1 END) as unstakes_24h
        FROM airdrop.staking_activities
      `);
      
      if (analyticsQuery.rows.length > 0) {
        analytics = analyticsQuery.rows[0];
      }
    } catch (dbError) {
      console.warn('⚠️ Database query failed for analytics:', dbError.message);
      analytics = {
        unique_stakers: 0,
        total_stakes: 0,
        avg_stake_amount: '0',
        first_stake_time: null,
        last_activity: null,
        stakes_24h: 0,
        unstakes_24h: 0
      };
    }
    
    // Ensure analytics object has all required properties
    analytics = {
      unique_stakers: analytics.unique_stakers || 0,
      total_stakes: analytics.total_stakes || 0,
      avg_stake_amount: analytics.avg_stake_amount || '0',
      first_stake_time: analytics.first_stake_time || null,
      last_activity: analytics.last_activity || null,
      stakes_24h: analytics.stakes_24h || 0,
      unstakes_24h: analytics.unstakes_24h || 0
    };

    // Format tiers data with error handling and BigInt safety
    let formattedTiers = [];
    try {
      // Ensure tiers and durationOptions are arrays
      const safeTiers = Array.isArray(tiers) ? tiers : [];
      const safeDurationOptions = Array.isArray(durationOptions) ? durationOptions : [];
      
      formattedTiers = safeTiers.map((tier, index) => {
        // Safely convert tier values
        const safeToString = (value) => {
          if (value === null || value === undefined) return '0';
          if (typeof value === 'bigint') return value.toString();
          if (typeof value === 'object' && value.toString) return value.toString();
          return String(value);
        };
        
        const safeToNumber = (value) => {
          if (value === null || value === undefined) return 0;
          if (typeof value === 'bigint') return Number(value);
          if (typeof value === 'number') return value;
          return Number(value) || 0;
        };
        
        return {
          id: index,
          baseAPY: safeToNumber(tier?.baseAPY),
          minStake: safeToString(tier?.minStake || 0), // Convert BigInt to string
          revenueShareRate: safeToNumber(tier?.revenueShareRate),
          durationOptions: safeDurationOptions.map((duration, durationIndex) => {
            const durationValue = typeof duration === 'bigint' ? Number(duration) : Number(duration) || 0;
            return {
              id: durationIndex,
              duration: safeToString(duration),
              bonus: durationIndex === 0 ? 0 : durationIndex === 1 ? 200 : 400, // 0%, 2%, 4% bonuses
              formatted: `${durationValue / (24 * 60 * 60)} days`
            };
          })
        };
      });
    } catch (tierError) {
      console.warn('⚠️ Tier formatting failed, using default tiers:', tierError.message);
      formattedTiers = [];
    }

    res.json({
      contract: {
        totalStaked: totalStaked.toString(), // Convert BigInt to string
        totalRewardsPaid: totalRewardsPaid.toString(), // Convert BigInt to string
        totalRevenuePaid: totalRevenuePaid.toString(), // Convert BigInt to string
      formatted: {
        totalStaked: ethers.formatEther(totalStaked.toString()) + ' BITR',
        totalRewardsPaid: ethers.formatEther(totalRewardsPaid.toString()) + ' BITR',
        totalRevenuePaid: ethers.formatEther(totalRevenuePaid.toString()) + ' BITR'
      }
      },
      analytics: {
        uniqueStakers: analytics.unique_stakers,
        totalStakes: analytics.total_stakes,
        avgStakeAmount: analytics.avg_stake_amount,
        firstStakeTime: analytics.first_stake_time,
        lastActivity: analytics.last_activity,
        stakes24h: analytics.stakes_24h,
        unstakes24h: analytics.unstakes_24h
      },
      tiers: formattedTiers,
      message: 'Staking statistics retrieved successfully'
    });

  } catch (error) {
    console.error('Error getting staking statistics:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get staking statistics'
    });
  }
});

/**
 * GET /api/staking/user/:address
 * Get user's staking data and history
 */
router.get('/user/:address', async (req, res) => {
  try {
    const { address } = req.params;

    if (!ethers.isAddress(address)) {
      return res.status(400).json({
        error: 'Invalid wallet address format'
      });
    }

    // Check if staking contract address is configured
    if (!config.blockchain.contractAddresses.stakingContract) {
      console.warn('⚠️ Staking contract address not configured');
      return res.json({
        stakes: [],
        totalStaked: '0',
        totalPendingRewards: '0',
        message: 'Staking contract not configured'
      });
    }

    const provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    const stakingContract = new ethers.Contract(
      config.blockchain.contractAddresses.stakingContract,
      STAKING_ABI,
      provider
    );

    // Get user stakes from contract with error handling
    let userStakes = [];
    let tiers = [];
    
    try {
      const stakesResult = await stakingContract.getUserStakes(address);
      // Ensure we have an array
      userStakes = Array.isArray(stakesResult) ? stakesResult : [];
      tiers = await stakingContract.getTiers();
      // Ensure tiers is an array
      tiers = Array.isArray(tiers) ? tiers : [];
    } catch (error) {
      console.error('Error fetching staking data from contract:', error);
      return res.json({
        stakes: [],
        totalStaked: '0',
        totalPendingRewards: '0',
        message: 'Failed to fetch staking data from contract'
      });
    }

    // Convert BigInt values to strings for safe JSON serialization
    // Use Promise.all to properly await async calculateRewards calls
    const stakesWithRewards = await Promise.all(
      userStakes.map(async (stake, index) => {
        // Calculate pending rewards for each stake (async call)
        let pendingRewards = BigInt(0);
        try {
          const rewardsResult = await stakingContract.calculateRewards(address, index);
          // Handle both single value and tuple returns
          if (Array.isArray(rewardsResult)) {
            pendingRewards = rewardsResult[0] || BigInt(0);
          } else {
            pendingRewards = rewardsResult || BigInt(0);
          }
          // Ensure it's a BigInt
          if (typeof pendingRewards !== 'bigint') {
            pendingRewards = BigInt(pendingRewards.toString());
          }
        } catch (error) {
          console.warn(`Could not calculate rewards for stake ${index}:`, error.message);
          pendingRewards = BigInt(0);
        }

        // Safely convert all BigInt values to strings
        const safeToString = (value) => {
          if (value === null || value === undefined) return '0';
          if (typeof value === 'bigint') return value.toString();
          if (typeof value === 'object' && value.toString) return value.toString();
          return String(value);
        };

        return {
          index,
          amount: safeToString(stake.amount), // Convert BigInt to string
          startTime: safeToString(stake.startTime), // Convert BigInt to string
          tierId: Number(stake.tierId) || 0,
          durationOption: Number(stake.durationOption) || 0,
          claimedRewardBITR: safeToString(stake.claimedRewardBITR), // Convert BigInt to string
          rewardDebtBITR: safeToString(stake.rewardDebtBITR), // Convert BigInt to string
          rewardDebtSTT: safeToString(stake.rewardDebtSTT), // Convert BigInt to string
          pendingRewards: safeToString(pendingRewards) // Convert BigInt to string
        };
      })
    );

    // Calculate totals with BigInt safety
    const totalStaked = stakesWithRewards.reduce((sum, stake) => {
      try {
        return sum + BigInt(stake.amount || '0');
      } catch (e) {
        return sum;
      }
    }, BigInt(0));
    
    const totalPendingRewards = stakesWithRewards.reduce((sum, stake) => {
      try {
        return sum + BigInt(stake.pendingRewards || '0');
      } catch (e) {
        return sum;
      }
    }, BigInt(0));
    
    const totalClaimedRewards = stakesWithRewards.reduce((sum, stake) => {
      try {
        return sum + BigInt(stake.claimedRewardBITR || '0');
      } catch (e) {
        return sum;
      }
    }, BigInt(0));

    // Get staking history from database with error handling
    let historyQuery;
    try {
      historyQuery = await db.query(`
        SELECT action_type, amount, tier_id, duration_option, timestamp, tx_hash, block_number
        FROM airdrop.staking_activities 
        WHERE user_address = $1
        ORDER BY timestamp DESC
        LIMIT 50
      `, [address]);
    } catch (dbError) {
      console.warn('⚠️ Database query failed for staking history:', dbError.message);
      historyQuery = { rows: [] };
    }

    res.json({
      address,
      stakes: stakesWithRewards,
      summary: {
        totalStakes: stakesWithRewards.length,
        totalStaked: totalStaked.toString(), // Convert BigInt to string
        totalPendingRewards: totalPendingRewards.toString(), // Convert BigInt to string
        totalClaimedRewards: totalClaimedRewards.toString(), // Convert BigInt to string
        activeStakes: stakesWithRewards.filter(stake => {
          try {
            return BigInt(stake.amount || '0') > BigInt(0);
          } catch (e) {
            return false;
          }
        }).length
      },
      history: (historyQuery.rows || []).map(event => ({
        actionType: event.action_type || null,
        amount: event.amount ? String(event.amount) : '0',
        tierId: event.tier_id !== null && event.tier_id !== undefined ? Number(event.tier_id) : null,
        durationOption: event.duration_option !== null && event.duration_option !== undefined ? Number(event.duration_option) : null,
        timestamp: event.timestamp || null,
        txHash: event.tx_hash || null,
        blockNumber: event.block_number ? String(event.block_number) : null
      })),
      formatted: {
        totalStaked: ethers.formatEther(totalStaked.toString()) + ' BITR',
        totalPendingRewards: ethers.formatEther(totalPendingRewards.toString()) + ' BITR',
        totalClaimedRewards: ethers.formatEther(totalClaimedRewards.toString()) + ' BITR'
      }
    });

  } catch (error) {
    console.error('Error getting user staking data:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get user staking data'
    });
  }
});

/**
 * GET /api/staking/leaderboard
 * Get staking leaderboard
 */
router.get('/leaderboard', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
    const timeframe = req.query.timeframe || '30d'; // 7d, 30d, 90d, all

    let timeFilter = '';
    if (timeframe !== 'all') {
      const days = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : 90;
      timeFilter = `AND se.timestamp >= NOW() - INTERVAL '${days} days'`;
    }

    let leaderboardQuery;
    try {
      // Check if analytics.staking_events table exists
      const tableExistsQuery = await db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'analytics' 
          AND table_name = 'staking_events'
        );
      `);
      
      if (tableExistsQuery.rows[0]?.exists) {
        leaderboardQuery = await db.query(`
          SELECT 
            se.user_address,
            SUM(CASE WHEN se.action_type = 'STAKE' THEN se.amount::numeric ELSE 0 END) as total_staked,
            SUM(CASE WHEN se.action_type = 'CLAIM_REWARDS' THEN se.amount::numeric ELSE 0 END) as total_claimed,
            COUNT(CASE WHEN se.action_type = 'STAKE' THEN 1 END) as stake_count,
            MIN(CASE WHEN se.action_type = 'STAKE' THEN se.timestamp END) as first_stake,
            MAX(se.timestamp) as last_activity,
            AVG(CASE WHEN se.action_type = 'STAKE' THEN se.tier_id END) as avg_tier
          FROM analytics.staking_events se
          WHERE 1=1 ${timeFilter}
          GROUP BY se.user_address
          HAVING SUM(CASE WHEN se.action_type = 'STAKE' THEN se.amount::numeric ELSE 0 END) > 0
          ORDER BY total_staked DESC
          LIMIT $1
        `, [limit]);
      } else {
        console.warn('⚠️ analytics.staking_events table does not exist, using empty leaderboard');
        leaderboardQuery = { rows: [] };
      }
    } catch (dbError) {
      console.warn('⚠️ Database query failed for leaderboard:', dbError.message);
      leaderboardQuery = { rows: [] };
    }

    // Ensure leaderboardQuery.rows is always an array
    if (!Array.isArray(leaderboardQuery.rows)) {
      console.warn('⚠️ leaderboardQuery.rows is not an array, using empty array');
      leaderboardQuery.rows = [];
    }

    const leaderboard = leaderboardQuery.rows.map((user, index) => ({
      rank: index + 1,
      address: user.user_address,
      totalStaked: user.total_staked || '0',
      totalClaimed: user.total_claimed || '0',
      stakeCount: parseInt(user.stake_count || 0),
      firstStake: user.first_stake,
      lastActivity: user.last_activity,
      avgTier: parseFloat(user.avg_tier || 0).toFixed(1)
    }));

    res.json({
      leaderboard,
      timeframe,
      totalUsers: leaderboard.length,
      showingTop: Math.min(limit, leaderboard.length)
    });

  } catch (error) {
    console.error('Error getting staking leaderboard:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get staking leaderboard'
    });
  }
});

/**
 * GET /api/staking/tiers
 * Get detailed tier information
 */
router.get('/tiers', async (req, res) => {
  try {
    const provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    const stakingContract = new ethers.Contract(
      config.blockchain.contractAddresses.stakingContract,
      STAKING_ABI,
      provider
    );

    let tiers, durationOptions;
    try {
      tiers = await stakingContract.getTiers();
      durationOptions = await stakingContract.getDurationOptions();
      
      // Ensure arrays are properly initialized
      if (!Array.isArray(tiers)) {
        console.warn('⚠️ getTiers returned non-array, using empty array');
        tiers = [];
      }
      
      if (!Array.isArray(durationOptions)) {
        console.warn('⚠️ getDurationOptions returned non-array, using empty array');
        durationOptions = [];
      }
    } catch (contractError) {
      console.warn('⚠️ Contract call failed for tiers:', contractError.message);
      tiers = [];
      durationOptions = [];
    }

    // Get tier usage statistics from database
    let tierStatsQuery;
    try {
      // Check if analytics.staking_events table exists
      const tableExistsQuery = await db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'analytics' 
          AND table_name = 'staking_events'
        );
      `);
      
      if (tableExistsQuery.rows[0]?.exists) {
        tierStatsQuery = await db.query(`
          SELECT 
            tier_id,
            COUNT(DISTINCT user_address) as unique_stakers,
            COUNT(*) as total_stakes,
            SUM(amount::numeric) as total_amount,
            AVG(amount::numeric) as avg_stake_amount
          FROM analytics.staking_events
          WHERE action_type = 'STAKE'
            AND timestamp >= NOW() - INTERVAL '30 days'
          GROUP BY tier_id
          ORDER BY tier_id
        `);
      } else {
        console.warn('⚠️ analytics.staking_events table does not exist, using empty tier stats');
        tierStatsQuery = { rows: [] };
      }
    } catch (dbError) {
      console.warn('⚠️ Database query failed for tier stats:', dbError.message);
      tierStatsQuery = { rows: [] };
    }

    const tierStats = {};
    
    // Ensure tierStatsQuery.rows is always an array
    if (Array.isArray(tierStatsQuery.rows)) {
      tierStatsQuery.rows.forEach(stat => {
        tierStats[stat.tier_id] = {
          uniqueStakers: parseInt(stat.unique_stakers || 0),
          totalStakes: parseInt(stat.total_stakes || 0),
          totalAmount: stat.total_amount || '0',
          avgStakeAmount: stat.avg_stake_amount || '0'
        };
      });
    }

    // Helper function to safely convert values
    const safeToString = (value) => {
      if (value === null || value === undefined) return '0';
      if (typeof value === 'bigint') return value.toString();
      if (typeof value === 'object' && value.toString) return value.toString();
      return String(value);
    };
    
    const safeToNumber = (value) => {
      if (value === null || value === undefined) return 0;
      if (typeof value === 'bigint') return Number(value);
      if (typeof value === 'number') return value;
      return Number(value) || 0;
    };
    
    const formattedTiers = tiers.map((tier, index) => {
      const minStakeValue = tier?.minStake || 0;
      const baseAPYValue = safeToNumber(tier?.baseAPY);
      const revenueShareValue = safeToNumber(tier?.revenueShareRate);
      
      return {
        id: index,
        name: ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'][index] || `Tier ${index}`,
        baseAPY: baseAPYValue,
        minStake: safeToString(minStakeValue),
        revenueShareRate: revenueShareValue,
        durationOptions: durationOptions.map((duration, durationIndex) => {
          const durationValue = safeToNumber(duration);
          return {
            id: durationIndex,
            duration: safeToString(duration),
            bonus: durationIndex === 0 ? 0 : durationIndex === 1 ? 200 : 400, // 0%, 2%, 4% bonuses
            formatted: `${durationValue / (24 * 60 * 60)} days`
          };
        }),
        statistics: tierStats[index] || {
          uniqueStakers: 0,
          totalStakes: 0,
          totalAmount: '0',
          avgStakeAmount: '0'
        },
        formatted: {
          minStake: ethers.formatEther(safeToString(minStakeValue)) + ' BITR',
          baseAPY: (baseAPYValue / 100).toFixed(2) + '%',
          revenueShare: (revenueShareValue / 100).toFixed(2) + '%'
        }
      };
    });

    res.json({
      tiers: formattedTiers,
      durationMultipliers: {
        thirtyDays: 100, // Base multiplier
        sixtyDays: 110,  // 10% bonus
        ninetyDays: 125  // 25% bonus
      }
    });

  } catch (error) {
    console.error('Error getting tier information:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get tier information'
    });
  }
});

/**
 * GET /api/staking/analytics
 * Get detailed staking analytics
 */
router.get('/analytics', async (req, res) => {
  try {
    const timeframe = req.query.timeframe || '30d';
    const days = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : 90;

    // Daily staking activity with error handling
    let dailyActivityQuery;
    try {
      dailyActivityQuery = await db.query(`
        SELECT 
          DATE(timestamp) as date,
          COUNT(CASE WHEN action_type = 'STAKE' THEN 1 END) as stakes,
          COUNT(CASE WHEN action_type = 'UNSTAKE' THEN 1 END) as unstakes,
          COUNT(CASE WHEN action_type = 'CLAIM_REWARDS' THEN 1 END) as claims,
          SUM(CASE WHEN action_type = 'STAKE' THEN amount::numeric ELSE 0 END) as stake_volume,
          COUNT(DISTINCT user_address) as unique_users
        FROM analytics.staking_events
        WHERE timestamp >= NOW() - INTERVAL '${days} days'
        GROUP BY DATE(timestamp)
        ORDER BY date DESC
      `);
    } catch (dbError) {
      console.warn('⚠️ Database query failed for daily activity:', dbError.message);
      dailyActivityQuery = { rows: [] };
    }

    // Tier distribution with error handling
    let tierDistributionQuery;
    try {
      tierDistributionQuery = await db.query(`
        SELECT 
          tier_id,
          COUNT(*) as stake_count,
          SUM(amount::numeric) as total_amount
        FROM analytics.staking_events
        WHERE action_type = 'STAKE'
          AND timestamp >= NOW() - INTERVAL '${days} days'
        GROUP BY tier_id
        ORDER BY tier_id
      `);
    } catch (dbError) {
      console.warn('⚠️ Database query failed for tier distribution:', dbError.message);
      tierDistributionQuery = { rows: [] };
    }

    // Duration option distribution with error handling
    let durationDistributionQuery;
    try {
      durationDistributionQuery = await db.query(`
        SELECT 
          duration_option,
          COUNT(*) as stake_count,
          SUM(amount::numeric) as total_amount
        FROM analytics.staking_events
        WHERE action_type = 'STAKE'
          AND timestamp >= NOW() - INTERVAL '${days} days'
        GROUP BY duration_option
        ORDER BY duration_option
      `);
    } catch (dbError) {
      console.warn('⚠️ Database query failed for duration distribution:', dbError.message);
      durationDistributionQuery = { rows: [] };
    }

    res.json({
      timeframe,
      dailyActivity: (dailyActivityQuery.rows || []).map(row => ({
        date: row.date || null,
        stakes: parseInt(row.stakes || 0),
        unstakes: parseInt(row.unstakes || 0),
        claims: parseInt(row.claims || 0),
        stakeVolume: row.stake_volume ? String(row.stake_volume) : '0',
        uniqueUsers: parseInt(row.unique_users || 0)
      })),
      tierDistribution: (tierDistributionQuery.rows || []).map(row => ({
        tierId: row.tier_id !== null && row.tier_id !== undefined ? parseInt(row.tier_id) : null,
        tierName: ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'][row.tier_id] || `Tier ${row.tier_id}`,
        stakeCount: parseInt(row.stake_count || 0),
        totalAmount: row.total_amount ? String(row.total_amount) : '0'
      })),
      durationDistribution: (durationDistributionQuery.rows || []).map(row => ({
        durationOption: row.duration_option !== null && row.duration_option !== undefined ? parseInt(row.duration_option) : null,
        durationName: ['30 Days', '60 Days', '90 Days'][row.duration_option] || `Duration ${row.duration_option}`,
        stakeCount: parseInt(row.stake_count || 0),
        totalAmount: row.total_amount ? String(row.total_amount) : '0'
      }))
    });

  } catch (error) {
    console.error('Error getting staking analytics:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get staking analytics'
    });
  }
});

module.exports = router; 