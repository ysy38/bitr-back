const express = require('express');
const router = express.Router();
const { ethers } = require('ethers');
const config = require('../config');
const db = require('../db/db');

// Airdrop requirements constants (from docs)
const AIRDROP_REQUIREMENTS = {
  minBITRActions: 20,
  minOddysseySlips: 3,
  stakingRequired: true,
  sttActivityBeforeFaucet: true
};

// Faucet ABI
const FAUCET_ABI = [
  "function getUserInfo(address user) external view returns (bool claimed, uint256 claimTime)",
  "function getFaucetStats() external view returns (uint256 balance, uint256 totalDistributed, uint256 userCount, bool active)"
];

/**
 * GET /airdrop/eligibility/:address
 * Check airdrop eligibility for a specific wallet address
 * Calculates eligibility on-the-fly from existing data
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
    
    const lowerAddress = address.toLowerCase();
    
    // 1. Check faucet claim from contract
    let faucetClaimed = false;
    let faucetClaimTime = null;
    try {
      const provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
      const faucetAddress = config.blockchain.contractAddresses.bitrFaucet;
      if (!faucetAddress) {
        throw new Error('Faucet contract address not configured');
      }
      const faucetContract = new ethers.Contract(
        faucetAddress,
        FAUCET_ABI,
        provider
      );
      const [claimed, claimTime] = await faucetContract.getUserInfo(address);
      faucetClaimed = claimed;
      faucetClaimTime = claimTime > 0 ? new Date(Number(claimTime) * 1000) : null;
    } catch (error) {
      console.warn('Could not check faucet claim from contract:', error.message);
    }
    
    // 2. Check STT activity BEFORE faucet claim
    let sttActivityBeforeFaucet = false;
    if (faucetClaimTime) {
      const sttPoolsQuery = await db.query(`
        SELECT COUNT(*) as count
        FROM analytics.pools
        WHERE LOWER(creator_address) = LOWER($1)
        AND uses_bitr = FALSE
        AND created_at < $2
      `, [lowerAddress, faucetClaimTime]);
      
      const sttBetsQuery = await db.query(`
        SELECT COUNT(*) as count
        FROM oracle.bets b
        JOIN analytics.pools ap ON b.pool_id::text = ap.pool_id::text
        WHERE LOWER(b.bettor_address) = LOWER($1)
        AND ap.uses_bitr = FALSE
        AND b.created_at < $2
      `, [lowerAddress, faucetClaimTime]);
      
      const poolsCount = parseInt(sttPoolsQuery.rows[0]?.count || 0);
      const betsCount = parseInt(sttBetsQuery.rows[0]?.count || 0);
      const totalSTTActions = poolsCount + betsCount;
      sttActivityBeforeFaucet = totalSTTActions > 0;
    }
    
    // 3. Count BITR actions (pools created or bets placed with BITR)
    const bitrPoolsQuery = await db.query(`
      SELECT COUNT(*) as count
      FROM analytics.pools
      WHERE LOWER(creator_address) = LOWER($1)
      AND uses_bitr = TRUE
    `, [lowerAddress]);
    
    const bitrBetsQuery = await db.query(`
      SELECT COUNT(*) as count
      FROM oracle.bets b
      JOIN analytics.pools ap ON b.pool_id::text = ap.pool_id::text
      WHERE LOWER(b.bettor_address) = LOWER($1)
      AND ap.uses_bitr = TRUE
    `, [lowerAddress]);
    
    const bitrPools = parseInt(bitrPoolsQuery.rows[0]?.count || 0);
    const bitrBets = parseInt(bitrBetsQuery.rows[0]?.count || 0);
    const bitrActions = bitrPools + bitrBets;
    
    // 4. Check staking activity
    const stakingQuery = await db.query(`
      SELECT COUNT(*) as staking_count
      FROM airdrop.staking_activities
      WHERE LOWER(user_address) = LOWER($1)
      AND action_type = 'STAKE'
    `, [lowerAddress]);
    
    const hasStakingActivity = parseInt(stakingQuery.rows[0]?.staking_count || 0) > 0;
    
    // 5. Count Oddyssey slips
    const oddysseyQuery = await db.query(`
      SELECT COUNT(*) as slip_count
      FROM oracle.oddyssey_slips
      WHERE LOWER(player_address) = LOWER($1)
    `, [lowerAddress]);
    
    const oddysseySlips = parseInt(oddysseyQuery.rows[0]?.slip_count || 0);
    
    // 6. Check for suspicious transfers (simplified - can be enhanced)
    const transferQuery = await db.query(`
      SELECT 
        COUNT(CASE WHEN activity_type = 'TRANSFER_IN' THEN 1 END) as transfers_in,
        COUNT(CASE WHEN activity_type IN ('POOL_CREATE', 'BET_PLACE', 'STAKING') THEN 1 END) as platform_actions
      FROM airdrop.bitr_activities
      WHERE LOWER(user_address) = LOWER($1)
    `, [lowerAddress]);
    
    const transferData = transferQuery.rows[0];
    const transfersIn = parseInt(transferData.transfers_in || 0);
    const platformActions = parseInt(transferData.platform_actions || 0);
    const isTransferOnlyRecipient = transfersIn > 0 && platformActions === 0;
    
    // Calculate eligibility
    const requirements = {
      faucetClaim: faucetClaimed,
      sttActivityBeforeFaucet: sttActivityBeforeFaucet,
      bitrActions: {
        current: bitrActions,
        required: AIRDROP_REQUIREMENTS.minBITRActions,
        met: bitrActions >= AIRDROP_REQUIREMENTS.minBITRActions
      },
      stakingActivity: hasStakingActivity,
      oddysseySlips: {
        current: oddysseySlips,
        required: AIRDROP_REQUIREMENTS.minOddysseySlips,
        met: oddysseySlips >= AIRDROP_REQUIREMENTS.minOddysseySlips
      }
    };
    
    // All requirements must be met (except STT activity before faucet if faucet not claimed yet)
    const isEligible = faucetClaimed &&
      (faucetClaimTime ? sttActivityBeforeFaucet : true) && // Only check if faucet was claimed
      requirements.bitrActions.met &&
      requirements.stakingActivity &&
      requirements.oddysseySlips.met &&
      !isTransferOnlyRecipient;
    
    // Get current BITR balance for potential airdrop calculation
    let currentBITRBalance = '0';
    try {
      const provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
      const bitrTokenAddress = config.blockchain.contractAddresses.bitrToken;
      if (!bitrTokenAddress) {
        throw new Error('BITR token contract address not configured');
      }
      const bitrTokenABI = ["function balanceOf(address owner) view returns (uint256)"];
      const bitrTokenContract = new ethers.Contract(
        bitrTokenAddress,
        bitrTokenABI,
        provider
      );
      const balance = await bitrTokenContract.balanceOf(address);
      currentBITRBalance = balance.toString();
    } catch (error) {
      console.warn('Could not get BITR balance:', error.message);
    }
    
    res.json({
      address,
      isEligible,
      eligibilityStatus: isEligible ? 'eligible' : 'not_eligible',
      lastUpdated: new Date().toISOString(),
      
      faucetClaim: {
        hasClaimed: faucetClaimed,
        claimedAt: faucetClaimTime,
        hadPriorSTTActivity: sttActivityBeforeFaucet
      },
      
      requirements,
      
      sybilFlags: {
        suspiciousTransfers: false, // Can be enhanced
        transferOnlyRecipient: isTransferOnlyRecipient,
        consolidationDetected: false, // Can be enhanced
        hasSybilActivity: isTransferOnlyRecipient
      },
      
      activityBreakdown: {
        poolCreations: bitrPools,
        betsPlaced: bitrBets,
        stakingActions: parseInt(stakingQuery.rows[0]?.staking_count || 0),
        oddysseySlips: oddysseySlips
      },
      
      airdropInfo: isEligible ? {
        snapshotBalance: currentBITRBalance,
        airdropAmount: null, // Will be calculated at snapshot time
        snapshotTakenAt: null
      } : null,
      
      nextSteps: isEligible ? 
        ['Wait for mainnet launch', 'Claim airdrop on mainnet'] : 
        getNextSteps(requirements, { hasSybilActivity: isTransferOnlyRecipient })
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
 * Calculated on-the-fly from existing data
 */
router.get('/statistics', async (req, res) => {
  try {
    // Get faucet statistics from contract
    let totalFaucetClaims = 0;
    try {
      const provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
      const faucetAddress = config.blockchain.contractAddresses.bitrFaucet;
      if (!faucetAddress) {
        throw new Error('Faucet contract address not configured');
      }
      const faucetContract = new ethers.Contract(
        faucetAddress,
        FAUCET_ABI,
        provider
      );
      const [, , userCount] = await faucetContract.getFaucetStats();
      totalFaucetClaims = Number(userCount.toString());
    } catch (error) {
      console.warn('Could not get faucet stats from contract:', error.message);
    }
    
    // Count eligible users (calculate on-the-fly)
    // This is expensive, so we'll use a simplified approach
    const eligibleUsersQuery = await db.query(`
      WITH all_users AS (
        SELECT DISTINCT LOWER(creator_address) as user_address FROM analytics.pools WHERE creator_address IS NOT NULL
        UNION
        SELECT DISTINCT LOWER(bettor_address) as user_address FROM oracle.bets WHERE bettor_address IS NOT NULL
        UNION
        SELECT DISTINCT LOWER(player_address) as user_address FROM oracle.oddyssey_slips WHERE player_address IS NOT NULL
        UNION
        SELECT DISTINCT LOWER(user_address) as user_address FROM airdrop.staking_activities WHERE user_address IS NOT NULL
      )
      SELECT COUNT(DISTINCT user_address) as total_users
      FROM all_users
      WHERE user_address IS NOT NULL
    `);
    
    // Get requirement breakdown
    const requirementBreakdown = await db.query(`
      SELECT 
        COUNT(DISTINCT CASE 
          WHEN EXISTS (
            SELECT 1 FROM analytics.pools p 
            WHERE LOWER(p.creator_address) = LOWER(u.user_address) AND p.uses_bitr = TRUE
          ) OR EXISTS (
            SELECT 1 FROM oracle.bets b
            JOIN analytics.pools ap ON b.pool_id::text = ap.pool_id::text
            WHERE LOWER(b.bettor_address) = LOWER(u.user_address) AND ap.uses_bitr = TRUE
          )
          THEN u.user_address
        END) as users_with_bitr_actions,
        COUNT(DISTINCT CASE 
          WHEN EXISTS (
            SELECT 1 FROM airdrop.staking_activities sa
            WHERE LOWER(sa.user_address) = LOWER(u.user_address) AND sa.action_type = 'STAKE'
          )
          THEN u.user_address
        END) as users_with_staking,
        COUNT(DISTINCT CASE 
          WHEN EXISTS (
            SELECT 1 FROM oracle.oddyssey_slips os
            WHERE LOWER(os.player_address) = LOWER(u.user_address)
            GROUP BY os.player_address
            HAVING COUNT(*) >= 3
          )
          THEN u.user_address
        END) as users_with_oddyssey
      FROM (
        SELECT DISTINCT LOWER(creator_address) as user_address FROM analytics.pools WHERE creator_address IS NOT NULL
        UNION
        SELECT DISTINCT LOWER(bettor_address) as user_address FROM oracle.bets WHERE bettor_address IS NOT NULL
        UNION
        SELECT DISTINCT LOWER(player_address) as user_address FROM oracle.oddyssey_slips WHERE player_address IS NOT NULL
      ) u
    `);
    
    const breakdown = requirementBreakdown.rows[0];
    
    // Get average BITR actions
    const avgActionsQuery = await db.query(`
      SELECT 
        AVG(bitr_count) as avg_bitr_actions
      FROM (
        SELECT 
          LOWER(COALESCE(p.creator_address, b.bettor_address)) as user_address,
          COUNT(*) as bitr_count
        FROM analytics.pools p
        FULL OUTER JOIN oracle.bets b ON 1=1
        WHERE (p.uses_bitr = TRUE OR EXISTS (
          SELECT 1 FROM analytics.pools ap WHERE ap.pool_id::text = b.pool_id::text AND ap.uses_bitr = TRUE
        ))
        AND (p.creator_address IS NOT NULL OR b.bettor_address IS NOT NULL)
        GROUP BY LOWER(COALESCE(p.creator_address, b.bettor_address))
      ) user_actions
    `);
    
    // Get average Oddyssey slips
    const avgSlipsQuery = await db.query(`
      SELECT AVG(slip_count) as avg_oddyssey_slips
      FROM (
        SELECT player_address, COUNT(*) as slip_count
        FROM oracle.oddyssey_slips
        GROUP BY player_address
      ) user_slips
    `);
    
    res.json({
      overview: {
        totalFaucetClaims: totalFaucetClaims,
        totalEligible: 0, // Will be calculated when snapshot is taken
        eligibilityRate: 0,
        totalEligibleBITR: '0',
        totalAirdropAllocated: '0',
        suspiciousWallets: 0,
        averageBITRActions: parseFloat(avgActionsQuery.rows[0]?.avg_bitr_actions || 0).toFixed(1),
        averageOddysseySlips: parseFloat(avgSlipsQuery.rows[0]?.avg_oddyssey_slips || 0).toFixed(1)
      },
      
      requirementFunnel: {
        claimedFaucet: totalFaucetClaims,
        hadSTTActivity: 0, // Would need to check before faucet claim time
        sufficientBITRActions: parseInt(breakdown.users_with_bitr_actions || 0),
        hasStaking: parseInt(breakdown.users_with_staking || 0),
        sufficientOddyssey: parseInt(breakdown.users_with_oddyssey || 0),
        fullyEligible: 0 // Will be calculated at snapshot time
      },
      
      recentActivity: [], // Can be added if needed
      
      latestSnapshot: null, // No snapshot taken yet
      
      constants: {
        totalAirdropPool: '5000000000000000000000000', // 5M BITR
        faucetAmountPerUser: '20000000000000000000000', // 20K BITR
        requirements: {
          sttActivityBeforeFaucet: true,
          minBITRActions: AIRDROP_REQUIREMENTS.minBITRActions,
          stakingRequired: true,
          minOddysseySlips: AIRDROP_REQUIREMENTS.minOddysseySlips
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
 * GET /airdrop/leaderboard
 * Get top eligible users by activity score
 * Calculated on-the-fly from existing data
 */
router.get('/leaderboard', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
    
    // Calculate activity scores for all users
    const leaderboardQuery = await db.query(`
      WITH all_users AS (
        SELECT DISTINCT LOWER(creator_address) as user_address FROM analytics.pools WHERE creator_address IS NOT NULL
        UNION
        SELECT DISTINCT LOWER(bettor_address) as user_address FROM oracle.bets WHERE bettor_address IS NOT NULL
        UNION
        SELECT DISTINCT LOWER(player_address) as user_address FROM oracle.oddyssey_slips WHERE player_address IS NOT NULL
        UNION
        SELECT DISTINCT LOWER(user_address) as user_address FROM airdrop.staking_activities WHERE user_address IS NOT NULL
      ),
      user_stats AS (
        SELECT 
          u.user_address,
          COALESCE((
            SELECT COUNT(*) FROM analytics.pools 
            WHERE LOWER(creator_address) = u.user_address AND uses_bitr = TRUE
          ), 0) as bitr_pools,
          COALESCE((
            SELECT COUNT(*) FROM oracle.bets b
            JOIN analytics.pools ap ON b.pool_id::text = ap.pool_id::text
            WHERE LOWER(b.bettor_address) = u.user_address AND ap.uses_bitr = TRUE
          ), 0) as bitr_bets,
          COALESCE((
            SELECT COUNT(*) FROM oracle.oddyssey_slips
            WHERE LOWER(player_address) = u.user_address
          ), 0) as oddyssey_slips,
          CASE WHEN EXISTS (
            SELECT 1 FROM airdrop.staking_activities sa
            WHERE LOWER(sa.user_address) = u.user_address AND sa.action_type = 'STAKE'
          ) THEN 1 ELSE 0 END as has_staking
        FROM all_users u
      )
      SELECT 
        user_address,
        (bitr_pools + bitr_bets) as bitr_actions,
        oddyssey_slips,
        has_staking,
        (bitr_pools + bitr_bets + oddyssey_slips * 10 + has_staking * 50) as activity_score
      FROM user_stats
      WHERE user_address IS NOT NULL
      ORDER BY activity_score DESC
      LIMIT $1
    `, [limit]);
    
    // Get total eligible count (users meeting all requirements)
    const totalEligibleQuery = await db.query(`
      WITH all_users AS (
        SELECT DISTINCT LOWER(creator_address) as user_address FROM analytics.pools WHERE creator_address IS NOT NULL
        UNION
        SELECT DISTINCT LOWER(bettor_address) as user_address FROM oracle.bets WHERE bettor_address IS NOT NULL
        UNION
        SELECT DISTINCT LOWER(player_address) as user_address FROM oracle.oddyssey_slips WHERE player_address IS NOT NULL
        UNION
        SELECT DISTINCT LOWER(user_address) as user_address FROM airdrop.staking_activities WHERE user_address IS NOT NULL
      ),
      user_stats AS (
        SELECT 
          u.user_address,
          COALESCE((
            SELECT COUNT(*) FROM analytics.pools 
            WHERE LOWER(creator_address) = u.user_address AND uses_bitr = TRUE
          ), 0) + COALESCE((
            SELECT COUNT(*) FROM oracle.bets b
            JOIN analytics.pools ap ON b.pool_id::text = ap.pool_id::text
            WHERE LOWER(b.bettor_address) = u.user_address AND ap.uses_bitr = TRUE
          ), 0) as bitr_actions,
          COALESCE((
            SELECT COUNT(*) FROM oracle.oddyssey_slips
            WHERE LOWER(player_address) = u.user_address
          ), 0) as oddyssey_slips,
          CASE WHEN EXISTS (
            SELECT 1 FROM airdrop.staking_activities sa
            WHERE LOWER(sa.user_address) = u.user_address AND sa.action_type = 'STAKE'
          ) THEN 1 ELSE 0 END as has_staking
        FROM all_users u
      )
      SELECT COUNT(*) as count
      FROM user_stats
      WHERE bitr_actions >= $1
        AND oddyssey_slips >= $2
        AND has_staking = 1
    `, [AIRDROP_REQUIREMENTS.minBITRActions, AIRDROP_REQUIREMENTS.minOddysseySlips]);
    
    res.json({
      leaderboard: leaderboardQuery.rows.map((user, index) => ({
        rank: index + 1,
        address: user.user_address,
        bitrActions: parseInt(user.bitr_actions || 0),
        oddysseySlips: parseInt(user.oddyssey_slips || 0),
        hasStaking: user.has_staking === 1,
        activityScore: parseInt(user.activity_score || 0),
        // Placeholder for airdrop amount (will be calculated at snapshot)
        airdropAmount: null
      })),
      totalEligible: parseInt(totalEligibleQuery.rows[0]?.count || 0),
      showingTop: Math.min(limit, leaderboardQuery.rows.length)
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
    steps.push('Claim BITR from faucet (requires prior STT activity and 2+ Oddyssey slips)');
  }
  
  if (!requirements.sttActivityBeforeFaucet && requirements.faucetClaim) {
    steps.push('⚠️ Cannot fix: STT activity must happen before faucet claim');
  }
  
  if (!requirements.bitrActions.met) {
    const remaining = requirements.bitrActions.required - requirements.bitrActions.current;
    steps.push(`Make ${remaining} more BITR actions (create pools or place bets using BITR)`);
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
