const express = require('express');
const router = express.Router();
const db = require('../db/db');
const { ethers } = require('ethers');
const optimizedCaching = require('../middleware/optimized-caching');
const sharedQueryService = require('../services/shared-query-service');
const { enrichPoolsWithArbitrationInfo, enrichPoolWithArbitrationInfo } = require('../utils/arbitration-helper');

/**
 * GET /api/optimized-pools/pools
 * Get all pools with comprehensive data for EnhancedPoolCard
 * ✅ CRITICAL: Verifies settlement status against contract for settled pools to ensure DB sync
 */
router.get('/pools', optimizedCaching.cacheMiddleware(120), async (req, res) => {
  try {
    const { category, status, sortBy = 'newest', limit = 50, offset = 0 } = req.query;
    
    // ✅ CRITICAL: Verify settlement status against contract for settled pools
    // This ensures DB is always in sync with on-chain state
    const verifySettlementStatus = async (poolId) => {
      try {
        const Web3Service = require('../services/web3-service');
        const web3Service = new Web3Service();
        await web3Service.initialize();
        
        const poolContract = await web3Service.getPoolCoreContract();
        const poolData = await poolContract.getPool(poolId);
        
        const isSettledOnChain = (Number(poolData.flags) & 1) !== 0;
        const creatorSideWonOnChain = (Number(poolData.flags) & 2) !== 0;
        
        return {
          isSettled: isSettledOnChain,
          creatorSideWon: creatorSideWonOnChain,
          result: poolData.result
        };
      } catch (error) {
        console.warn(`⚠️ Could not verify pool ${poolId} settlement on-chain:`, error.message);
        return null; // Return null if verification fails (use DB data)
      }
    };
    
    // Build dynamic query
    let whereClause = 'WHERE p.status != \'deleted\'';
    let queryParams = [];
    let paramCount = 0;
    
    if (category && category !== 'all') {
      paramCount++;
      whereClause += ` AND p.category = $${paramCount}`;
      queryParams.push(category);
    }
    
    if (status && status !== 'all') {
      paramCount++;
      if (status === 'active') {
        whereClause += ` AND p.event_start_time > EXTRACT(EPOCH FROM NOW())`;
      } else if (status === 'closed') {
        whereClause += ` AND p.event_start_time <= EXTRACT(EPOCH FROM NOW()) AND p.event_end_time > EXTRACT(EPOCH FROM NOW())`;
      } else if (status === 'settled') {
        whereClause += ` AND p.is_settled = true`;
      }
    }
    
    // Sort options
    let orderBy = 'ORDER BY p.pool_id DESC';
    if (sortBy === 'oldest') {
      orderBy = 'ORDER BY p.pool_id ASC';
    } else if (sortBy === 'volume') {
      orderBy = 'ORDER BY p.total_bettor_stake DESC';
    } else if (sortBy === 'ending-soon') {
      orderBy = 'ORDER BY p.betting_end_time ASC';
    }
    
    // Get pools with comprehensive data using optimized JOINs instead of subqueries
    const poolsQuery = `
      SELECT 
        p.pool_id as id,
        p.title,
        p.category,
        p.creator_address,
        p.odds,
        p.creator_stake,
        p.total_creator_side_stake,
        p.total_bettor_stake,
        p.max_bettor_stake,
        p.predicted_outcome,
        p.event_start_time,
        p.event_end_time,
        p.betting_end_time,
        p.is_settled,
        p.creator_side_won,
        p.is_private,
        p.use_bitr,
        p.boost_tier,
        p.boost_expiry,
        p.league,
        p.home_team,
        p.away_team,
        p.region,
        p.created_at,
        p.social_stats,
        -- Calculate effective creator side stake (matches contract logic)
        CASE 
          WHEN p.total_bettor_stake = 0 OR p.total_bettor_stake > p.creator_stake THEN 
            p.total_creator_side_stake
          ELSE p.creator_stake
        END as effective_creator_side_stake,
        -- Calculate current max bettor stake dynamically (matches contract logic)
        CASE 
          WHEN p.total_bettor_stake = 0 OR p.total_bettor_stake > p.creator_stake THEN 
            (p.total_creator_side_stake::numeric * 100) / NULLIF((p.odds - 100), 0)
          ELSE 
            (p.creator_stake::numeric * 100) / NULLIF((p.odds - 100), 0)
        END as current_max_bettor_stake,
        -- Calculate fill percentage including creator stake and LP stakes
        CASE 
          WHEN (p.total_bettor_stake = 0 OR p.total_bettor_stake > p.creator_stake) AND p.total_creator_side_stake > 0 THEN 
            LEAST(100, ((p.total_creator_side_stake::numeric + p.total_bettor_stake::numeric) / NULLIF((p.total_creator_side_stake::numeric + ((p.total_creator_side_stake::numeric * 100) / NULLIF((p.odds - 100), 0))), 0) * 100))
          WHEN p.total_bettor_stake <= p.creator_stake AND p.creator_stake > 0 THEN 
            LEAST(100, ((p.creator_stake::numeric + p.total_bettor_stake::numeric) / NULLIF((p.creator_stake::numeric + ((p.creator_stake::numeric * 100) / NULLIF((p.odds - 100), 0))), 0) * 100))
          ELSE 0 
        END as fill_percentage,
        -- Calculate max pool size dynamically (matches contract logic exactly)
        -- Total pool capacity = effectiveCreatorSideStake + maxBettorStake
        -- maxBettorStake = (effectiveCreatorSideStake * 100) / (odds - 100)
        -- effectiveCreatorSideStake = totalCreatorSideStake when no bets or bets > creatorStake
        CASE 
          WHEN p.total_bettor_stake = 0 OR p.total_bettor_stake > p.creator_stake THEN 
            p.total_creator_side_stake::numeric + ((p.total_creator_side_stake::numeric * 100) / NULLIF((p.odds - 100), 0))
          ELSE 
            p.creator_stake::numeric + ((p.creator_stake::numeric * 100) / NULLIF((p.odds - 100), 0))
        END as max_pool_size,
        -- Optimized bet stats using LEFT JOINs
        COALESCE(bet_stats.unique_bettors, 0) as unique_bettors,
        COALESCE(bet_stats.bet_count, 0) as bet_count,
        COALESCE(bet_stats.avg_bet_size, 0) as avg_bet_size,
        COALESCE(lp_stats.lp_count, 0) as lp_count,
        -- Social stats (calculated dynamically if not in social_stats column)
        COALESCE((p.social_stats->>'likes')::int, (SELECT COUNT(*) FROM core.social_reactions WHERE target_type = 'pool' AND target_id::text = p.pool_id::text AND reaction_type = 'like')) as likes_count,
        COALESCE((p.social_stats->>'comments')::int, (SELECT COUNT(*) FROM core.pool_comments WHERE pool_id = p.pool_id::text AND is_deleted = false)) as comments_count,
        -- Football market data for better title generation
        fpm.outcome_type,
        fpm.predicted_outcome as detailed_predicted_outcome,
        -- Team logos for football pools (from fixtures table)
        f.home_team_image_path,
        f.away_team_image_path,
        f.home_team_id,
        f.away_team_id,
        -- Crypto logo for cryptocurrency pools
        cc.logo_url as crypto_logo_url,
        cc.coinpaprika_id
      FROM oracle.pools p
      LEFT JOIN (
        SELECT 
          b.pool_id,
          COUNT(DISTINCT b.bettor_address) as unique_bettors,
          COUNT(*) as bet_count,
          AVG(b.amount::numeric) as avg_bet_size
        FROM oracle.bets b 
        -- ✅ FIX: Count ALL bets (both YES and NO bets) for refund detection
        -- Previously only counted is_for_outcome = true, which missed NO bets
        GROUP BY b.pool_id
      ) bet_stats ON bet_stats.pool_id::bigint = p.pool_id
      LEFT JOIN (
        SELECT 
          lp.pool_id,
          COUNT(DISTINCT lp.lp_address) as lp_count
        FROM oracle.pool_liquidity_providers lp
        GROUP BY lp.pool_id
      ) lp_stats ON lp_stats.pool_id::bigint = p.pool_id
      LEFT JOIN oracle.football_prediction_markets fpm ON fpm.pool_id = p.pool_id::text
      -- Join fixtures table to get team logos for football pools
      LEFT JOIN oracle.fixtures f ON (f.id = p.fixture_id::text OR f.id = p.market_id)
      -- Join crypto tables to get coin logos for crypto pools (join via market_id since crypto_prediction_markets doesn't have pool_id)
      LEFT JOIN oracle.crypto_prediction_markets cpm ON cpm.market_id = p.market_id
      LEFT JOIN oracle.crypto_coins cc ON cc.coinpaprika_id = cpm.coinpaprika_id
      ${whereClause}
      ${orderBy}
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;
    
    queryParams.push(parseInt(limit), parseInt(offset));
    
    const poolsResult = await db.query(poolsQuery, queryParams);
    
    // Get creator data for each pool
    // ✅ CRITICAL: Verify settlement status for settled pools to ensure DB sync
    const poolsWithCreators = await Promise.all(
      poolsResult.rows.map(async (pool) => {
        // For settled pools, verify against contract (batch verification for performance)
        // ✅ FIX: Explicitly convert PostgreSQL boolean to JavaScript boolean
        let verifiedIsSettled = Boolean(pool.is_settled);
        let verifiedCreatorSideWon = Boolean(pool.creator_side_won);
        
        if (pool.is_settled) {
          // Only verify settled pools to avoid unnecessary contract calls
          const contractState = await verifySettlementStatus(parseInt(pool.id));
          if (contractState) {
            // Use contract as source of truth
            verifiedIsSettled = Boolean(contractState.isSettled);
            verifiedCreatorSideWon = Boolean(contractState.creatorSideWon);
            
            // ✅ FIX: Explicit boolean comparison to catch type mismatches
            const dbIsSettled = Boolean(pool.is_settled);
            const dbCreatorSideWon = Boolean(pool.creator_side_won);
            
            // If DB is out of sync, log warning and update DB (async, don't block)
            if (dbIsSettled !== verifiedIsSettled || 
                dbCreatorSideWon !== verifiedCreatorSideWon) {
              console.warn(`⚠️ Pool ${pool.id} settlement mismatch! DB: is_settled=${dbIsSettled}, creator_side_won=${dbCreatorSideWon} | Contract: is_settled=${verifiedIsSettled}, creator_side_won=${verifiedCreatorSideWon}`);
              
              // Update DB to match contract (async, don't block response)
              db.query(`
                UPDATE oracle.pools 
                SET is_settled = $1, creator_side_won = $2, updated_at = NOW()
                WHERE pool_id = $3
              `, [verifiedIsSettled, verifiedCreatorSideWon, pool.id]).catch(err => {
                console.error(`❌ Failed to sync pool ${pool.id} in DB:`, err.message);
              });
            }
          }
          
          // Override pool data with verified contract state
          pool.is_settled = verifiedIsSettled;
          pool.creator_side_won = verifiedCreatorSideWon;
        }
        
        // ✅ FIX: Explicit debug logging for Pool 8
        if (pool.id === 8) {
          console.log(`🔍 Pool 8 API response:`, {
            is_settled: pool.is_settled,
            creator_side_won: pool.creator_side_won,
            verifiedIsSettled,
            verifiedCreatorSideWon,
            typeIsSettled: typeof pool.is_settled,
            typeCreatorSideWon: typeof pool.creator_side_won
          });
        }
        // Get creator stats
        const creatorStats = await db.query(`
          SELECT 
            COUNT(*) as total_pools,
            AVG(CASE WHEN p.is_settled = true THEN 
              CASE WHEN p.creator_side_won = true THEN 1 ELSE 0 END 
            END) as success_rate,
            SUM(p.creator_stake) as total_volume
          FROM oracle.pools p 
          WHERE p.creator_address = $1
        `, [pool.creator_address]);
        
        const stats = creatorStats.rows[0];
        
        // Determine currency
        const currency = pool.use_bitr ? 'BITR' : 'STT';
        
        // Calculate time left
        const now = Math.floor(Date.now() / 1000);
        const timeLeft = Math.max(0, pool.event_end_time - now);
        
        // Determine comprehensive status
        let status = 'active';
        let canBet = true;
        let isEventStarted = false;
        let isPoolFilled = false;
        
        if (pool.is_settled) {
          status = 'settled';
          canBet = false;
        } else if (now >= pool.event_start_time) {
          status = 'closed';
          canBet = false;
          isEventStarted = true;
        } else if (parseFloat(pool.fill_percentage) >= 100) {
          status = 'filled';
          canBet = false;
          isPoolFilled = true;
        } else if (now >= pool.betting_end_time) {
          status = 'betting_closed';
          canBet = false;
        }
        
        // Generate intelligent title using frontend-compatible logic
        const generateTitle = () => {
          // Always generate a new title based on the data, ignore existing database title
          // Use the same title generation logic as frontend
          // Prefer detailed_predicted_outcome from football_prediction_markets if available
          const predictedOutcome = pool.detailed_predicted_outcome || pool.predicted_outcome;
          
          const marketData = {
            marketType: pool.market_type || 'CUSTOM',
            homeTeam: pool.home_team,
            awayTeam: pool.away_team,
            predictedOutcome: predictedOutcome,
            outcomeType: pool.outcome_type, // OU25, 1X2, etc.
            league: pool.league,
            marketId: pool.market_id || pool.id.toString(),
            fixtureId: pool.fixture_id || pool.market_id,
            category: pool.category,
            eventStartTime: pool.event_start_time,
            eventEndTime: pool.event_end_time
          };
          
          return generateProfessionalTitle(marketData);
        };

        // Professional title generation (backend version of frontend service)
        const generateProfessionalTitle = (marketData) => {
          const { homeTeam, awayTeam, predictedOutcome, category, marketType } = marketData;
          
          // Check if this is a crypto market
          if (isCryptoMarket(marketData)) {
            return generateCryptoTitle(marketData);
          }
          
          // For team-based predictions
          if (homeTeam && awayTeam) {
            return generateTeamBasedTitle(homeTeam, awayTeam, predictedOutcome, marketType);
          }
          
          // Fallback based on category
          if (predictedOutcome) {
            return `Prediction: ${predictedOutcome}`;
          }
          
          if (category === 'crypto' || category === 'cryptocurrency') {
            return `Crypto Market Prediction #${marketData.marketId}`;
          }
          
          if (category === 'football') {
            return `Football Match Prediction #${marketData.marketId}`;
          }
          
          if (category === 'basketball') {
            return `Basketball Game Prediction #${marketData.marketId}`;
          }
          
          return `Prediction Pool #${marketData.marketId}`;
        };

        // Check if market is crypto
        const isCryptoMarket = (marketData) => {
          return Boolean(
            marketData.category === 'cryptocurrency' || 
            marketData.category === 'crypto' ||
            (marketData.league && marketData.league === 'crypto') ||
            (marketData.marketType && marketData.marketType.startsWith('CRYPTO_')) ||
            (marketData.homeTeam && ['BTC', 'ETH', 'BNB', 'ADA', 'SOL', 'MATIC', 'AVAX', 'DOT', 'LINK', 'UNI'].includes(marketData.homeTeam))
          );
        };

        // Generate crypto title
        const generateCryptoTitle = (marketData) => {
          const { homeTeam, predictedOutcome, eventStartTime, eventEndTime } = marketData;
          
          // For crypto markets, homeTeam is the crypto symbol (e.g., "BTC", "SOL", "ETH")
          // predictedOutcome contains the full prediction (e.g., "BTC > $130,000" or "SOL <= $250")
          
          // ✅ FIX: Check if symbol is already in predictedOutcome to avoid duplication
          const symbol = homeTeam ? homeTeam.toUpperCase() : '';
          const outcome = predictedOutcome || '';
          
          // Check if symbol already appears in predictedOutcome
          const symbolAlreadyInOutcome = symbol && outcome.toUpperCase().includes(symbol);
          
          // Extract price and direction from predictedOutcome
          const aboveMatch = outcome.match(/above\s+\$?([\d,]+(?:\.\d+)?)/i);
          const belowMatch = outcome.match(/below\s+\$?([\d,]+(?:\.\d+)?)/i);
          const price = aboveMatch ? aboveMatch[1] : (belowMatch ? belowMatch[1] : null);
          const direction = aboveMatch ? 'above' : (belowMatch ? 'below' : null);
          
          // Calculate timeframe from event times
          let timeframeText = '';
          if (eventStartTime && eventEndTime) {
            const timeframeSeconds = parseInt(eventEndTime) - parseInt(eventStartTime);
            const hours = Math.floor(timeframeSeconds / 3600);
            const days = Math.floor(hours / 24);
            
            if (days > 0) {
              timeframeText = `${days} day${days > 1 ? 's' : ''}`;
            } else if (hours > 0) {
              timeframeText = `${hours} hour${hours > 1 ? 's' : ''}`;
            } else {
              const minutes = Math.floor(timeframeSeconds / 60);
              timeframeText = `${minutes} minute${minutes > 1 ? 's' : ''}`;
            }
          }
          
          // Generate challenging/engaging title
          if (symbol && price && direction) {
            // Remove symbol from predictedOutcome if it's already there
            let cleanOutcome = outcome;
            if (symbolAlreadyInOutcome) {
              // Remove the symbol from the beginning of the outcome
              cleanOutcome = outcome.replace(new RegExp(`^${symbol}\\s+`, 'i'), '').trim();
            }
            
            // Create engaging title with timeframe
            const challengePhrases = [
              `Will ${symbol} ${direction} $${price}?`,
              `${symbol} ${direction} $${price} Challenge`,
              `Can ${symbol} Hit $${price} ${direction}?`,
              `${symbol} Price ${direction} $${price} Prediction`,
              `${symbol} ${direction} $${price} - Will it happen?`
            ];
            
            // Select a challenging phrase deterministically based on pool ID for consistency
            // Use pool ID modulo to ensure consistent title per pool
            const poolId = marketData.marketId || '';
            const phraseIndex = poolId ? (parseInt(String(poolId).replace(/\D/g, '')) || 0) % challengePhrases.length : 0;
            const title = challengePhrases[phraseIndex];
            
            // Add timeframe if available
            if (timeframeText) {
              return `${title} (${timeframeText} window)`;
            }
            
            return title;
          }
          
          // Fallback: use predictedOutcome directly if symbol already included
          if (symbolAlreadyInOutcome) {
            return timeframeText ? `${outcome} (${timeframeText} window)` : outcome;
          }
          
          // Fallback: combine symbol and outcome
          if (symbol && outcome) {
            return timeframeText ? `${symbol} ${outcome} (${timeframeText} window)` : `${symbol} ${outcome}`;
          }
          
          return timeframeText ? `Crypto prediction: ${outcome} (${timeframeText} window)` : `Crypto prediction: ${outcome}`;
        };

        // Generate team-based title
        const generateTeamBasedTitle = (homeTeam, awayTeam, predictedOutcome, marketType) => {
          if (!predictedOutcome) {
            return `${homeTeam} vs ${awayTeam}`;
          }
          
          console.log(`🔍 Title generation: ${homeTeam} vs ${awayTeam}, outcome: ${predictedOutcome}, marketType: ${marketType}`);
          
          // Auto-detect market type from predicted outcome if marketType is not useful
          const detectedMarketType = detectMarketTypeFromOutcome(predictedOutcome, marketType);
          console.log(`🎯 Detected market type: ${detectedMarketType} (original: ${marketType})`);
          
          // Use templates similar to frontend
          const templates = getTitleTemplates(detectedMarketType);
          
          // Try to find exact match
          if (templates[predictedOutcome]) {
            return processTemplate(templates[predictedOutcome], { homeTeam, awayTeam });
          }
          
          // Try normalized matches
          const normalizedOutcome = predictedOutcome.toLowerCase().replace(/\s+goals?/g, '').trim();
          for (const [key, template] of Object.entries(templates)) {
            const normalizedKey = key.toLowerCase().replace(/\s+goals?/g, '').trim();
            if (normalizedOutcome === normalizedKey) {
              return processTemplate(template, { homeTeam, awayTeam });
            }
          }
          
          // Try partial matches
          for (const [key, template] of Object.entries(templates)) {
            if (isPartialMatch(predictedOutcome, key)) {
              return processTemplate(template, { homeTeam, awayTeam });
            }
          }
          
          // Special handling for common outcomes
          const outcome = predictedOutcome.toLowerCase().trim();
          if (outcome === 'home wins' || outcome === 'home' || outcome === '1') {
            return `${homeTeam} will beat ${awayTeam} at home!`;
          } else if (outcome === 'away wins' || outcome === 'away' || outcome === '2') {
            return `${awayTeam} will beat ${homeTeam} away!`;
          } else if (outcome === 'draw' || outcome === 'x') {
            return `${homeTeam} vs ${awayTeam} will end in a draw!`;
          } else {
            // Robust number detection using regex
            const numberMatch = outcome.match(/(\d+\.?\d*)/);
            if (numberMatch) {
              const number = numberMatch[1];
              if (outcome.includes('under')) {
                return `${homeTeam} vs ${awayTeam} will score under ${number} goals!`;
              } else if (outcome.includes('over')) {
                return `${homeTeam} vs ${awayTeam} will score over ${number} goals!`;
              }
            }
          }
          
          // Fallback
          return `${homeTeam} vs ${awayTeam} will ${predictedOutcome.toLowerCase()}!`;
        };

        // Detect market type from predicted outcome
        const detectMarketTypeFromOutcome = (predictedOutcome, originalMarketType) => {
          if (!predictedOutcome) return originalMarketType || 'CUSTOM';
          
          const outcome = predictedOutcome.toLowerCase().trim();
          
          // Over/Under detection
          if (outcome.includes('over') || outcome.includes('under')) {
            return 'OVER_UNDER';
          }
          
          // BTTS detection
          if (outcome.includes('both teams') || outcome.includes('btts') || 
              (outcome.includes('yes') && originalMarketType !== 'MONEYLINE') ||
              (outcome.includes('no') && originalMarketType !== 'MONEYLINE')) {
            return 'BOTH_TEAMS_SCORE';
          }
          
          // 1X2 / Moneyline detection
          if (outcome === 'home' || outcome === 'away' || outcome === 'draw' ||
              outcome === '1' || outcome === '2' || outcome === 'x' ||
              outcome.includes('wins') || outcome.includes('win')) {
            return 'MONEYLINE';
          }
          
          // Double Chance detection
          if (outcome.includes('1x') || outcome.includes('12') || outcome.includes('x2') ||
              outcome.includes('double chance')) {
            return 'DOUBLE_CHANCE';
          }
          
          // Correct Score detection
          if (/\d+-\d+/.test(outcome) || outcome.includes('correct score')) {
            return 'CORRECT_SCORE';
          }
          
          // Half Time detection
          if (outcome.includes('ht') || outcome.includes('half time') || outcome.includes('halftime')) {
            return 'HALF_TIME';
          }
          
          // Asian Handicap detection
          if (outcome.includes('handicap') || outcome.includes('ah') || /[+-]\d+\.?\d*/.test(outcome)) {
            return 'ASIAN_HANDICAP';
          }
          
          // Fallback to original or CUSTOM
          return originalMarketType && originalMarketType !== '0' ? originalMarketType : 'CUSTOM';
        };

        // Get title templates (simplified version of frontend)
        const getTitleTemplates = (marketType) => {
          const templates = {
            'MONEYLINE': {
              'Home wins': '${homeTeam} will beat ${awayTeam} at home!',
              'Away wins': '${awayTeam} will beat ${homeTeam} away!',
              'Draw': '${homeTeam} vs ${awayTeam} will end in a draw!',
              '1': '${homeTeam} will beat ${awayTeam} at home!',
              '2': '${awayTeam} will beat ${homeTeam} away!',
              'X': '${homeTeam} vs ${awayTeam} will end in a draw!',
              'Home FT': '${homeTeam} will beat ${awayTeam} at full-time!',
              'Away FT': '${awayTeam} will beat ${homeTeam} at full-time!',
              'Draw FT': '${homeTeam} vs ${awayTeam} will end in a draw!'
            },
            'HALF_TIME': {
              'Home HT': '${homeTeam} will lead ${awayTeam} in the first half!',
              'Away HT': '${awayTeam} will lead ${homeTeam} in the first half!',
              'Draw HT': '${homeTeam} vs ${awayTeam} will be tied at half-time!',
              'Home HT 1': '${homeTeam} will lead ${awayTeam} in the first half!',
              'Away HT 2': '${awayTeam} will lead ${homeTeam} in the first half!',
              'Draw HT X': '${homeTeam} vs ${awayTeam} will be tied at half-time!',
              'Home': '${homeTeam} will lead ${awayTeam} in the first half!',
              'Away': '${awayTeam} will lead ${homeTeam} in the first half!',
              'Draw': '${homeTeam} vs ${awayTeam} will be tied at half-time!',
              '1': '${homeTeam} will lead ${awayTeam} in the first half!',
              '2': '${awayTeam} will lead ${homeTeam} in the first half!',
              'X': '${homeTeam} vs ${awayTeam} will be tied at half-time!'
            },
            'OVER_UNDER': {
              // Short format (matches Pool 0)
              'Over 0.5': '${homeTeam} vs ${awayTeam} will score over 0.5 goals!',
              'Under 0.5': '${homeTeam} vs ${awayTeam} will score under 0.5 goals!',
              'Over 1.5': '${homeTeam} vs ${awayTeam} will score over 1.5 goals!',
              'Under 1.5': '${homeTeam} vs ${awayTeam} will score under 1.5 goals!',
              'Over 2.5': '${homeTeam} vs ${awayTeam} will score over 2.5 goals!',
              'Under 2.5': '${homeTeam} vs ${awayTeam} will score under 2.5 goals!',
              'Over 3.5': '${homeTeam} vs ${awayTeam} will score over 3.5 goals!',
              'Under 3.5': '${homeTeam} vs ${awayTeam} will score under 3.5 goals!',
              // Long format (legacy)
              'Over 2.5 goals': '${homeTeam} vs ${awayTeam} will score over 2.5 goals!',
              'Under 2.5 goals': '${homeTeam} vs ${awayTeam} will score under 2.5 goals!',
              'Over 1.5 goals': '${homeTeam} vs ${awayTeam} will score over 1.5 goals!',
              'Under 1.5 goals': '${homeTeam} vs ${awayTeam} will score under 1.5 goals!',
              'Over 3.5 goals': '${homeTeam} vs ${awayTeam} will score over 3.5 goals!',
              'Under 3.5 goals': '${homeTeam} vs ${awayTeam} will score under 3.5 goals!'
            },
            'BOTH_TEAMS_SCORE': {
              'Both teams to score': 'Both ${homeTeam} and ${awayTeam} will score!',
              'Not both teams to score': 'Both ${homeTeam} and ${awayTeam} will NOT score!',
              'Yes': 'Both ${homeTeam} and ${awayTeam} will score!',
              'No': 'Both ${homeTeam} and ${awayTeam} will NOT score!'
            },
            'CUSTOM': {
              'Over 0.5 goals': '${homeTeam} vs ${awayTeam} will score over 0.5 goals!',
              'Under 0.5 goals': '${homeTeam} vs ${awayTeam} will score under 0.5 goals!',
              'Over': '${homeTeam} vs ${awayTeam} will score over 0.5 goals!',
              'Under': '${homeTeam} vs ${awayTeam} will score under 0.5 goals!'
            }
          };
          
          return templates[marketType] || templates['CUSTOM'];
        };

        // Process template string
        const processTemplate = (template, data) => {
          return template
            .replace(/\${homeTeam}/g, data.homeTeam)
            .replace(/\${awayTeam}/g, data.awayTeam);
        };

        // Check for partial match
        const isPartialMatch = (predictedOutcome, key) => {
          const outcome = predictedOutcome.toLowerCase();
          const keyLower = key.toLowerCase();
          return outcome.includes(keyLower) || keyLower.includes(outcome);
        };

        // Validate and format odds as basis points
        const validateAndFormatOdds = (odds) => {
          const oddsValue = parseInt(odds);
          
          // Ensure odds are in valid range (101-10000 basis points = 1.01x to 100x)
          if (oddsValue < 101 || oddsValue > 10000) {
            console.warn(`Invalid odds value: ${oddsValue} for pool ${pool.id}. Using default 200 (2.00x)`);
            return 200; // Default to 2.00x odds
          }
          
          return oddsValue;
        };

        return {
          id: pool.id,
          title: generateTitle(),
          category: pool.category,
          creator: {
            address: pool.creator_address,
            username: `${pool.creator_address.slice(0, 6)}...${pool.creator_address.slice(-4)}`,
            successRate: parseFloat(stats.success_rate || 0) * 100,
            totalPools: parseInt(stats.total_pools || 0),
            totalVolume: parseFloat(stats.total_volume || 0),
            badges: [] // Will be populated from reputation system
          },
          odds: validateAndFormatOdds(pool.odds),
          creatorStake: (parseFloat(pool.creator_stake) / 1e18).toFixed(2),
          totalBettorStake: (parseFloat(pool.total_bettor_stake) / 1e18).toFixed(2),
          maxPoolSize: (parseFloat(pool.max_pool_size) / 1e18).toFixed(2),
          fillPercentage: parseFloat(pool.fill_percentage),
          participants: parseInt(pool.unique_bettors) + parseInt(pool.lp_count || 0), // Include LPs in participant count
          eventStartTime: pool.event_start_time,
          eventEndTime: pool.event_end_time,
          bettingEndTime: pool.betting_end_time,
          status,
          canBet,
          isEventStarted,
          isPoolFilled,
          isSettled: Boolean(verifiedIsSettled), // ✅ FIX: Ensure boolean type
          creatorSideWon: Boolean(verifiedCreatorSideWon), // ✅ FIX: Ensure boolean type (source of truth)
          currency,
          boostTier: pool.boost_tier === 0 || pool.boost_tier === '0' || pool.boost_tier === 'NONE' || !pool.boost_tier ? 'NONE' : 
                    pool.boost_tier === 1 || pool.boost_tier === '1' || pool.boost_tier === 'BRONZE' ? 'BRONZE' : 
                    pool.boost_tier === 2 || pool.boost_tier === '2' || pool.boost_tier === 'SILVER' ? 'SILVER' : 
                    pool.boost_tier === 3 || pool.boost_tier === '3' || pool.boost_tier === 'GOLD' ? 'GOLD' : 'NONE',
          trending: parseFloat(pool.fill_percentage) > 50,
          socialStats: (() => {
            // Get social stats from pool.social_stats JSONB column or calculate dynamically
            if (pool.social_stats) {
              const stats = typeof pool.social_stats === 'string' 
                ? JSON.parse(pool.social_stats) 
                : pool.social_stats;
              return {
                likes: stats.likes || 0,
                comments: stats.comments || 0,
                views: stats.views || 0,
                shares: stats.shares || 0
              };
            }
            // Fallback: calculate from related tables
            return {
              likes: pool.likes_count || 0,
              comments: pool.comments_count || 0,
              views: parseInt(pool.unique_bettors) > 0 ? parseInt(pool.unique_bettors) : 0,
              shares: 0
            };
          })(),
          // Bet statistics
          totalBets: parseInt(pool.bet_count || 0) + parseInt(pool.lp_count || 0), // Include LPs in total bets
          avgBet: (() => {
            const totalParticipants = parseInt(pool.bet_count || 0) + parseInt(pool.lp_count || 0);
            if (totalParticipants === 0) return 0;
            const totalFilled = parseFloat(pool.total_bettor_stake || 0) + (parseFloat(pool.total_creator_side_stake || 0) - parseFloat(pool.creator_stake || 0));
            return (totalFilled / 1e18) / totalParticipants;
          })(), // Calculate average based on total filled amount / total participants
          timeLeft: {
            days: Math.floor(timeLeft / (24 * 60 * 60)),
            hours: Math.floor((timeLeft % (24 * 60 * 60)) / (60 * 60)),
            minutes: Math.floor((timeLeft % (60 * 60)) / 60),
            seconds: timeLeft % 60
          },
          // Additional fields for bet page
          homeTeam: pool.home_team,
          awayTeam: pool.away_team,
          league: pool.league,
          region: pool.region,
          predictedOutcome: pool.detailed_predicted_outcome || pool.predicted_outcome,
          marketId: pool.market_id || pool.id.toString(),
          marketType: pool.market_type || 'CUSTOM',
          fixtureId: pool.fixture_id || pool.market_id,
          oracleType: 'GUIDED', // Default oracle type
          liquidityProviders: parseInt(pool.lp_count || 0), // Add LP provider count
          // Logo URLs for cards
          homeTeamLogo: pool.home_team_image_path || (pool.home_team_id ? getTeamLogoUrl(pool.home_team_id, pool.home_team) : null),
          awayTeamLogo: pool.away_team_image_path || (pool.away_team_id ? getTeamLogoUrl(pool.away_team_id, pool.away_team) : null),
          cryptoLogo: (() => {
            // Use logo from database if available
            if (pool.crypto_logo_url) {
              return pool.crypto_logo_url;
            }
            // Fallback: generate CoinPaprika URL from coinpaprika_id if available
            if (pool.coinpaprika_id) {
              return `https://static.coinpaprika.com/coin/${pool.coinpaprika_id}/logo.png`;
            }
            // Last resort: try to extract symbol from homeTeam (for crypto pools, homeTeam is often the symbol)
            if ((pool.category === 'cryptocurrency' || pool.category === 'crypto') && pool.home_team) {
              const symbol = pool.home_team.toUpperCase();
              // Common crypto symbols mapping to CoinPaprika IDs
              const coinMap = {
                'BTC': 'btc-bitcoin',
                'ETH': 'eth-ethereum',
                'SOL': 'sol-solana',
                'BNB': 'bnb-binance-coin',
                'XRP': 'xrp-xrp',
                'ADA': 'ada-cardano',
                'DOGE': 'doge-dogecoin',
                'MATIC': 'matic-polygon',
                'DOT': 'dot-polkadot',
                'AVAX': 'avax-avalanche'
              };
              const coinId = coinMap[symbol] || `coins/${symbol.toLowerCase()}`;
              return `https://static.coinpaprika.com/coin/${coinId}/logo.png`;
            }
            return null;
          })()
        };
      })
    );
    
    // Get market stats
    const statsQuery = `
      SELECT 
        COUNT(*) as total_pools,
        COUNT(CASE WHEN p.event_start_time > EXTRACT(EPOCH FROM NOW()) THEN 1 END) as active_pools,
        SUM(p.total_bettor_stake) as total_volume,
        COUNT(DISTINCT p.creator_address) as unique_creators
      FROM oracle.pools p
      WHERE p.status != 'deleted'
    `;
    
    const statsResult = await db.query(statsQuery);
    const stats = statsResult.rows[0];
    
    // Add arbitration and settlement info to pools
    const poolsWithArbitration = enrichPoolsWithArbitrationInfo(poolsWithCreators);

    res.json({
      success: true,
      data: {
        pools: poolsWithArbitration,
        stats: {
          totalPools: parseInt(stats.total_pools),
          activePools: parseInt(stats.active_pools),
          totalVolume: (parseFloat(stats.total_volume || 0) / 1e18).toFixed(2),
          participants: parseInt(stats.unique_creators)
        }
      }
    });
    
  } catch (error) {
    console.error('Error fetching pools:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pools'
    });
  }
});

/**
 * GET /api/optimized-pools/pools/:id
 * Get detailed pool data for bet page
 * ✅ CRITICAL: Verifies settlement status against contract to ensure DB sync
 */
router.get('/pools/:id', optimizedCaching.cacheMiddleware(60), async (req, res) => {
  try {
    const { id } = req.params;
    
    // ✅ CRITICAL: Verify settlement status against contract for settled pools
    // This ensures DB is always in sync with on-chain state
    const verifySettlementStatus = async (poolId) => {
      try {
        const Web3Service = require('../services/web3-service');
        const web3Service = new Web3Service();
        await web3Service.initialize();
        
        const poolContract = await web3Service.getPoolCoreContract();
        const poolData = await poolContract.getPool(poolId);
        
        const isSettledOnChain = (Number(poolData.flags) & 1) !== 0;
        const creatorSideWonOnChain = (Number(poolData.flags) & 2) !== 0;
        
        return {
          isSettled: isSettledOnChain,
          creatorSideWon: creatorSideWonOnChain,
          result: poolData.result
        };
      } catch (error) {
        console.warn(`⚠️ Could not verify pool ${poolId} settlement on-chain:`, error.message);
        return null; // Return null if verification fails (use DB data)
      }
    };
    
    // Get pool data with dynamic calculations matching contract logic (optimized with JOINs)
    const poolResult = await db.query(`
      SELECT 
        p.*,
        p.social_stats,
        -- Calculate effective creator side stake (matches contract logic)
        CASE 
          WHEN p.total_bettor_stake = 0 OR p.total_bettor_stake > p.creator_stake THEN 
            p.total_creator_side_stake
          ELSE p.creator_stake
        END as effective_creator_side_stake,
        -- Calculate current max bettor stake dynamically (matches contract logic)
        CASE 
          WHEN p.total_bettor_stake = 0 OR p.total_bettor_stake > p.creator_stake THEN 
            (p.total_creator_side_stake::numeric * 100) / NULLIF((p.odds - 100), 0)
          ELSE 
            (p.creator_stake::numeric * 100) / NULLIF((p.odds - 100), 0)
        END as current_max_bettor_stake,
        -- Calculate fill percentage including creator stake and LP stakes
        CASE 
          WHEN (p.total_bettor_stake = 0 OR p.total_bettor_stake > p.creator_stake) AND p.total_creator_side_stake > 0 THEN 
            LEAST(100, ((p.total_creator_side_stake::numeric + p.total_bettor_stake::numeric) / NULLIF((p.total_creator_side_stake::numeric + ((p.total_creator_side_stake::numeric * 100) / NULLIF((p.odds - 100), 0))), 0) * 100))
          WHEN p.total_bettor_stake <= p.creator_stake AND p.creator_stake > 0 THEN 
            LEAST(100, ((p.creator_stake::numeric + p.total_bettor_stake::numeric) / NULLIF((p.creator_stake::numeric + ((p.creator_stake::numeric * 100) / NULLIF((p.odds - 100), 0))), 0) * 100))
          ELSE 0 
        END as fill_percentage,
        -- Calculate max pool size dynamically (matches contract logic exactly)
        CASE 
          WHEN p.total_bettor_stake = 0 OR p.total_bettor_stake > p.creator_stake THEN 
            p.total_creator_side_stake::numeric + ((p.total_creator_side_stake::numeric * 100) / NULLIF((p.odds - 100), 0))
          ELSE 
            p.total_creator_side_stake::numeric + ((p.creator_stake::numeric * 100) / NULLIF((p.odds - 100), 0))
        END as max_pool_size,
        -- Optimized bet stats using LEFT JOINs (fixes bigint=text error)
        COALESCE(bet_stats.unique_bettors, 0) as unique_bettors,
        COALESCE(bet_stats.bet_count, 0) as bet_count,
        COALESCE(bet_stats.avg_bet_size, 0) as avg_bet_size,
        COALESCE(lp_stats.lp_count, 0) as lp_count,
        -- Social stats (calculated dynamically if not in social_stats column)
        COALESCE((p.social_stats->>'likes')::int, (SELECT COUNT(*) FROM core.social_reactions WHERE target_type = 'pool' AND target_id::text = p.pool_id::text AND reaction_type = 'like')) as likes_count,
        COALESCE((p.social_stats->>'comments')::int, (SELECT COUNT(*) FROM core.pool_comments WHERE pool_id = p.pool_id::text AND is_deleted = false)) as comments_count,
        -- Football market data for better title generation
        fpm.outcome_type,
        fpm.predicted_outcome as detailed_predicted_outcome,
        -- Team logos for football pools (from fixtures table)
        f.home_team_image_path,
        f.away_team_image_path,
        f.home_team_id,
        f.away_team_id,
        -- Crypto logo for cryptocurrency pools
        cc.logo_url as crypto_logo_url,
        cc.coinpaprika_id
      FROM oracle.pools p
      LEFT JOIN (
        SELECT 
          b.pool_id,
          COUNT(DISTINCT b.bettor_address) as unique_bettors,
          COUNT(*) as bet_count,
          AVG(b.amount::numeric) as avg_bet_size
        FROM oracle.bets b 
        -- ✅ FIX: Count ALL bets (both YES and NO bets) for refund detection
        -- Previously only counted is_for_outcome = true, which missed NO bets
        GROUP BY b.pool_id
      ) bet_stats ON bet_stats.pool_id::bigint = p.pool_id
      LEFT JOIN (
        SELECT 
          lp.pool_id,
          COUNT(DISTINCT lp.lp_address) as lp_count
        FROM oracle.pool_liquidity_providers lp
        GROUP BY lp.pool_id
      ) lp_stats ON lp_stats.pool_id::bigint = p.pool_id
      LEFT JOIN oracle.football_prediction_markets fpm ON fpm.pool_id = p.pool_id::text
      -- Join fixtures table to get team logos for football pools
      LEFT JOIN oracle.fixtures f ON (f.id = p.fixture_id::text OR f.id = p.market_id)
      -- Join crypto tables to get coin logos for crypto pools (join via market_id since crypto_prediction_markets doesn't have pool_id)
      LEFT JOIN oracle.crypto_prediction_markets cpm ON cpm.market_id = p.market_id
      LEFT JOIN oracle.crypto_coins cc ON cc.coinpaprika_id = cpm.coinpaprika_id
      WHERE p.pool_id = $1
    `, [id]);
    
    if (poolResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Pool not found'
      });
    }
    
    const pool = poolResult.rows[0];
    
    // ✅ CRITICAL: Verify and sync settlement status with contract for settled pools
    // This ensures both EnhancedPoolCard and Bet Page see the same status
    // ✅ FIX: Explicitly convert PostgreSQL boolean to JavaScript boolean
    let verifiedIsSettled = Boolean(pool.is_settled);
    let verifiedCreatorSideWon = Boolean(pool.creator_side_won);
    
    if (pool.is_settled) {
      // For settled pools, always verify against contract to ensure accuracy
      const contractState = await verifySettlementStatus(parseInt(id));
      if (contractState) {
        // Use contract as source of truth
        verifiedIsSettled = Boolean(contractState.isSettled);
        verifiedCreatorSideWon = Boolean(contractState.creatorSideWon);
        
        // ✅ FIX: Explicit boolean comparison to catch type mismatches
        const dbIsSettled = Boolean(pool.is_settled);
        const dbCreatorSideWon = Boolean(pool.creator_side_won);
        
        // If DB is out of sync, log warning and use contract state
        if (dbIsSettled !== verifiedIsSettled || 
            dbCreatorSideWon !== verifiedCreatorSideWon) {
          console.warn(`⚠️ Pool ${id} settlement mismatch detected! Syncing DB...`);
          console.warn(`   DB: is_settled=${dbIsSettled}, creator_side_won=${dbCreatorSideWon}`);
          console.warn(`   Contract: is_settled=${verifiedIsSettled}, creator_side_won=${verifiedCreatorSideWon}`);
          
          // Update DB to match contract (async, don't block response)
          db.query(`
            UPDATE oracle.pools 
            SET is_settled = $1, creator_side_won = $2, updated_at = NOW()
            WHERE pool_id = $3
          `, [verifiedIsSettled, verifiedCreatorSideWon, id]).catch(err => {
            console.error(`❌ Failed to sync pool ${id} in DB:`, err.message);
          });
        }
      }
    }
    
    // Override pool data with verified contract state
    pool.is_settled = verifiedIsSettled;
    pool.creator_side_won = verifiedCreatorSideWon;
    
    // ✅ FIX: Explicit debug logging for Pool 8
    if (parseInt(id) === 8) {
      console.log(`🔍 Pool 8 API response (detail endpoint):`, {
        is_settled: pool.is_settled,
        creator_side_won: pool.creator_side_won,
        verifiedIsSettled,
        verifiedCreatorSideWon,
        typeIsSettled: typeof pool.is_settled,
        typeCreatorSideWon: typeof pool.creator_side_won
      });
    }
    
    // Get creator stats
    const creatorStats = await db.query(`
      SELECT 
        COUNT(*) as total_pools,
        AVG(CASE WHEN p.is_settled = true THEN 
          CASE WHEN p.creator_side_won = true THEN 1 ELSE 0 END 
        END) as success_rate,
        SUM(p.creator_stake) as total_volume
      FROM oracle.pools p 
      WHERE p.creator_address = $1
    `, [pool.creator_address]);
    
    const stats = creatorStats.rows[0];
    
    // Get LP providers for this pool
    const lpResult = await db.query(`
      SELECT 
        lp_address,
        stake,
        created_at
      FROM oracle.pool_liquidity_providers 
      WHERE pool_id = $1
      ORDER BY created_at DESC
    `, [id]);
    
    const lpProviders = lpResult.rows.map(lp => ({
      address: lp.lp_address,
      stake: (parseFloat(lp.stake) / 1e18).toFixed(2), // ✅ FIX: BITR tokens use 18 decimals (1e18), not 15
      timestamp: Math.floor(new Date(lp.created_at).getTime() / 1000)
    }));
    
    // Calculate time left and status
    const now = Math.floor(Date.now() / 1000);
    const timeLeft = Math.max(0, pool.event_end_time - now);
    
    let status = 'active';
    let canBet = true;
    let isEventStarted = false;
    let isPoolFilled = false;
    
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
    
    if (pool.is_settled) {
      status = isRefunded ? 'refunded' : 'settled';
      canBet = false;
    } else if (now >= pool.event_start_time) {
      status = 'closed';
      canBet = false;
      isEventStarted = true;
    } else if (parseFloat(pool.fill_percentage) >= 100) {
      status = 'filled';
      isPoolFilled = true;
      canBet = false;
    } else if (now >= pool.betting_end_time) {
      status = 'betting_closed';
      canBet = false;
    }
    
    // Generate intelligent title using frontend-compatible logic
    const generateTitle = () => {
      // Always generate a new title based on the data, ignore existing database title
      // Use the same title generation logic as frontend
      // Prefer detailed_predicted_outcome from football_prediction_markets if available
      const predictedOutcome = pool.detailed_predicted_outcome || pool.predicted_outcome;
      
      const marketData = {
        marketType: pool.market_type || 'CUSTOM',
        homeTeam: pool.home_team,
        awayTeam: pool.away_team,
        predictedOutcome: predictedOutcome,
        outcomeType: pool.outcome_type, // OU25, 1X2, etc.
        league: pool.league,
        marketId: pool.market_id || pool.pool_id.toString(),
        fixtureId: pool.fixture_id || pool.market_id,
        category: pool.category,
        eventStartTime: pool.event_start_time,
        eventEndTime: pool.event_end_time
      };
      
      return generateProfessionalTitle(marketData);
    };

    // Professional title generation (backend version of frontend service)
    const generateProfessionalTitle = (marketData) => {
      const { homeTeam, awayTeam, predictedOutcome, category, marketType } = marketData;
      
      // Check if this is a crypto market
      if (isCryptoMarket(marketData)) {
        return generateCryptoTitle(marketData);
      }
      
      // For team-based predictions
      if (homeTeam && awayTeam) {
        return generateTeamBasedTitle(homeTeam, awayTeam, predictedOutcome, marketType);
      }
      
      // Fallback based on category
      if (predictedOutcome) {
        return `Prediction: ${predictedOutcome}`;
      }
      
      if (category === 'crypto' || category === 'cryptocurrency') {
        return `Crypto Market Prediction #${marketData.marketId}`;
      }
      
      if (category === 'football') {
        return `Football Match Prediction #${marketData.marketId}`;
      }
      
      if (category === 'basketball') {
        return `Basketball Game Prediction #${marketData.marketId}`;
      }
      
      return `Prediction Pool #${marketData.marketId}`;
    };

    // Check if market is crypto
    const isCryptoMarket = (marketData) => {
      return Boolean(
        marketData.category === 'cryptocurrency' || 
        marketData.category === 'crypto' ||
        (marketData.league && marketData.league === 'crypto') ||
        (marketData.marketType && marketData.marketType.startsWith('CRYPTO_')) ||
        (marketData.homeTeam && ['BTC', 'ETH', 'BNB', 'ADA', 'SOL', 'MATIC', 'AVAX', 'DOT', 'LINK', 'UNI'].includes(marketData.homeTeam))
      );
    };

    // Generate crypto title
    const generateCryptoTitle = (marketData) => {
      const { homeTeam, predictedOutcome, eventStartTime, eventEndTime } = marketData;
      
      // For crypto markets, homeTeam is the crypto symbol (e.g., "BTC", "SOL", "ETH")
      // predictedOutcome contains the full prediction (e.g., "BTC > $130,000" or "SOL <= $250")
      
      // ✅ FIX: Check if symbol is already in predictedOutcome to avoid duplication
      const symbol = homeTeam ? homeTeam.toUpperCase() : '';
      const outcome = predictedOutcome || '';
      
      // Check if symbol already appears in predictedOutcome
      const symbolAlreadyInOutcome = symbol && outcome.toUpperCase().includes(symbol);
      
      // Extract price and direction from predictedOutcome
      const aboveMatch = outcome.match(/above\s+\$?([\d,]+(?:\.\d+)?)/i);
      const belowMatch = outcome.match(/below\s+\$?([\d,]+(?:\.\d+)?)/i);
      const price = aboveMatch ? aboveMatch[1] : (belowMatch ? belowMatch[1] : null);
      const direction = aboveMatch ? 'above' : (belowMatch ? 'below' : null);
      
      // Calculate timeframe from event times
      let timeframeText = '';
      if (eventStartTime && eventEndTime) {
        const timeframeSeconds = parseInt(eventEndTime) - parseInt(eventStartTime);
        const hours = Math.floor(timeframeSeconds / 3600);
        const days = Math.floor(hours / 24);
        
        if (days > 0) {
          timeframeText = `${days} day${days > 1 ? 's' : ''}`;
        } else if (hours > 0) {
          timeframeText = `${hours} hour${hours > 1 ? 's' : ''}`;
        } else {
          const minutes = Math.floor(timeframeSeconds / 60);
          timeframeText = `${minutes} minute${minutes > 1 ? 's' : ''}`;
        }
      }
      
      // Generate challenging/engaging title
      if (symbol && price && direction) {
        // Remove symbol from predictedOutcome if it's already there
        let cleanOutcome = outcome;
        if (symbolAlreadyInOutcome) {
          // Remove the symbol from the beginning of the outcome
          cleanOutcome = outcome.replace(new RegExp(`^${symbol}\\s+`, 'i'), '').trim();
        }
        
        // Create engaging title with timeframe
        const challengePhrases = [
          `Will ${symbol} ${direction} $${price}?`,
          `${symbol} ${direction} $${price} Challenge`,
          `Can ${symbol} Hit $${price} ${direction}?`,
          `${symbol} Price ${direction} $${price} Prediction`,
          `${symbol} ${direction} $${price} - Will it happen?`
        ];
        
        // Select a challenging phrase deterministically based on pool ID for consistency
        // Use pool ID modulo to ensure consistent title per pool
        const poolId = marketData.marketId || '';
        const phraseIndex = poolId ? (parseInt(String(poolId).replace(/\D/g, '')) || 0) % challengePhrases.length : 0;
        const title = challengePhrases[phraseIndex];
        
        // Add timeframe if available
        if (timeframeText) {
          return `${title} (${timeframeText} window)`;
        }
        
        return title;
      }
      
      // Fallback: use predictedOutcome directly if symbol already included
      if (symbolAlreadyInOutcome) {
        return timeframeText ? `${outcome} (${timeframeText} window)` : outcome;
      }
      
      // Fallback: combine symbol and outcome
      if (symbol && outcome) {
        return timeframeText ? `${symbol} ${outcome} (${timeframeText} window)` : `${symbol} ${outcome}`;
      }
      
      return timeframeText ? `Crypto prediction: ${outcome} (${timeframeText} window)` : `Crypto prediction: ${outcome}`;
    };

    // Generate team-based title
    const generateTeamBasedTitle = (homeTeam, awayTeam, predictedOutcome, marketType) => {
      if (!predictedOutcome) {
        return `${homeTeam} vs ${awayTeam}`;
      }
      
      // Auto-detect market type from predicted outcome if marketType is not useful
      const detectedMarketType = detectMarketTypeFromOutcome(predictedOutcome, marketType);
      
      // Use templates similar to frontend
      const templates = getTitleTemplates(detectedMarketType);
      
      // Try to find exact match
      if (templates[predictedOutcome]) {
        return processTemplate(templates[predictedOutcome], { homeTeam, awayTeam });
      }
      
      // Try normalized matches
      const normalizedOutcome = predictedOutcome.toLowerCase().replace(/\s+goals?/g, '').trim();
      for (const [key, template] of Object.entries(templates)) {
        const normalizedKey = key.toLowerCase().replace(/\s+goals?/g, '').trim();
        if (normalizedOutcome === normalizedKey) {
          return processTemplate(template, { homeTeam, awayTeam });
        }
      }
      
      // Try partial matches
      for (const [key, template] of Object.entries(templates)) {
        if (isPartialMatch(predictedOutcome, key)) {
          return processTemplate(template, { homeTeam, awayTeam });
        }
      }
      
      // Special handling for common outcomes
      const outcome = predictedOutcome.toLowerCase().trim();
      if (outcome === 'home wins' || outcome === 'home' || outcome === '1') {
        return `${homeTeam} will beat ${awayTeam} at home!`;
      } else if (outcome === 'away wins' || outcome === 'away' || outcome === '2') {
        return `${awayTeam} will beat ${homeTeam} away!`;
      } else if (outcome === 'draw' || outcome === 'x') {
        return `${homeTeam} vs ${awayTeam} will end in a draw!`;
      } else {
        // Robust number detection using regex
        const numberMatch = outcome.match(/(\d+\.?\d*)/);
        if (numberMatch) {
          const number = numberMatch[1];
          if (outcome.includes('under')) {
            return `${homeTeam} vs ${awayTeam} will score under ${number} goals!`;
          } else if (outcome.includes('over')) {
            return `${homeTeam} vs ${awayTeam} will score over ${number} goals!`;
          }
        }
      }
      
      // Fallback
      return `${homeTeam} vs ${awayTeam} will ${predictedOutcome.toLowerCase()}!`;
    };

    // Detect market type from predicted outcome
    const detectMarketTypeFromOutcome = (predictedOutcome, originalMarketType) => {
      if (!predictedOutcome) return originalMarketType || 'CUSTOM';
      
      const outcome = predictedOutcome.toLowerCase().trim();
      
      // Over/Under detection
      if (outcome.includes('over') || outcome.includes('under')) {
        return 'OVER_UNDER';
      }
      
      // BTTS detection
      if (outcome.includes('both teams') || outcome.includes('btts') || 
          (outcome.includes('yes') && originalMarketType !== 'MONEYLINE') ||
          (outcome.includes('no') && originalMarketType !== 'MONEYLINE')) {
        return 'BOTH_TEAMS_SCORE';
      }
      
      // 1X2 / Moneyline detection
      if (outcome === 'home' || outcome === 'away' || outcome === 'draw' ||
          outcome === '1' || outcome === '2' || outcome === 'x' ||
          outcome.includes('wins') || outcome.includes('win')) {
        return 'MONEYLINE';
      }
      
      // Double Chance detection
      if (outcome.includes('1x') || outcome.includes('12') || outcome.includes('x2') ||
          outcome.includes('double chance')) {
        return 'DOUBLE_CHANCE';
      }
      
      // Correct Score detection
      if (/\d+-\d+/.test(outcome) || outcome.includes('correct score')) {
        return 'CORRECT_SCORE';
      }
      
      // Half Time detection
      if (outcome.includes('ht') || outcome.includes('half time') || outcome.includes('halftime')) {
        return 'HALF_TIME';
      }
      
      // Asian Handicap detection
      if (outcome.includes('handicap') || outcome.includes('ah') || /[+-]\d+\.?\d*/.test(outcome)) {
        return 'ASIAN_HANDICAP';
      }
      
      // Fallback to original or CUSTOM
      return originalMarketType && originalMarketType !== '0' ? originalMarketType : 'CUSTOM';
    };

    // Get title templates (simplified version of frontend)
    const getTitleTemplates = (marketType) => {
      const templates = {
        'MONEYLINE': {
          'Home wins': '${homeTeam} will beat ${awayTeam} at home!',
          'Away wins': '${awayTeam} will beat ${homeTeam} away!',
          'Draw': '${homeTeam} vs ${awayTeam} will end in a draw!',
          '1': '${homeTeam} will beat ${awayTeam} at home!',
          '2': '${awayTeam} will beat ${homeTeam} away!',
          'X': '${homeTeam} vs ${awayTeam} will end in a draw!',
          'Home FT': '${homeTeam} will beat ${awayTeam} at full-time!',
          'Away FT': '${awayTeam} will beat ${homeTeam} at full-time!',
          'Draw FT': '${homeTeam} vs ${awayTeam} will end in a draw!'
        },
        'HALF_TIME': {
          'Home HT': '${homeTeam} will lead ${awayTeam} in the first half!',
          'Away HT': '${awayTeam} will lead ${homeTeam} in the first half!',
          'Draw HT': '${homeTeam} vs ${awayTeam} will be tied at half-time!',
          'Home HT 1': '${homeTeam} will lead ${awayTeam} in the first half!',
          'Away HT 2': '${awayTeam} will lead ${homeTeam} in the first half!',
          'Draw HT X': '${homeTeam} vs ${awayTeam} will be tied at half-time!',
          'Home': '${homeTeam} will lead ${awayTeam} in the first half!',
          'Away': '${awayTeam} will lead ${homeTeam} in the first half!',
          'Draw': '${homeTeam} vs ${awayTeam} will be tied at half-time!',
          '1': '${homeTeam} will lead ${awayTeam} in the first half!',
          '2': '${awayTeam} will lead ${homeTeam} in the first half!',
          'X': '${homeTeam} vs ${awayTeam} will be tied at half-time!'
        },
        'OVER_UNDER': {
          // Short format (matches Pool 0)
          'Over 0.5': '${homeTeam} vs ${awayTeam} will score over 0.5 goals!',
          'Under 0.5': '${homeTeam} vs ${awayTeam} will score under 0.5 goals!',
          'Over 1.5': '${homeTeam} vs ${awayTeam} will score over 1.5 goals!',
          'Under 1.5': '${homeTeam} vs ${awayTeam} will score under 1.5 goals!',
          'Over 2.5': '${homeTeam} vs ${awayTeam} will score over 2.5 goals!',
          'Under 2.5': '${homeTeam} vs ${awayTeam} will score under 2.5 goals!',
          'Over 3.5': '${homeTeam} vs ${awayTeam} will score over 3.5 goals!',
          'Under 3.5': '${homeTeam} vs ${awayTeam} will score under 3.5 goals!',
          // Long format (legacy)
          'Over 2.5 goals': '${homeTeam} vs ${awayTeam} will score over 2.5 goals!',
          'Under 2.5 goals': '${homeTeam} vs ${awayTeam} will score under 2.5 goals!',
          'Over 1.5 goals': '${homeTeam} vs ${awayTeam} will score over 1.5 goals!',
          'Under 1.5 goals': '${homeTeam} vs ${awayTeam} will score under 1.5 goals!',
          'Over 3.5 goals': '${homeTeam} vs ${awayTeam} will score over 3.5 goals!',
          'Under 3.5 goals': '${homeTeam} vs ${awayTeam} will score under 3.5 goals!'
        },
        'BOTH_TEAMS_SCORE': {
          'Both teams to score': 'Both ${homeTeam} and ${awayTeam} will score!',
          'Not both teams to score': 'Both ${homeTeam} and ${awayTeam} will NOT score!',
          'Yes': 'Both ${homeTeam} and ${awayTeam} will score!',
          'No': 'Both ${homeTeam} and ${awayTeam} will NOT score!'
        },
        'CUSTOM': {
          'Over 0.5 goals': '${homeTeam} vs ${awayTeam} will score over 0.5 goals!',
          'Under 0.5 goals': '${homeTeam} vs ${awayTeam} will score under 0.5 goals!',
          'Over': '${homeTeam} vs ${awayTeam} will score over 0.5 goals!',
          'Under': '${homeTeam} vs ${awayTeam} will score under 0.5 goals!'
        }
      };
      
      return templates[marketType] || templates['CUSTOM'];
    };

    // Process template string
    const processTemplate = (template, data) => {
      return template
        .replace(/\${homeTeam}/g, data.homeTeam)
        .replace(/\${awayTeam}/g, data.awayTeam);
    };

    // Check for partial match
    const isPartialMatch = (predictedOutcome, key) => {
      const outcome = predictedOutcome.toLowerCase();
      const keyLower = key.toLowerCase();
      return outcome.includes(keyLower) || keyLower.includes(outcome);
    };

    // Validate and format odds as basis points
    const validateAndFormatOdds = (odds) => {
      const oddsValue = parseInt(odds);
      
      // Ensure odds are in valid range (101-10000 basis points = 1.01x to 100x)
      if (oddsValue < 101 || oddsValue > 10000) {
        console.warn(`Invalid odds value: ${oddsValue} for pool ${pool.pool_id}. Using default 200 (2.00x)`);
        return 200; // Default to 2.00x odds
      }
      
      return oddsValue;
    };

    const poolData = {
      id: pool.pool_id,
      title: generateTitle(),
      description: pool.description || `Prediction: ${pool.predicted_outcome}`,
      category: pool.category,
      creator: {
        address: pool.creator_address,
        username: `${pool.creator_address.slice(0, 6)}...${pool.creator_address.slice(-4)}`,
        successRate: parseFloat(stats.success_rate || 0) * 100,
        totalPools: parseInt(stats.total_pools || 0),
        totalVolume: parseFloat(stats.total_volume || 0),
        badges: []
      },
      odds: validateAndFormatOdds(pool.odds),
      creatorStake: (parseFloat(pool.creator_stake) / 1e18).toFixed(2),
      totalBettorStake: (parseFloat(pool.total_bettor_stake) / 1e18).toFixed(2),
      totalCreatorSideStake: (parseFloat(pool.total_creator_side_stake) / 1e18).toFixed(2),
      maxBettorStake: (parseFloat(pool.current_max_bettor_stake) / 1e18).toFixed(2),
      maxPoolSize: (parseFloat(pool.max_pool_size) / 1e18).toFixed(2),
      fillPercentage: parseFloat(pool.fill_percentage),
      participants: parseInt(pool.unique_bettors) + parseInt(pool.lp_count || 0), // Include LPs in participant count
      eventStartTime: pool.event_start_time,
      eventEndTime: pool.event_end_time,
      bettingEndTime: pool.betting_end_time,
      status,
      isSettled: Boolean(verifiedIsSettled), // ✅ FIX: Ensure boolean type
      isRefunded: Boolean(isRefunded), // ✅ Detect refunded pools (result is zero)
      creatorSideWon: Boolean(verifiedCreatorSideWon), // ✅ FIX: Ensure boolean type (source of truth)
      currency: pool.use_bitr ? 'BITR' : 'STT',
      boostTier: pool.boost_tier === 0 || pool.boost_tier === '0' || pool.boost_tier === 'NONE' || !pool.boost_tier ? 'NONE' : 
                pool.boost_tier === 1 || pool.boost_tier === '1' || pool.boost_tier === 'BRONZE' ? 'BRONZE' : 
                pool.boost_tier === 2 || pool.boost_tier === '2' || pool.boost_tier === 'SILVER' ? 'SILVER' : 
                pool.boost_tier === 3 || pool.boost_tier === '3' || pool.boost_tier === 'GOLD' ? 'GOLD' : 'NONE',
      trending: parseFloat(pool.fill_percentage) > 50,
      socialStats: (() => {
        // Get social stats from pool.social_stats JSONB column or calculate dynamically
        if (pool.social_stats) {
          const stats = typeof pool.social_stats === 'string' 
            ? JSON.parse(pool.social_stats) 
            : pool.social_stats;
          return {
            likes: stats.likes || 0,
            comments: stats.comments || 0,
            views: stats.views || 0,
            shares: stats.shares || 0
          };
        }
        // Fallback: calculate from related tables
        return {
          likes: pool.likes_count || 0,
          comments: pool.comments_count || 0,
          views: parseInt(pool.unique_bettors) > 0 ? parseInt(pool.unique_bettors) : 0,
          shares: 0
        };
      })(),
      // Bet statistics
      totalBets: parseInt(pool.bet_count || 0) + parseInt(pool.lp_count || 0), // Include LPs in total bets
      avgBet: (() => {
        const totalParticipants = parseInt(pool.bet_count || 0) + parseInt(pool.lp_count || 0);
        if (totalParticipants === 0) return 0;
        const totalFilled = parseFloat(pool.total_bettor_stake || 0) + (parseFloat(pool.total_creator_side_stake || 0) - parseFloat(pool.creator_stake || 0));
        return (totalFilled / 1e18) / totalParticipants;
      })(), // Calculate average based on total filled amount / total participants
      timeLeft: {
        days: Math.floor(timeLeft / (24 * 60 * 60)),
        hours: Math.floor((timeLeft % (24 * 60 * 60)) / (60 * 60)),
        minutes: Math.floor((timeLeft % (60 * 60)) / 60),
        seconds: timeLeft % 60
      },
      canBet,
      isEventStarted,
      isPoolFilled,
      // Additional fields for bet page
      homeTeam: pool.home_team,
      awayTeam: pool.away_team,
      league: pool.league,
      region: pool.region,
      predictedOutcome: pool.detailed_predicted_outcome || pool.predicted_outcome,
      marketId: pool.market_id || pool.pool_id.toString(),
      marketType: pool.market_type || 'CUSTOM',
      fixtureId: pool.fixture_id || pool.market_id,
      oracleType: 'GUIDED', // Default oracle type
      liquidityProviders: lpProviders,
      lpCount: parseInt(pool.lp_count || 0), // Add LP provider count for frontend display
      // Logo URLs for cards
      homeTeamLogo: pool.home_team_image_path || (pool.home_team_id ? getTeamLogoUrl(pool.home_team_id, pool.home_team) : null),
      awayTeamLogo: pool.away_team_image_path || (pool.away_team_id ? getTeamLogoUrl(pool.away_team_id, pool.away_team) : null),
      cryptoLogo: (() => {
        // Use logo from database if available
        if (pool.crypto_logo_url) {
          return pool.crypto_logo_url;
        }
        // Fallback: generate CoinPaprika URL from coinpaprika_id if available
        if (pool.coinpaprika_id) {
          return `https://static.coinpaprika.com/coin/${pool.coinpaprika_id}/logo.png`;
        }
        // Last resort: try to extract symbol from homeTeam (for crypto pools, homeTeam is often the symbol)
        if ((pool.category === 'cryptocurrency' || pool.category === 'crypto') && pool.home_team) {
          const symbol = pool.home_team.toUpperCase();
          // Common crypto symbols mapping to CoinPaprika IDs
          const coinMap = {
            'BTC': 'btc-bitcoin',
            'ETH': 'eth-ethereum',
            'SOL': 'sol-solana',
            'BNB': 'bnb-binance-coin',
            'XRP': 'xrp-xrp',
            'ADA': 'ada-cardano',
            'DOGE': 'doge-dogecoin',
            'MATIC': 'matic-polygon',
            'DOT': 'dot-polkadot',
            'AVAX': 'avax-avalanche'
          };
          const coinId = coinMap[symbol] || `coins/${symbol.toLowerCase()}`;
          return `https://static.coinpaprika.com/coin/${coinId}/logo.png`;
        }
        return null;
      })()
    };
    
    // DEBUG: Log the poolData immediately after creation
    console.log(`🔍 DEBUG POOL ${id}: fixtureId after creation = ${poolData.fixtureId}, pool.fixture_id = ${pool.fixture_id}, pool.market_id = ${pool.market_id}`);
    
    // Decode hex-encoded fields
    if (poolData.category && poolData.category.startsWith('0x')) {
      poolData.category = Buffer.from(poolData.category.slice(2), 'hex').toString('utf8').replace(/\0/g, '').trim();
    }
    if (poolData.homeTeam && poolData.homeTeam.startsWith('0x')) {
      poolData.homeTeam = Buffer.from(poolData.homeTeam.slice(2), 'hex').toString('utf8').replace(/\0/g, '').trim();
    }
    if (poolData.awayTeam && poolData.awayTeam.startsWith('0x')) {
      poolData.awayTeam = Buffer.from(poolData.awayTeam.slice(2), 'hex').toString('utf8').replace(/\0/g, '').trim();
    }
    if (poolData.league && poolData.league.startsWith('0x')) {
      poolData.league = Buffer.from(poolData.league.slice(2), 'hex').toString('utf8').replace(/\0/g, '').trim();
    }
    if (poolData.title && poolData.title.startsWith('0x')) {
      poolData.title = Buffer.from(poolData.title.slice(2), 'hex').toString('utf8').replace(/\0/g, '').trim();
    }
    
    // Add arbitration and settlement info to pool
    const poolWithArbitration = enrichPoolWithArbitrationInfo(poolData);

    res.json({
      success: true,
      data: {
        pool: poolWithArbitration
      }
    });
    
  } catch (error) {
    console.error('Error fetching pool details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pool details'
    });
  }
});

/**
 * GET /api/optimized-pools/pools/:id/progress
 * Get real-time pool progress data
 */
router.get('/pools/:id/progress', optimizedCaching.cacheMiddleware(30), async (req, res) => {
  try {
    const { id } = req.params;
    
    const progressResult = await db.query(`
      SELECT 
        p.pool_id,
        p.total_bettor_stake,
        p.total_creator_side_stake,
        p.creator_stake,
        p.odds,
        -- Calculate effective creator side stake (matches contract logic)
        CASE 
          WHEN p.total_bettor_stake = 0 OR p.total_bettor_stake > p.creator_stake THEN 
            p.total_creator_side_stake
          ELSE p.creator_stake
        END as effective_creator_side_stake,
        -- Calculate current max bettor stake dynamically (matches contract logic)
        CASE 
          WHEN p.total_bettor_stake = 0 OR p.total_bettor_stake > p.creator_stake THEN 
            (p.total_creator_side_stake::numeric * 100) / (p.odds - 100)
          ELSE 
            (p.creator_stake::numeric * 100) / (p.odds - 100)
        END as current_max_bettor_stake,
        -- Calculate fill percentage including creator stake and LP stakes
        CASE 
          WHEN (p.total_bettor_stake = 0 OR p.total_bettor_stake > p.creator_stake) AND p.total_creator_side_stake > 0 THEN 
            LEAST(100, ((p.total_creator_side_stake::numeric + p.total_bettor_stake::numeric) / (p.total_creator_side_stake::numeric + ((p.total_creator_side_stake::numeric * 100) / (p.odds - 100))) * 100))
          WHEN p.total_bettor_stake <= p.creator_stake AND p.creator_stake > 0 THEN 
            LEAST(100, ((p.creator_stake::numeric + p.total_bettor_stake::numeric) / (p.creator_stake::numeric + ((p.creator_stake::numeric * 100) / (p.odds - 100))) * 100))
          ELSE 0 
        END as fill_percentage,
        -- Calculate max pool size dynamically
        CASE 
          WHEN p.total_bettor_stake = 0 OR p.total_bettor_stake > p.creator_stake THEN 
            p.total_creator_side_stake::numeric + ((p.total_creator_side_stake::numeric * 100) / (p.odds - 100))
          ELSE 
            p.creator_stake::numeric + ((p.creator_stake::numeric * 100) / (p.odds - 100))
        END as max_pool_size,
        -- ✅ FIX: Count actual unique bettors (not estimate)
        COALESCE((
          SELECT COUNT(DISTINCT b.bettor_address) 
          FROM oracle.bets b 
          WHERE b.pool_id::bigint = p.pool_id AND b.is_for_outcome = true
        ), 0) as participants,
        -- ✅ FIX: Count actual bet count (not estimate)
        COALESCE((
          SELECT COUNT(*) 
          FROM oracle.bets b 
          WHERE b.pool_id::bigint = p.pool_id
        ), 0) as bet_count
      FROM oracle.pools p
      WHERE p.pool_id = $1
    `, [id]);
    
    if (progressResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Pool not found'
      });
    }
    
    const progress = progressResult.rows[0];
    
    res.json({
      success: true,
      data: {
        poolId: parseInt(id),
        fillPercentage: parseFloat(progress.fill_percentage),
        totalBettorStake: (parseFloat(progress.total_bettor_stake) / 1e18).toFixed(2),
        maxPoolSize: (parseFloat(progress.max_pool_size) / 1e18).toFixed(2),
        currentMaxBettorStake: (parseFloat(progress.current_max_bettor_stake) / 1e18).toFixed(2),
        effectiveCreatorSideStake: (parseFloat(progress.effective_creator_side_stake) / 1e18).toFixed(2),
        participants: parseInt(progress.participants || 0), // ✅ FIX: Actual unique bettors count
        betCount: parseInt(progress.bet_count || 0), // ✅ FIX: Actual bet count
        lastUpdated: Math.floor(Date.now() / 1000)
      }
    });
    
  } catch (error) {
    console.error('Error fetching pool progress:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pool progress'
    });
  }
});

/**
 * GET /api/optimized-pools/recent-bets
 * Get recent betting activity and pool creations
 */
router.get('/recent-bets', optimizedCaching.cacheMiddleware(60), async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    
    // Get recent bets and LP events with currency information
    // ✅ FIX: Exclude bet records that are actually LP events (duplicates)
    // LP events should only come from pool_liquidity_providers table
    const betsResult = await db.query(`
      SELECT 
        b.transaction_hash as id,
        b.pool_id::text as pool_id,
        b.bettor_address as bettor,
        b.amount::text as amount,
        b.is_for_outcome,
        b.created_at as timestamp,
        p.title as pool_title,
        p.category,
        p.league,
        p.odds::text as odds,
        p.use_bitr,
        'bet' as event_type
      FROM oracle.bets b
      JOIN oracle.pools p ON b.pool_id::bigint = p.pool_id
      -- ✅ FIX: Exclude bets that are actually LP events (is_for_outcome = false AND matches LP provider)
      WHERE NOT (
        b.is_for_outcome = false 
        AND EXISTS (
          SELECT 1 FROM oracle.pool_liquidity_providers lp
          WHERE lp.pool_id::text = b.pool_id::text
          AND LOWER(lp.lp_address) = LOWER(b.bettor_address)
          AND lp.stake::text = b.amount::text
          AND ABS(EXTRACT(EPOCH FROM (lp.created_at - b.created_at))) < 60 -- Within 60 seconds
        )
      )
      
      UNION ALL
      
      SELECT 
        CONCAT('lp_', lp.pool_id, '_', lp.lp_address) as id,
        lp.pool_id::text as pool_id,
        lp.lp_address as bettor,
        lp.stake::text as amount,
        false as is_for_outcome,
        lp.created_at as timestamp,
        p.title as pool_title,
        p.category,
        p.league,
        p.odds::text as odds,
        p.use_bitr,
        'liquidity_added' as event_type
      FROM oracle.pool_liquidity_providers lp
      JOIN oracle.pools p ON lp.pool_id = p.pool_id
      
      ORDER BY timestamp DESC
      LIMIT $1
    `, [parseInt(limit)]);
    
    // Get recent pool creations with currency information
    const poolsResult = await db.query(`
      SELECT 
        p.pool_id as id,
        p.pool_id,
        p.creator_address as bettor,
        p.creator_stake as amount,
        false as is_for_outcome,
        p.created_at as timestamp,
        p.title as pool_title,
        p.category,
        p.league,
        p.use_bitr,
        'pool_created' as event_type
      FROM oracle.pools p
      ORDER BY p.created_at DESC
      LIMIT $1
    `, [parseInt(limit)]);
    
    // Combine and sort all events by timestamp
    const allEvents = [...betsResult.rows, ...poolsResult.rows]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, parseInt(limit));
    
    const bets = allEvents.map(event => {
      const isBitr = event.use_bitr === true;
      const currency = isBitr ? 'BITR' : 'STT';
      // ✅ FIX: Both LP stakes and bets use 18 decimals (1e18) for BITR/STT tokens
      const divisor = 1e18; // Always use 1e18 for token amounts
      const amount = (parseFloat(event.amount) / divisor).toFixed(2);
      
      return {
        id: event.id,
        poolId: event.pool_id,
        bettor: event.bettor,
        amount: amount,
        currency: currency,
        amountWithCurrency: `${amount} ${currency}`,
        isForOutcome: event.is_for_outcome,
        timestamp: Math.floor(new Date(event.timestamp).getTime() / 1000),
        poolTitle: event.pool_title,
        category: event.category,
        league: event.league,
        odds: event.odds ? parseInt(event.odds) : null,
        eventType: event.event_type,
        useBitr: isBitr,
        // Add specific fields for different event types
        ...(event.event_type === 'liquidity_added' && {
          action: `Added liquidity (${currency})`,
          icon: '💧'
        }),
        ...(event.event_type === 'bet' && {
          action: event.is_for_outcome ? `Bet on outcome (${currency})` : `Bet against outcome (${currency})`,
          icon: '🎯'
        }),
        ...(event.event_type === 'pool_created' && {
          action: `Created pool (${currency})`,
          icon: '🏗️'
        })
      };
    });
    
    res.json({
      success: true,
      data: {
        bets
      }
    });
    
  } catch (error) {
    console.error('Error fetching recent bets:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch recent bets'
    });
  }
});

/**
 * GET /api/optimized-pools/user-bets/:address
 * Get recent bets for a specific user/wallet
 */
router.get('/user-bets/:address', optimizedCaching.cacheMiddleware(60), async (req, res) => {
  try {
    const { address } = req.params;
    const { limit = 20 } = req.query;
    
    const betsResult = await db.query(`
      SELECT 
        b.transaction_hash as id,
        b.pool_id,
        b.bettor_address as bettor,
        b.amount,
        b.is_for_outcome,
        b.created_at as timestamp,
        p.title as pool_title,
        p.category,
        p.league,
        p.home_team,
        p.away_team,
        p.is_settled,
        p.creator_side_won,
        p.use_bitr
      FROM oracle.bets b
      JOIN oracle.pools p ON b.pool_id::bigint = p.pool_id
      WHERE LOWER(b.bettor_address) = LOWER($1)
      ORDER BY b.created_at DESC
      LIMIT $2
    `, [address, parseInt(limit)]);
    
    const bets = betsResult.rows.map(bet => ({
      id: bet.id,
      poolId: bet.pool_id,
      bettor: bet.bettor,
      amount: (parseFloat(bet.amount) / 1e18).toFixed(2),
      isForOutcome: bet.is_for_outcome,
      timestamp: Math.floor(new Date(bet.timestamp).getTime() / 1000),
      poolTitle: bet.pool_title,
      category: bet.category,
      league: bet.league,
      homeTeam: bet.home_team,
      awayTeam: bet.away_team,
      isSettled: bet.is_settled,
      creatorSideWon: bet.creator_side_won,
      currency: bet.use_bitr ? 'BITR' : 'STT'
    }));
    
    res.json({
      success: true,
      data: {
        bets,
        user: address,
        totalBets: bets.length
      }
    });
    
  } catch (error) {
    console.error('Error fetching user bets:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user bets'
    });
  }
});

/**
 * GET /api/optimized-pools/analytics
 * Get market analytics
 */
router.get('/analytics', optimizedCaching.cacheMiddleware(300), async (req, res) => {
  try {
    console.log('📊 Fetching analytics data...');
    
    // Simple query first to test connection
    const testResult = await db.query('SELECT COUNT(*) as pool_count FROM oracle.pools');
    console.log('✅ Database connection test:', testResult.rows[0]);
    
    const analyticsResult = await db.query(`
      SELECT 
        COUNT(*) as total_pools,
        COUNT(CASE WHEN p.event_start_time > EXTRACT(EPOCH FROM NOW()) THEN 1 END) as active_pools,
        COUNT(CASE WHEN p.is_settled = true THEN 1 END) as settled_pools,
        COALESCE(SUM(p.total_bettor_stake + p.creator_stake), 0) as total_volume,
        COALESCE(SUM(CASE WHEN p.use_bitr = true THEN (p.total_bettor_stake + p.creator_stake) ELSE 0 END), 0) as bitr_volume,
        COALESCE(SUM(CASE WHEN p.use_bitr = false THEN (p.total_bettor_stake + p.creator_stake) ELSE 0 END), 0) as stt_volume,
        COUNT(DISTINCT p.creator_address) as unique_creators,
        COALESCE(COUNT(DISTINCT b.bettor_address), 0) as unique_bettors,
        COUNT(CASE WHEN p.boost_tier != 'NONE' AND p.boost_tier IS NOT NULL THEN 1 END) as boosted_pools
      FROM oracle.pools p
      LEFT JOIN oracle.bets b ON p.pool_id::bigint = b.pool_id::bigint
      WHERE p.status != 'deleted' OR p.status IS NULL
    `);
    
    console.log('📊 Analytics query result:', analyticsResult.rows[0]);
    
    const analytics = analyticsResult.rows[0];
    
    const response = {
      success: true,
      data: {
        totalPools: parseInt(analytics.total_pools),
        activePools: parseInt(analytics.active_pools),
        settledPools: parseInt(analytics.settled_pools),
        totalVolume: (parseFloat(analytics.total_volume || 0) / 1e18).toFixed(2),
        bitrVolume: (parseFloat(analytics.bitr_volume || 0) / 1e18).toFixed(2),
        sttVolume: (parseFloat(analytics.stt_volume || 0) / 1e18).toFixed(2),
        participants: parseInt(analytics.unique_creators) + parseInt(analytics.unique_bettors),
        boostedPools: parseInt(analytics.boosted_pools),
        trendingPools: Math.max(0, parseInt(analytics.active_pools) - parseInt(analytics.boosted_pools))
      }
    };
    
    console.log('📊 Analytics response:', response);
    res.json(response);
    
  } catch (error) {
    console.error('❌ Error fetching analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch analytics',
      details: error.message
    });
  }
});

// Helper function to get team logo URL
function getTeamLogoUrl(teamId, teamName) {
  if (!teamId) {
    // Fallback to UI Avatars if no team ID available
    if (!teamName) return null;
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(teamName)}&background=22C7FF&color=000&size=64&font-size=0.4&bold=true`;
  }
  
  // Use SportMonks CDN with team ID
  return `https://cdn.sportmonks.com/images/soccer/teams/${teamId}.png`;
}

// Helper function to get crypto logo URL
function getCryptoLogoUrl(coinSymbolOrId) {
  if (!coinSymbolOrId) return null;
  
  // If we have a coinpaprika_id, use CoinPaprika CDN
  // Otherwise, try to construct from symbol
  const symbol = coinSymbolOrId.split('-')[0]?.toUpperCase() || coinSymbolOrId.toUpperCase();
  
  // Use CoinPaprika CDN (more reliable than CoinGecko)
  // Format: https://static.coinpaprika.com/coin/{coinpaprika_id}/logo.png
  // For now, return null if we don't have coinpaprika_id - it should come from database
  return null; // Will be populated from crypto_coins.logo_url in the query
}

module.exports = router;
