const express = require('express');
const router = express.Router();
const { ethers } = require('ethers');
const db = require('../db/db');

/**
 * POST /api/claim-oddyssey/:cycleId/:slipId
 * Claim prizes from an Odyssey slip using direct contract interaction
 */
router.post('/:cycleId/:slipId', async (req, res) => {
  try {
    const { cycleId, slipId } = req.params;
    const { userAddress } = req.body;

    if (!cycleId || isNaN(cycleId)) {
      return res.status(400).json({
        success: false,
        error: 'Valid cycle ID is required'
      });
    }

    if (!slipId || isNaN(slipId)) {
      return res.status(400).json({
        success: false,
        error: 'Valid slip ID is required'
      });
    }

    if (!userAddress || !ethers.isAddress(userAddress)) {
      return res.status(400).json({
        success: false,
        error: 'Valid user address is required'
      });
    }

    console.log(`🎯 Claiming Odyssey prize for cycle ${cycleId}, slip ${slipId}, user ${userAddress}`);

    // Get slip details from database
    const slipResult = await db.query(`
      SELECT 
        s.slip_id, s.cycle_id, s.player_address, s.is_evaluated,
        s.final_score, s.correct_count, s.leaderboard_rank,
        c.is_resolved, c.prize_pool, c.claimable_start_time
      FROM oracle.oddyssey_slips s
      LEFT JOIN oracle.oddyssey_cycles c ON s.cycle_id = c.cycle_id
      WHERE s.slip_id = $1 AND s.cycle_id = $2
    `, [slipId, cycleId]);

    if (slipResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Slip not found'
      });
    }

    const slip = slipResult.rows[0];

    // Validate slip ownership
    if (slip.player_address.toLowerCase() !== userAddress.toLowerCase()) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to claim this slip'
      });
    }

    // Check if cycle is resolved
    if (!slip.is_resolved) {
      return res.status(400).json({
        success: false,
        error: 'Cycle not yet resolved'
      });
    }

    // Check if slip is evaluated
    if (!slip.is_evaluated) {
      return res.status(400).json({
        success: false,
        error: 'Slip not yet evaluated'
      });
    }

    // Check if claiming is available (after claimable_start_time)
    const now = Math.floor(Date.now() / 1000);
    if (slip.claimable_start_time && now < slip.claimable_start_time) {
      return res.status(400).json({
        success: false,
        error: 'Claiming not yet available',
        claimableAt: new Date(slip.claimable_start_time * 1000).toISOString()
      });
    }

    // Check if user is eligible for prize (7+ correct predictions)
    if (slip.correct_count < 7) {
      return res.status(400).json({
        success: false,
        error: 'Not eligible for prize - need 7+ correct predictions',
        correctCount: slip.correct_count
      });
    }

    // Check if already claimed
    const claimResult = await db.query(`
      SELECT claimed FROM oracle.oddyssey_prize_claims 
      WHERE cycle_id = $1 AND slip_id = $2 AND player_address = $3
    `, [cycleId, slipId, userAddress.toLowerCase()]);

    if (claimResult.rows.length > 0 && claimResult.rows[0].claimed) {
      return res.status(400).json({
        success: false,
        error: 'Prize already claimed'
      });
    }

    // Get leaderboard rank and prize amount
    const leaderboardResult = await db.query(`
      SELECT 
        rank, prize_amount, prize_percentage
      FROM oracle.oddyssey_leaderboard 
      WHERE cycle_id = $1 AND slip_id = $2
    `, [cycleId, slipId]);

    if (leaderboardResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Not on leaderboard - not eligible for prize'
      });
    }

    const leaderboard = leaderboardResult.rows[0];
    const prizeAmount = parseFloat(leaderboard.prize_amount) || 0;

    if (prizeAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'No prize amount available'
      });
    }

    // Initialize Web3 service for contract interaction
    const Web3Service = require('../services/web3-service');
    const web3Service = new Web3Service();
    await web3Service.initialize();

    // Call contract claim function
    let tx;
    try {
      tx = await web3Service.claimOdysseyPrize(cycleId, slipId, userAddress);
    } catch (error) {
      console.error('❌ Contract claim failed:', error);
      return res.status(400).json({
        success: false,
        error: `Contract claim failed: ${error.message}`
      });
    }

    // Record the claim in database
    await db.query(`
      INSERT INTO oracle.oddyssey_prize_claims (
        cycle_id, slip_id, player_address, prize_amount, 
        rank, claimed_at, tx_hash, claimed
      ) VALUES ($1, $2, $3, $4, $5, NOW(), $6, true)
      ON CONFLICT (cycle_id, slip_id, player_address) 
      DO UPDATE SET 
        prize_amount = $4,
        rank = $5,
        claimed_at = NOW(),
        tx_hash = $6,
        claimed = true
    `, [cycleId, slipId, userAddress.toLowerCase(), prizeAmount, leaderboard.rank, tx.hash]);

    console.log(`✅ Odyssey prize claimed successfully: ${prizeAmount} STT for cycle ${cycleId}, slip ${slipId}`);

    res.json({
      success: true,
      data: {
        cycleId: parseInt(cycleId),
        slipId: parseInt(slipId),
        userAddress: userAddress,
        prizeAmount: prizeAmount,
        rank: leaderboard.rank,
        prizePercentage: leaderboard.prize_percentage,
        txHash: tx.hash,
        claimedAt: new Date().toISOString()
      },
      message: 'Odyssey prize claimed successfully'
    });

  } catch (error) {
    console.error('❌ Error claiming Odyssey prize:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * GET /api/claim-oddyssey/:cycleId/:slipId/:userAddress/status
 * Check claim status for a user's slip in a cycle
 */
router.get('/:cycleId/:slipId/:userAddress/status', async (req, res) => {
  try {
    const { cycleId, slipId, userAddress } = req.params;

    if (!cycleId || isNaN(cycleId)) {
      return res.status(400).json({
        success: false,
        error: 'Valid cycle ID is required'
      });
    }

    if (!slipId || isNaN(slipId)) {
      return res.status(400).json({
        success: false,
        error: 'Valid slip ID is required'
      });
    }

    if (!userAddress || !ethers.isAddress(userAddress)) {
      return res.status(400).json({
        success: false,
        error: 'Valid user address is required'
      });
    }

    // Get slip and claim status
    const result = await db.query(`
      SELECT 
        s.slip_id, s.cycle_id, s.player_address, s.is_evaluated,
        s.final_score, s.correct_count, s.leaderboard_rank,
        c.is_resolved, c.prize_pool, c.claimable_start_time,
        COALESCE(pc.claimed, false) as already_claimed,
        COALESCE(pc.prize_amount, 0) as claimed_amount,
        pc.claimed_at, pc.tx_hash, pc.rank as claim_rank
      FROM oracle.oddyssey_slips s
      LEFT JOIN oracle.oddyssey_cycles c ON s.cycle_id = c.cycle_id
      LEFT JOIN oracle.oddyssey_prize_claims pc ON s.cycle_id = pc.cycle_id 
        AND s.slip_id = pc.slip_id AND pc.player_address = $3
      WHERE s.slip_id = $1 AND s.cycle_id = $2
    `, [slipId, cycleId, userAddress.toLowerCase()]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Slip not found'
      });
    }

    const data = result.rows[0];

    // Validate slip ownership
    if (data.player_address.toLowerCase() !== userAddress.toLowerCase()) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to check this slip'
      });
    }

    // Determine claim eligibility
    let canClaim = false;
    let reason = '';
    let prizeAmount = 0;

    if (!data.is_resolved) {
      reason = 'Cycle not yet resolved';
    } else if (!data.is_evaluated) {
      reason = 'Slip not yet evaluated';
    } else if (data.correct_count < 7) {
      reason = `Not eligible for prize - need 7+ correct predictions (got ${data.correct_count})`;
    } else if (data.already_claimed) {
      reason = 'Already claimed';
    } else {
      // Check if claiming is available
      const now = Math.floor(Date.now() / 1000);
      if (data.claimable_start_time && now < data.claimable_start_time) {
        reason = 'Claiming not yet available';
      } else {
        // Get prize amount from leaderboard
        const leaderboardResult = await db.query(`
          SELECT prize_amount, rank, prize_percentage
          FROM oracle.oddyssey_leaderboard 
          WHERE cycle_id = $1 AND slip_id = $2
        `, [cycleId, slipId]);

        if (leaderboardResult.rows.length > 0) {
          const leaderboard = leaderboardResult.rows[0];
          prizeAmount = parseFloat(leaderboard.prize_amount) || 0;
          
          if (prizeAmount > 0) {
            canClaim = true;
            reason = 'Eligible to claim prize';
          } else {
            reason = 'No prize amount available';
          }
        } else {
          reason = 'Not on leaderboard - not eligible for prize';
        }
      }
    }

    res.json({
      success: true,
      data: {
        cycleId: parseInt(cycleId),
        slipId: parseInt(slipId),
        userAddress: userAddress,
        canClaim: canClaim,
        prizeAmount: prizeAmount,
        alreadyClaimed: data.already_claimed,
        claimedAmount: parseFloat(data.claimed_amount) || 0,
        claimedAt: data.claimed_at,
        txHash: data.tx_hash,
        reason: reason,
        slipStatus: {
          isEvaluated: data.is_evaluated,
          correctCount: data.correct_count,
          finalScore: data.final_score,
          leaderboardRank: data.leaderboard_rank
        },
        cycleStatus: {
          isResolved: data.is_resolved,
          prizePool: data.prize_pool,
          claimableStartTime: data.claimable_start_time
        }
      }
    });

  } catch (error) {
    console.error('❌ Error checking Odyssey claim status:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * GET /api/claim-oddyssey/user/:userAddress/claimable
 * Get all claimable Odyssey prizes for a user
 */
router.get('/user/:userAddress/claimable', async (req, res) => {
  try {
    const { userAddress } = req.params;

    if (!userAddress || !ethers.isAddress(userAddress)) {
      return res.status(400).json({
        success: false,
        error: 'Valid user address is required'
      });
    }

    // Get all claimable slips for the user
    const result = await db.query(`
      SELECT 
        s.slip_id, s.cycle_id, s.final_score, s.correct_count,
        s.leaderboard_rank, s.placed_at,
        c.is_resolved, c.prize_pool, c.claimable_start_time,
        COALESCE(pc.claimed, false) as already_claimed,
        COALESCE(pc.prize_amount, 0) as claimed_amount,
        lb.prize_amount, lb.rank, lb.prize_percentage
      FROM oracle.oddyssey_slips s
      LEFT JOIN oracle.oddyssey_cycles c ON s.cycle_id = c.cycle_id
      LEFT JOIN oracle.oddyssey_prize_claims pc ON s.cycle_id = pc.cycle_id 
        AND s.slip_id = pc.slip_id AND pc.player_address = $1
      LEFT JOIN oracle.oddyssey_leaderboard lb ON s.cycle_id = lb.cycle_id 
        AND s.slip_id = lb.slip_id
      WHERE s.player_address = $1
        AND s.is_evaluated = true
        AND s.correct_count >= 7
        AND c.is_resolved = true
        AND (c.claimable_start_time IS NULL OR c.claimable_start_time <= EXTRACT(EPOCH FROM NOW()))
        AND COALESCE(pc.claimed, false) = false
      ORDER BY s.cycle_id DESC, s.final_score DESC
    `, [userAddress.toLowerCase()]);

    const claimablePrizes = result.rows.map(row => ({
      slipId: row.slip_id,
      cycleId: row.cycle_id,
      finalScore: parseFloat(row.final_score) || 0,
      correctCount: row.correct_count,
      leaderboardRank: row.leaderboard_rank,
      prizeAmount: parseFloat(row.prize_amount) || 0,
      prizePercentage: row.prize_percentage,
      placedAt: row.placed_at,
      canClaim: true
    }));

    res.json({
      success: true,
      data: {
        userAddress: userAddress,
        claimablePrizes: claimablePrizes,
        totalClaimable: claimablePrizes.length,
        totalAmount: claimablePrizes.reduce((sum, prize) => sum + prize.prizeAmount, 0)
      }
    });

  } catch (error) {
    console.error('❌ Error getting claimable Odyssey prizes:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

module.exports = router;
