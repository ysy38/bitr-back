const express = require('express');
const router = express.Router();
const db = require('../db/db');
const { ethers } = require('ethers');
const portfolioService = require('../services/portfolio-service');

// Get user profile and basic stats - CALCULATED FROM REAL DATA
router.get('/:address', async (req, res) => {
  try {
    const { address } = req.params;
    
    // Validate address format
    if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ success: false, error: 'Invalid wallet address format' });
    }
    
    const lowerAddress = address.toLowerCase();
    
    // Check if user exists in core.users first
    const userResult = await db.query(`
      SELECT 
        address,
        reputation,
        joined_at,
        last_active
      FROM core.users 
      WHERE LOWER(address) = $1
    `, [lowerAddress]);
    
    // Get all bets data for this user
    const allBetsResult = await db.query(`
      SELECT
        b.transaction_hash,
        b.pool_id,
        b.amount,
        b.is_for_outcome,
        b.created_at,
        p.is_settled,
        p.creator_side_won,
        p.odds
      FROM oracle.bets b
      LEFT JOIN oracle.pools p ON b.pool_id::bigint = p.pool_id
      WHERE LOWER(b.bettor_address) = $1
    `, [lowerAddress]);


    // Get pools created by this user
    const poolsResult = await db.query(`
      SELECT
        COUNT(*) as total_pools_created,
        SUM(CASE WHEN is_settled = true AND creator_side_won = true THEN 1 ELSE 0 END) as pools_won,
        SUM(CAST(creator_stake AS NUMERIC)) as creator_volume
      FROM oracle.pools
      WHERE LOWER(creator_address) = $1
    `, [lowerAddress]);

    const allBets = allBetsResult.rows;
    const pools = poolsResult.rows[0];

    // Calculate stats from actual bets data
    const totalBets = allBets.length;
    let wonBets = 0;
    let totalVolume = 0;
    let profitLoss = 0;
    let biggestWin = 0;

    // PROCESS EACH BET
    allBets.forEach(bet => {
      const betAmount = parseFloat(bet.amount) / 1e18; // Convert from Wei
      totalVolume += betAmount;

      if (bet.is_settled && bet.creator_side_won !== null) {
        // Determine if bettor won: bettor wins if their choice differs from creator's outcome
        const bettorWon = (bet.is_for_outcome && !bet.creator_side_won) ||
                         (!bet.is_for_outcome && bet.creator_side_won);

        if (bettorWon) {
          wonBets += 1;

          // Calculate payout using odds (odds are stored as integers like 160 for 1.60x)
          const oddsValue = bet.odds ? parseFloat(bet.odds) : 200;
          const oddsMultiplier = oddsValue / 100;
          const grossPayout = betAmount * oddsMultiplier;
          const fee = grossPayout * 0.05; // 5% fee
          const netPayout = grossPayout - fee;
          const betProfit = netPayout - betAmount;

          profitLoss += betProfit;
          biggestWin = Math.max(biggestWin, betProfit);
        } else {
          // Lost bet
          profitLoss -= betAmount;
        }
      }
    });

    const totalPoolsCreated = parseInt(pools.total_pools_created) || 0;
    const poolsWon = parseInt(pools.pools_won) || 0;
    const creatorVolume = (parseFloat(pools.creator_volume) || 0) / 1e18;
    const combinedVolume = totalVolume + creatorVolume;

    const avgBetSize = totalBets > 0 ? totalVolume / totalBets : 0;
    
    // Get favorite category
    const categoryResult = await db.query(`
      SELECT category, COUNT(*) as bet_count
      FROM oracle.bets
      WHERE LOWER(bettor_address) = $1
      GROUP BY category
      ORDER BY bet_count DESC
      LIMIT 1
    `, [lowerAddress]);
    const favoriteCategory = categoryResult.rows.length > 0 ? categoryResult.rows[0].category : 'General';
    
    const userStats = {
      address: lowerAddress,
      total_bets: totalBets,
      won_bets: wonBets,
      profit_loss: profitLoss,
      total_volume: combinedVolume,
      avg_bet_size: avgBetSize,
      biggest_win: biggestWin,
      biggest_loss: 0, // Could calculate but not critical
      current_streak: 0,
      max_win_streak: 0,
      max_loss_streak: 0,
      streak_is_win: false,
      favorite_category: favoriteCategory,
      total_pools_created: totalPoolsCreated,
      pools_won: poolsWon,
      reputation: userResult.rows.length > 0 ? (parseInt(userResult.rows[0].reputation) || 40) : 40,
      risk_score: 500,
      joined_at: userResult.rows.length > 0 ? userResult.rows[0].joined_at : null,
      last_active: userResult.rows.length > 0 ? userResult.rows[0].last_active : null
    };

    res.json({ success: true, stats: userStats });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch user profile' });
  }
});

// Enhanced profile endpoint with refunds and prizes
router.get('/:address/profile', async (req, res) => {
  try {
    const { address } = req.params;
    
    // Validate address format
    if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ success: false, error: 'Invalid wallet address format' });
    }
    
    const lowerAddress = address.toLowerCase();
    
    // Get refundable pools (closed pools with no bettor stakes)
    const refundablePools = await db.query(`
      SELECT 
        pool_id,
        creator_stake,
        created_at,
        category,
        league
      FROM oracle.pools 
      WHERE LOWER(creator_address) = $1 
        AND status = 'closed' 
        AND total_bettor_stake = '0'
      ORDER BY created_at DESC
    `, [lowerAddress]);
    
    // Get claimable Oddyssey prizes (evaluated slips with 7+ correct predictions)
    const claimablePrizes = await db.query(`
      SELECT 
        slip_id,
        cycle_id,
        leaderboard_rank,
        final_score,
        correct_count,
        placed_at,
        (correct_count >= 7) as is_eligible
      FROM oracle.oddyssey_slips 
      WHERE LOWER(player_address) = $1 
        AND is_evaluated = true 
        AND prize_claimed = false
        AND leaderboard_rank <= 3
        AND correct_count >= 7
      ORDER BY placed_at DESC
    `, [lowerAddress]);
    
    // Calculate total refundable amount
    const totalRefundable = refundablePools.rows.reduce((sum, pool) => {
      const weiAmount = BigInt(pool.creator_stake);
      const bitrAmount = Number(weiAmount) / 1e18;
      return sum + bitrAmount;
    }, 0);
    
    res.json({
      success: true,
      data: {
        refunds: {
          pools: refundablePools.rows,
          totalAmount: totalRefundable,
          count: refundablePools.rows.length
        },
        prizes: {
          slips: claimablePrizes.rows,
          count: claimablePrizes.rows.length
        }
      }
    });
    
  } catch (error) {
    console.error('Error fetching enhanced profile:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch profile data' });
  }
});

// Get user badges - REAL DATA FROM core.user_badges
router.get('/:address/badges', async (req, res) => {
  try {
    const { address } = req.params;
    
    // Validate address format
    if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ success: false, error: 'Invalid wallet address format' });
    }
    
    // Query user badges from database using correct column names
    const result = await db.query(`
      SELECT 
        id as badge_id,
        badge_type,
        badge_category,
        title,
        description,
        icon_name,
        rarity,
        earned_at,
        is_active
      FROM core.user_badges 
      WHERE LOWER(user_address) = $1
      ORDER BY earned_at DESC
    `, [address.toLowerCase()]);
    
    const badges = result.rows.map(badge => ({
      id: badge.badge_id,
      badgeType: badge.badge_type,
      badge_category: badge.badge_category || 'bettor',
      title: badge.title,
      description: badge.description,
      icon_name: badge.icon_name,
      rarity: badge.rarity,
      earned_at: badge.earned_at,
      is_active: badge.is_active || true,
      expires_at: null
    }));
    
    res.json(badges);
  } catch (error) {
    console.error('Error fetching user badges:', error);
    // Return empty array instead of 500 error
    res.json([]);
  }
});

// Get user activity - CALCULATED FROM oracle.bets AND oracle.pools
router.get('/:address/activity', async (req, res) => {
  try {
    const { address } = req.params;
    const { limit = 20 } = req.query;
    
    // Validate address format
    if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ success: false, error: 'Invalid wallet address format' });
    }
    
    const lowerAddress = address.toLowerCase();
    
    // Parse limit to ensure it's an integer
    const parsedLimit = Math.floor(parseInt(limit, 10));
    if (isNaN(parsedLimit) || parsedLimit <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid limit parameter' });
    }
    
    // Get recent bets - FIX: Cast pool_id correctly and ensure limit is integer
    const betsActivity = await db.query(`
      SELECT 
        b.transaction_hash as id,
        'bet_placed' as type,
        CONCAT('Placed bet on pool #', b.pool_id) as description,
        b.amount,
        b.created_at as timestamp,
        b.pool_id::text as pool_id,
        null as related_slip_id,
        b.category,
        b.block_number,
        b.transaction_hash as tx_hash
      FROM oracle.bets b
      WHERE LOWER(b.bettor_address) = $1
      ORDER BY b.created_at DESC
      LIMIT $2
    `, [lowerAddress, Math.floor(parsedLimit / 2)]);
    
    // Get recent pools created
    const poolsActivity = await db.query(`
      SELECT 
        p.tx_hash as id,
        'pool_created' as type,
        CONCAT('Created pool: ', COALESCE(p.title, 'Pool #' || p.pool_id)) as description,
        p.creator_stake as amount,
        p.created_at as timestamp,
        p.pool_id::text as pool_id,
        null as related_slip_id,
        p.category,
        p.block_number,
        p.tx_hash
      FROM oracle.pools p
      WHERE LOWER(p.creator_address) = $1
      ORDER BY p.created_at DESC
      LIMIT $2
    `, [lowerAddress, Math.floor(parsedLimit / 2)]);
    
    // Combine and sort activities
    const activities = [...betsActivity.rows, ...poolsActivity.rows]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, parsedLimit)
      .map(activity => ({
        id: activity.id || `activity-${activity.type}-${activity.pool_id}-${Date.parse(activity.timestamp)}`,
        type: activity.type,
        description: activity.description,
        amount: activity.amount,
        timestamp: activity.timestamp,
        poolId: activity.pool_id,
        relatedSlipId: activity.related_slip_id,
        category: activity.category,
        blockNumber: activity.block_number,
        txHash: activity.tx_hash || null
      }));
    
    res.json(activities);
  } catch (error) {
    console.error('Error fetching user activity:', error);
    // Return empty array instead of 500 error
    res.json([]);
  }
});

// Get user category performance - CALCULATED FROM oracle.bets
router.get('/:address/category-performance', async (req, res) => {
  try {
    const { address } = req.params;
    
    // Validate address format
    if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ success: false, error: 'Invalid wallet address format' });
    }
    
    // Calculate category performance from bets
    const result = await db.query(`
      SELECT 
        b.category,
        COUNT(*) as total_bets,
        SUM(CASE 
          WHEN p.is_settled = true AND 
               ((b.is_for_outcome = true AND p.creator_side_won = false) OR 
                (b.is_for_outcome = false AND p.creator_side_won = true))
          THEN 1 ELSE 0 
        END) as won_bets,
        SUM(CAST(b.amount AS NUMERIC)) as total_volume,
        AVG(CAST(b.amount AS NUMERIC)) as avg_bet_size
      FROM oracle.bets b
      LEFT JOIN oracle.pools p ON b.pool_id = p.pool_id::text
      WHERE LOWER(b.bettor_address) = $1
      GROUP BY b.category
      ORDER BY total_volume DESC
    `, [address.toLowerCase()]);
    
    const categories = result.rows.map(cat => ({
      category: cat.category || 'General',
      total_bets: parseInt(cat.total_bets) || 0,
      won_bets: parseInt(cat.won_bets) || 0,
      total_volume: (parseFloat(cat.total_volume) || 0) / 1e18,
      avg_bet_size: (parseFloat(cat.avg_bet_size) || 0) / 1e18,
      best_streak: 0,
      profit_loss: 0
    }));
    
    res.json(categories);
  } catch (error) {
    console.error('Error fetching category performance:', error);
    // Return empty array instead of 500 error
    res.json([]);
  }
});

// Get user portfolio
router.get('/:address/portfolio', async (req, res) => {
  try {
    const { address } = req.params;
    
    // Validate address format
    if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ success: false, error: 'Invalid wallet address format' });
    }
    
    const portfolio = await portfolioService.getUserPortfolio(address);
    res.json({ success: true, ...portfolio });
  } catch (error) {
    console.error('Error fetching user portfolio:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch user portfolio' });
  }
});

module.exports = router;
