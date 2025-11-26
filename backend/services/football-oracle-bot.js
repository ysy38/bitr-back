const { ethers } = require('ethers');
const SportMonksService = require('./sportmonks');
const UnifiedPoolSettlementSystem = require('./unified-pool-settlement-system');
const db = require('../db/db');
const config = require('../config');

class FootballOracleBot {
  constructor() {
    this.sportmonksService = new SportMonksService();
    this.unifiedSettlementSystem = new UnifiedPoolSettlementSystem();
    this.isRunning = false;
    this.updateInterval = 5 * 60 * 1000; // 5 minutes
    this.resolutionInterval = 2 * 60 * 1000; // 2 minutes
    this.priceUpdateInterval = null;
    this.resolutionCheckInterval = null;
    
    // Initialize web3 connection for oracle submission
    this.provider = new ethers.JsonRpcProvider(process.env.BLOCKCHAIN_RPC_URL || process.env.RPC_URL);
    this.wallet = new ethers.Wallet(process.env.ORACLE_PRIVATE_KEY || process.env.ORACLE_SIGNER_PRIVATE_KEY, this.provider);
    
    // Contract addresses and ABIs
    this.guidedOracleAddress = process.env.GUIDED_ORACLE_ADDRESS || config.blockchain.contractAddresses.guidedOracle;
    this.guidedOracleABI = [
      "function submitOutcome(string memory marketId, bytes calldata resultData) external",
      "function getOutcome(string memory marketId) external view returns (bool isSet, bytes memory resultData)",
      "function oracleBot() external view returns (address)"
    ];
    this.guidedOracleContract = new ethers.Contract(
      this.guidedOracleAddress,
      this.guidedOracleABI,
      this.wallet
    );
  }

  /**
   * Start the football oracle bot
   */
  async start() {
    if (this.isRunning) {
      console.log('Football Oracle Bot is already running');
      return;
    }

    this.isRunning = true;
    console.log('🚀 Starting Football Oracle Bot...');

    try {
      // Verify oracle bot wallet
      const botAddress = await this.wallet.getAddress();
      console.log(`Oracle bot wallet: ${botAddress}`);

      // Check if this wallet is authorized in the contract
      const authorizedBot = await this.guidedOracleContract.oracleBot();
      if (botAddress.toLowerCase() !== authorizedBot.toLowerCase()) {
        console.warn(`⚠️ Warning: Wallet ${botAddress} is not the authorized oracle bot (${authorizedBot})`);
      }

      // Start periodic operations
      await this.startPeriodicOperations();
      
      console.log('✅ Football Oracle Bot started successfully');
    } catch (error) {
      console.error('❌ Failed to start Football Oracle Bot:', error);
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Stop the football oracle bot
   */
  async stop() {
    this.isRunning = false;
    
    if (this.priceUpdateInterval) {
      clearInterval(this.priceUpdateInterval);
      this.priceUpdateInterval = null;
    }
    
    if (this.resolutionCheckInterval) {
      clearInterval(this.resolutionCheckInterval);
      this.resolutionCheckInterval = null;
    }
    
    console.log('🛑 Football Oracle Bot stopped');
  }

  /**
   * Start periodic fixture updates and market resolution checks
   */
  async startPeriodicOperations() {
    // DISABLED: Results fetching moved to Unified Results Manager
    // This prevents conflicts with the new unified system
    console.log('⚠️ Football Oracle Bot results fetching DISABLED - using Unified Results Manager instead');
    
    // Only keep market resolution checking (not results fetching)
    this.resolutionCheckInterval = setInterval(async () => {
      if (!this.isRunning) return;
      
      try {
        await this.checkAndResolveMarkets();
      } catch (error) {
        console.error('Error in resolution cycle:', error);
      }
    }, this.resolutionInterval);

    // Run initial market resolution check
    setTimeout(async () => {
      await this.checkAndResolveMarkets();
    }, 5000);
  }

  /**
   * Update fixture results from SportMonks API
   */
  async updateFixtureResults() {
    console.log('📊 Updating fixture results...');
    
    try {
      // Get fixtures that are likely finished but don't have results yet
      const result = await db.query(`
        SELECT f.id as fixture_id, f.home_team, f.away_team, f.match_date
        FROM oracle.fixtures f
        LEFT JOIN oracle.fixture_results r ON f.id::VARCHAR = r.fixture_id::VARCHAR
        WHERE f.match_date >= NOW() - INTERVAL '3 hours'
        AND f.match_date <= NOW()
        AND r.fixture_id IS NULL
        AND f.status NOT IN ('NS', 'CANC', 'POST')
        ORDER BY f.match_date DESC
        LIMIT 20
      `);

      if (result.rows.length === 0) {
        console.log('No fixtures need result updates');
        return;
      }

      console.log(`Updating results for ${result.rows.length} fixtures...`);

      const fixtureIds = result.rows.map(row => row.fixture_id);
      const results = await this.sportmonksService.fetchFixtureResults(fixtureIds);
      
      if (results.length > 0) {
        const savedResults = await this.sportmonksService.saveResults(results);
        console.log(`✅ Updated ${savedResults} fixture results`);
      } else {
        console.log('No new results available');
      }

    } catch (error) {
      console.error('❌ Failed to update fixture results:', error);
    }
  }

  /**
   * Check main pools table for GUIDED oracle pools that need resolution
   */
  async checkMainPoolsForResolution() {
    console.log('🔍 Checking main pools table for GUIDED oracle pools...');
    
    try {
      // Get GUIDED oracle pools that need resolution
      // ✅ FIX: Use market_id for DIRECT fixture lookup (no fuzzy matching!)
      const result = await db.query(`
        SELECT 
          p.pool_id,
          p.title,
          p.market_id,
          p.predicted_outcome,
          p.event_end_time,
          p.league,
          p.home_team,
          p.away_team,
          p.oracle_type,
          p.status,
          f.id as fixture_id,
          f.home_team as fixture_home_team,
          f.away_team as fixture_away_team,
          f.match_date,
          fr.home_score,
          fr.away_score,
          fr.finished_at,
          fr.outcome_1x2,
          fr.outcome_ou25,
          fr.outcome_btts
        FROM oracle.pools p
        -- ✅ CRITICAL FIX: Join by market_id = fixture_id (exact match, no fuzzy logic!)
        INNER JOIN oracle.fixtures f ON f.id::text = p.market_id
        LEFT JOIN oracle.fixture_results fr ON f.id::VARCHAR = fr.fixture_id::VARCHAR
        WHERE p.oracle_type = 0  -- GUIDED oracle
          AND TO_TIMESTAMP(p.event_end_time) <= NOW()
          AND p.status = 'active'
          -- ✅ CRITICAL: Only resolve when match has FINISHED with FINAL SCORES
          AND fr.home_score IS NOT NULL
          AND fr.away_score IS NOT NULL
          AND fr.finished_at IS NOT NULL
          -- ✅ CRITICAL: Match must have ended at least 15 minutes ago
          AND fr.finished_at <= NOW() - INTERVAL '15 minutes'
          -- Check if outcome already submitted to contract
          AND NOT EXISTS (
            SELECT 1 FROM public.oracle_submissions os
            WHERE os.match_id = p.market_id
          )
        ORDER BY p.event_end_time ASC
        LIMIT 10
      `);

      if (result.rows.length === 0) {
        console.log('No main pools need oracle submission to contract');
        return;
      }

      console.log(`📋 Found ${result.rows.length} main pools needing oracle submission to contract`);

      for (const pool of result.rows) {
        try {
          await this.resolveMainPool(pool);
        } catch (error) {
          console.error(`Failed to resolve main pool ${pool.pool_id}:`, error);
        }
      }

    } catch (error) {
      console.error('❌ Failed to check main pools for resolution:', error);
    }
  }

  /**
   * Resolve a main pool (GUIDED oracle)
   */
  async resolveMainPool(pool) {
    console.log(`🎯 Resolving main pool: ${pool.pool_id} (${pool.title})`);
    console.log(`   Pool market_id: ${pool.market_id}`);
    console.log(`   Pool predicted_outcome: "${pool.predicted_outcome}"`);
    console.log(`   Pool teams: ${pool.home_team} vs ${pool.away_team}`);
    
    try {
      // ✅ VALIDATION: Pool already has fixture data from the query
      // We now have: fixture_id, fixture_home_team, fixture_away_team, match_date, scores, outcomes
      
      console.log(`   Fixture ID: ${pool.fixture_id}`);
      console.log(`   Fixture teams: ${pool.fixture_home_team} vs ${pool.fixture_away_team}`);
      console.log(`   Match date: ${pool.match_date}`);
      console.log(`   Scores: ${pool.home_score} - ${pool.away_score}`);
      console.log(`   Finished at: ${pool.finished_at}`);
      
      // ✅ CRITICAL VALIDATION: market_id must match fixture_id
      if (pool.market_id !== pool.fixture_id.toString()) {
        console.error(`❌ CRITICAL: market_id mismatch!`);
        console.error(`   Pool market_id: ${pool.market_id}`);
        console.error(`   Found fixture_id: ${pool.fixture_id}`);
        console.error(`   This should never happen with the new query!`);
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

      // ✅ VALIDATION: Match must be finished
      if (!pool.finished_at) {
        console.log(`⚠️ Match not finished yet for pool ${pool.pool_id}`);
        return;
      }

      // ✅ DETERMINE OUTCOME based on predicted_outcome type and normalize to match prediction format
      let outcome;
      const prediction = pool.predicted_outcome.trim();
      
      console.log(`   Determining outcome for prediction: "${prediction}"`);
      
      // ========== MONEYLINE (1X2) MARKETS ==========
      if (['Home', 'Draw', 'Away', 'Home wins', 'Away wins'].includes(prediction)) {
        const rawOutcome = pool.outcome_1x2;
        console.log(`   Market Type: MONEYLINE (1X2)`);
        console.log(`   Raw outcome: ${rawOutcome}`);
        
        // ✅ VALIDATION: Outcome must be valid
        if (!['Home', 'Draw', 'Away'].includes(rawOutcome)) {
          console.error(`❌ Invalid 1X2 outcome: ${rawOutcome}`);
          return;
        }
        
        // ✅ NORMALIZE: Match prediction format
        if (prediction === 'Home wins' || prediction === 'Away wins') {
          outcome = rawOutcome === 'Home' ? 'Home wins' : rawOutcome === 'Away' ? 'Away wins' : 'Draw';
        } else {
          outcome = rawOutcome;
        }
        console.log(`   Normalized outcome: ${outcome}`);
      }
      // ========== OVER/UNDER MARKETS ==========
      else if (prediction.includes('Over') || prediction.includes('Under')) {
        // Detect which O/U market
        let rawOutcome;
        let marketType;
        
        if (prediction.includes('2.5')) {
          rawOutcome = pool.outcome_ou25;
          marketType = 'O/U 2.5';
        } else if (prediction.includes('3.5')) {
          rawOutcome = pool.outcome_ou35;
          marketType = 'O/U 3.5';
        } else if (prediction.includes('1.5')) {
          rawOutcome = pool.outcome_ou15;
          marketType = 'O/U 1.5';
        } else if (prediction.includes('0.5')) {
          rawOutcome = pool.outcome_ou05;
          marketType = 'O/U 0.5';
        } else if (prediction.includes('4.5')) {
          rawOutcome = pool.outcome_ou45;
          marketType = 'O/U 4.5';
        } else if (prediction.includes('HT')) {
          // Half-time O/U
          if (prediction.includes('0.5')) {
            rawOutcome = pool.outcome_ht_ou05;
            marketType = 'HT O/U 0.5';
          } else if (prediction.includes('1.5')) {
            rawOutcome = pool.outcome_ht_ou15;
            marketType = 'HT O/U 1.5';
          }
        }
        
        console.log(`   Market Type: ${marketType}`);
        console.log(`   Raw outcome: ${rawOutcome}`);
        
        // ✅ VALIDATION: Outcome must be valid
        if (!['Over', 'Under'].includes(rawOutcome)) {
          console.error(`❌ Invalid O/U outcome: ${rawOutcome}`);
          return;
        }
        
        // ✅ NORMALIZE: Match prediction format
        // e.g., "Over 2.5" vs "Over", "Over 3.5 HT" vs "Over"
        if (prediction.includes('2.5')) {
          outcome = rawOutcome === 'Over' ? 'Over 2.5' : 'Under 2.5';
        } else if (prediction.includes('3.5')) {
          outcome = rawOutcome === 'Over' ? 'Over 3.5' : 'Under 3.5';
        } else if (prediction.includes('1.5') && prediction.includes('HT')) {
          outcome = rawOutcome === 'Over' ? 'Over 1.5 HT' : 'Under 1.5 HT';
        } else if (prediction.includes('0.5') && prediction.includes('HT')) {
          outcome = rawOutcome === 'Over' ? 'Over 0.5 HT' : 'Under 0.5 HT';
        } else if (prediction.includes('1.5')) {
          outcome = rawOutcome === 'Over' ? 'Over 1.5' : 'Under 1.5';
        } else if (prediction.includes('0.5')) {
          outcome = rawOutcome === 'Over' ? 'Over 0.5' : 'Under 0.5';
        } else if (prediction.includes('4.5')) {
          outcome = rawOutcome === 'Over' ? 'Over 4.5' : 'Under 4.5';
        } else {
          // Fallback: use prediction format
          outcome = prediction.includes('Over') ? (rawOutcome === 'Over' ? prediction : prediction.replace('Over', 'Under')) : (rawOutcome === 'Under' ? prediction : prediction.replace('Under', 'Over'));
        }
        console.log(`   Normalized outcome: ${outcome}`);
      }
      // ========== BTTS (BOTH TEAMS TO SCORE) MARKETS ==========
      else if (prediction === 'Yes' || prediction === 'No' || prediction.toLowerCase().includes('btts')) {
        const rawOutcome = pool.outcome_btts;
        console.log(`   Market Type: BTTS`);
        console.log(`   Raw outcome: ${rawOutcome}`);
        
        // ✅ VALIDATION: Outcome must be valid
        if (!['Yes', 'No'].includes(rawOutcome)) {
          console.error(`❌ Invalid BTTS outcome: ${rawOutcome}`);
          return;
        }
        
        // ✅ NORMALIZE: Already in correct format
        outcome = rawOutcome;
        console.log(`   Normalized outcome: ${outcome}`);
      }
      // ========== HALF-TIME 1X2 MARKETS ==========
      else if (prediction.includes('HT') && (prediction.includes('Home') || prediction.includes('Draw') || prediction.includes('Away'))) {
        const rawOutcome = pool.outcome_ht_result;
        console.log(`   Market Type: HALF-TIME 1X2`);
        console.log(`   Raw outcome: ${rawOutcome}`);
        
        // ✅ VALIDATION: Outcome must be valid
        if (!['Home', 'Draw', 'Away'].includes(rawOutcome)) {
          console.error(`❌ Invalid HT outcome: ${rawOutcome}`);
          return;
        }
        
        // ✅ NORMALIZE: Match prediction format (e.g., "Home HT", "Draw HT", "Away HT")
        if (prediction === 'Home HT' || prediction === 'Draw HT' || prediction === 'Away HT') {
          outcome = `${rawOutcome} HT`;
        } else {
          outcome = rawOutcome;
        }
        console.log(`   Normalized outcome: ${outcome}`);
      }
      // ========== DOUBLE CHANCE MARKETS ==========
      else if (prediction.includes('or') || pool.outcome_dc) {
        const rawOutcome = pool.outcome_dc;
        console.log(`   Market Type: DOUBLE CHANCE`);
        console.log(`   Raw outcome: ${rawOutcome}`);
        
        // ✅ NORMALIZE: Match prediction format
        outcome = rawOutcome || prediction; // Use prediction as fallback
        console.log(`   Normalized outcome: ${outcome}`);
      }
      // ========== CORRECT SCORE MARKETS ==========
      else if (prediction.match(/\d+-\d+/)) {
        const rawOutcome = pool.outcome_cs;
        console.log(`   Market Type: CORRECT SCORE`);
        console.log(`   Raw outcome: ${rawOutcome}`);
        
        // ✅ NORMALIZE: Match prediction format
        outcome = rawOutcome || prediction; // Use prediction as fallback
        console.log(`   Normalized outcome: ${outcome}`);
      }
      // ========== UNKNOWN MARKET TYPE ==========
      else {
        console.error(`❌ Unknown prediction type: "${prediction}"`);
        console.error(`   Available outcomes:`, {
          outcome_1x2: pool.outcome_1x2,
          outcome_ou25: pool.outcome_ou25,
          outcome_btts: pool.outcome_btts,
          outcome_ht_result: pool.outcome_ht_result
        });
        return;
      }

      if (!outcome) {
        console.log(`⚠️ No outcome available for pool ${pool.pool_id}`);
        return;
      }

      console.log(`   ✅ Final outcome to submit: "${outcome}"`);
      console.log(`   📤 Submitting to market_id: ${pool.market_id}`);
      
      // Submit to contract
      const resultData = ethers.toUtf8Bytes(outcome);
      const submission = await this.submitOutcomeWithRetry(pool.market_id, resultData);
      
      if (submission.success) {
        if (submission.alreadyExists) {
          console.log(`✅ Pool ${pool.pool_id}: Outcome already exists in contract, skipping database update`);
        } else {
          console.log(`✅ Pool ${pool.pool_id}: Oracle outcome submitted successfully (Block: ${submission.blockNumber})`);
          
          // Record the submission
          await db.query(`
            INSERT INTO public.oracle_submissions (match_id, oracle_address, outcome_data, submitted_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (match_id) DO NOTHING
          `, [
            pool.market_id,
            this.wallet.address,
            JSON.stringify({
              outcome: outcome,
              pool_id: pool.pool_id,
              fixture_id: pool.fixture_id,
              transaction_hash: submission.txHash,
              block_number: submission.blockNumber
            })
          ]);
        }
      } else {
        console.log(`💥 Pool ${pool.pool_id}: Failed to submit outcome to contract`);
        console.log(`🔍 Submission error details:`, {
          error: submission.error,
          errorCode: submission.errorCode,
          errorReason: submission.errorReason,
          marketId: pool.market_id,
          outcome: outcome
        });
        
        // Do NOT record failed submissions in database
        // This will allow the bot to retry next time
      }

    } catch (error) {
      console.error(`❌ Failed to resolve main pool ${pool.pool_id}:`, error);
    }
  }

  /**
   * Submit outcome to contract with retry logic
   */
  async submitOutcomeWithRetry(marketId, resultData, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Check if outcome already exists
        const [isSet, existingData] = await this.guidedOracleContract.getOutcome(marketId);
        if (isSet) {
          console.log(`✅ Outcome already exists for market ${marketId}`);
          return { success: true, alreadyExists: true, txHash: null };
        }

        const tx = await this.guidedOracleContract.submitOutcome(marketId, resultData);
        console.log(`📤 Transaction submitted: ${tx.hash}`);
        const receipt = await tx.wait();
        console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);
        return { 
          success: true, 
          txHash: tx.hash, 
          blockNumber: receipt.blockNumber,
          alreadyExists: false 
        };
      } catch (error) {
        if (attempt === maxRetries) {
          console.log(`❌ Failed to submit outcome after ${maxRetries} attempts: ${error.message}`);
          return { 
            success: false, 
            error: error.message,
            errorCode: error.code,
            errorReason: error.reason
          };
        }
        console.log(`⚠️ Submit attempt ${attempt} failed, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 2000 * attempt)); // Exponential backoff
      }
    }
  }

  /**
   * Check for football markets that need resolution
   */
  async checkAndResolveMarkets() {
    console.log('🔍 Checking for football markets needing resolution...');
    
    try {
      // Use the unified settlement system for comprehensive processing
      await this.unifiedSettlementSystem.processAllPools();
      
    } catch (error) {
      console.error('❌ Error in unified settlement processing:', error);
    }
  }

  // Keep the existing checkMainPoolsForResolution method for backward compatibility
  // but it will be called by the robust settlement manager
}

module.exports = FootballOracleBot;

