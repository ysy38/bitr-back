const express = require('express');
const router = express.Router();
const { ethers } = require('ethers');

/**
 * GET /airdrop/eligibility/:address
 * Check airdrop eligibility for a specific wallet address
 */
router.get('/eligibility/:address', async (req, res) => {
  try {
    const { address } = req.params;
    
    // Validate address format
    if (!ethers.isAddress(address)) {
      return res.status(400).json({
        error: 'Invalid wallet address format'
      });
    }
    
    const db = req.app.get('db');
    
    // Get eligibility data
    const eligibilityResult = await db.query(`
      SELECT 
        e.*,
        fc.amount as faucet_amount,
        fc.claimed_at as faucet_claimed_at,
        (SELECT COUNT(*) FROM prediction.bets b 
         WHERE b.user_address = e.user_address 
         AND b.created_at < e.faucet_claim_date) +
        (SELECT COUNT(*) FROM prediction.pools p 
         WHERE p.creator_address = e.user_address 
         AND p.creation_time < e.faucet_claim_date) as stt_activity_count_before_faucet
      FROM airdrop.eligibility e
      LEFT JOIN airdrop.faucet_claims fc ON e.user_address = fc.user_address
      WHERE LOWER(e.user_address) = LOWER($1)
    `, [address]);
    
    if (eligibilityResult.rows.length === 0) {
      // Check if address has claimed faucet but eligibility not calculated yet
      const faucetResult = await db.query(`
        SELECT * FROM airdrop.faucet_claims WHERE LOWER(user_address) = LOWER($1)
      `, [address]);
      
      if (faucetResult.rows.length > 0) {
        return res.json({
          address,
          hasFaucetClaim: true,
          isEligible: false,
          status: 'pending_calculation',
          message: 'Faucet claimed but eligibility calculation pending. Please check again in a few minutes.'
        });
      }
      
      return res.json({
        address,
        hasFaucetClaim: false,
        isEligible: false,
        status: 'no_faucet_claim',
        message: 'No faucet claim found for this address. Must claim faucet first.',
        requirements: {
          faucetClaim: false,
          sttActivityBeforeFaucet: false,
          bitrActions: { current: 0, required: 20 },
          stakingActivity: false,
          oddysseySlips: { current: 0, required: 3 }
        }
      });
    }
    
    const data = eligibilityResult.rows[0];
    
    // Calculate requirement status
    const requirements = {
      faucetClaim: data.has_faucet_claim,
      sttActivityBeforeFaucet: data.has_stt_activity_before_faucet,
      bitrActions: {
        current: data.bitr_action_count,
        required: 20,
        met: data.bitr_action_count >= 20
      },
      stakingActivity: data.has_staking_activity,
      oddysseySlips: {
        current: data.oddyssey_slip_count,
        required: 3,
        met: data.oddyssey_slip_count >= 3
      }
    };
    
    // Sybil detection flags
    const sybilFlags = {
      suspiciousTransfers: data.has_suspicious_transfers,
      transferOnlyRecipient: data.is_transfer_only_recipient,
      consolidationDetected: data.consolidation_detected,
      hasSybilActivity: data.has_suspicious_transfers || data.is_transfer_only_recipient || data.consolidation_detected
    };
    
    // Additional activity stats
    const activityStats = await db.query(`
      SELECT 
        COUNT(CASE WHEN activity_type = 'POOL_CREATE' THEN 1 END) as pool_creations,
        COUNT(CASE WHEN activity_type = 'BET_PLACE' THEN 1 END) as bets_placed,
        COUNT(CASE WHEN activity_type = 'STAKING' THEN 1 END) as staking_actions,
        MIN(timestamp) as first_bitr_activity,
        MAX(timestamp) as last_bitr_activity
      FROM airdrop.bitr_activities
      WHERE LOWER(user_address) = LOWER($1)
      AND activity_type IN ('POOL_CREATE', 'BET_PLACE', 'STAKING')
    `, [address]);
    
    const activityData = activityStats.rows[0];
    
    res.json({
      address,
      isEligible: data.is_eligible,
      eligibilityStatus: data.is_eligible ? 'eligible' : 'not_eligible',
      lastUpdated: data.eligibility_updated_at,
      
      faucetClaim: {
        hasClaimed: data.has_faucet_claim,
        amount: data.faucet_amount,
        claimedAt: data.faucet_claimed_at,
        hadPriorSTTActivity: data.has_stt_activity_before_faucet,
        sttActivityCountBeforeFaucet: parseInt(data.stt_activity_count_before_faucet || 0)
      },
      
      requirements,
      sybilFlags,
      
      activityBreakdown: {
        poolCreations: parseInt(activityData.pool_creations || 0),
        betsPlaced: parseInt(activityData.bets_placed || 0),
        stakingActions: parseInt(activityData.staking_actions || 0),
        firstBITRActivity: activityData.first_bitr_activity,
        lastBITRActivity: activityData.last_bitr_activity
      },
      
      airdropInfo: data.is_eligible ? {
        snapshotBalance: data.snapshot_bitr_balance,
        airdropAmount: data.airdrop_amount,
        snapshotTakenAt: data.snapshot_taken_at
      } : null,
      
      nextSteps: data.is_eligible ? 
        ['Wait for mainnet launch', 'Claim airdrop on mainnet'] : 
        getNextSteps(requirements, sybilFlags)
    });
    
  } catch (error) {
    console.error('Error checking eligibility:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to check eligibility'
    });
  }
});

/**
 * GET /airdrop/statistics
 * Get overall airdrop statistics
 */
router.get('/statistics', async (req, res) => {
  try {
    const db = req.app.get('db');
    
    // Main statistics
    const statsResult = await db.query(`
      SELECT 
        (SELECT COUNT(*) FROM airdrop.faucet_claims) as total_faucet_claims,
        (SELECT COUNT(*) FROM airdrop.eligibility WHERE is_eligible = TRUE) as total_eligible,
        (SELECT COALESCE(SUM(snapshot_bitr_balance::numeric), 0) FROM airdrop.eligibility WHERE is_eligible = TRUE) as total_eligible_bitr,
        (SELECT COALESCE(SUM(airdrop_amount::numeric), 0) FROM airdrop.eligibility WHERE is_eligible = TRUE) as total_airdrop_allocated,
        (SELECT COUNT(*) FROM airdrop.eligibility WHERE has_suspicious_transfers = TRUE OR is_transfer_only_recipient = TRUE OR consolidation_detected = TRUE) as suspicious_wallets,
        (SELECT COALESCE(AVG(bitr_action_count), 0) FROM airdrop.eligibility WHERE is_eligible = TRUE) as avg_bitr_actions,
        (SELECT COALESCE(AVG(oddyssey_slip_count), 0) FROM airdrop.eligibility WHERE is_eligible = TRUE) as avg_oddyssey_slips
    `);
    
    const stats = statsResult.rows[0];
    
    // Requirement breakdown
    const requirementBreakdown = await db.query(`
      SELECT 
        COUNT(*) FILTER (WHERE has_faucet_claim = TRUE) as claimed_faucet,
        COUNT(*) FILTER (WHERE has_stt_activity_before_faucet = TRUE) as had_stt_activity,
        COUNT(*) FILTER (WHERE bitr_action_count >= 20) as sufficient_bitr_actions,
        COUNT(*) FILTER (WHERE has_staking_activity = TRUE) as has_staking,
        COUNT(*) FILTER (WHERE oddyssey_slip_count >= 3) as sufficient_oddyssey,
        COUNT(*) FILTER (WHERE is_eligible = TRUE) as fully_eligible
      FROM airdrop.eligibility
      WHERE has_faucet_claim = TRUE
    `);
    
    const breakdown = requirementBreakdown.rows[0];
    
    // Recent activity
    const recentActivity = await db.query(`
      SELECT 
        DATE(claimed_at) as claim_date,
        COUNT(*) as claims_count
      FROM airdrop.faucet_claims
      WHERE claimed_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(claimed_at)
      ORDER BY claim_date DESC
    `);
    
    // Latest snapshot info
    const latestSnapshot = await db.query(`
      SELECT * FROM airdrop.snapshots 
      ORDER BY created_at DESC 
      LIMIT 1
    `);
    
    const eligibilityRate = stats.total_faucet_claims > 0 
      ? (stats.total_eligible / stats.total_faucet_claims * 100).toFixed(2)
      : 0;
    
    res.json({
      overview: {
        totalFaucetClaims: parseInt(stats.total_faucet_claims),
        totalEligible: parseInt(stats.total_eligible),
        eligibilityRate: parseFloat(eligibilityRate),
        totalEligibleBITR: stats.total_eligible_bitr,
        totalAirdropAllocated: stats.total_airdrop_allocated,
        suspiciousWallets: parseInt(stats.suspicious_wallets),
        averageBITRActions: parseFloat(stats.avg_bitr_actions).toFixed(1),
        averageOddysseySlips: parseFloat(stats.avg_oddyssey_slips).toFixed(1)
      },
      
      requirementFunnel: {
        claimedFaucet: parseInt(breakdown.claimed_faucet),
        hadSTTActivity: parseInt(breakdown.had_stt_activity),
        sufficientBITRActions: parseInt(breakdown.sufficient_bitr_actions),
        hasStaking: parseInt(breakdown.has_staking),
        sufficientOddyssey: parseInt(breakdown.sufficient_oddyssey),
        fullyEligible: parseInt(breakdown.fully_eligible)
      },
      
      recentActivity: recentActivity.rows,
      
      latestSnapshot: latestSnapshot.rows.length > 0 ? {
        name: latestSnapshot.rows[0].snapshot_name,
        blockNumber: latestSnapshot.rows[0].snapshot_block,
        timestamp: latestSnapshot.rows[0].snapshot_timestamp,
        eligibleWallets: latestSnapshot.rows[0].total_eligible_wallets,
        totalEligibleBITR: latestSnapshot.rows[0].total_eligible_bitr,
        isFinal: latestSnapshot.rows[0].is_final
      } : null,
      
      constants: {
        totalAirdropPool: '5000000000000000000000000', // 5M BITR
        faucetAmountPerUser: '20000000000000000000000', // 20K BITR
        requirements: {
          sttActivityBeforeFaucet: true,
          minBITRActions: 20,
          stakingRequired: true,
          minOddysseySlips: 3
        }
      }
    });
    
  } catch (error) {
    console.error('Error getting airdrop statistics:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get statistics'
    });
  }
});

/**
 * POST /airdrop/snapshot
 * Take snapshot of eligible users (admin only)
 */
router.post('/snapshot', async (req, res) => {
  try {
    // TODO: Add admin authentication middleware
    
    const { name } = req.body;
    
    if (!name || typeof name !== 'string') {
      return res.status(400).json({
        error: 'Snapshot name is required'
      });
    }
    
    const db = req.app.get('db');
    const eligibilityCalculator = req.app.get('eligibilityCalculator');
    
    // Check if snapshot name already exists
    const existingSnapshot = await db.query(`
      SELECT id FROM airdrop.snapshots WHERE snapshot_name = $1
    `, [name]);
    
    if (existingSnapshot.rows.length > 0) {
      return res.status(400).json({
        error: 'Snapshot name already exists'
      });
    }
    
    // Take snapshot
    const snapshotResult = await eligibilityCalculator.takeSnapshot(name);
    
    res.json({
      success: true,
      snapshot: snapshotResult,
      message: `Snapshot '${name}' created successfully`
    });
    
  } catch (error) {
    console.error('Error taking snapshot:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to create snapshot'
    });
  }
});

/**
 * GET /airdrop/leaderboard
 * Get top eligible users by airdrop amount
 */
router.get('/leaderboard', async (req, res) => {
  try {
    const db = req.app.get('db');
    const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
    
    const leaderboard = await db.query(`
      SELECT 
        user_address,
        snapshot_bitr_balance,
        airdrop_amount,
        bitr_action_count,
        oddyssey_slip_count,
        eligibility_updated_at
      FROM airdrop.eligibility
      WHERE is_eligible = TRUE AND airdrop_amount > 0
      ORDER BY airdrop_amount::numeric DESC
      LIMIT $1
    `, [limit]);
    
    const totalEligible = await db.query(`
      SELECT COUNT(*) as count FROM airdrop.eligibility WHERE is_eligible = TRUE
    `);
    
    res.json({
      leaderboard: leaderboard.rows.map((user, index) => ({
        rank: index + 1,
        address: user.user_address,
        bitrBalance: user.snapshot_bitr_balance,
        airdropAmount: user.airdrop_amount,
        bitrActions: user.bitr_action_count,
        oddysseySlips: user.oddyssey_slip_count,
        lastUpdated: user.eligibility_updated_at
      })),
      totalEligible: parseInt(totalEligible.rows[0].count),
      showingTop: Math.min(limit, leaderboard.rows.length)
    });
    
  } catch (error) {
    console.error('Error getting leaderboard:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get leaderboard'
    });
  }
});

/**
 * Helper function to get next steps for ineligible users
 */
function getNextSteps(requirements, sybilFlags) {
  const steps = [];
  
  if (!requirements.faucetClaim) {
    steps.push('Claim BITR from faucet (requires prior STT activity)');
  }
  
  if (!requirements.sttActivityBeforeFaucet) {
    steps.push('Cannot fix: STT activity must happen before faucet claim');
  }
  
  if (!requirements.bitrActions.met) {
    const remaining = requirements.bitrActions.required - requirements.bitrActions.current;
    steps.push(`Make ${remaining} more BITR actions (create pools, place bets, or stake)`);
  }
  
  if (!requirements.stakingActivity) {
    steps.push('Stake some BITR tokens in the staking contract');
  }
  
  if (!requirements.oddysseySlips.met) {
    const remaining = requirements.oddysseySlips.required - requirements.oddysseySlips.current;
    steps.push(`Submit ${remaining} more Oddyssey game slips`);
  }
  
  if (sybilFlags.hasSybilActivity) {
    steps.push('⚠️ Account flagged for suspicious activity - contact support');
  }
  
  return steps;
}

module.exports = router;