const express = require('express');
const router = express.Router();
const db = require('../db/db');
const { ethers } = require('ethers');
const config = require('../config');

/**
 * GET /api/rewards/:address
 * Get all claimable rewards for a user (pools + oddyssey prizes)
 */
router.get('/:address', async (req, res) => {
  try {
    const { address } = req.params;
    
    if (!address || !ethers.isAddress(address)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid wallet address format'
      });
    }
    
    const lowerAddress = address.toLowerCase();
    
    // Get claimable pool prizes - check contract for claimable status
    const poolPrizesQuery = `
      SELECT DISTINCT
        p.pool_id,
        p.creator_address,
        p.odds,
        p.is_settled,
        p.creator_side_won,
        p.use_bitr,
        p.creator_stake,
        p.total_creator_side_stake,
        p.total_bettor_stake,
        p.predicted_outcome,
        p.league,
        p.category,
        p.settled_at,
        
        -- Check if user has bettor stake
        COALESCE((
          SELECT SUM(amount::numeric) 
          FROM oracle.bets 
          WHERE pool_id::text = p.pool_id::text 
          AND LOWER(bettor_address) = LOWER($1)
        ), 0) as bettor_stake,
        
        -- Claim status (check if user has claimed from contract or database)
        COALESCE(pc.claimed, false) as claimed,
        pc.claimed_at,
        pc.claimed_amount,
        pc.tx_hash
        
      FROM oracle.pools p
      LEFT JOIN LATERAL (
        SELECT claimed, claimed_at, claimed_amount, tx_hash
        FROM oracle.prize_claims
        WHERE pool_id = p.pool_id AND LOWER(user_address) = LOWER($1)
        LIMIT 1
      ) pc ON true
      
      WHERE p.is_settled = true
        AND (
          (LOWER(p.creator_address) = LOWER($1) AND p.creator_side_won = true) OR
          (EXISTS (
            SELECT 1 FROM oracle.bets b 
            WHERE b.pool_id::text = p.pool_id::text 
            AND LOWER(b.bettor_address) = LOWER($1)
            AND p.creator_side_won = false
          ))
        )
        AND (pc.claimed IS NULL OR pc.claimed = false)
      ORDER BY p.settled_at DESC
    `;
    
    let poolPrizes = { rows: [] };
    try {
      poolPrizes = await db.query(poolPrizesQuery, [lowerAddress]);
    } catch (error) {
      console.warn('Pool prizes query failed (prize_claims table may not exist):', error.message);
      // Try without prize_claims join
      const simplePoolQuery = poolPrizesQuery.replace(/LEFT JOIN LATERAL.*?pc ON true/, '');
      poolPrizes = await db.query(simplePoolQuery.replace(/AND \(pc\.claimed.*?\)/, ''), [lowerAddress]);
    }
    
    // Get claimable combo pool prizes (if combo pools exist)
    const comboPrizesQuery = `
      SELECT DISTINCT
        cp.combo_pool_id,
        cp.is_settled,
        cp.creator_side_won,
        cp.use_bitr,
        cp.total_creator_side_stake,
        cp.total_bettor_stake,
        cp.total_odds,
        cp.settled_at,
        
        -- User's stake information
        COALESCE((
          SELECT SUM(stake_amount::numeric) 
          FROM oracle.combo_lp_stakes 
          WHERE combo_pool_id = cp.combo_pool_id 
          AND LOWER(user_address) = LOWER($1)
        ), 0) as combo_lp_stake,
        COALESCE((
          SELECT SUM(stake_amount::numeric) 
          FROM oracle.combo_bettor_stakes 
          WHERE combo_pool_id = cp.combo_pool_id 
          AND LOWER(user_address) = LOWER($1)
        ), 0) as combo_bettor_stake,
        
        -- Claim status (if combo_prize_claims table exists)
        false as combo_claimed
        
      FROM oracle.combo_pools cp
      
      WHERE cp.is_settled = true
        AND (
          (LOWER(cp.creator_address) = LOWER($1) AND cp.creator_side_won = true) OR
          (EXISTS (
            SELECT 1 FROM oracle.combo_bettor_stakes cbs 
            WHERE cbs.combo_pool_id = cp.combo_pool_id 
            AND LOWER(cbs.user_address) = LOWER($1)
            AND cp.creator_side_won = false
          ))
        )
      ORDER BY cp.settled_at DESC
    `;
    
    let comboPrizes = { rows: [] };
    try {
      comboPrizes = await db.query(comboPrizesQuery, [lowerAddress]);
    } catch (error) {
      console.warn('Combo pools query failed (table may not exist):', error.message);
    }
    
    // Get claimable Oddyssey prizes
    const oddysseyPrizesQuery = `
      SELECT 
        s.slip_id, 
        s.cycle_id, 
        s.final_score, 
        s.correct_count,
        s.leaderboard_rank, 
        s.placed_at,
        c.is_resolved, 
        c.prize_pool, 
        c.claimable_start_time,
        CASE WHEN pc.claimed_at IS NOT NULL OR pc.tx_hash IS NOT NULL THEN true ELSE false END as already_claimed,
        COALESCE(pc.amount, 0) as claimed_amount,
        pc.tx_hash,
        pc.claimed_at,
        -- Calculate prize amount from leaderboard rank
        CASE 
          WHEN s.leaderboard_rank = 1 THEN c.prize_pool * 0.5
          WHEN s.leaderboard_rank = 2 THEN c.prize_pool * 0.3
          WHEN s.leaderboard_rank = 3 THEN c.prize_pool * 0.2
          ELSE 0
        END as prize_amount
      FROM oracle.oddyssey_slips s
      LEFT JOIN oracle.oddyssey_cycles c ON s.cycle_id = c.cycle_id
      LEFT JOIN oracle.oddyssey_prize_claims pc ON s.cycle_id = pc.cycle_id 
        AND pc.rank = s.leaderboard_rank AND LOWER(pc.player_address) = LOWER($1)
      WHERE LOWER(s.player_address) = LOWER($1)
        AND s.is_evaluated = true
        AND s.correct_count >= 7
        AND s.leaderboard_rank <= 3
        AND c.is_resolved = true
        AND (c.claimable_start_time IS NULL OR c.claimable_start_time <= EXTRACT(EPOCH FROM NOW()))
        AND (pc.claimed IS NULL OR pc.claimed = false)
      ORDER BY s.cycle_id DESC, s.final_score DESC
    `;
    
    let oddysseyPrizes = { rows: [] };
    try {
      oddysseyPrizes = await db.query(oddysseyPrizesQuery, [lowerAddress]);
    } catch (error) {
      console.warn('Oddyssey prizes query failed:', error.message);
    }
    
    // Process pool prizes
    const processedPoolPrizes = poolPrizes.rows.map(row => {
      const stakeAmount = parseFloat(row.bettor_stake || row.creator_stake || '0');
      const isCreator = row.creator_address?.toLowerCase() === lowerAddress;
      const isWinner = (row.creator_side_won && isCreator) || (!row.creator_side_won && parseFloat(row.bettor_stake) > 0);
      
      // Calculate claimable amount (simplified - actual calculation should use contract)
      const oddsDecimal = parseFloat(row.odds) / 100;
      let claimableAmount = 0;
      if (isWinner) {
        if (isCreator) {
          // Creator gets their stake back + share of bettor stakes
          claimableAmount = stakeAmount * oddsDecimal;
        } else {
          // Bettor gets stake * odds
          claimableAmount = stakeAmount * oddsDecimal;
        }
      }
      
      return {
        type: 'pool',
        id: row.pool_id,
        poolId: row.pool_id,
        league: row.league,
        category: row.category,
        predictedOutcome: row.predicted_outcome,
        stakeAmount: stakeAmount,
        claimableAmount: claimableAmount,
        currency: row.use_bitr ? 'BITR' : 'STT',
        settledAt: row.settled_at,
        claimed: row.claimed || false,
        txHash: row.tx_hash
      };
    });
    
    // Process combo prizes
    const processedComboPrizes = comboPrizes.rows.map(row => {
      const stakeAmount = parseFloat(row.combo_lp_stake || row.combo_bettor_stake || '0');
      const isWinner = (row.creator_side_won && parseFloat(row.combo_lp_stake) > 0) || 
                      (!row.creator_side_won && parseFloat(row.combo_bettor_stake) > 0);
      
      // Calculate claimable amount
      const oddsDecimal = parseFloat(row.total_odds) / 100;
      const claimableAmount = isWinner ? stakeAmount * oddsDecimal : 0;
      
      return {
        type: 'combo',
        id: row.combo_pool_id,
        comboPoolId: row.combo_pool_id,
        title: 'Combo Pool',
        stakeAmount: stakeAmount,
        claimableAmount: claimableAmount,
        currency: row.use_bitr ? 'BITR' : 'STT',
        settledAt: row.settled_at,
        claimed: row.combo_claimed || false,
        txHash: null
      };
    });
    
    // Process Oddyssey prizes
    const processedOddysseyPrizes = oddysseyPrizes.rows.map(row => ({
      type: 'oddyssey',
      id: `${row.cycle_id}-${row.slip_id}`,
      cycleId: row.cycle_id,
      slipId: row.slip_id,
      finalScore: parseFloat(row.final_score) || 0,
      correctCount: row.correct_count,
      leaderboardRank: row.leaderboard_rank,
      prizeAmount: parseFloat(row.prize_amount) || 0,
      placedAt: row.placed_at,
      claimed: row.already_claimed || false,
      txHash: row.tx_hash,
      currency: 'BITR'
    }));
    
    // Calculate totals
    const totalClaimable = [
      ...processedPoolPrizes,
      ...processedComboPrizes,
      ...processedOddysseyPrizes
    ].reduce((sum, prize) => sum + (prize.claimableAmount || prize.prizeAmount || 0), 0);
    
    res.json({
      success: true,
      data: {
        rewards: {
          pools: processedPoolPrizes,
          combos: processedComboPrizes,
          oddyssey: processedOddysseyPrizes,
          all: [...processedPoolPrizes, ...processedComboPrizes, ...processedOddysseyPrizes]
        },
        summary: {
          totalClaimable,
          poolCount: processedPoolPrizes.length,
          comboCount: processedComboPrizes.length,
          oddysseyCount: processedOddysseyPrizes.length,
          totalCount: processedPoolPrizes.length + processedComboPrizes.length + processedOddysseyPrizes.length
        }
      }
    });
    
  } catch (error) {
    console.error('Error fetching rewards:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * GET /api/rewards/events/all
 * Get all platform claims (for events table)
 */
router.get('/events/all', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
    const offset = parseInt(req.query.offset) || 0;
    
    // Get all pool prize claims
    const poolClaimsQuery = `
      SELECT 
        c.pool_id,
        c.user_address,
        c.claimed_amount,
        c.claimed_at,
        c.tx_hash,
        p.league,
        p.category,
        p.predicted_outcome,
        p.use_bitr,
        'pool' as claim_type
      FROM oracle.prize_claims c
      JOIN oracle.pools p ON c.pool_id = p.pool_id
      WHERE c.claimed = true OR c.tx_hash IS NOT NULL
      ORDER BY c.claimed_at DESC
      LIMIT $1 OFFSET $2
    `;
    
    let poolClaims = { rows: [] };
    try {
      poolClaims = await db.query(poolClaimsQuery, [limit, offset]);
    } catch (error) {
      console.warn('Pool claims query failed (prize_claims table may not exist):', error.message);
    }
    
    // Get all Oddyssey prize claims
    const oddysseyClaimsQuery = `
      SELECT 
        pc.cycle_id::text || '-' || pc.rank::text as pool_id,
        pc.player_address as user_address,
        pc.amount as claimed_amount,
        pc.claimed_at,
        pc.tx_hash,
        'Oddyssey' as league,
        'oddyssey' as category,
        'Cycle ' || pc.cycle_id || ' Prize' as predicted_outcome,
        false as use_bitr,
        'oddyssey' as claim_type
      FROM oracle.oddyssey_prize_claims pc
      WHERE pc.claimed_at IS NOT NULL OR pc.tx_hash IS NOT NULL
      ORDER BY pc.claimed_at DESC
      LIMIT $1 OFFSET $2
    `;
    
    let oddysseyClaims = { rows: [] };
    try {
      oddysseyClaims = await db.query(oddysseyClaimsQuery, [limit, offset]);
    } catch (error) {
      console.warn('Oddyssey claims query failed:', error.message);
    }
    
    // Combine and format all claims
    const allClaims = [
      ...poolClaims.rows.map(row => ({
        id: `pool-${row.pool_id}`,
        type: 'pool',
        poolId: row.pool_id,
        userAddress: row.user_address,
        amount: parseFloat(row.claimed_amount || '0') / 1e18,
        currency: row.use_bitr ? 'BITR' : 'STT',
        claimedAt: row.claimed_at,
        txHash: row.tx_hash,
        league: row.league,
        category: row.category,
        outcome: row.predicted_outcome
      })),
      ...oddysseyClaims.rows.map(row => ({
        id: `oddyssey-${row.pool_id}`,
        type: 'oddyssey',
        poolId: row.pool_id,
        userAddress: row.user_address,
        amount: parseFloat(row.claimed_amount || '0') / 1e18,
        currency: 'BITR',
        claimedAt: row.claimed_at,
        txHash: row.tx_hash,
        league: row.league,
        category: row.category,
        outcome: row.predicted_outcome
      }))
    ].sort((a, b) => new Date(b.claimedAt) - new Date(a.claimedAt));
    
    res.json({
      success: true,
      data: {
        claims: allClaims,
        total: allClaims.length
      }
    });
    
  } catch (error) {
    console.error('Error fetching platform claims:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

module.exports = router;

