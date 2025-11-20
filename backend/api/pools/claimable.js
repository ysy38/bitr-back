const express = require('express');
const db = require('../../db/db');
const { ethers } = require('ethers');

const router = express.Router();

/**
 * GET /api/pools/claimable/:userAddress
 * Get all claimable positions for a user
 */
router.get('/:userAddress', async (req, res) => {
  try {
    const { userAddress } = req.params;
    
    if (!ethers.isAddress(userAddress)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user address'
      });
    }

    console.log(`🔍 Fetching claimable positions for user: ${userAddress}`);

    // Query for claimable single pools
    const singlePoolsQuery = `
      SELECT DISTINCT
        p.pool_id,
        p.creator,
        p.odds,
        p.settled,
        p.creator_side_won,
        p.is_private,
        p.uses_bitr,
        p.creator_stake,
        p.total_creator_side_stake,
        p.total_bettor_stake,
        p.predicted_outcome,
        p.league,
        p.category,
        p.region,
        p.event_start_time,
        p.event_end_time,
        p.settled_at,
        
        -- User's stake information
        COALESCE(lp.stake_amount, '0') as lp_stake,
        COALESCE(b.stake_amount, '0') as bettor_stake,
        
        -- Claim status
        COALESCE(c.claimed, false) as claimed,
        c.claimed_at,
        c.claimed_amount
        
      FROM core.pools p
      LEFT JOIN core.lp_stakes lp ON p.pool_id = lp.pool_id AND lp.user_address = $1
      LEFT JOIN core.bettor_stakes b ON p.pool_id = b.pool_id AND b.user_address = $1
      LEFT JOIN core.prize_claims c ON p.pool_id = c.pool_id AND c.user_address = $1
      
      WHERE p.settled = true
        AND (lp.stake_amount IS NOT NULL OR b.stake_amount IS NOT NULL)
        AND (
          (p.creator_side_won = true AND lp.stake_amount IS NOT NULL) OR
          (p.creator_side_won = false AND b.stake_amount IS NOT NULL)
        )
      ORDER BY p.settled_at DESC
    `;

    // Query for claimable combo pools
    const comboPoolsQuery = `
      SELECT DISTINCT
        cp.combo_pool_id,
        cp.settled,
        cp.creator_side_won,
        cp.uses_bitr,
        cp.total_creator_side_stake,
        cp.total_bettor_stake,
        cp.total_odds,
        cp.settled_at,
        
        -- User's stake information
        COALESCE(clp.stake_amount, '0') as combo_lp_stake,
        COALESCE(cb.stake_amount, '0') as combo_bettor_stake,
        
        -- Claim status
        COALESCE(cc.claimed, false) as combo_claimed,
        cc.claimed_at as combo_claimed_at,
        cc.claimed_amount as combo_claimed_amount,
        
        -- Pool details for display
        STRING_AGG(p.league || ' - ' || p.category, ', ') as combo_title
        
      FROM core.combo_pools cp
      LEFT JOIN core.combo_pool_pools cpp ON cp.combo_pool_id = cpp.combo_pool_id
      LEFT JOIN core.pools p ON cpp.pool_id = p.pool_id
      LEFT JOIN core.combo_lp_stakes clp ON cp.combo_pool_id = clp.combo_pool_id AND clp.user_address = $1
      LEFT JOIN core.combo_bettor_stakes cb ON cp.combo_pool_id = cb.combo_pool_id AND cb.user_address = $1
      LEFT JOIN core.combo_prize_claims cc ON cp.combo_pool_id = cc.combo_pool_id AND cc.user_address = $1
      
      WHERE cp.settled = true
        AND (clp.stake_amount IS NOT NULL OR cb.stake_amount IS NOT NULL)
        AND (
          (cp.creator_side_won = true AND clp.stake_amount IS NOT NULL) OR
          (cp.creator_side_won = false AND cb.stake_amount IS NOT NULL)
        )
      GROUP BY cp.combo_pool_id, cp.settled, cp.creator_side_won, cp.uses_bitr,
               cp.total_creator_side_stake, cp.total_bettor_stake, cp.total_odds,
               cp.settled_at, clp.stake_amount, cb.stake_amount, cc.claimed,
               cc.claimed_at, cc.claimed_amount
      ORDER BY cp.settled_at DESC
    `;

    // Execute both queries
    const [singlePoolsResult, comboPoolsResult] = await Promise.all([
      db.query(singlePoolsQuery, [userAddress]),
      db.query(comboPoolsQuery, [userAddress])
    ]);

    const positions = [];

    // Process single pools
    for (const row of singlePoolsResult.rows) {
      const isLP = parseFloat(row.lp_stake) > 0;
      const userStake = isLP ? row.lp_stake : row.bettor_stake;
      
      // Calculate potential payout
      let potentialPayout = '0';
      if (row.creator_side_won && isLP) {
        // LP wins - gets stake back plus share of bettor stakes
        const stakeAmount = BigInt(userStake);
        const totalCreatorStake = BigInt(row.total_creator_side_stake);
        const totalBettorStake = BigInt(row.total_bettor_stake);
        
        if (totalCreatorStake > 0n) {
          const sharePercentage = (stakeAmount * 10000n) / totalCreatorStake;
          potentialPayout = (stakeAmount + ((totalBettorStake * sharePercentage) / 10000n)).toString();
        }
      } else if (!row.creator_side_won && !isLP) {
        // Bettor wins - gets payout based on odds
        const stakeAmount = BigInt(userStake);
        const odds = BigInt(row.odds);
        const grossPayout = (stakeAmount * odds) / 100n;
        const profit = grossPayout - stakeAmount;
        
        // Apply fee (assuming 5% fee)
        const fee = (profit * 500n) / 10000n; // 5% fee
        potentialPayout = (grossPayout - fee).toString();
      }

      positions.push({
        poolId: row.pool_id,
        poolType: 'single',
        userStake: userStake,
        potentialPayout: potentialPayout,
        isWinner: (row.creator_side_won && isLP) || (!row.creator_side_won && !isLP),
        claimed: row.claimed,
        usesBitr: row.uses_bitr,
        marketTitle: `${row.league} - ${row.category}`,
        category: row.category,
        league: row.league,
        settledAt: new Date(row.settled_at),
        claimedAt: row.claimed_at ? new Date(row.claimed_at) : null,
        claimedAmount: row.claimed_amount
      });
    }

    // Process combo pools
    for (const row of comboPoolsResult.rows) {
      const isComboLP = parseFloat(row.combo_lp_stake) > 0;
      const userStake = isComboLP ? row.combo_lp_stake : row.combo_bettor_stake;
      
      // Calculate potential payout for combo
      let potentialPayout = '0';
      if (row.creator_side_won && isComboLP) {
        // Combo LP wins
        const stakeAmount = BigInt(userStake);
        const totalCreatorStake = BigInt(row.total_creator_side_stake);
        const totalBettorStake = BigInt(row.total_bettor_stake);
        
        if (totalCreatorStake > 0n) {
          const sharePercentage = (stakeAmount * 10000n) / totalCreatorStake;
          potentialPayout = (stakeAmount + ((totalBettorStake * sharePercentage) / 10000n)).toString();
        }
      } else if (!row.creator_side_won && !isComboLP) {
        // Combo bettor wins
        const stakeAmount = BigInt(userStake);
        const totalOdds = BigInt(row.total_odds);
        const grossPayout = (stakeAmount * totalOdds) / 100n;
        const profit = grossPayout - stakeAmount;
        
        // Apply fee (assuming 5% fee)
        const fee = (profit * 500n) / 10000n; // 5% fee
        potentialPayout = (grossPayout - fee).toString();
      }

      positions.push({
        poolId: row.combo_pool_id,
        poolType: 'combo',
        userStake: userStake,
        potentialPayout: potentialPayout,
        isWinner: (row.creator_side_won && isComboLP) || (!row.creator_side_won && !isComboLP),
        claimed: row.combo_claimed,
        usesBitr: row.uses_bitr,
        marketTitle: row.combo_title || 'Combo Market',
        category: 'combo',
        league: 'Multi-League',
        settledAt: new Date(row.settled_at),
        claimedAt: row.combo_claimed_at ? new Date(row.combo_claimed_at) : null,
        claimedAmount: row.combo_claimed_amount
      });
    }

    // Calculate summary statistics
    const totalClaimable = positions
      .filter(p => !p.claimed && p.isWinner)
      .reduce((sum, p) => sum + parseFloat(p.potentialPayout), 0);

    const totalClaimed = positions
      .filter(p => p.claimed)
      .reduce((sum, p) => sum + parseFloat(p.claimedAmount || '0'), 0);

    console.log(`✅ Found ${positions.length} positions for user ${userAddress}`);
    console.log(`💰 Total claimable: ${totalClaimable} tokens`);
    console.log(`🏆 Total claimed: ${totalClaimed} tokens`);

    res.json({
      success: true,
      data: {
        positions: positions,
        summary: {
          totalPositions: positions.length,
          claimablePositions: positions.filter(p => !p.claimed && p.isWinner).length,
          claimedPositions: positions.filter(p => p.claimed).length,
          totalClaimableAmount: totalClaimable.toString(),
          totalClaimedAmount: totalClaimed.toString()
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching claimable positions:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/pools/claimable/:userAddress/refresh
 * Refresh claimable positions by checking contract state
 */
router.post('/:userAddress/refresh', async (req, res) => {
  try {
    const { userAddress } = req.params;
    
    if (!ethers.isAddress(userAddress)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user address'
      });
    }

    console.log(`🔄 Refreshing claimable positions for user: ${userAddress}`);

    // This would typically trigger a refresh of the indexer data
    // For now, we'll just return success
    
    res.json({
      success: true,
      message: 'Claimable positions refresh initiated'
    });

  } catch (error) {
    console.error('❌ Error refreshing claimable positions:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
