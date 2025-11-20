const express = require('express');
const router = express.Router();
const { ethers } = require('ethers');
const db = require('../db/db');

/**
 * POST /api/claim-pools/:poolId
 * Claim prizes from a prediction pool using direct contract interaction
 */
router.post('/:poolId', async (req, res) => {
  try {
    const { poolId } = req.params;
    const { userAddress } = req.body;

    if (!poolId || isNaN(poolId)) {
      return res.status(400).json({
        success: false,
        error: 'Valid pool ID is required'
      });
    }

    if (!userAddress || !ethers.isAddress(userAddress)) {
      return res.status(400).json({
        success: false,
        error: 'Valid user address is required'
      });
    }

    console.log(`🎯 Claiming pool ${poolId} for user ${userAddress}`);

    // Get pool details from database
    const poolResult = await db.query(`
      SELECT 
        pool_id, creator_address, is_settled, creator_side_won, use_bitr,
        total_creator_side_stake, total_bettor_stake, odds
      FROM oracle.pools 
      WHERE pool_id = $1
    `, [poolId]);

    if (poolResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Pool not found'
      });
    }

    const pool = poolResult.rows[0];

    if (!pool.is_settled) {
      return res.status(400).json({
        success: false,
        error: 'Pool not yet settled'
      });
    }

    // Use Web3Service to get claim info from contract (this handles all logic correctly)
    const Web3Service = require('../services/web3-service');
    const web3Service = new Web3Service();
    await web3Service.initialize();

    let claimInfo;
    try {
      claimInfo = await web3Service.getPoolClaimInfo(poolId, userAddress);
    } catch (error) {
      console.error('❌ Error getting claim info from contract:', error);
      return res.status(400).json({
        success: false,
        error: `Failed to get claim info: ${error.message}`
      });
    }

    // Use contract claim info (handles creator stakes, LP FIFO, etc.)
    if (!claimInfo.canClaim) {
      return res.status(400).json({
        success: false,
        error: claimInfo.reason || 'Not eligible to claim'
      });
    }

    const claimableAmount = parseFloat(claimInfo.claimableAmount);
    const isWinner = claimInfo.isWinner;

    // Call contract claim function
    let tx;
    try {
      tx = await web3Service.claimPoolPrize(poolId, userAddress);
    } catch (error) {
      console.error('❌ Contract claim failed:', error);
      return res.status(400).json({
        success: false,
        error: `Contract claim failed: ${error.message}`
      });
    }

    // Record the claim in database (update to use oracle schema)
    await db.query(`
      INSERT INTO oracle.prize_claims (pool_id, user_address, claimed_amount, claimed_at, tx_hash, claimed)
      VALUES ($1, $2, $3, NOW(), $4, true)
      ON CONFLICT (pool_id, user_address) 
      DO UPDATE SET 
        claimed_amount = $3,
        claimed_at = NOW(),
        tx_hash = $4,
        claimed = true
    `, [poolId, userAddress.toLowerCase(), claimableAmount, tx.hash]);

    console.log(`✅ Pool ${poolId} claimed successfully by ${userAddress}: ${claimableAmount} STT`);

    res.json({
      success: true,
      data: {
        poolId: parseInt(poolId),
        userAddress: userAddress,
        claimableAmount: claimableAmount,
        txHash: tx.hash,
        isWinner: isWinner,
        claimedAt: new Date().toISOString()
      },
      message: 'Pool prize claimed successfully'
    });

  } catch (error) {
    console.error('❌ Error claiming pool prize:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * GET /api/claim-pools/:poolId/:userAddress/status
 * Check claim status for a user in a pool
 */
router.get('/:poolId/:userAddress/status', async (req, res) => {
  try {
    const { poolId, userAddress } = req.params;

    if (!poolId || isNaN(poolId)) {
      return res.status(400).json({
        success: false,
        error: 'Valid pool ID is required'
      });
    }

    if (!userAddress || !ethers.isAddress(userAddress)) {
      return res.status(400).json({
        success: false,
        error: 'Valid user address is required'
      });
    }

    // Use Web3Service to get claim info from contract
    const Web3Service = require('../services/web3-service');
    const web3Service = new Web3Service();
    await web3Service.initialize();

    let claimInfo;
    try {
      claimInfo = await web3Service.getPoolClaimInfo(poolId, userAddress);
    } catch (error) {
      console.error('❌ Error getting claim info from contract:', error);
      return res.status(400).json({
        success: false,
        error: `Failed to get claim info: ${error.message}`
      });
    }

    // Get pool basic info
    const result = await db.query(`
      SELECT 
        p.pool_id, p.is_settled, p.creator_side_won, p.use_bitr,
        p.total_creator_side_stake, p.total_bettor_stake, p.creator_address,
        COALESCE(pc.claimed, false) as already_claimed,
        COALESCE(pc.claimed_amount, 0) as claimed_amount,
        pc.claimed_at, pc.tx_hash
      FROM oracle.pools p
      LEFT JOIN oracle.prize_claims pc ON p.pool_id = pc.pool_id AND pc.user_address = $2
      WHERE p.pool_id = $1
    `, [poolId, userAddress.toLowerCase()]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Pool not found'
      });
    }

    const data = result.rows[0];

    // Use contract claim info (handles all logic correctly)
    const canClaim = claimInfo.canClaim;
    const claimableAmount = parseFloat(claimInfo.claimableAmount);
    const isWinner = claimInfo.isWinner;
    const reason = claimInfo.reason;
    const userStake = parseFloat(claimInfo.userStake);

    // Determine user type based on address and stakes
    let userType = 'none';
    if (userAddress.toLowerCase() === data.creator_address.toLowerCase()) {
      userType = 'creator';
    } else if (userStake > 0 && data.creator_side_won) {
      userType = 'lp_provider';
    } else if (userStake > 0 && !data.creator_side_won) {
      userType = 'bettor';
    }

    res.json({
      success: true,
      data: {
        poolId: parseInt(poolId),
        userAddress: userAddress,
        canClaim: canClaim,
        isWinner: isWinner,
        claimableAmount: claimableAmount,
        alreadyClaimed: data.already_claimed,
        claimedAmount: parseFloat(data.claimed_amount) || 0,
        claimedAt: data.claimed_at,
        txHash: data.tx_hash,
        reason: reason,
        poolSettled: data.is_settled,
        creatorSideWon: data.creator_side_won,
        userType: userType,
        userStake: userStake,
        isCreator: userAddress.toLowerCase() === data.creator_address.toLowerCase()
      }
    });

  } catch (error) {
    console.error('❌ Error checking claim status:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

module.exports = router;
