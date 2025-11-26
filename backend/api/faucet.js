const express = require('express');
const router = express.Router();
const { ethers } = require('ethers');
const config = require('../config');
const db = require('../db/db');

// Enhanced BITR Faucet ABI with Oddyssey integration
const FAUCET_ABI = [
  "function claimBitr() external",
  "function getUserInfo(address user) external view returns (bool claimed, uint256 claimTime)",
  "function checkEligibility(address user) external view returns (bool eligible, string reason, uint256 oddysseySlips)",
  "function getFaucetStats() external view returns (uint256 balance, uint256 totalDistributed, uint256 userCount, bool active)",
  "function hasSufficientBalance() external view returns (bool)",
  "function maxPossibleClaims() external view returns (uint256)",
  "event FaucetClaimed(address indexed user, uint256 amount, uint256 timestamp)"
];

// User session tracking for authentication and terms acceptance
const userSessions = new Map(); // Temporary in-memory storage

/**
 * Validate user authentication and terms acceptance
 */
function validateUserSession(address, sessionData) {
  if (!sessionData) {
    return { valid: false, reason: "No active session" };
  }

  // Check if session is expired (24 hours)
  const sessionAge = Date.now() - sessionData.createdAt;
  if (sessionAge > 24 * 60 * 60 * 1000) {
    userSessions.delete(address.toLowerCase());
    return { valid: false, reason: "Session expired" };
  }

  // Check if user accepted terms
  if (!sessionData.termsAccepted) {
    return { valid: false, reason: "Terms not accepted" };
  }

  // Check if wallet is authenticated
  if (!sessionData.walletAuthenticated) {
    return { valid: false, reason: "Wallet not authenticated" };
  }

  return { valid: true };
}

/**
 * Check if user has accepted terms in database (PERSISTENT CHECK)
 */
async function checkTermsAcceptanceInDatabase(address, termsVersion = '1.0') {
  try {
    const result = await db.query(`
      SELECT accepted_at, terms_version, signature_hash
      FROM oracle.user_terms_acceptance 
      WHERE user_address = $1 AND terms_version = $2
    `, [address.toLowerCase(), termsVersion]);
    
    return {
      accepted: result.rows.length > 0,
      acceptedAt: result.rows[0]?.accepted_at,
      signatureHash: result.rows[0]?.signature_hash
    };
  } catch (error) {
    console.error('Error checking terms acceptance in database:', error);
    return { accepted: false, error: error.message };
  }
}

/**
 * Check STT activity eligibility using database
 */
async function checkSTTActivity(address) {
  try {
    // Query database for STT activity (pools and bets where uses_bitr = false)
    const activityQuery = await db.query(`
      SELECT 
        COUNT(CASE 
          WHEN p.creator_address = LOWER($1) AND p.uses_bitr = FALSE 
          THEN 1 END
        ) as pools_created,
        COUNT(CASE 
          WHEN b.user_address = LOWER($1) AND EXISTS (
            SELECT 1 FROM analytics.pools ap 
            WHERE ap.pool_id = b.pool_id AND ap.uses_bitr = FALSE
          ) 
          THEN 1 END
        ) as bets_placed,
        MIN(CASE 
          WHEN p.creator_address = LOWER($1) AND p.uses_bitr = FALSE 
          THEN p.creation_time 
          WHEN b.user_address = LOWER($1) AND EXISTS (
            SELECT 1 FROM analytics.pools ap 
            WHERE ap.pool_id = b.pool_id AND ap.uses_bitr = FALSE
          ) 
          THEN b.created_at 
        END) as first_activity,
        MAX(CASE 
          WHEN p.creator_address = LOWER($1) AND p.uses_bitr = FALSE 
          THEN p.creation_time 
          WHEN b.user_address = LOWER($1) AND EXISTS (
            SELECT 1 FROM analytics.pools ap 
            WHERE ap.pool_id = b.pool_id AND ap.uses_bitr = FALSE
          ) 
          THEN b.created_at 
        END) as last_activity
      FROM analytics.pools p
      FULL OUTER JOIN prediction.bets b ON 1=1
      WHERE p.creator_address = LOWER($1) OR b.user_address = LOWER($1)
    `, [address]);

    const activity = activityQuery.rows[0] || {
      pools_created: 0,
      bets_placed: 0,
      first_activity: null,
      last_activity: null
    };

    const totalSTTActions = parseInt(activity.pools_created || 0) + parseInt(activity.bets_placed || 0);
    const hasSTTActivity = totalSTTActions > 0;

    return {
      hasActivity: hasSTTActivity,
      poolsCreated: parseInt(activity.pools_created || 0),
      betsPlaced: parseInt(activity.bets_placed || 0),
      totalSTTActions,
      firstActivity: activity.first_activity,
      lastActivity: activity.last_activity
    };
  } catch (error) {
    console.error('Error checking STT activity:', error);
    return {
      hasActivity: false,
      poolsCreated: 0,
      betsPlaced: 0,
      totalSTTActions: 0,
      firstActivity: null,
      lastActivity: null
    };
  }
}

/**
 * POST /faucet/authenticate
 * Authenticate user wallet connection
 */
router.post('/authenticate', async (req, res) => {
  try {
    const { address, signature, message } = req.body;
    
    // Validate address format
    if (!ethers.isAddress(address)) {
      return res.status(400).json({
        error: 'Invalid wallet address format'
      });
    }

    // Verify signature
    if (!signature || !message) {
      return res.status(400).json({
        error: 'Signature and message are required'
      });
    }

    try {
      const recoveredAddress = ethers.verifyMessage(message, signature);
      if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
        return res.status(400).json({
          error: 'Invalid signature'
        });
      }
    } catch (error) {
      return res.status(400).json({
        error: 'Failed to verify signature'
      });
    }

    // Create or update user session
    const sessionData = userSessions.get(address.toLowerCase()) || {};
    sessionData.walletAuthenticated = true;
    sessionData.createdAt = sessionData.createdAt || Date.now();
    sessionData.lastAuthenticated = Date.now();
    userSessions.set(address.toLowerCase(), sessionData);

    res.json({
      success: true,
      message: 'Wallet authenticated successfully',
      address: address,
      sessionValid: true
    });

  } catch (error) {
    console.error('Error authenticating wallet:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to authenticate wallet'
    });
  }
});

/**
 * POST /faucet/accept-terms
 * Record user's acceptance of terms and conditions (PERSISTENT STORAGE)
 */
router.post('/accept-terms', async (req, res) => {
  try {
    const { address, termsVersion, signature, ipAddress, userAgent } = req.body;
    
    // Validate address format
    if (!ethers.isAddress(address)) {
      return res.status(400).json({
        error: 'Invalid wallet address format'
      });
    }

    // Get existing session
    const sessionData = userSessions.get(address.toLowerCase()) || {};
    
    // Check if wallet is authenticated
    if (!sessionData.walletAuthenticated) {
      return res.status(400).json({
        error: 'Wallet must be authenticated first'
      });
    }

    // ✅ PERSISTENT STORAGE: Store terms acceptance in database
    const termsVersionToStore = termsVersion || '1.0';
    
    await db.query(`
      INSERT INTO oracle.user_terms_acceptance 
      (user_address, terms_version, ip_address, user_agent, signature_hash)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_address, terms_version) 
      DO UPDATE SET 
        accepted_at = NOW(),
        ip_address = EXCLUDED.ip_address,
        user_agent = EXCLUDED.user_agent,
        signature_hash = EXCLUDED.signature_hash,
        updated_at = NOW()
    `, [
      address.toLowerCase(),
      termsVersionToStore,
      ipAddress || req.ip,
      userAgent || req.get('User-Agent'),
      signature || null
    ]);

    // Update session data
    sessionData.termsAccepted = true;
    sessionData.termsVersion = termsVersionToStore;
    sessionData.termsAcceptedAt = Date.now();
    sessionData.createdAt = sessionData.createdAt || Date.now();
    userSessions.set(address.toLowerCase(), sessionData);

    res.json({
      success: true,
      message: 'Terms accepted successfully and stored persistently',
      address: address,
      termsVersion: termsVersionToStore,
      persistent: true
    });

  } catch (error) {
    console.error('Error accepting terms:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to record terms acceptance'
    });
  }
});

/**
 * GET /faucet/eligibility/:address
 * Check if user is eligible to claim BITR from faucet (Enhanced with Oddyssey validation)
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
    
    const provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    const faucetContract = new ethers.Contract(
      config.blockchain.contractAddresses.bitrFaucet,
      FAUCET_ABI,
      provider
    );
    
    // Check on-chain eligibility (includes Oddyssey slips requirement)
    const [onChainEligible, onChainReason, oddysseySlips] = await faucetContract.checkEligibility(address);
    
    // Check backend validations
    const sessionData = userSessions.get(address.toLowerCase());
    const sessionValidation = validateUserSession(address, sessionData);
    
    // Check STT activity from database (legacy requirement)
    const activityData = await checkSTTActivity(address);
    
    // Determine overall eligibility
    const eligible = onChainEligible && sessionValidation.valid && activityData.hasActivity;
    
    let reason = "Eligible to claim";
    if (!onChainEligible) {
      reason = onChainReason;
    } else if (!sessionValidation.valid) {
      reason = sessionValidation.reason;
    } else if (!activityData.hasActivity) {
      reason = "Must create a pool or place a bet using STT first";
    }
    
    res.json({
      address,
      eligible,
      reason,
      status: {
        onChainEligible,
        onChainReason,
        sessionValid: sessionValidation.valid,
        sessionReason: sessionValidation.reason,
        hasSTTActivity: activityData.hasActivity
      },
      oddyssey: {
        totalSlips: parseInt(oddysseySlips.toString()),
        required: 2,
        meetsRequirement: parseInt(oddysseySlips.toString()) >= 2
      },
      activity: {
        poolsCreated: activityData.poolsCreated,
        betsPlaced: activityData.betsPlaced,
        firstActivity: activityData.firstActivity,
        lastActivity: activityData.lastActivity,
        totalSTTActions: activityData.totalSTTActions
      },
      session: sessionData ? {
        authenticated: sessionData.walletAuthenticated || false,
        termsAccepted: sessionData.termsAccepted || false,
        createdAt: sessionData.createdAt,
        termsVersion: sessionData.termsVersion
      } : null,
      // ✅ PERSISTENT TERMS CHECK: Also check database
      persistentTermsCheck: await checkTermsAcceptanceInDatabase(address),
      requirements: {
        oddysseySlips: "Must have at least 2 Oddyssey slips",
        authentication: "Must authenticate wallet connection",
        termsAcceptance: "Must accept terms and conditions",
        sttActivity: "Must create a pool or place a bet using STT"
      }
    });
    
  } catch (error) {
    console.error('Error checking faucet eligibility:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to check faucet eligibility'
    });
  }
});

/**
 * POST /faucet/claim
 * Validate eligibility and return claim instructions
 */
router.post('/claim', async (req, res) => {
  try {
    const { address, signature } = req.body;
    
    if (!ethers.isAddress(address)) {
      return res.status(400).json({
        error: 'Invalid wallet address format'
      });
    }
    
    // Verify signature (optional - for additional security)
    if (signature) {
      const message = `Claim BITR faucet: ${address}`;
      const recoveredAddress = ethers.verifyMessage(message, signature);
      
      if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
        return res.status(400).json({
          error: 'Invalid signature'
        });
      }
    }
    
    const provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    const faucetContract = new ethers.Contract(
      config.blockchain.contractAddresses.bitrFaucet,
      FAUCET_ABI,
      provider
    );
    
    // Check on-chain eligibility (includes all contract validations)
    const [onChainEligible, onChainReason, oddysseySlips] = await faucetContract.checkEligibility(address);
    
    // Check backend validations
    const sessionData = userSessions.get(address.toLowerCase());
    const sessionValidation = validateUserSession(address, sessionData);
    
    // Check STT activity from database
    const activityData = await checkSTTActivity(address);
    
    // Validate all requirements
    if (!onChainEligible) {
      return res.status(400).json({
        error: 'Not eligible to claim',
        reason: onChainReason,
        oddysseySlips: parseInt(oddysseySlips.toString())
      });
    }
    
    if (!sessionValidation.valid) {
      return res.status(400).json({
        error: 'Authentication required',
        reason: sessionValidation.reason
      });
    }
    
    if (!activityData.hasActivity) {
      return res.status(400).json({
        error: 'Not eligible to claim',
        reason: 'Must create a pool or place a bet using STT first'
      });
    }
    
    // All checks passed - user can claim
    res.json({
      success: true,
      message: 'Eligible to claim BITR',
      contractAddress: config.blockchain.contractAddresses.bitrFaucet,
      method: 'claimBitr',
      amount: '20000000000000000000000', // 20,000 BITR in wei
      instructions: 'Call claimBitr() function on the faucet contract',
      validation: {
        oddysseySlips: parseInt(oddysseySlips.toString()),
        authenticated: sessionData.walletAuthenticated,
        termsAccepted: sessionData.termsAccepted,
        sttActivity: activityData.hasActivity
      },
      activity: activityData
    });
    
  } catch (error) {
    console.error('Error processing faucet claim:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to process faucet claim'
    });
  }
});

/**
 * Helper function to format numbers with 2 decimal places and commas
 */
function formatNumber(num, decimals = 2) {
  const numValue = typeof num === 'string' ? parseFloat(num) : Number(num);
  if (isNaN(numValue)) return '0.00';
  
  // Round to specified decimals
  const rounded = Math.round(numValue * Math.pow(10, decimals)) / Math.pow(10, decimals);
  
  // Format with commas for thousands
  return rounded.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

/**
 * GET /faucet/statistics
 * Get overall faucet statistics
 */
router.get('/statistics', async (req, res) => {
  try {
    const provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    const faucetContract = new ethers.Contract(
      config.blockchain.contractAddresses.bitrFaucet,
      FAUCET_ABI,
      provider
    );
    
    const [balance, totalDistributed, userCount, active] = await faucetContract.getFaucetStats();
    const maxClaims = await faucetContract.maxPossibleClaims();
    const hasSufficientBalance = await faucetContract.hasSufficientBalance();
    
    // Convert from wei to ether
    const balanceEther = ethers.formatEther(balance);
    const totalDistributedEther = ethers.formatEther(totalDistributed);
    
    // Safely convert BigInt values to numbers
    const userCountBigInt = typeof userCount === 'bigint' ? userCount : BigInt(userCount.toString());
    const userCountNum = Number(userCountBigInt.toString());
    const maxClaimsBigInt = typeof maxClaims === 'bigint' ? maxClaims : BigInt(maxClaims.toString());
    const maxClaimsNum = Number(maxClaimsBigInt.toString());
    
    // Log for debugging
    console.log('🔍 Faucet stats:', {
      userCountRaw: userCount.toString(),
      userCountNum,
      totalDistributed: totalDistributed.toString(),
      balance: balance.toString()
    });
    
    // Calculate remaining claims (max possible claims minus users who already claimed)
    // This ensures we show accurate remaining claims based on actual balance
    const remainingClaims = Math.max(0, maxClaimsNum - userCountNum);
    
    // Calculate total users as: 1000 - remainingClaims
    // This ensures accurate display even if contract userCount is not working
    const MAX_FAUCET_CLAIMS = 1000;
    const calculatedTotalUsers = Math.max(0, MAX_FAUCET_CLAIMS - remainingClaims);
    
    res.json({
      faucet: {
        active: active,
        balance: balance.toString(),
        totalDistributed: totalDistributed.toString(),
        totalUsers: calculatedTotalUsers.toString(), // Use calculated value instead of contract userCount
        maxPossibleClaims: maxClaims.toString(),
        remainingClaims: remainingClaims.toString(),
        hasSufficientBalance: hasSufficientBalance
      },
      constants: {
        faucetAmount: '20000000000000000000000', // 20K BITR
        contractAddress: config.blockchain.contractAddresses.bitrFaucet
      },
      formatted: {
        balance: formatNumber(balanceEther, 0) + ' BITR', // No decimals for balance
        totalDistributed: formatNumber(totalDistributedEther, 2) + ' BITR',
        totalUsers: calculatedTotalUsers.toLocaleString('en-US'), // Use calculated value
        remainingClaims: remainingClaims.toLocaleString('en-US'),
        maxPossibleClaims: maxClaimsNum.toLocaleString('en-US'),
        faucetAmount: '20,000 BITR'
      }
    });
    
  } catch (error) {
    console.error('Error getting faucet statistics:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get faucet statistics'
    });
  }
});

/**
 * GET /faucet/activity/:address
 * Get user's STT activity history for faucet eligibility
 */
router.get('/activity/:address', async (req, res) => {
  try {
    const { address } = req.params;
    
    if (!ethers.isAddress(address)) {
      return res.status(400).json({
        error: 'Invalid wallet address format'
      });
    }
    
    // Get detailed STT activity from database
    const activities = await db.query(`
      SELECT 
        pool_id,
        'POOL_CREATE' as activity_type,
        creator_stake::text as amount,
        creation_time as timestamp,
        'Pool Creation' as description,
        category,
        league
      FROM analytics.pools 
      WHERE LOWER(creator_address) = LOWER($1)
      AND uses_bitr = FALSE  -- STT pools only
      
      UNION ALL
      
      SELECT 
        b.pool_id,
        'BET_PLACE' as activity_type,
        b.amount::text as amount,
        b.created_at as timestamp,
        'Bet Placed' as description,
        p.category,
        p.league
      FROM prediction.bets b
      JOIN analytics.pools p ON b.pool_id = p.pool_id
      WHERE LOWER(b.user_address) = LOWER($1)
      AND p.uses_bitr = FALSE  -- STT bets only
      
      ORDER BY timestamp DESC
      LIMIT 50
    `, [address]);
    
    const activityData = await checkSTTActivity(address);
    
    res.json({
      address,
      summary: {
        poolsCreated: activityData.poolsCreated,
        betsPlaced: activityData.betsPlaced,
        totalSTTActions: activityData.totalSTTActions,
        firstActivity: activityData.firstActivity,
        lastActivity: activityData.lastActivity
      },
      activities: activities.rows.map(activity => ({
        poolId: activity.pool_id,
        type: activity.activity_type,
        amount: activity.amount,
        timestamp: activity.timestamp,
        description: activity.description,
        category: activity.category,
        league: activity.league
      })),
      eligibility: {
        hasSTTActivity: activityData.hasActivity,
        message: activityData.hasActivity ?
          "✅ Eligible for BITR faucet" :
          "❌ Must create a pool or place a bet using STT first"
      }
    });
    
  } catch (error) {
    console.error('Error getting user activity:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get user activity'
    });
  }
});

module.exports = router;