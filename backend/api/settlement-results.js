const express = require('express');
const router = express.Router();
const db = require('../db/db');
const { asyncHandler } = require('../utils/validation');
const optimizedCaching = require('../middleware/optimized-caching');

/**
 * Settlement Results API
 * 
 * Provides comprehensive settlement data including:
 * - Match results and outcomes
 * - Oracle settlement transactions
 * - Settlement transparency data
 */

/**
 * GET /api/settlement-results
 * Get all settlement results with comprehensive data
 */
router.get('/', optimizedCaching.cacheMiddleware(30000), asyncHandler(async (req, res) => {
  try {
    console.log('📊 Fetching settlement results...');
    
    const result = await db.query(`
      SELECT 
        p.pool_id,
        p.fixture_id,
        p.title,
        p.home_team,
        p.away_team,
        p.predicted_outcome,
        p.market_id,
        p.is_settled,
        p.settlement_tx_hash,
        p.creator_side_won,
        p.result,
        p.settled_at,
        p.created_at,
        p.betting_end_time,
        p.total_creator_side_stake,
        p.total_bettor_stake,
        p.category,
        p.league,
        p.odds,
        p.use_bitr,
        -- Settlement transparency data
        CASE 
          WHEN p.is_settled = true THEN 'settled'
          WHEN p.betting_end_time IS NOT NULL AND EXTRACT(EPOCH FROM NOW()) > p.betting_end_time THEN 'pending_settlement'
          ELSE 'active'
        END as settlement_status,
        -- Pool statistics
        (SELECT COUNT(*) FROM oracle.bets WHERE pool_id = p.pool_id::text) as bet_count,
        (SELECT SUM(amount::numeric) FROM oracle.bets WHERE pool_id = p.pool_id::text) as total_bet_amount,
        -- LP data
        (SELECT COUNT(*) FROM oracle.pool_liquidity_providers WHERE pool_id = p.pool_id::text) as lp_count,
        (SELECT SUM(amount_provided::numeric) FROM oracle.pool_liquidity_providers WHERE pool_id = p.pool_id::text) as total_lp_stake
      FROM oracle.pools p
      WHERE p.oracle_type = 0  -- Only GUIDED oracle pools
      ORDER BY p.pool_id DESC
    `);
    
    const settlements = result.rows.map(pool => {
      const isBitr = pool.use_bitr === true;
      const currency = isBitr ? 'BITR' : 'STT';
      
      // Match result data is not available since we removed the fixture join
      let matchResult = null;
      
      // ✅ Detect refunded pools (result is zero/empty AND no bets placed)
      // CRITICAL: A pool with bets CANNOT be refunded - only pools with zero bets are refunded
      // IMPORTANT: A 0-0 game result is NOT a refund - it's a valid "Draw" outcome
      // Only the exact zero hash (all zeros) indicates a refund (no bets scenario)
      const zeroResult = '0x0000000000000000000000000000000000000000000000000000000000000000';
      
      // ✅ CRITICAL FIX: Check for bets more robustly
      // total_bettor_stake might be a string, number, or BigInt - handle all cases
      const totalBettorStakeNum = typeof pool.total_bettor_stake === 'string' 
        ? parseFloat(pool.total_bettor_stake) 
        : (typeof pool.total_bettor_stake === 'bigint' 
          ? Number(pool.total_bettor_stake) 
          : (pool.total_bettor_stake || 0));
      const betCountNum = typeof pool.bet_count === 'string' 
        ? parseInt(pool.bet_count) 
        : (pool.bet_count || 0);
      
      const hasBets = totalBettorStakeNum > 0 || betCountNum > 0;
      
      // Normalize result for comparison
      let normalizedResult = pool.result;
      if (typeof pool.result === 'string' && pool.result.startsWith('0x')) {
        normalizedResult = pool.result.toLowerCase();
      } else if (!pool.result || pool.result === null || pool.result === '') {
        // NULL or empty result - only refund if NO bets
        normalizedResult = null;
      }
      
      // ✅ CRITICAL FIX: Only mark as refund if:
      // 1. Pool is settled
      // 2. Has NO bets (this is the PRIMARY check - pools with bets are NEVER refunded)
      // 3. Result is EXACTLY the zero hash OR NULL/empty (for automatic refunds)
      // A pool with bets should NEVER be marked as refunded, regardless of result field
      // 
      // IMPORTANT: If hasBets is true, isRefunded MUST be false (pools with bets cannot be refunded)
      let isRefunded = false;
      if (pool.is_settled && !hasBets) {
        // Only check result field if there are NO bets
        // If there are bets, this pool cannot be refunded
        isRefunded = (normalizedResult === zeroResult || 
                     normalizedResult === zeroResult.toLowerCase() ||
                     normalizedResult === null ||
                     normalizedResult === '');
      }
      // If hasBets is true, isRefunded remains false (pools with bets are NEVER refunded)
      
      // Settlement transparency data
      const settlementData = {
        isSettled: pool.is_settled,
        isRefunded: isRefunded,
        settlementTxHash: pool.settlement_tx_hash,
        settlementStatus: isRefunded ? 'refunded' : pool.settlement_status,
        settledAt: pool.settled_at,
        creatorSideWon: pool.creator_side_won,
        result: pool.result,
        // Settlement timing
        bettingEndTime: pool.betting_end_time,
        timeSinceBettingEnd: pool.betting_end_time ? 
          Math.floor((Date.now() / 1000) - pool.betting_end_time) : null,
        // Pool economics
        totalStake: {
          creator: pool.total_creator_side_stake,
          bettors: pool.total_bettor_stake,
          liquidityProviders: pool.total_lp_stake || '0',
          total: (BigInt(pool.total_creator_side_stake || 0) + 
                  BigInt(pool.total_bettor_stake || 0) + 
                  BigInt(pool.total_lp_stake || 0)).toString()
        },
        // Activity data
        activity: {
          betCount: parseInt(pool.bet_count || 0),
          totalBetAmount: pool.total_bet_amount || '0',
          lpCount: parseInt(pool.lp_count || 0),
          totalLpStake: pool.total_lp_stake || '0'
        }
      };
      
      return {
        poolId: pool.pool_id,
        marketId: pool.fixture_id,
        title: pool.title,
        teams: {
          home: pool.home_team,
          away: pool.away_team
        },
        prediction: {
          outcome: pool.predicted_outcome,
          marketId: pool.fixture_id
        },
        match: {
          fixtureId: pool.fixture_id,
          result: matchResult
        },
        settlement: settlementData,
        pool: {
          category: pool.category,
          league: pool.league,
          odds: pool.odds ? parseInt(pool.odds) : null,
          currency: currency,
          useBitr: isBitr,
          createdAt: pool.created_at
        }
      };
    });
    
    res.json({
      success: true,
      data: {
        settlements: settlements,
        totalSettlements: settlements.length,
        settledCount: settlements.filter(s => s.settlement.isSettled).length,
        pendingCount: settlements.filter(s => s.settlement.settlementStatus === 'pending_settlement').length,
        activeCount: settlements.filter(s => s.settlement.settlementStatus === 'active').length
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching settlement results:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch settlement results',
      message: error.message
    });
  }
}));

/**
 * GET /api/settlement-results/:poolId
 * Get detailed settlement result for a specific pool
 */
router.get('/:poolId', optimizedCaching.cacheMiddleware(30000), asyncHandler(async (req, res) => {
  try {
    const { poolId } = req.params;
    console.log(`📊 Fetching settlement result for pool ${poolId}...`);
    
    const result = await db.query(`
      SELECT 
        p.pool_id,
        p.fixture_id,
        p.title,
        p.home_team,
        p.away_team,
        p.predicted_outcome,
        p.market_id,
        p.is_settled,
        p.settlement_tx_hash,
        p.creator_side_won,
        p.result,
        p.settled_at,
        p.created_at,
        p.betting_end_time,
        p.total_creator_side_stake,
        p.total_bettor_stake,
        p.category,
        p.league,
        p.odds,
        p.use_bitr,
        -- Settlement transparency data
        CASE 
          WHEN p.is_settled = true THEN 'settled'
          WHEN p.betting_end_time IS NOT NULL AND EXTRACT(EPOCH FROM NOW()) > p.betting_end_time THEN 'pending_settlement'
          ELSE 'active'
        END as settlement_status,
        -- Pool statistics
        (SELECT COUNT(*) FROM oracle.bets WHERE pool_id = p.pool_id::text) as bet_count,
        (SELECT SUM(amount::numeric) FROM oracle.bets WHERE pool_id = p.pool_id::text) as total_bet_amount,
        -- LP data
        (SELECT COUNT(*) FROM oracle.pool_liquidity_providers WHERE pool_id::bigint = p.pool_id) as lp_count,
        (SELECT SUM(stake::numeric) FROM oracle.pool_liquidity_providers WHERE pool_id::bigint = p.pool_id) as total_lp_stake,
        -- Match result data
        f.result_info
      FROM oracle.pools p
      LEFT JOIN oracle.fixtures f ON f.id::text = p.market_id
      WHERE p.pool_id = $1::bigint
    `, [poolId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Pool not found',
        message: `Pool ${poolId} not found or not a GUIDED oracle pool`
      });
    }
    
    const pool = result.rows[0];
    const isBitr = pool.use_bitr === true;
    const currency = isBitr ? 'BITR' : 'STT';
    
    // Extract match result data from fixture
    let matchResult = null;
    if (pool.result_info) {
      const resultInfo = pool.result_info;
      matchResult = {
        homeScore: resultInfo.home_score,
        awayScore: resultInfo.away_score,
        finalScore: resultInfo.full_score || `${resultInfo.home_score}-${resultInfo.away_score}`,
        result1X2: resultInfo.result_1x2,
        resultOU25: resultInfo.result_ou25,
        resultBTTS: resultInfo.result_btts,
        status: resultInfo.status
      };
    }
    
    // ✅ Detect refunded pools (result is zero/empty AND no bets placed)
    // CRITICAL: A pool with bets cannot be refunded - only pools with zero bets are refunded
    // IMPORTANT: A 0-0 game result is NOT a refund - it's a valid "Draw" outcome
    // Only the exact zero hash (all zeros) indicates a refund (no bets scenario)
    const zeroResult = '0x0000000000000000000000000000000000000000000000000000000000000000';
    const hasBets = parseFloat(pool.total_bettor_stake || '0') > 0 || parseInt(pool.bet_count || 0) > 0;
    
    // Normalize result for comparison
    let normalizedResult = pool.result;
    if (typeof pool.result === 'string' && pool.result.startsWith('0x')) {
      normalizedResult = pool.result.toLowerCase();
    }
    
    // Only mark as refund if:
    // 1. Pool is settled
    // 2. Has NO bets
    // 3. Result is EXACTLY the zero hash (all zeros) - NOT empty/null/other zero-like values
    const isRefunded = pool.is_settled && 
                       !hasBets && // CRITICAL: Only refund if NO bets
                       (normalizedResult === zeroResult || 
                        normalizedResult === zeroResult.toLowerCase());
    
    // Settlement transparency data
    const settlementData = {
      isSettled: pool.is_settled,
      isRefunded: isRefunded,
      settlementTxHash: pool.settlement_tx_hash,
      settlementStatus: isRefunded ? 'refunded' : pool.settlement_status,
      settledAt: pool.settled_at,
      creatorSideWon: pool.creator_side_won,
      result: pool.result,
      // Settlement timing
      bettingEndTime: pool.betting_end_time,
      timeSinceBettingEnd: pool.betting_end_time ? 
        Math.floor((Date.now() / 1000) - new Date(pool.betting_end_time).getTime() / 1000) : null
    };
    
    // Get detailed bet data
    const betsResult = await db.query(`
      SELECT 
        bettor_address,
        amount,
        is_for_outcome,
        created_at,
        transaction_hash
      FROM oracle.bets 
      WHERE pool_id::bigint = $1::bigint
      ORDER BY created_at DESC
    `, [poolId]);
    
    // Get LP data
    const lpResult = await db.query(`
      SELECT 
        lp_address,
        stake,
        created_at
      FROM oracle.pool_liquidity_providers 
      WHERE pool_id::bigint = $1::bigint
      ORDER BY created_at DESC
    `, [poolId]);
    
    const settlement = {
      poolId: pool.pool_id,
      fixtureId: pool.fixture_id || pool.market_id,
      homeTeam: pool.home_team,
      awayTeam: pool.away_team,
      league: pool.league,
      matchDate: pool.created_at,
      finalScore: matchResult?.finalScore || null,
      result1X2: matchResult?.result1X2 || null,
      resultOU25: matchResult?.resultOU25 || null,
      resultBTTS: matchResult?.resultBTTS || null,
      totalPoolSize: (parseFloat(pool.total_creator_side_stake || 0) + parseFloat(pool.total_bettor_stake || 0)) / 1e18,
      totalParticipants: (parseInt(pool.bet_count || 0) + parseInt(pool.lp_count || 0)),
      creatorWon: pool.creator_side_won,
      settlementTxHash: pool.settlement_tx_hash, // Settlement transaction hash as proof
      settlementTimestamp: pool.settled_at,
      transparencyData: {
        totalBets: parseInt(pool.bet_count || 0),
        totalVolume: parseFloat(pool.total_bet_amount || 0) / 1e18,
        creatorStake: parseFloat(pool.total_creator_side_stake || 0) / 1e18,
        bettorStake: parseFloat(pool.total_bettor_stake || 0) / 1e18,
        feesCollected: 0, // TODO: Calculate fees
        winnersCount: pool.creator_side_won ? 1 : parseInt(pool.bet_count || 0),
        losersCount: pool.creator_side_won ? parseInt(pool.bet_count || 0) : 1
      },
      // Legacy format for backward compatibility
      marketId: pool.fixture_id,
      title: pool.title,
      teams: {
        home: pool.home_team,
        away: pool.away_team
      },
      prediction: {
        outcome: pool.predicted_outcome,
        marketId: pool.fixture_id
      },
      match: {
        fixtureId: pool.fixture_id,
        result: matchResult
      },
      settlement: settlementData,
      pool: {
        category: pool.category,
        league: pool.league,
        odds: pool.odds ? parseInt(pool.odds) : null,
        currency: currency,
        useBitr: isBitr,
        createdAt: pool.created_at,
        totalCreatorStake: pool.total_creator_side_stake,
        totalBettorStake: pool.total_bettor_stake
      },
      activity: {
        bets: betsResult.rows.map(bet => ({
          bettor: bet.bettor_address,
          amount: bet.amount,
          isForOutcome: bet.is_for_outcome,
          createdAt: bet.created_at,
          txHash: bet.transaction_hash
        })),
        liquidityProviders: lpResult.rows.map(lp => ({
          provider: lp.lp_address,
          stake: lp.stake,
          createdAt: lp.created_at
        })),
        totalBets: betsResult.rows.length,
        totalLPs: lpResult.rows.length
      }
    };
    
    res.json({
      success: true,
      data: settlement
    });
    
  } catch (error) {
    console.error(`❌ Error fetching settlement result for pool ${req.params.poolId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch settlement result',
      message: error.message
    });
  }
}));

/**
 * GET /api/settlement-results/transparency/:poolId
 * Get transparency data for a specific pool (oracle submissions, transactions, etc.)
 */
router.get('/transparency/:poolId', optimizedCaching.cacheMiddleware(30000), asyncHandler(async (req, res) => {
  try {
    const { poolId } = req.params;
    console.log(`📊 Fetching transparency data for pool ${poolId}...`);
    
    // Get pool basic info
    const poolResult = await db.query(`
      SELECT 
        pool_id,
        title,
        market_id,
        is_settled,
        settlement_tx_hash,
        result,
        settled_at
      FROM prediction.pools 
      WHERE pool_id = $1 AND oracle_type = 'GUIDED'
    `, [poolId]);
    
    if (poolResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Pool not found',
        message: `Pool ${poolId} not found or not a GUIDED oracle pool`
      });
    }
    
    const pool = poolResult.rows[0];
    
    // Get all transactions related to this pool
    const transactionsResult = await db.query(`
      SELECT 
        'bet' as transaction_type,
        transaction_hash,
        bettor_address as user_address,
        amount,
        created_at,
        'Bet placed' as description
      FROM prediction.bets 
      WHERE pool_id = $1
      
      
      ORDER BY created_at DESC
    `, [poolId]);
    
    const transparency = {
      poolId: pool.pool_id,
      title: pool.title,
      marketId: pool.market_id,
      settlement: {
        isSettled: pool.is_settled,
        settlementTxHash: pool.settlement_tx_hash,
        result: pool.result,
        settledAt: pool.settled_at
      },
      transactions: transactionsResult.rows.map(tx => ({
        type: tx.transaction_type,
        hash: tx.transaction_hash,
        user: tx.user_address,
        amount: tx.amount,
        description: tx.description,
        timestamp: tx.created_at
      })),
      transparency: {
        totalTransactions: transactionsResult.rows.length,
        betTransactions: transactionsResult.rows.filter(tx => tx.transaction_type === 'bet').length,
        lpTransactions: transactionsResult.rows.filter(tx => tx.transaction_type === 'liquidity').length,
        hasSettlementTx: !!pool.settlement_tx_hash,
        settlementTransparency: pool.is_settled ? 'Fully transparent' : 'Pending settlement'
      }
    };
    
    res.json({
      success: true,
      data: transparency
    });
    
  } catch (error) {
    console.error(`❌ Error fetching transparency data for pool ${req.params.poolId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch transparency data',
      message: error.message
    });
  }
}));

module.exports = router;
