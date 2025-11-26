const { ethers } = require('ethers');
const db = require('../db/db');
const config = require('../config');

/**
 * Unified Pool Settlement System
 * 
 * This replaces both the old Football Oracle Bot settlement logic and the new Robust Settlement Manager
 * with a single, comprehensive system that handles all data type conversions and ensures compatibility
 * between Pool Sync Service → Database → Oracle → Contract
 */
class UnifiedPoolSettlementSystem {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    this.wallet = new ethers.Wallet(
      process.env.ORACLE_PRIVATE_KEY || process.env.ORACLE_SIGNER_PRIVATE_KEY,
      this.provider
    );
    
    this.guidedOracleAddress = config.blockchain.contractAddresses.guidedOracle;
    this.poolCoreAddress = config.blockchain.contractAddresses.poolCore;
    
    this.guidedOracleABI = [
      "function submitOutcome(string memory marketId, bytes calldata resultData) external",
      "function getOutcome(string memory marketId) external view returns (bool isSet, bytes memory resultData)",
      "function executeCall(address target, bytes calldata data) external returns (bytes memory)"
    ];
    
    this.poolCoreABI = [
      "function getPoolStats(uint256 poolId) external view returns (uint256 totalBettorStake, uint256 totalCreatorSideStake, uint256 bettorCount, uint256 lpCount, bool isSettled, bool eligibleForRefund, uint256 timeUntilEventStart, uint256 timeUntilBettingEnd)",
      "function checkAndRefundEmptyPool(uint256 poolId) external",
      "function isEligibleForRefund(uint256 poolId) external view returns (bool)"
    ];
    
    this.guidedOracleContract = new ethers.Contract(this.guidedOracleAddress, this.guidedOracleABI, this.wallet);
    this.poolCoreContract = new ethers.Contract(this.poolCoreAddress, this.poolCoreABI, this.wallet);
    
    this.maxRetries = 3;
    this.retryDelay = 5000;
    this.isRunning = false;
  }

  /**
   * Start the settlement service
   */
  async start() {
    console.log('🚀 Starting Unified Pool Settlement System...');
    this.isRunning = true;
    
    // Run initial processing
    await this.processAllPools();
    
    // Set up periodic polling every 5 minutes
    this.pollInterval = setInterval(async () => {
      if (this.isRunning) {
        console.log('🔄 Polling for unsettled pools...');
        await this.processAllPools();
      }
    }, 5 * 60 * 1000); // 5 minutes
    
    console.log('✅ Unified Pool Settlement System started (polling every 5 minutes)');
  }

  /**
   * Stop the settlement service
   */
  async stop() {
    console.log('🛑 Stopping Unified Pool Settlement System...');
    this.isRunning = false;
    
    // Clear polling interval
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    
    console.log('✅ Unified Pool Settlement System stopped');
  }

  /**
   * Main entry point - Process all pools with complete data normalization
   */
  async processAllPools() {
    console.log('🚀 UNIFIED POOL SETTLEMENT SYSTEM - Processing all pools...');
    
    try {
      // Step 1: Data healing and normalization
      await this.normalizeAllData();
      
      // Step 2: Get all unsettled pools
      const pools = await this.getUnsettledPools();
      console.log(`📊 Found ${pools.length} unsettled pools`);
      
      // Step 3: Process each pool
      for (const pool of pools) {
        try {
          await this.processPool(pool);
        } catch (error) {
          console.error(`❌ Failed to process pool ${pool.pool_id}:`, error.message);
        }
      }
      
      console.log('✅ Unified pool settlement processing completed');
    } catch (error) {
      console.error('❌ Unified settlement system error:', error);
    }
  }

  /**
   * Normalize all data types and fix inconsistencies
   */
  async normalizeAllData() {
    console.log('🔧 NORMALIZING ALL DATA TYPES...');
    
    try {
      // 1. Fix fixtures table - populate fixture_id from result_info where missing
      console.log('  📊 Fixing fixtures.fixture_id from result_info...');
      const fixtureUpdates = await db.query(`
        UPDATE oracle.fixtures 
        SET fixture_id = (result_info->>'fixture_id')::bigint
        WHERE fixture_id IS NULL 
        AND result_info IS NOT NULL
        AND result_info->>'fixture_id' IS NOT NULL
        AND result_info->>'fixture_id' ~ '^[0-9]+$'
      `);
      console.log(`    ✅ Updated ${fixtureUpdates.rowCount} fixtures`);
      
      // 2. Fix pools table - ensure fixture_id matches fixtures table
      console.log('  📊 Normalizing pools.fixture_id...');
      const poolFixtureUpdates = await db.query(`
        UPDATE oracle.pools p
        SET fixture_id = f.fixture_id::text
        FROM oracle.fixtures f
        WHERE (
          (LOWER(f.home_team) LIKE '%' || LOWER(p.home_team) || '%' OR LOWER(p.home_team) LIKE '%' || LOWER(f.home_team) || '%')
          AND (LOWER(f.away_team) LIKE '%' || LOWER(p.away_team) || '%' OR LOWER(p.away_team) LIKE '%' || LOWER(f.away_team) || '%')
        )
        AND f.fixture_id IS NOT NULL
        AND f.result_info IS NOT NULL
        AND (p.fixture_id IS NULL OR p.fixture_id = '' OR p.fixture_id !~ '^[0-9]+$')
      `);
      console.log(`    ✅ Updated ${poolFixtureUpdates.rowCount} pool fixture_ids`);
      
      // 3. Clean market_id binary prefixes
      console.log('  📊 Cleaning market_id binary prefixes...');
      const marketIdCleaning = await db.query(`
        UPDATE oracle.pools 
        SET market_id = regexp_replace(market_id, '^[\\x00-\\x1F]+', '', 'g')
        WHERE market_id ~ '[\\x00-\\x1F]'
      `);
      console.log(`    ✅ Cleaned ${marketIdCleaning.rowCount} market_ids`);
      
      console.log('✅ Data normalization completed');
      
    } catch (error) {
      console.error('❌ Data normalization error:', error);
    }
  }

  /**
   * Get all unsettled pools with normalized data
   */
  async getUnsettledPools() {
    // ✅ FIX: Use market_id for DIRECT fixture lookup (no fuzzy matching!)
    const result = await db.query(`
      SELECT 
        p.pool_id, 
        p.title, 
        p.market_id, 
        p.fixture_id,
        p.home_team, 
        p.away_team, 
        p.predicted_outcome,
        p.oracle_type,
        p.is_settled,
        p.event_end_time,
        p.category,
        f.id as actual_fixture_id,
        f.home_team as fixture_home_team,
        f.away_team as fixture_away_team,
        f.match_date,
        fr.home_score,
        fr.away_score,
        fr.finished_at,
        fr.outcome_1x2,
        fr.outcome_ou25,
        fr.outcome_btts,
        -- Half-time results
        fr.ht_home_score,
        fr.ht_away_score,
        fr.result_ht,
        fr.outcome_ht_result,
        fr.result_ht_ou05,
        fr.result_ht_ou15,
        fr.outcome_ht_ou05,
        fr.outcome_ht_ou15,
        -- Note: result_ht_btts and outcome_ht_btts don't exist, calculate from scores if needed
        -- Determine pool type based on category
        CASE 
          WHEN p.category = 'cryptocurrency' OR p.category = 'crypto' THEN 'crypto'
          WHEN p.category = 'football' OR p.category = 'soccer' THEN 'football'
          WHEN p.title LIKE '%BNB%' OR p.title LIKE '%Price%' OR p.market_id LIKE '%BNB%' THEN 'crypto'
          WHEN p.home_team IN ('BNB', 'USD', 'ETH', 'BTC') OR p.away_team IN ('BNB', 'USD', 'ETH', 'BTC') THEN 'crypto'
          ELSE 'football'
        END as pool_type
      FROM oracle.pools p
      -- ✅ CRITICAL FIX: Join by market_id = fixture_id (exact match, no fuzzy logic!)
      LEFT JOIN oracle.fixtures f ON f.id::text = p.market_id
      LEFT JOIN oracle.fixture_results fr ON f.id::VARCHAR = fr.fixture_id::VARCHAR
      WHERE p.is_settled = false 
      AND p.oracle_type = 0  -- Only GUIDED oracle pools (both football and crypto)
      AND TO_TIMESTAMP(p.event_end_time) <= NOW()  -- Only ended events
      -- ✅ CRITICAL: For football pools, only process when match has FINISHED with FINAL SCORES
      AND (
        (p.category = 'cryptocurrency' OR p.category = 'crypto')  -- Crypto pools don't need fixture results
        OR (
          fr.home_score IS NOT NULL 
          AND fr.away_score IS NOT NULL 
          AND fr.finished_at IS NOT NULL
          -- ✅ CRITICAL: Match must have ended at least 15 minutes ago
          AND fr.finished_at <= NOW() - INTERVAL '15 minutes'
        )
      )
      ORDER BY p.pool_id
    `);
    
    return result.rows;
  }

  /**
   * Process a single pool with complete data validation
   */
  async processPool(pool) {
    console.log(`\n🎯 Processing Pool ${pool.pool_id}: ${pool.title} (${pool.pool_type})`);
    
    // Handle different pool types
    if (pool.pool_type === 'crypto') {
      return await this.processCryptoPool(pool);
    } else {
      return await this.processFootballPool(pool);
    }
  }

  /**
   * Process a football pool
   */
  async processFootballPool(pool) {
    console.log(`🎯 Processing Pool ${pool.pool_id}: ${pool.title}`);
    console.log(`   Pool market_id: ${pool.market_id}`);
    console.log(`   Pool predicted_outcome: "${pool.predicted_outcome}"`);
    console.log(`   Pool teams: ${pool.home_team} vs ${pool.away_team}`);
    
    // ✅ VALIDATION: Pool already has fixture data from the query
    console.log(`   Fixture ID: ${pool.actual_fixture_id}`);
    console.log(`   Fixture teams: ${pool.fixture_home_team} vs ${pool.fixture_away_team}`);
    console.log(`   Match date: ${pool.match_date}`);
    console.log(`   Scores: ${pool.home_score} - ${pool.away_score}`);
    console.log(`   Finished at: ${pool.finished_at}`);
    
    // ✅ CRITICAL VALIDATION: market_id must match actual_fixture_id
    if (!pool.actual_fixture_id) {
      console.log(`⚠️ No fixture found for pool ${pool.pool_id} market_id: ${pool.market_id}`);
      return;
    }
    
    if (pool.market_id !== pool.actual_fixture_id.toString()) {
      console.error(`❌ CRITICAL: market_id mismatch!`);
      console.error(`   Pool market_id: ${pool.market_id}`);
      console.error(`   Found actual_fixture_id: ${pool.actual_fixture_id}`);
      return;
    }
    
    // ✅ VALIDATION: Scores must exist (NOT null/undefined)
    // IMPORTANT: A score of 0 is VALID (e.g., 0-0 is a valid Draw result)
    // Only null/undefined indicates missing data
    if (pool.home_score === null || pool.home_score === undefined || 
        pool.away_score === null || pool.away_score === undefined) {
      console.log(`⚠️ No scores available for pool ${pool.pool_id}`);
      return;
    }
    
    // Log score for debugging (including 0-0 which is valid)
    console.log(`   📊 Scores: ${pool.home_score}-${pool.away_score} (0-0 is a valid Draw result)`);
    
    // ✅ CRITICAL VALIDATION: Ensure we're using 90-minute FT scores, not AET/PEN scores
    if (pool.match_status === 'AET' || pool.match_status === 'FT_PEN') {
      console.log(`⚠️ AET/PEN match detected for pool ${pool.pool_id} - verifying 90-minute FT score usage`);
      console.log(`   Match status: ${pool.match_status}`);
      console.log(`   Scores being used: ${pool.home_score}-${pool.away_score}`);
      console.log(`   ✅ These should be 90-minute FT scores, not AET/PEN scores`);
    }
    
    // ✅ VALIDATION: Match must be finished
    if (!pool.finished_at) {
      console.log(`⚠️ Match not finished yet for pool ${pool.pool_id}`);
      return;
    }
    
    // Step 2: Determine actual result based on pool's prediction type
    const actualResult = this.determineActualResultFromPool(pool, pool.predicted_outcome);
    if (!actualResult) {
      console.log(`⚠️ Cannot determine actual result for pool ${pool.pool_id} (prediction: ${pool.predicted_outcome})`);
      return;
    }
    
    console.log(`  🎯 Pool prediction: "${pool.predicted_outcome}" -> Actual result: "${actualResult}"`);
    
    // ✅ CRITICAL FIX: Normalize outcome to match the format used during pool creation
    // Pool creation stores: "Home wins", "Away wins", "Draw", "Over 2.5", "Under 2.5", etc.
    // But actualResult returns: "Home", "Away", "Draw", "Over", "Under"
    // We need to convert back to the pool creation format for proper contract comparison
    const normalizedOutcome = this.normalizeOutcomeForContract(actualResult, pool.predicted_outcome);
    console.log(`  🔄 Normalized outcome for contract: "${actualResult}" -> "${normalizedOutcome}"`);
    
    // Step 3: Ensure outcome is submitted to oracle
    const submitted = await this.ensureOutcomeSubmitted(pool.market_id, normalizedOutcome);
    if (!submitted) {
      console.log(`❌ Failed to submit outcome for pool ${pool.pool_id}`);
      return;
    }
    
    // Step 4: Settle pool on contract
    const settled = await this.settlePool(pool.pool_id, pool.market_id);
    if (settled) {
      console.log(`✅ Pool ${pool.pool_id} settled successfully`);
    }
  }
  
  /**
   * Normalize outcome to match the format used during pool creation
   * This ensures the contract's comparison (outcome != pool.predictedOutcome) works correctly
   */
  normalizeOutcomeForContract(actualResult, predictedOutcome) {
    // Extract the prediction type from predictedOutcome
    const prediction = predictedOutcome.toLowerCase();
    
    // === CRYPTO MARKETS ===
    // For crypto pools, the outcome format should match the prediction format
    // e.g., "SOL above $195" → outcome "SOL above $195" or "SOL below $195"
    if (prediction.match(/(btc|eth|sol|bnb|ada|matic|avax|dot|link|ltc|uni)\s+(above|below)\s+\$?(\d+)/i)) {
      // Crypto outcome is already in the correct format from determineCryptoOutcome
      // Just return it as-is
      return actualResult;
    }
    
    // === HALF TIME MARKETS ===
    if (prediction.includes('ht') || prediction.includes('half time')) {
      // For HT markets, match the format used during pool creation
      // If prediction is "Home HT", "Away HT", "Draw HT" → return "Home HT", "Away HT", "Draw HT"
      // If prediction is "Home HT" but result is "Draw" → return "Draw HT" to match format
      if (prediction.includes('home')) {
        return actualResult === 'Home' ? 'Home HT' : actualResult === 'Away' ? 'Away HT' : 'Draw HT';
      }
      if (prediction.includes('away')) {
        return actualResult === 'Home' ? 'Home HT' : actualResult === 'Away' ? 'Away HT' : 'Draw HT';
      }
      if (prediction.includes('draw')) {
        return actualResult === 'Home' ? 'Home HT' : actualResult === 'Away' ? 'Away HT' : 'Draw HT';
      }
      // For HT Over/Under: "Over 0.5 HT", "Under 1.5 HT"
      if (prediction.includes('over') || prediction.includes('under')) {
        const thresholds = ['0.5', '1.5', '2.5'];
        for (const threshold of thresholds) {
          if (prediction.includes(threshold)) {
            return actualResult === 'Over' ? `Over ${threshold} HT` : `Under ${threshold} HT`;
          }
        }
      }
      // Default: append HT suffix to match format
      return `${actualResult} HT`;
    }
    
    // For 1X2 markets: Convert "Home"/"Away"/"Draw" to match pool creation format
    if (prediction.includes('home wins') || prediction.includes('home win')) {
      return actualResult === 'Home' ? 'Home wins' : actualResult === 'Away' ? 'Away wins' : 'Draw';
    }
    if (prediction.includes('away wins') || prediction.includes('away win')) {
      return actualResult === 'Home' ? 'Home wins' : actualResult === 'Away' ? 'Away wins' : 'Draw';
    }
    if (prediction === 'home' || prediction === 'away' || prediction === 'draw') {
      // If pool uses short format, keep short format
      return actualResult;
    }
    
    // For Over/Under markets: Convert "Over"/"Under" to match pool creation format
    if (prediction.includes('over 2.5') || prediction.includes('under 2.5')) {
      return actualResult === 'Over' ? 'Over 2.5' : 'Under 2.5';
    }
    if (prediction.includes('over 1.5') || prediction.includes('under 1.5')) {
      return actualResult === 'Over' ? 'Over 1.5' : 'Under 1.5';
    }
    if (prediction.includes('over 3.5') || prediction.includes('under 3.5')) {
      return actualResult === 'Over' ? 'Over 3.5' : 'Under 3.5';
    }
    if (prediction.includes('over 0.5') || prediction.includes('under 0.5')) {
      return actualResult === 'Over' ? 'Over 0.5' : 'Under 0.5';
    }
    
    // For BTTS markets: Keep as-is
    if (prediction.includes('btts') || prediction.includes('both teams')) {
      return actualResult; // "Yes" or "No"
    }
    
    // Default: return as-is
    return actualResult;
  }
  
  /**
   * Determine actual result from pool data (not fixture lookup!)
   * This function now receives pool with all fixture data pre-joined
   */
  determineActualResultFromPool(pool, predictedOutcome) {
    const prediction = predictedOutcome ? predictedOutcome.trim() : '';
    
    console.log(`   🔍 Determining outcome for prediction: "${prediction}"`);
    
    // === HALF TIME MARKETS ===
    if (prediction.includes('HT') || prediction.includes('Half Time') || prediction.includes('half time')) {
      console.log(`   Market Type: HALF TIME`);
      return this.handleHalfTimeMarkets(pool, prediction);
    }
    
    // === 1X2 MARKETS ===
    if (['Home', 'Draw', 'Away', 'Home wins', 'Away wins'].includes(prediction)) {
      const outcome = pool.outcome_1x2;
      console.log(`   Market Type: MONEYLINE (1X2)`);
      console.log(`   Actual outcome: ${outcome}`);
      
      // ✅ VALIDATION: Outcome must match prediction type
      if (!['Home', 'Draw', 'Away'].includes(outcome)) {
        console.error(`❌ Invalid 1X2 outcome: ${outcome}`);
        return null;
      }
      return outcome;
    }
    
    // === OVER/UNDER MARKETS ===
    if (prediction.includes('Over') || prediction.includes('Under')) {
      // Determine which threshold (0.5, 1.5, 2.5, 3.5, etc.)
      let outcome;
      if (prediction.includes('0.5')) {
        outcome = pool.outcome_ou05 || this.calculateOverUnder(pool.home_score + pool.away_score, 0.5);
      } else if (prediction.includes('1.5')) {
        outcome = pool.outcome_ou15 || this.calculateOverUnder(pool.home_score + pool.away_score, 1.5);
      } else if (prediction.includes('3.5')) {
        outcome = pool.outcome_ou35 || this.calculateOverUnder(pool.home_score + pool.away_score, 3.5);
      } else {
        // Default to 2.5
        outcome = pool.outcome_ou25 || this.calculateOverUnder(pool.home_score + pool.away_score, 2.5);
      }
      
      console.log(`   Market Type: OVER/UNDER`);
      console.log(`   Actual outcome: ${outcome}`);
      
      // ✅ VALIDATION: Outcome must match prediction type
      if (!['Over', 'Under'].includes(outcome)) {
        console.error(`❌ Invalid O/U outcome: ${outcome}`);
        return null;
      }
      return outcome;
    }
    
    // === BTTS MARKETS ===
    if (prediction === 'Yes' || prediction === 'No' || prediction.includes('BTTS')) {
      const outcome = pool.outcome_btts;
      console.log(`   Market Type: BTTS`);
      console.log(`   Actual outcome: ${outcome}`);
      
      // ✅ VALIDATION: Outcome must match prediction type
      if (!['Yes', 'No'].includes(outcome)) {
        console.error(`❌ Invalid BTTS outcome: ${outcome}`);
        return null;
      }
      return outcome;
    }
    
    console.log(`  ⚠️ Unknown prediction type: "${prediction}"`);
    return null;
  }
  
  /**
   * Calculate Over/Under outcome from total goals
   */
  calculateOverUnder(totalGoals, threshold) {
    return totalGoals > threshold ? 'Over' : 'Under';
  }

  /**
   * Process a crypto pool
   */
  async processCryptoPool(pool) {
    console.log(`  📈 Processing crypto pool: ${pool.predicted_outcome}`);
    
    // Get current crypto price for outcome determination
    const outcome = await this.determineCryptoOutcome(pool);
    if (!outcome) {
      console.log(`⚠️ Cannot determine crypto outcome for pool ${pool.pool_id}`);
      return;
    }
    
    console.log(`📊 Pool ${pool.pool_id} crypto outcome: ${outcome}`);
    
    // Step 3: Ensure outcome is submitted to oracle
    const submitted = await this.ensureOutcomeSubmitted(pool.market_id, outcome);
    if (!submitted) {
      console.log(`❌ Failed to submit crypto outcome for pool ${pool.pool_id}`);
      return;
    }
    
    // Step 4: Settle pool on contract
    const settled = await this.settlePool(pool.pool_id, pool.market_id);
    if (settled) {
      console.log(`✅ Crypto pool ${pool.pool_id} settled successfully`);
    }
  }

  /**
   * Determine crypto outcome based on current price vs prediction
   */
  async determineCryptoOutcome(pool) {
    try {
      // Parse the prediction from market_id or predicted_outcome
      let symbol, targetPrice, isAbove;
      
      // Try to extract from market_id like "SOL_195_above_1762103615" or similar
      const marketMatch = pool.market_id.match(/(\w+)_(\d+(?:\.\d+)?)_(above|below)_/);
      if (marketMatch) {
        const [, sym, price, direction] = marketMatch;
        symbol = sym.toUpperCase();
        targetPrice = parseFloat(price);
        isAbove = direction === 'above';
      } else {
        // Try to extract from predicted_outcome like "SOL above $195" or "SOL above 195"
        const outcomeMatch = pool.predicted_outcome.match(/(\w+)\s+(above|below)\s+\$?(\d+(?:\.\d+)?)/i);
        if (outcomeMatch) {
          const [, sym, direction, price] = outcomeMatch;
          symbol = sym.toUpperCase();
          targetPrice = parseFloat(price);
          isAbove = direction.toLowerCase() === 'above';
        } else if (pool.home_team) {
          // Fallback: use home_team as symbol (e.g., "SOL" from pool.home_team)
          symbol = pool.home_team.toUpperCase();
          // Try to extract just the price from predicted_outcome
          const priceMatch = pool.predicted_outcome.match(/\$?(\d+(?:\.\d+)?)/);
          if (priceMatch) {
            targetPrice = parseFloat(priceMatch[1]);
            isAbove = pool.predicted_outcome.toLowerCase().includes('above');
          }
        }
      }
      
      if (!symbol || !targetPrice) {
        console.log(`  ⚠️ Cannot parse crypto prediction from: market_id=${pool.market_id}, predicted_outcome=${pool.predicted_outcome}, home_team=${pool.home_team}`);
        return null;
      }
      
      // Check if event has ended
      const currentTime = Math.floor(Date.now() / 1000);
      const eventEndTime = parseInt(pool.event_end_time);
      
      if (currentTime < eventEndTime) {
        console.log(`  ⚠️ Crypto event hasn't ended yet: ${new Date(eventEndTime * 1000)} (${Math.floor((eventEndTime - currentTime) / 60)} minutes remaining)`);
        return null;
      }
      
      // ✅ FIX: Fetch REAL price from Coinpaprika API
      const CoinpaprikaService = require('./coinpaprika');
      const coinpaprikaService = new CoinpaprikaService();
      
      // Find coin ID by symbol
      const coinId = await coinpaprikaService.findCoinIdBySymbol(symbol);
      if (!coinId) {
        console.log(`  ⚠️ Cannot find coin ID for symbol: ${symbol}`);
        return null;
      }
      
      console.log(`  🔍 Fetching ${symbol} price (${coinId}) from Coinpaprika...`);
      
      // Get current price
      const tickerResponse = await coinpaprikaService.getCoinTicker(coinId);
      if (!tickerResponse.success || !tickerResponse.data) {
        console.log(`  ⚠️ Failed to fetch ${symbol} price from Coinpaprika`);
        return null;
      }
      
      const currentPrice = parseFloat(tickerResponse.data.price_usd);
      console.log(`  📊 ${symbol} Current Price: $${currentPrice}, Target: $${targetPrice}, Direction: ${isAbove ? 'above' : 'below'}`);
      
      // Determine outcome: match the format of the prediction
      // If prediction is "SOL above $195", outcome should be "SOL above $195" if current > 195, else "SOL below $195"
      let actualOutcome;
      if (isAbove) {
        // Prediction was "X above $Y"
        if (currentPrice >= targetPrice) {
          actualOutcome = `${symbol} above $${targetPrice}`;
        } else {
          actualOutcome = `${symbol} below $${targetPrice}`;
        }
      } else {
        // Prediction was "X below $Y"
        if (currentPrice <= targetPrice) {
          actualOutcome = `${symbol} below $${targetPrice}`;
        } else {
          actualOutcome = `${symbol} above $${targetPrice}`;
        }
      }
      
      console.log(`  ✅ Crypto outcome: ${actualOutcome} (Current: $${currentPrice})`);
      
      return actualOutcome;
      
    } catch (error) {
      console.error(`  ❌ Error determining crypto outcome:`, error.message);
      console.error(error.stack);
      return null;
    }
  }

  /**
   * Find fixture using multiple robust strategies with proper type handling
   */
  async findFixture(pool) {
    const strategies = [
      // Strategy 1: Direct fixture_id lookup (handle string/number conversion)
      async () => {
        if (pool.normalized_fixture_id) {
          const result = await db.query(`
            SELECT fixture_id, home_team, away_team, status, result_info
            FROM oracle.fixtures 
            WHERE fixture_id = $1
          `, [parseInt(pool.normalized_fixture_id)]);
          
          if (result.rows.length > 0) {
            console.log(`  ✅ Found via direct fixture_id lookup`);
            return result.rows[0];
          }
        }
        return null;
      },
      
      // Strategy 2: Team name matching with accent normalization
      async () => {
        const normalizeTeam = (name) => name
          .toLowerCase()
          .replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i').replace(/ó/g, 'o').replace(/ú/g, 'u')
          .replace(/ã/g, 'a').replace(/õ/g, 'o').replace(/ç/g, 'c')
          .trim();
        
        const normalizedHome = normalizeTeam(pool.home_team);
        const normalizedAway = normalizeTeam(pool.away_team);
        
        const result = await db.query(`
          SELECT fixture_id, home_team, away_team, status, result_info
          FROM oracle.fixtures 
          WHERE (
            LOWER(home_team) LIKE '%' || $1 || '%'
            AND LOWER(away_team) LIKE '%' || $2 || '%'
          )
          AND result_info IS NOT NULL
          AND status = 'FT'
          ORDER BY match_date DESC
          LIMIT 1
        `, [normalizedHome, normalizedAway]);
        
        if (result.rows.length > 0) {
          console.log(`  ✅ Found via normalized team name matching`);
          return result.rows[0];
        }
        return null;
      },
      
      // Strategy 3: Fuzzy matching (remove common words)
      async () => {
        const cleanTeam = (name) => name
          .replace(/\b(FC|CF|SC|AC|vs|de|del|da|do|América|America)\b/gi, '')
          .trim();
        
        const cleanHome = cleanTeam(pool.home_team);
        const cleanAway = cleanTeam(pool.away_team);
        
        const result = await db.query(`
          SELECT fixture_id, home_team, away_team, status, result_info
          FROM oracle.fixtures 
          WHERE (
            LOWER(home_team) LIKE '%' || LOWER($1) || '%'
            AND LOWER(away_team) LIKE '%' || LOWER($2) || '%'
          )
          AND result_info IS NOT NULL
          AND status = 'FT'
          ORDER BY match_date DESC
          LIMIT 1
        `, [cleanHome, cleanAway]);
        
        if (result.rows.length > 0) {
          console.log(`  ✅ Found via fuzzy team name matching`);
          return result.rows[0];
        }
        return null;
      }
    ];
    
    // Try each strategy
    for (let i = 0; i < strategies.length; i++) {
      try {
        const fixture = await strategies[i]();
        if (fixture) return fixture;
      } catch (error) {
        console.log(`  ⚠️ Strategy ${i + 1} failed:`, error.message);
      }
    }
    
    return null;
  }

  /**
   * Determine outcome from fixture with comprehensive mapping
   */
  async determineOutcome(pool, fixture) {
    if (!fixture.result_info) return null;
    
    const result = fixture.result_info;
    const predicted = pool.predicted_outcome.toLowerCase();
    
    // Map different outcome types with comprehensive coverage
    // ✅ FIXED: Database now uses normalized format ("Home"/"Away"/"Draw", "Over"/"Under", "Yes"/"No")
    const outcomeMap = {
      // Over/Under mappings
      'over 2.5': result.outcome_ou25 === 'Over' ? 'Over' : null,
      'under 2.5': result.outcome_ou25 === 'Under' ? 'Under' : null,
      'over 1.5': result.result_ou15 === 'Over' ? 'Over' : null,
      'under 1.5': result.result_ou15 === 'Under' ? 'Under' : null,
      'over 3.5': result.result_ou35 === 'Over' ? 'Over' : null,
      'under 3.5': result.result_ou35 === 'Under' ? 'Under' : null,
      
      // 1X2 mappings - ✅ FIXED: Database now has "Home"/"Away"/"Draw"
      'home': result.outcome_1x2 === 'Home' ? 'Home' : null,
      'home wins': result.outcome_1x2 === 'Home' ? 'Home' : null,
      'home win': result.outcome_1x2 === 'Home' ? 'Home' : null,
      'home team': result.outcome_1x2 === 'Home' ? 'Home' : null,
      'draw': result.outcome_1x2 === 'Draw' ? 'Draw' : null,
      'away': result.outcome_1x2 === 'Away' ? 'Away' : null,
      'away wins': result.outcome_1x2 === 'Away' ? 'Away' : null,
      'away win': result.outcome_1x2 === 'Away' ? 'Away' : null,
      'away team': result.outcome_1x2 === 'Away' ? 'Away' : null,
      '1': result.outcome_1x2 === 'Home' ? 'Home' : null,  // Legacy support
      'x': result.outcome_1x2 === 'Draw' ? 'Draw' : null,  // Legacy support
      '2': result.outcome_1x2 === 'Away' ? 'Away' : null,  // Legacy support
      
      // BTTS mappings - ✅ FIXED: Database now has "Yes"/"No"
      'both teams to score': result.result_btts === 'Yes' || result.outcome_btts === 'Yes' ? 'Yes' : null,
      'btts yes': result.result_btts === 'Yes' || result.outcome_btts === 'Yes' ? 'Yes' : null,
      'btts no': result.result_btts === 'No' || result.outcome_btts === 'No' ? 'No' : null
    };
    
    // Try direct mapping first
    if (outcomeMap[predicted]) {
      return outcomeMap[predicted];
    }
    
    // Try partial matching
    for (const [key, value] of Object.entries(outcomeMap)) {
      if (predicted.includes(key) && value) {
        return value;
      }
    }
    
    // Try result field matching
    const availableResults = [
      result.outcome_ou25, result.result_ou35, result.result_ou15,
      result.outcome_1x2, result.result_btts, result.result_ht_1x2
    ].filter(Boolean);
    
    for (const availableResult of availableResults) {
      if (predicted.includes(availableResult.toLowerCase())) {
        return availableResult;
      }
    }
    
    return null;
  }

  /**
   * Determine actual result from fixture (for settlement)
   */
  async determineActualResult(fixture) {
    if (!fixture.result_info) return null;
    
    const result = fixture.result_info;
    
    // Return the primary 1X2 result for settlement
    // ✅ FIXED: Database now stores "Home"/"Away"/"Draw" directly (no conversion needed!)
    if (result.outcome_1x2) {
      return result.outcome_1x2;  // Already in correct format: "Home", "Away", or "Draw"
    }
    
    return null;
  }

  /**
   * Comprehensive outcome determination for all market types
   */
  async determineActualResultForPool(fixture, poolPrediction) {
    if (!fixture.result_info) return null;
    
    const result = fixture.result_info;
    
    // Normalize prediction for easier matching
    const prediction = poolPrediction ? poolPrediction.trim() : '';
    
    console.log(`  🔍 Determining outcome for prediction: "${prediction}"`);
    
    // === OVER/UNDER MARKETS ===
    if (prediction.includes('Over') || prediction.includes('Under')) {
      return this.handleOverUnderMarkets(result, prediction);
    }
    
    // === HALF TIME MARKETS ===
    if (prediction.includes('HT') || prediction.includes('Half Time')) {
      return this.handleHalfTimeMarkets(result, prediction);
    }
    
    // === 1X2 MARKETS ===
    if (['Home', 'Draw', 'Away', 'Home wins', 'Away wins'].includes(prediction)) {
      return this.handle1X2Markets(result, prediction);
    }
    
    // === BOTH TEAMS TO SCORE (BTTS) ===
    if (prediction === 'Yes' || prediction === 'No' || prediction.includes('BTTS')) {
      return this.handleBTTSMarkets(result, prediction);
    }
    
    // === DOUBLE CHANCE ===
    if (prediction.includes('1X') || prediction.includes('12') || prediction.includes('X2')) {
      return this.handleDoubleChanceMarkets(result, prediction);
    }
    
    // === CORRECT SCORE ===
    if (prediction.includes('-') && /\d+-\d+/.test(prediction)) {
      return this.handleCorrectScoreMarkets(result, prediction);
    }
    
    // === ASIAN HANDICAP ===
    if (prediction.includes('AH') || prediction.includes('Handicap')) {
      return this.handleAsianHandicapMarkets(result, prediction);
    }
    
    // === SIMPLE MONEYLINE (legacy format) ===
    // ✅ FIXED: Database now has "Home"/"Away"/"Draw" format
    if (prediction === 'Home wins' || prediction === 'Home' || prediction === '1') {
      return result.outcome_1x2 === 'Home' ? 'Home' : null;
    }
    if (prediction === 'Away wins' || prediction === 'Away' || prediction === '2') {
      return result.outcome_1x2 === 'Away' ? 'Away' : null;
    }
    if (prediction === 'Draw' || prediction === 'X') {
      return result.outcome_1x2 === 'Draw' ? 'Draw' : null;
    }
    
    console.log(`  ⚠️ Unknown prediction type: "${prediction}"`);
    return null;
  }

  /**
   * Handle Over/Under markets (0.5, 1.5, 2.5, 3.5, 4.5)
   */
  handleOverUnderMarkets(result, prediction) {
    const overUnderMap = {
      '0.5': ['result_ou05', 'outcome_ou05'],
      '1.5': ['result_ou15', 'outcome_ou15'], 
      '2.5': ['result_ou25', 'outcome_ou25'],
      '3.5': ['result_ou35', 'outcome_ou35'],
      '4.5': ['result_ou45', 'outcome_ou45']
    };
    
    for (const [threshold, [resultField, outcomeField]] of Object.entries(overUnderMap)) {
      if (prediction.includes(threshold)) {
        // Try result field first (already in Over/Under format)
        if (result[resultField]) {
          return result[resultField];
        }
        // ✅ FIXED: Database now has "Over"/"Under" format (normalized)
        // But still handle legacy "O"/"U" format for backward compatibility
        if (result[outcomeField]) {
          const value = result[outcomeField];
          if (value === 'Over' || value === 'O') return 'Over';
          if (value === 'Under' || value === 'U') return 'Under';
        }
      }
    }
    
    console.log(`  ❌ No Over/Under result found for: ${prediction}`);
    return null;
  }

  /**
   * Handle Half Time markets (HT Winner, HT Over/Under)
   */
  handleHalfTimeMarkets(pool, prediction) {
    // HT Winner (1X2) - "Home HT", "Away HT", "Draw HT"
    if (prediction.includes('Home') || prediction.includes('Draw') || prediction.includes('Away')) {
      const htResultMap = {
        '1': 'Home',
        'X': 'Draw',
        '2': 'Away',
        'Home': 'Home',
        'Draw': 'Draw',
        'Away': 'Away'
      };
      
      // Try to get from result_ht or outcome_ht_result first
      if (pool.result_ht) {
        const result = htResultMap[pool.result_ht] || pool.result_ht;
        console.log(`   HT Result from result_ht: ${result}`);
        return result;
      }
      if (pool.outcome_ht_result) {
        const result = htResultMap[pool.outcome_ht_result] || pool.outcome_ht_result;
        console.log(`   HT Result from outcome_ht_result: ${result}`);
        return result;
      }
      
      // Calculate from HT scores if available
      if (pool.ht_home_score !== null && pool.ht_away_score !== null) {
        const htHome = pool.ht_home_score;
        const htAway = pool.ht_away_score;
        let result;
        if (htHome > htAway) {
          result = 'Home';
        } else if (htAway > htHome) {
          result = 'Away';
        } else {
          result = 'Draw';
        }
        console.log(`   HT Result calculated from scores (${htHome}-${htAway}): ${result}`);
        return result;
      }
      
      console.log(`   ⚠️ No HT result found for 1X2 prediction: ${prediction}`);
      return null;
    }
    
    // HT Over/Under - "Over X.X HT", "Under X.X HT"
    if (prediction.includes('Over') || prediction.includes('Under')) {
      const thresholds = ['0.5', '1.5', '2.5'];
      for (const threshold of thresholds) {
        if (prediction.includes(threshold)) {
          // Try result fields first
          const fieldName = `result_ht_ou${threshold.replace('.', '')}`;
          if (pool[fieldName]) {
            const result = pool[fieldName];
            console.log(`   HT O/U ${threshold} from result field: ${result}`);
            return result;
          }
          const outcomeFieldName = `outcome_ht_ou${threshold.replace('.', '')}`;
          if (pool[outcomeFieldName]) {
            const outcome = pool[outcomeFieldName];
            const result = outcome === 'O' || outcome === 'Over' ? 'Over' : 'Under';
            console.log(`   HT O/U ${threshold} from outcome field: ${result}`);
            return result;
          }
          
          // Calculate from HT scores if available
          if (pool.ht_home_score !== null && pool.ht_away_score !== null) {
            const totalGoals = pool.ht_home_score + pool.ht_away_score;
            const result = totalGoals > parseFloat(threshold) ? 'Over' : 'Under';
            console.log(`   HT O/U ${threshold} calculated from scores (${totalGoals}): ${result}`);
            return result;
          }
        }
      }
      
      console.log(`   ⚠️ No HT Over/Under result found for: ${prediction}`);
      return null;
    }
    
    // HT BTTS
    if (prediction.includes('BTTS') || (prediction.includes('Yes') && prediction.includes('HT')) || (prediction.includes('No') && prediction.includes('HT'))) {
      // Note: result_ht_btts and outcome_ht_btts columns don't exist in database
      // Calculate from HT scores
      if (pool.ht_home_score !== null && pool.ht_away_score !== null) {
        const result = pool.ht_home_score > 0 && pool.ht_away_score > 0 ? 'Yes' : 'No';
        console.log(`   HT BTTS calculated from scores (${pool.ht_home_score}-${pool.ht_away_score}): ${result}`);
        return result;
      }
      
      console.log(`   ⚠️ No HT BTTS result found for: ${prediction} (HT scores not available)`);
      return null;
    }
    
    console.log(`  ❌ No Half Time result found for: ${prediction}`);
    return null;
  }

  /**
   * Handle 1X2 markets (Home/Draw/Away)
   */
  handle1X2Markets(result, prediction) {
    // ✅ FIXED: Database now stores "Home"/"Away"/"Draw" directly!
    // No conversion needed, but keep legacy mapping for old data (if any)
    const legacyResultMap = {
      '1': 'Home',
      'X': 'Draw',
      '2': 'Away'
    };
    
    // Normalize prediction to standard format
    let normalizedPrediction = prediction;
    if (prediction === 'Home wins') normalizedPrediction = 'Home';
    if (prediction === 'Away wins') normalizedPrediction = 'Away';
    
    // Try result_1x2 first
    if (result.result_1x2) {
      // Check if it's already in correct format or needs conversion
      const actualResult = legacyResultMap[result.result_1x2] || result.result_1x2;
      console.log(`  🎯 1X2 Result: ${result.result_1x2} -> ${actualResult}, Prediction: ${normalizedPrediction}`);
      return actualResult;
    }
    
    // Try outcome_1x2 (now in normalized format: "Home"/"Away"/"Draw")
    if (result.outcome_1x2) {
      // Database now has correct format, but check legacy just in case
      const actualResult = legacyResultMap[result.outcome_1x2] || result.outcome_1x2;
      console.log(`  🎯 1X2 Outcome: ${result.outcome_1x2} -> ${actualResult}, Prediction: ${normalizedPrediction}`);
      return actualResult;
    }
    
    console.log(`  ❌ No 1X2 result found for: ${prediction}`);
    return null;
  }

  /**
   * Handle Both Teams To Score (BTTS)
   */
  handleBTTSMarkets(result, prediction) {
    // Try result_btts first
    if (result.result_btts) {
      return result.result_btts;
    }
    
    // ✅ FIXED: Database now has "Yes"/"No" format (normalized)
    // But still handle legacy "Y"/"N" format for backward compatibility
    if (result.outcome_btts) {
      const value = result.outcome_btts;
      if (value === 'Yes' || value === 'Y') return 'Yes';
      if (value === 'No' || value === 'N') return 'No';
    }
    
    console.log(`  ❌ No BTTS result found for: ${prediction}`);
    return null;
  }

  /**
   * Handle Double Chance markets (1X, 12, X2)
   */
  handleDoubleChanceMarkets(result, prediction) {
    const dcMap = {
      '1X': ['result_dc_1x', 'outcome_dc_1x'],
      '12': ['result_dc_12', 'outcome_dc_12'], 
      'X2': ['result_dc_x2', 'outcome_dc_x2']
    };
    
    for (const [dcType, [resultField, outcomeField]] of Object.entries(dcMap)) {
      if (prediction.includes(dcType)) {
        if (result[resultField]) {
          return result[resultField];
        }
        if (result[outcomeField]) {
          return result[outcomeField];
        }
      }
    }
    
    console.log(`  ❌ No Double Chance result found for: ${prediction}`);
    return null;
  }

  /**
   * Handle Correct Score markets
   */
  handleCorrectScoreMarkets(result, prediction) {
    // Extract score from prediction (e.g., "2-1")
    const scoreMatch = prediction.match(/(\d+)-(\d+)/);
    if (!scoreMatch) return null;
    
    const [, homeScore, awayScore] = scoreMatch;
    const predictedScore = `${homeScore}-${awayScore}`;
    
    // Try result_cs first
    if (result.result_cs) {
      return result.result_cs === predictedScore ? predictedScore : 'Other';
    }
    
    // Try outcome_cs
    if (result.outcome_cs) {
      return result.outcome_cs === predictedScore ? predictedScore : 'Other';
    }
    
    // Construct from home_score and away_score
    if (result.home_score !== undefined && result.away_score !== undefined) {
      const actualScore = `${result.home_score}-${result.away_score}`;
      return actualScore === predictedScore ? predictedScore : 'Other';
    }
    
    console.log(`  ❌ No Correct Score result found for: ${prediction}`);
    return null;
  }

  /**
   * Handle Asian Handicap markets
   */
  handleAsianHandicapMarkets(result, prediction) {
    // Extract handicap value (e.g., "AH +0.5", "Handicap -1")
    const handicapMatch = prediction.match(/[+-]?(\d+(?:\.\d+)?)/);
    if (!handicapMatch) return null;
    
    const handicapValue = handicapMatch[1];
    
    // Map common handicap values to result fields
    const ahMap = {
      '0': ['result_ah_home_0', 'outcome_ah_home_0'],
      '0.5': ['result_ah_home_05', 'outcome_ah_home_05'],
      '1': ['result_ah_home_1', 'outcome_ah_home_1']
    };
    
    const [resultField, outcomeField] = ahMap[handicapValue] || [];
    
    if (resultField && result[resultField]) {
      return result[resultField];
    }
    
    if (outcomeField && result[outcomeField]) {
      return result[outcomeField];
    }
    
    console.log(`  ❌ No Asian Handicap result found for: ${prediction}`);
    return null;
  }

  /**
   * Ensure outcome is submitted to oracle with proper error handling
   */
  async ensureOutcomeSubmitted(marketId, outcome) {
    try {
      // Check if already exists
      const [isSet] = await this.guidedOracleContract.getOutcome(marketId);
      if (isSet) {
        console.log(`  ✅ Outcome already exists for market ${marketId}`);
        return true;
      }
      
      console.log(`  🔍 Submitting outcome for market: ${marketId} -> ${outcome}`);
      
      // Submit with retry
      for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
        try {
          const resultData = ethers.toUtf8Bytes(outcome);
          const tx = await this.guidedOracleContract.submitOutcome(marketId, resultData);
          
          console.log(`  📤 Submission transaction: ${tx.hash}`);
          const receipt = await tx.wait();
          console.log(`  ✅ Outcome submitted! Block: ${receipt.blockNumber}`);
          
          return true;
          
        } catch (submitError) {
          console.log(`  ❌ Attempt ${attempt} failed: ${submitError.message}`);
          
          if (attempt < this.maxRetries) {
            await new Promise(resolve => setTimeout(resolve, this.retryDelay));
          }
        }
      }
      
      return false;
      
    } catch (error) {
      console.error(`  ❌ Error submitting outcome:`, error.message);
      return false;
    }
  }

  /**
   * Settle pool on contract with proper data format
   */
  async settlePool(poolId, marketId) {
    try {
      // CRITICAL: Check for no bets before settlement
      const poolStats = await this.getPoolStats(poolId);
      if (!poolStats) {
        console.log(`  ❌ Could not get pool stats for ${poolId}`);
        return false;
      }
      
      console.log(`  📊 Pool ${poolId} stats: totalBettorStake=${poolStats.totalBettorStake}, isEligibleForRefund=${poolStats.isEligibleForRefund}`);
      
      // Check if pool has no bets and should be refunded instead of settled
      if (poolStats.totalBettorStake === 0n && poolStats.isEligibleForRefund) {
        console.log(`  💰 Pool ${poolId} has no bets - checking arbitration deadline for refund`);
        
        // Check if arbitration deadline has passed (24 hours after event end)
        const now = Math.floor(Date.now() / 1000);
        
        // Get pool data from database since we may not have the right contract method
        const poolDbResult = await db.query('SELECT arbitration_deadline FROM oracle.pools WHERE pool_id = $1', [poolId]);
        const arbitrationDeadline = poolDbResult.rows[0] ? Number(poolDbResult.rows[0].arbitration_deadline) : 0;
        
        if (now >= arbitrationDeadline) {
          console.log(`  ✅ Arbitration deadline passed - processing refund`);
          return await this.processRefund(poolId);
        } else {
          const timeUntilRefund = arbitrationDeadline - now;
          const hours = Math.floor(timeUntilRefund / 3600);
          const minutes = Math.floor((timeUntilRefund % 3600) / 60);
          console.log(`  ⏳ Pool ${poolId} waiting for arbitration deadline (${hours}h ${minutes}m remaining)`);
          return false;
        }
      }
      
      // Additional check: If pool has no bets but is not eligible for refund, skip settlement
      if (poolStats.totalBettorStake === 0n) {
        console.log(`  ⚠️ Pool ${poolId} has no bets but is not eligible for refund - skipping settlement`);
        return false;
      }
      
      // Get outcome from oracle
      const [isSet, resultData] = await this.guidedOracleContract.getOutcome(marketId);
      if (!isSet) {
        console.log(`  ⚠️ No outcome available for pool ${poolId}`);
        return false;
      }
      
      console.log(`  🚀 Settling pool ${poolId}...`);
      
      // Try settlement with retry
      for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
        try {
          // Create settlement call data
          // ✅ CRITICAL FIX: Send raw outcome data, not hashed (predictedOutcome is stored as raw data in contract)
          const settlePoolInterface = new ethers.Interface([
            'function settlePool(uint256 poolId, bytes32 outcome) external'
          ]);
          
          // Convert result data to bytes32
          // ✅ CRITICAL: resultData from GuidedOracle is bytes from ethers.toUtf8Bytes()
          // We need to convert it to bytes32 format that matches predictedOutcome padding
          // predictedOutcome is stored as ethers.toUtf8Bytes() RIGHT-padded to 32 bytes (zeros at end)
          // Use zeroPadBytes which RIGHT-pads correctly to 32 bytes
          let outcomeBytes32;
          if (typeof resultData === 'string' && resultData.startsWith('0x')) {
            // Already hex bytes, ensure it's 32 bytes (RIGHT-pad with zeros)
            const bytes = ethers.getBytes(resultData);
            outcomeBytes32 = ethers.zeroPadBytes(bytes, 32);
          } else {
            // Convert string to bytes and RIGHT-pad to 32 bytes
            const outcomeString = typeof resultData === 'string' ? resultData : ethers.toUtf8String(resultData);
            const outcomeBytes = ethers.toUtf8Bytes(outcomeString);
            outcomeBytes32 = ethers.zeroPadBytes(outcomeBytes, 32);
          }
          
          console.log(`  📝 Outcome bytes32 (right-padded): ${outcomeBytes32}`);
          const callData = settlePoolInterface.encodeFunctionData('settlePool', [poolId, outcomeBytes32]);
          
          // Execute via GuidedOracle
          const tx = await this.guidedOracleContract.executeCall(this.poolCoreAddress, callData, {
            gasLimit: 2000000
          });
          
          console.log(`  📤 Settlement transaction: ${tx.hash}`);
          const receipt = await tx.wait();
          console.log(`  ✅ Pool ${poolId} settled! Block: ${receipt.blockNumber}`);
          
          // Parse PoolSettled event from receipt to get actual settlement data
          const poolCoreInterface = new ethers.Interface([
            'event PoolSettled(uint256 indexed poolId, bytes32 result, bool creatorSideWon, uint256 timestamp)'
          ]);
          
          let settlementResult = null;
          let creatorSideWon = null;
          let resultTimestamp = null;
          
          // Find PoolSettled event in the receipt
          for (const log of receipt.logs) {
            try {
              const parsed = poolCoreInterface.parseLog(log);
              if (parsed && parsed.name === 'PoolSettled') {
                settlementResult = parsed.args.result;
                creatorSideWon = parsed.args.creatorSideWon;
                resultTimestamp = parsed.args.timestamp;
                console.log(`  📊 Found PoolSettled event: result=${settlementResult}, creatorSideWon=${creatorSideWon}`);
                break;
              }
            } catch (e) {
              // Not a PoolSettled event, continue
            }
          }
          
          // Update database with settlement data from event
          if (settlementResult !== null && creatorSideWon !== null) {
            await db.query(`
              UPDATE oracle.pools 
              SET is_settled = true, 
                  result = $2,
                  creator_side_won = $3,
                  result_timestamp = $4,
                  status = CASE WHEN $2 = '0x0000000000000000000000000000000000000000000000000000000000000000' THEN 'refunded' ELSE 'settled' END,
                  settlement_tx_hash = $5,
                  settled_at = NOW(), 
                  updated_at = NOW()
              WHERE pool_id = $1
            `, [poolId, settlementResult, Boolean(Number(creatorSideWon)), Number(resultTimestamp), tx.hash]);
            console.log(`  ✅ Database updated with settlement data from event`);
          } else {
            // Fallback: Update only basic fields if event parsing failed
            console.log(`  ⚠️ Could not parse PoolSettled event, updating basic fields only`);
            await db.query(`
              UPDATE oracle.pools 
              SET is_settled = true, 
                  settlement_tx_hash = $2,
                  settled_at = NOW(), 
                  updated_at = NOW()
              WHERE pool_id = $1
            `, [poolId, tx.hash]);
            console.log(`  ⚠️ Note: result and creator_side_won will be updated by event listener`);
          }
          
          return true;
          
        } catch (settlementError) {
          console.log(`  ❌ Settlement attempt ${attempt} failed: ${settlementError.message}`);
          
          if (settlementError.message.includes('Already settled')) {
            console.log(`  ✅ Pool ${poolId} already settled in contract`);
            
            // Update database (settlement TX hash not available for already settled pools)
            await db.query(`
              UPDATE oracle.pools 
              SET is_settled = true, 
                  settled_at = NOW(), 
                  updated_at = NOW()
              WHERE pool_id = $1 AND is_settled = false
            `, [poolId]);
            
            return true;
          }
          
          if (attempt < this.maxRetries) {
            await new Promise(resolve => setTimeout(resolve, this.retryDelay));
          }
        }
      }
      
      return false;
      
    } catch (error) {
      console.error(`  ❌ Error settling pool ${poolId}:`, error.message);
      return false;
    }
  }

  /**
   * Get system status and health check
   */
  async getSystemStatus() {
    try {
      const walletAddress = await this.wallet.getAddress();
      const balance = await this.provider.getBalance(walletAddress);
      
      // Check data consistency
      const dataHealth = await db.query(`
        SELECT 
          COUNT(*) as total_pools,
          COUNT(CASE WHEN is_settled = false THEN 1 END) as unsettled_pools,
          COUNT(CASE WHEN fixture_id IS NULL OR fixture_id = '' THEN 1 END) as missing_fixture_ids,
          COUNT(CASE WHEN fixture_id !~ '^[0-9]+$' AND fixture_id != '' THEN 1 END) as invalid_fixture_ids
        FROM oracle.pools 
        WHERE oracle_type = 0
      `);
      
      const health = dataHealth.rows[0];
      
      return {
        walletAddress,
        walletBalance: ethers.formatEther(balance),
        totalPools: parseInt(health.total_pools),
        unsettledPools: parseInt(health.unsettled_pools),
        dataIssues: {
          missingFixtureIds: parseInt(health.missing_fixture_ids),
          invalidFixtureIds: parseInt(health.invalid_fixture_ids)
        },
        healthScore: Math.max(0, 100 - (parseInt(health.missing_fixture_ids) + parseInt(health.invalid_fixture_ids)) * 10),
        lastUpdate: new Date().toISOString()
      };
      
    } catch (error) {
      return {
        error: error.message,
        healthScore: 0
      };
    }
  }

  /**
   * Get pool statistics from contract
   */
  async getPoolStats(poolId) {
    try {
      const stats = await this.poolCoreContract.getPoolStats(poolId);
      return {
        totalBettorStake: stats[0],
        totalCreatorSideStake: stats[1],
        bettorCount: stats[2],
        lpCount: stats[3],
        isSettled: stats[4],
        isEligibleForRefund: stats[5],
        timeUntilEventStart: stats[6],
        timeUntilBettingEnd: stats[7]
      };
    } catch (error) {
      console.error(`❌ Error getting pool stats for ${poolId}:`, error.message);
      return null;
    }
  }

  /**
   * Process refund for pool with no bets
   */
  async processRefund(poolId) {
    try {
      console.log(`  💰 Processing refund for pool ${poolId} (no bets placed)`);
      
      // Call the contract's refund function
      const tx = await this.poolCoreContract.checkAndRefundEmptyPool(poolId, {
        gasLimit: 2000000
      });
      
      console.log(`  📤 Refund transaction: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`  ✅ Pool ${poolId} refunded! Block: ${receipt.blockNumber}`);
      
      // Update database to reflect refund
      await db.query(`
        UPDATE oracle.pools 
        SET is_settled = true, 
            settlement_tx_hash = $2,
            creator_side_won = false,
            result = '0x0000000000000000000000000000000000000000000000000000000000000000',
            status = 'refunded',
            refund_reason = 'No bets placed',
            refunded_at = NOW(),
            settled_at = NOW(), 
            updated_at = NOW()
        WHERE pool_id = $1
      `, [poolId, tx.hash]);
      
      console.log(`  ✅ Database updated for pool ${poolId} refund`);
      return true;
      
    } catch (error) {
      console.error(`  ❌ Error processing refund for pool ${poolId}:`, error.message);
      return false;
    }
  }
}

module.exports = UnifiedPoolSettlementSystem;
