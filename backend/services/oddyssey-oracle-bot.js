require('dotenv').config();
const { ethers } = require('ethers');
const path = require('path');
const OddysseyMatchSelector = require('./oddyssey-match-selector');
const SportMonksService = require('./sportmonks');
const SchemaSyncBridge = require('./schema-sync-bridge');
const SimpleBulletproofService = require('./simple-bulletproof-service');
const Web3Service = require('./web3-service'); // 🚨 CRITICAL FIX: Import Web3Service
const db = require('../db/db');

class OddysseyOracleBot {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    this.wallet = new ethers.Wallet(process.env.BOT_PRIVATE_KEY, this.provider);
    this.sportmonksService = new SportMonksService();
    
    // Load full Oddyssey contract ABI
    try {
      // Try multiple possible paths for the ABI (Docker container paths)
      const possiblePaths = [
        './solidity/Oddyssey.json',
        '../solidity/Oddyssey.json',
        '../../solidity/Oddyssey.json',
        path.join(__dirname, '../solidity/Oddyssey.json'),
        path.join(__dirname, '../../solidity/Oddyssey.json')
      ];
      
      let abiLoaded = false;
      for (const abiPath of possiblePaths) {
        try {
          this.oddysseyABI = require(abiPath).abi;
          console.log(`✅ Oddyssey ABI loaded from: ${abiPath}`);
          abiLoaded = true;
          break;
        } catch (pathError) {
          // Continue to next path
        }
      }
      
      if (!abiLoaded) {
        throw new Error('Could not load ABI from any path');
      }
    } catch (error) {
      console.warn('⚠️ Failed to load Oddyssey ABI from artifacts, using fallback');
      // Fallback ABI (only the functions we need)
      this.oddysseyABI = [
        "function startDailyCycle((uint64,uint64,uint32,uint32,uint32,uint32,uint32,(uint8,uint8))[10] memory _matches) external",
        "function resolveDailyCycle(uint256 _cycleId, (uint8,uint8)[10] memory _results) external",
        "function dailyCycleId() external view returns (uint256)",
        "function dailyCycleEndTimes(uint256) external view returns (uint256)",
        "function isCycleResolved(uint256) external view returns (bool)",
        "function getCycleStatus(uint256 _cycleId) external view returns (bool exists, uint8 state, uint256 endTime, uint256 prizePool, uint32 cycleSlipCount, bool hasWinner)",
        "event CycleStarted(uint256 indexed cycleId, uint256 endTime)",
        "event CycleResolved(uint256 indexed cycleId, uint256 prizePool)"
      ];
    }

    const config = require('../config');
    this.oddysseyContract = new ethers.Contract(
      config.blockchain.contractAddresses.oddyssey,
      this.oddysseyABI,
      this.wallet
    );

    this.matchSelector = new OddysseyMatchSelector();
    this.sportmonksService = new SportMonksService();
    this.syncBridge = new SchemaSyncBridge();
    this.web3Service = new Web3Service(); // 🚨 CRITICAL FIX: Initialize Web3Service
    
    // ROOT CAUSE FIX: Initialize simple bulletproof service
    this.bulletproofService = new SimpleBulletproofService();
    
    this.isRunning = false;
  }

  async start() {
    if (this.isRunning) {
      console.log('✅ Oddyssey Oracle Bot is already running');
      return;
    }

    this.isRunning = true;
    console.log('🤖 Starting Oddyssey Oracle Bot...');

    try {
      // ROOT CAUSE FIX: Initialize simple bulletproof system first
      console.log('🛡️ Initializing simple bulletproof system...');
      const initResult = await this.bulletproofService.initialize();
      console.log('✅ Simple bulletproof system initialized:', initResult.message);

      // Verify contract connection (check entry fee as a simple connection test)
      const entryFee = await this.oddysseyContract.entryFee();
      console.log(`✅ Oddyssey contract connected (Entry fee: ${entryFee} wei)`);

      // Check if we need to start a new cycle today
      await this.checkAndStartNewCycle();

      // Check for cycles that need resolution
      await this.checkAndResolveCycles();

      console.log('✅ Oddyssey Oracle Bot started successfully with simple bulletproof protection');
    } catch (error) {
      console.error('❌ Failed to start Oddyssey Oracle Bot:', error);
      this.isRunning = false;
      throw error;
    }
  }

  async stop() {
    this.isRunning = false;
    console.log('⏹️ Oddyssey Oracle Bot stopped');
  }

  /**
   * Check if we need to start a new daily cycle
   */
  async checkAndStartNewCycle() {
    try {
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      
      console.log(`🔍 [${now.toISOString()}] Checking for new cycle creation for date: ${today}`);
      
      // FIXED: Check contract's current cycle ID first
      const contractCycleId = await this.oddysseyContract.dailyCycleId();
      console.log(`📊 Contract current cycle ID: ${contractCycleId}`);
      
      // CRITICAL: Use atomic transaction to prevent race conditions
      await db.query('BEGIN');
      
      try {
        // Check if we already started a cycle for today in database
        const result = await db.query(`
          SELECT cycle_id, created_at 
          FROM oracle.oddyssey_cycles 
          WHERE DATE(created_at) = $1 
          ORDER BY cycle_id DESC 
          LIMIT 1
        `, [today]);

        if (result.rows.length > 0) {
          const dbCycleId = result.rows[0].cycle_id;
          console.log(`ℹ️ [${now.toISOString()}] Database cycle for today: ${dbCycleId}`);
          
          // Check if database and contract are in sync
          if (dbCycleId.toString() === contractCycleId.toString()) {
            console.log(`✅ Database and contract are in sync (cycle ${dbCycleId})`);
            await db.query('ROLLBACK');
            return;
          } else {
            console.log(`⚠️ Database (${dbCycleId}) and contract (${contractCycleId}) are out of sync`);
            
            // Log sync issue for monitoring
            await db.query(`
              INSERT INTO oracle.cycle_health_reports (
                cycle_id, overall_health, issues_found, report_data, status, total_cycles, missing_cycles, anomalies_count
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [
              contractCycleId,
              'WARNING',
              1,
              JSON.stringify({ 
                sync_issue: { 
                  db_cycle: dbCycleId.toString(), 
                  contract_cycle: contractCycleId.toString(),
                  description: `Database cycle ${dbCycleId} != contract cycle ${contractCycleId}`,
                  severity: 'warning'
                } 
              }, (key, value) => typeof value === 'bigint' ? value.toString() : value),
              'SYNC_ISSUE',
              1,
              0,
              0
            ]);
            
            await db.query('ROLLBACK');
            return; // Don't create new cycle if there's a sync issue
          }
        }
        
        await db.query('COMMIT');
        
      } catch (error) {
        await db.query('ROLLBACK');
        throw error;
      }

      // Check if it's the right time to start (cron runs at 10:50 UTC)
      const hour = now.getUTCHours();
      const minute = now.getUTCMinutes();
      
      // FIXED: Clear time window logic for cycle creation
      // Cron job runs at 10:50 UTC, so we expect hour = 10
      // Add 5-minute buffer for potential delays
      if (hour !== 10 || minute < 45 || minute > 55) {
        console.log(`ℹ️ [${now.toISOString()}] Outside cycle creation window (${hour}:${minute} UTC), expected 10:45-10:55 UTC`);
        return;
      }

      console.log(`🚀 [${now.toISOString()}] Starting new Oddyssey cycle for today...`);
      
      try {
        await this.startNewDailyCycle();
        console.log(`✅ [${now.toISOString()}] Successfully started new cycle`);
        
      } catch (cycleError) {
        console.error(`❌ [${now.toISOString()}] Failed to start new cycle:`, cycleError);
        
        // Log cycle creation failure for monitoring
        try {
          await db.query(`
            INSERT INTO oracle.cycle_health_reports (
              cycle_id, overall_health, issues_found, report_data
            ) VALUES ($1, $2, $3, $4)
          `, [
            0,
            'CRITICAL',
            1,
            JSON.stringify({ 
              error: cycleError.message, 
              stack: cycleError.stack,
              description: `Cycle creation failed: ${cycleError.message}`,
              severity: 'critical'
            }, (key, value) => typeof value === 'bigint' ? value.toString() : value)
          ]);
        } catch (logError) {
          console.error('Failed to log cycle creation error:', logError);
        }
        
        throw cycleError;
      }

    } catch (error) {
      console.error('❌ Error in checkAndStartNewCycle:', error);
      throw error;
    }
  }

  /**
   * ROOT CAUSE FIX: Start a new daily cycle with bulletproof validation
   */
  async startNewDailyCycle() {
    try {
      // Get today's date for matches
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];

      console.log(`🛡️ [BULLETPROOF] Starting cycle creation for ${todayStr}...`);

      // Step 1: Get SportMonks fixtures for today
      let sportMonksFixtures = [];
      try {
        console.log('📡 Fetching SportMonks fixtures...');
        const fixtures = await this.sportmonksService.getFixturesForDate(todayStr);
        sportMonksFixtures = fixtures || [];
        console.log(`📥 Retrieved ${sportMonksFixtures.length} SportMonks fixtures`);
      } catch (error) {
        console.warn('⚠️ SportMonks fetch failed, will use database fallback:', error.message);
      }

      // Step 2: Create bulletproof cycle
      const cycleResult = await this.bulletproofService.createBulletproofCycle(todayStr, sportMonksFixtures);
      
      if (!cycleResult.success) {
        throw new Error(`Bulletproof cycle creation failed: ${cycleResult.errors.join(', ')}`);
      }

      console.log(`🛡️ [BULLETPROOF] Cycle ${cycleResult.cycleId} created with ${cycleResult.matchCount} validated matches`);

      // Step 3: Get matches for contract submission
      const matchesForContract = await this.getContractMatchesFromCycle(cycleResult.cycleId);
      
      if (matchesForContract.length !== 10) {
        throw new Error(`Expected 10 matches for contract, got ${matchesForContract.length}`);
      }

      // Step 4: Send to contract with bulletproof validation using explicit ABI
      console.log('📤 Sending bulletproof matches to Oddyssey contract...');
      
      // Use explicit ABI for reliable contract interaction
      const { ethers } = require('ethers');
      const OddysseyABI = require('../solidity/Oddyssey.json');
      
      const explicitContract = new ethers.Contract(
        this.oddysseyContract.target,
        OddysseyABI,
        this.wallet
      );
      
      // Estimate gas first
      const gasEstimate = await explicitContract.startDailyCycle.estimateGas(matchesForContract);
      console.log(`⛽ Gas estimate: ${gasEstimate.toString()}`);
      
      const tx = await explicitContract.startDailyCycle(matchesForContract, {
        gasLimit: gasEstimate + 500000n, // Add 500k buffer
        gasPrice: '7000000000' // 7 gwei
      });

      console.log(`⏳ Transaction sent: ${tx.hash}`);
      const receipt = await tx.wait();
      
      if (receipt.status === 1) {
        console.log('✅ Bulletproof cycle started successfully on contract!');
        
        // Step 5: Update database with transaction hash
        await this.updateCycleWithTransaction(cycleResult.cycleId, receipt);
        
        // Step 6: Sync to oddyssey schema
        const currentCycleId = await this.oddysseyContract.dailyCycleId();
        await this.syncBridge.syncCycleFromOracle(currentCycleId.toString());
        
        // Step 7: Log success event
        const event = receipt.logs.find(log => {
          try {
            const parsed = this.oddysseyContract.interface.parseLog(log);
            return parsed.name === 'CycleStarted';
          } catch {
            return false;
          }
        });

        if (event) {
          const parsedEvent = this.oddysseyContract.interface.parseLog(event);
          console.log(`🎉 [BULLETPROOF] Cycle ${parsedEvent.args.cycleId} started, betting ends at ${new Date(Number(parsedEvent.args.endTime) * 1000)}`);
        }

        // Step 8: Final verification
        const systemStatus = await this.bulletproofService.getSystemStatus();
        console.log(`🛡️ [BULLETPROOF] System status: ${systemStatus.statistics.successRate} success rate`);

      } else {
        throw new Error('Contract transaction failed');
      }

    } catch (error) {
      console.error('❌ [BULLETPROOF] Failed to start new cycle:', error);
      
      // Log detailed error for monitoring
      try {
        const systemStatus = await this.bulletproofService.getSystemStatus();
        console.error('🔍 System status at failure:', systemStatus);
      } catch (statusError) {
        console.error('❌ Could not get system status:', statusError);
      }
      
      throw error;
    }
  }

  /**
   * Get contract-formatted matches from bulletproof cycle
   */
  async getContractMatchesFromCycle(cycleId) {
    try {
      // Get matches from daily_game_matches table with team names and league
      const result = await db.query(`
        SELECT 
          dgm.fixture_id,
          dgm.home_team,
          dgm.away_team,
          dgm.league_name,
          dgm.match_date,
          dgm.home_odds,
          dgm.draw_odds,
          dgm.away_odds,
          dgm.over_25_odds,
          dgm.under_25_odds,
          dgm.display_order
        FROM oracle.daily_game_matches dgm
        WHERE dgm.cycle_id = $1
        ORDER BY dgm.display_order ASC
      `, [cycleId]);

      if (result.rows.length === 0) {
        throw new Error(`No matches found for cycle ${cycleId}`);
      }

      const matches = result.rows.map((row, index) => {
        return {
          id: BigInt(row.fixture_id),
          startTime: Math.floor(new Date(row.match_date).getTime() / 1000),
          oddsHome: Math.floor(parseFloat(row.home_odds) * 1000),
          oddsDraw: Math.floor(parseFloat(row.draw_odds) * 1000),
          oddsAway: Math.floor(parseFloat(row.away_odds) * 1000),
          oddsOver: Math.floor(parseFloat(row.over_25_odds) * 1000),
          oddsUnder: Math.floor(parseFloat(row.under_25_odds) * 1000),
          homeTeam: row.home_team,
          awayTeam: row.away_team,
          leagueName: row.league_name,
          result: {
            moneyline: 0, // NotSet
            overUnder: 0  // NotSet
          }
        };
      });

      return matches;
    } catch (error) {
      console.error('❌ Error getting contract matches from cycle:', error);
      throw error;
    }
  }

  /**
   * Update cycle with transaction details
   */
  async updateCycleWithTransaction(cycleId, receipt) {
    try {
      await db.query(`
        UPDATE oracle.oddyssey_cycles 
        SET 
          tx_hash = $2,
          updated_at = NOW()
        WHERE cycle_id = $1
      `, [
        cycleId,
        receipt.hash
      ]);

      console.log(`✅ Updated cycle ${cycleId} with transaction details`);
    } catch (error) {
      console.error('❌ Error updating cycle with transaction:', error);
      throw error;
    }
  }

  /**
   * Check for cycles that need resolution
   */
  async checkAndResolveCycles() {
    try {
      // ✅ CRITICAL FIX: Check for cycles with ready_for_resolution=true FIRST
      // This ensures cycles prepared by oddyssey-results-resolver are resolved immediately
      const readyResult = await db.query(`
        SELECT cycle_id, matches_data, cycle_end_time, resolution_data
        FROM oracle.oddyssey_cycles 
        WHERE ready_for_resolution = true 
          AND is_resolved = false
        ORDER BY cycle_id ASC
      `);
      
      if (readyResult.rows.length > 0) {
        console.log(`📋 Found ${readyResult.rows.length} cycles ready for resolution (ready_for_resolution=true)`);
        for (const cycle of readyResult.rows) {
          console.log(`🔍 Processing ready cycle ${cycle.cycle_id}...`);
          try {
            await this.resolveCycleIfReady(cycle);
          } catch (error) {
            console.error(`❌ Failed to resolve ready cycle ${cycle.cycle_id}:`, error.message);
          }
        }
        return; // ✅ Prioritize ready cycles, skip timing-based check
      }
      
      // Fallback: Get unresolved cycles that are past their end time (if no ready cycles)
      const result = await db.query(`
        SELECT cycle_id, matches_data, cycle_end_time
        FROM oracle.oddyssey_cycles 
        WHERE is_resolved = false 
          AND cycle_end_time < NOW()
        ORDER BY cycle_id ASC
      `);

      for (const cycle of result.rows) {
        console.log(`🔍 Checking cycle ${cycle.cycle_id} for resolution...`);
        
        try {
          // CRITICAL FIX: Check if cycle is already resolved on-chain FIRST before timing validation
          // This ensures we sync the database even if timing validation would fail
          const contract = await this.oddysseyContract;
          const cycleStatus = await contract.getCycleStatus(cycle.cycle_id);
          const cycleState = Number(cycleStatus.state);
          
          // CycleState enum: NotStarted(0), Active(1), Ended(2), Resolved(3)
          const CycleState = { NotStarted: 0, Active: 1, Ended: 2, Resolved: 3 };
          
          if (cycleState === CycleState.Resolved) {
            console.log(`✅ Cycle ${cycle.cycle_id} is already RESOLVED on-chain, syncing database...`);
            
            // Sync database to mark as resolved
            await db.query(`
              UPDATE oracle.oddyssey_cycles 
              SET is_resolved = true, resolved_at = NOW()
              WHERE cycle_id = $1 AND is_resolved = false
            `, [cycle.cycle_id]);
            
            console.log(`📊 Cycle ${cycle.cycle_id} database state synchronized to match contract`);
            continue; // Skip to next cycle
          }
          
          if (cycleState === CycleState.Active) {
            console.log(`⏳ Cycle ${cycle.cycle_id} is still ACTIVE on-chain, skipping (betting not ended yet)`);
            continue;
          }
          
          // NOW check if all matches have finished (FT state) before attempting resolution
          // CRITICAL: Validate match states using SportMonks API
          const canResolveByState = await this.validateMatchStateForResolution(cycle);
          if (!canResolveByState) {
            console.log(`⏳ Cycle ${cycle.cycle_id} matches haven't all finished yet (waiting for FT state)`);
            continue;
          }
          
          // For Ended state, attempt resolution
          if (cycleState === CycleState.Ended) {
            console.log(`🔧 Cycle ${cycle.cycle_id} is in ENDED state, attempting resolution...`);
            await this.resolveCycleIfReady(cycle);
          }
        } catch (error) {
          console.error(`❌ Failed to process cycle ${cycle.cycle_id}:`, error.message);
        }
      }

    } catch (error) {
      console.error('❌ Error checking cycles for resolution:', error);
    }
  }

  /**
   * Resolve a cycle if all matches are completed
   * CRITICAL: This function now validates FT states before resolving on-chain
   */
  async resolveCycleIfReady(cycle) {
    try {
      console.log(`🔧 [Cycle ${cycle.cycle_id}] Starting resolution process...`);
      
      // ✅ CRITICAL FIX: Check if cycle is already resolved on-chain FIRST
      // This prevents InvalidState errors when trying to resolve an already-resolved cycle
      const contract = await this.oddysseyContract;
      const cycleStatus = await contract.getCycleStatus(cycle.cycle_id);
      const cycleState = Number(cycleStatus.state);
      
      const CycleState = { NotStarted: 0, Active: 1, Ended: 2, Resolved: 3 };
      
      if (cycleState === CycleState.Resolved) {
        console.log(`✅ [Cycle ${cycle.cycle_id}] Already resolved on-chain! Syncing database...`);
        
        // Try to get the resolution transaction hash from events
        try {
          const filter = contract.filters.CycleResolved(cycle.cycle_id);
          const events = await contract.queryFilter(filter);
          
          if (events.length > 0) {
            const latestEvent = events[events.length - 1];
            const txHash = latestEvent.transactionHash;
            const block = await latestEvent.getBlock();
            const resolvedAt = new Date(Number(block.timestamp) * 1000);
            
            console.log(`📋 [Cycle ${cycle.cycle_id}] Found resolution tx: ${txHash}`);
            console.log(`   Resolved at: ${resolvedAt.toISOString()}`);
            
            // Update database to match on-chain state
            await db.query(`
              UPDATE oracle.oddyssey_cycles 
              SET 
                is_resolved = true, 
                resolution_tx_hash = $1, 
                resolved_at = $2,
                ready_for_resolution = false
              WHERE cycle_id = $3
            `, [txHash, resolvedAt, cycle.cycle_id]);
            
            await db.query(`
              UPDATE oracle.current_oddyssey_cycle 
              SET is_resolved = true, resolution_tx_hash = $1, resolved_at = $2
              WHERE cycle_id = $3
            `, [txHash, resolvedAt, cycle.cycle_id]);
            
            console.log(`✅ [Cycle ${cycle.cycle_id}] Database synced with on-chain state`);
          } else {
            console.log(`⚠️ [Cycle ${cycle.cycle_id}] Resolved on-chain but no CycleResolved event found`);
            // Still update database as resolved
            await db.query(`
              UPDATE oracle.oddyssey_cycles 
              SET is_resolved = true, resolved_at = NOW(), ready_for_resolution = false
              WHERE cycle_id = $1
            `, [cycle.cycle_id]);
          }
        } catch (eventError) {
          console.error(`⚠️ [Cycle ${cycle.cycle_id}] Error fetching resolution event:`, eventError.message);
          // Still update database as resolved (don't fail completely)
          await db.query(`
            UPDATE oracle.oddyssey_cycles 
            SET is_resolved = true, resolved_at = NOW(), ready_for_resolution = false
            WHERE cycle_id = $1
          `, [cycle.cycle_id]);
        }
        
        return true; // Already resolved, skip resolution attempt
      }
      
      // ✅ CRITICAL FIX: Use prepared resolution_data if available (from oddyssey-results-resolver)
      let formattedResults;
      let results = null; // Will be set if we fetch from database
      // Parse resolution_data if it's a JSON string
      let resolutionData = cycle.resolution_data;
      if (typeof resolutionData === 'string') {
        try {
          resolutionData = JSON.parse(resolutionData);
        } catch (parseError) {
          console.warn(`⚠️ [Cycle ${cycle.cycle_id}] Failed to parse resolution_data as JSON:`, parseError.message);
          resolutionData = null;
        }
      }
      
      if (resolutionData && typeof resolutionData === 'object' && resolutionData.formattedResults) {
        console.log(`✅ [Cycle ${cycle.cycle_id}] Using prepared resolution data from oddyssey-results-resolver`);
        formattedResults = resolutionData.formattedResults;
        
        // Validate formatted results
        if (!Array.isArray(formattedResults) || formattedResults.length !== 10) {
          throw new Error(`Invalid formattedResults: expected array of 10, got ${formattedResults?.length || 0}`);
        }
        
        // Validate each result has moneyline and overUnder
        const invalidResults = formattedResults.filter(r => 
          typeof r.moneyline !== 'number' || 
          typeof r.overUnder !== 'number' ||
          r.moneyline < 0 || r.moneyline > 3 ||
          r.overUnder < 0 || r.overUnder > 2
        );
        
        if (invalidResults.length > 0) {
          console.error(`❌ [Cycle ${cycle.cycle_id}] Invalid formatted results found:`, invalidResults);
          throw new Error(`Invalid formatted results for cycle ${cycle.cycle_id}`);
        }
        
        console.log(`✅ [Cycle ${cycle.cycle_id}] Prepared results validated:`, formattedResults);
        
        // ✅ CRITICAL FIX: Check contract state BEFORE attempting resolution (even with prepared data)
        // Note: We'll check contract state again right before submission for final validation
        
        // ✅ Use matchResults from resolution_data if available (for updateCycleMatchResults)
        if (resolutionData.matchResults && Array.isArray(resolutionData.matchResults)) {
          results = resolutionData.matchResults;
          console.log(`✅ [Cycle ${cycle.cycle_id}] Using prepared matchResults for database update`);
        }
      } else {
        // Fallback: Get results from database if no prepared data
        console.log(`⚠️ [Cycle ${cycle.cycle_id}] No prepared data, fetching results from database...`);
        
        // CRITICAL: First validate that all matches have FT state
        // This prevents on-chain resolution with incomplete matches
        const canResolveByState = await this.validateMatchStateForResolution(cycle);
        if (!canResolveByState) {
          console.log(`⏳ [Cycle ${cycle.cycle_id}] Cannot resolve - matches not all finished (FT state)`);
          return;
        }
        
        // Handle both old and new data formats
        let matchIds;
        if (cycle.match_ids) {
          // Old format: JSON string
          matchIds = JSON.parse(cycle.match_ids);
        } else if (cycle.matches_data) {
          // New format: JSONB object - extract IDs from match objects
          if (Array.isArray(cycle.matches_data)) {
            matchIds = cycle.matches_data.map(match => match.id);
          } else {
            matchIds = cycle.matches_data;
          }
        } else {
          throw new Error(`No match data found for cycle ${cycle.cycle_id}`);
        }
        
        // Ensure matchIds is an array
        if (!Array.isArray(matchIds)) {
          throw new Error(`Invalid match data format for cycle ${cycle.cycle_id}`);
        }
        
        // Check if all matches have results in database
        const results = await this.getMatchResults(matchIds);
        
        console.log(`🔍 [Cycle ${cycle.cycle_id}] Database query returned ${results.length} results`);
        
        if (results.length !== 10) {
          console.log(`⏳ Cycle ${cycle.cycle_id}: Only ${results.length}/10 matches have database results, waiting...`);
          console.log(`   Missing results for ${10 - results.length} matches`);
          return;
        }
        
        // 🚨 CRITICAL: Additional validation - check each result has valid data
        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          if (!r.matchId) {
            console.error(`❌ [Cycle ${cycle.cycle_id}] Result ${i} missing matchId`);
            return;
          }
          if (!r.result1x2 || r.result1x2 === 'null' || r.result1x2 === 'undefined') {
            console.error(`❌ [Cycle ${cycle.cycle_id}] Result ${i} (match ${r.matchId}) has invalid result1x2: "${r.result1x2}"`);
            return;
          }
          if (!r.resultOU25 || r.resultOU25 === 'null' || r.resultOU25 === 'undefined') {
            console.error(`❌ [Cycle ${cycle.cycle_id}] Result ${i} (match ${r.matchId}) has invalid resultOU25: "${r.resultOU25}"`);
            return;
          }
        }
        
        console.log(`✅ [Cycle ${cycle.cycle_id}] All 10 results validated:`);
        results.forEach((r, i) => {
          console.log(`   ${i + 1}. Match ${r.matchId}: ${r.result1x2} / ${r.resultOU25}`);
        });
        
        // CRITICAL: Verify that NO results are NotSet before submitting to blockchain
        // Check for missing or invalid string values (NOT numeric values anymore)
        const hasNotSetResults = results.some(r => 
          !r.result1x2 || !r.resultOU25 || 
          r.result1x2 === 'NotSet' || r.resultOU25 === 'NotSet'
        );
        
        if (hasNotSetResults) {
          console.error(`❌ [Cycle ${cycle.cycle_id}] BLOCKING RESOLUTION: Some results are NotSet or missing!`);
          console.error(`   Results:`, results.map(r => `${r.result1x2}/${r.resultOU25}`).join(', '));
          throw new Error(`Cannot resolve cycle ${cycle.cycle_id}: contains NotSet or missing results`);
        }

        console.log(`✅ All matches validated and resolved for cycle ${cycle.cycle_id}, submitting to blockchain...`);

        // Format results for contract using Web3Service (it handles conversion from strings to enums)
        formattedResults = this.web3Service.formatResultsForContract(results);
      }

      // ✅ CRITICAL FIX: Check contract state BEFORE gas estimation (avoid wasting gas on reverts)
      // Note: contract is already declared at line 529, just reuse it
      console.log(`🔍 [Cycle ${cycle.cycle_id}] Final contract state check before resolution...`);
      const finalContractState = await contract.getCycleStatus(cycle.cycle_id);
      const finalCycleState = Number(finalContractState.state);
      const finalCycleEndTime = Number(finalContractState.endTime);
      const currentBlockTime = Math.floor(Date.now() / 1000);
      
      console.log(`📊 [Cycle ${cycle.cycle_id}] Contract state check:`);
      console.log(`   • State: ${finalCycleState} (0=NotStarted, 1=Active, 2=Ended, 3=Resolved)`);
      console.log(`   • EndTime: ${new Date(finalCycleEndTime * 1000).toISOString()}`);
      console.log(`   • Current time: ${new Date(currentBlockTime * 1000).toISOString()}`);
      console.log(`   • Time since end: ${currentBlockTime - finalCycleEndTime} seconds`);
      
      // Note: CycleState is already declared at line 533 in the early check, reuse it here
      // CycleState is still in scope since we're in the same function
      
      if (finalCycleState === CycleState.Resolved) {
        console.log(`✅ [Cycle ${cycle.cycle_id}] Already resolved on-chain, updating database...`);
        await db.query(`
          UPDATE oracle.oddyssey_cycles 
          SET is_resolved = true, resolved_at = NOW(), ready_for_resolution = false
          WHERE cycle_id = $1 AND is_resolved = false
        `, [cycle.cycle_id]);
        return true;
      }
      
      if (finalCycleState === CycleState.Active) {
        console.log(`⏳ [Cycle ${cycle.cycle_id}] Still ACTIVE - must wait for betting to end`);
        console.log(`   Block time ${currentBlockTime} must be > cycle.endTime ${finalCycleEndTime}`);
        console.log(`   Wait ${finalCycleEndTime - currentBlockTime} more seconds`);
        return false;
      }
      
      if (finalCycleState !== CycleState.Ended) {
        console.log(`❌ [Cycle ${cycle.cycle_id}] Invalid contract state: ${finalCycleState} (expected Ended=2)`);
        return false;
      }
      
      // ✅ CRITICAL: Check timing requirement from contract
      if (currentBlockTime <= finalCycleEndTime) {
        console.log(`⏳ [Cycle ${cycle.cycle_id}] Contract requires block.timestamp > cycle.endTime`);
        console.log(`   Current: ${currentBlockTime}, Required: > ${finalCycleEndTime}`);
        console.log(`   Wait ${finalCycleEndTime - currentBlockTime + 1} more seconds`);
        return false;
      }
      
      // ✅ CRITICAL: Check latest match end time (start + 105 minutes)
      let latestMatchEndTime = 0;
      const cycleMatches = await contract.dailyMatches(cycle.cycle_id);
      for (let i = 0; i < 10; i++) {
        const matchStartTime = Number(cycleMatches[i].startTime);
        const matchEndTime = matchStartTime + 6300; // 105 minutes
        if (matchEndTime > latestMatchEndTime) {
          latestMatchEndTime = matchEndTime;
        }
      }
      
      console.log(`   • Latest match end time: ${new Date(latestMatchEndTime * 1000).toISOString()}`);
      console.log(`   • Time since latest match end: ${currentBlockTime - latestMatchEndTime} seconds`);
      
      if (currentBlockTime < latestMatchEndTime) {
        console.log(`⏳ [Cycle ${cycle.cycle_id}] Contract requires block.timestamp >= latestMatchEndTime`);
        console.log(`   Current: ${currentBlockTime}, Required: >= ${latestMatchEndTime}`);
        console.log(`   Wait ${latestMatchEndTime - currentBlockTime} more seconds`);
        return false;
      }
      
      console.log(`✅ [Cycle ${cycle.cycle_id}] All contract validations passed - proceeding to resolution`);
      
      // Estimate gas first
      const gasEstimate = await this.oddysseyContract.resolveDailyCycle.estimateGas(cycle.cycle_id, formattedResults);
      console.log(`⛽ Gas estimate: ${gasEstimate.toString()}`);
      
      // Submit to contract with proper gas limit
      const tx = await this.oddysseyContract.resolveDailyCycle(cycle.cycle_id, formattedResults, {
        gasLimit: gasEstimate + 200000n // Add 200k buffer
      });

      console.log(`⏳ Resolution transaction sent: ${tx.hash}`);
      const receipt = await tx.wait();

      if (receipt.status === 1) {
        console.log(`🎉 Cycle ${cycle.cycle_id} resolved successfully on-chain!`);
        console.log(`📋 Transaction hash: ${tx.hash}`);
        
        // ✅ CRITICAL FIX: Wrap database updates in try-catch to prevent failures from blocking resolution
        // Even if database update fails, the on-chain resolution is complete and can be synced later
        try {
          // First, update matches_data with actual results (if available)
          if (results && Array.isArray(results) && results.length > 0) {
            await this.updateCycleMatchResults(cycle.cycle_id, results);
            console.log(`✅ [Cycle ${cycle.cycle_id}] Matches data updated`);
          } else {
            console.log(`ℹ️ [Cycle ${cycle.cycle_id}] Skipping match results update (results not available)`);
          }
          
          // Update database - BOTH cycle tables for consistency
          await db.query(`
            UPDATE oracle.oddyssey_cycles 
            SET 
              is_resolved = true, 
              resolution_tx_hash = $1, 
              resolved_at = NOW(),
              ready_for_resolution = false
            WHERE cycle_id = $2
          `, [tx.hash, cycle.cycle_id]);
          console.log(`✅ [Cycle ${cycle.cycle_id}] oracle.oddyssey_cycles updated`);

          // Also update current_oddyssey_cycle to maintain consistency
          await db.query(`
            UPDATE oracle.current_oddyssey_cycle 
            SET is_resolved = true, resolution_tx_hash = $1, resolved_at = NOW()
            WHERE cycle_id = $2
          `, [tx.hash, cycle.cycle_id]);
          console.log(`✅ [Cycle ${cycle.cycle_id}] oracle.current_oddyssey_cycle updated`);

          // Sync resolution to oddyssey schema
          await this.syncBridge.syncCycleResolution(cycle.cycle_id);
          console.log(`✅ [Cycle ${cycle.cycle_id}] Database fully synced`);
          
          // Publish to Somnia Data Streams
          try {
            const somniaDataStreams = require('./somnia-data-streams-service');
            const cycleResult = await db.query(`
              SELECT prize_pool, matches_count 
              FROM oracle.oddyssey_cycles 
              WHERE cycle_id = $1
            `, [cycle.cycle_id]);
            
            if (cycleResult.rows.length > 0) {
              const cycleData = cycleResult.rows[0];
              const slipCountResult = await db.query(`
                SELECT COUNT(*) as total_slips
                FROM oracle.oddyssey_slips
                WHERE cycle_id = $1
              `, [cycle.cycle_id]);
              
              await somniaDataStreams.publishCycleResolved(
                cycle.cycle_id,
                cycleData.prize_pool || 0,
                parseInt(slipCountResult.rows[0]?.total_slips || 0),
                Math.floor(Date.now() / 1000),
                'resolved'
              );
            }
          } catch (sdsError) {
            console.warn(`⚠️ Failed to publish cycle resolved to SDS (non-critical):`, sdsError.message);
          }
          
          // ✅ CRITICAL: Broadcast WebSocket update for Live Activity feed
          try {
            const wsService = require('./websocket-service');
            wsService.broadcastCycleResolved({
              cycleId: cycle.cycle_id.toString(),
              prizePool: (cycleData.prize_pool || 0).toString(),
              totalSlips: parseInt(slipCountResult.rows[0]?.total_slips || 0),
              timestamp: Date.now(),
              status: 'resolved'
            });
            console.log(`📡 WebSocket cycle:resolved broadcast sent for cycle ${cycle.cycle_id}`);
          } catch (wsError) {
            console.warn(`⚠️ WebSocket broadcast failed (non-critical):`, wsError.message);
          }
          
        } catch (dbError) {
          // ❌ CRITICAL: Database update failed, but on-chain resolution succeeded!
          // Don't throw - the cycle IS resolved on-chain, and the early check will sync DB on next run
          console.error(`⚠️ [Cycle ${cycle.cycle_id}] Database update FAILED after successful on-chain resolution!`);
          console.error(`   Error: ${dbError.message}`);
          console.error(`   Transaction hash: ${tx.hash}`);
          console.error(`   ⚠️ WARNING: Database is OUT OF SYNC with on-chain state!`);
          console.error(`   ✅ FIX: The early check at start of resolveCycleIfReady will sync on next run`);
          console.error(`   ⚠️ For now, cycle ${cycle.cycle_id} is resolved on-chain but DB shows is_resolved=false`);
          
          // Don't throw - the resolution succeeded on-chain, that's what matters
          // The early check I added will catch this on next run and sync the database
        }
        
      } else {
        throw new Error('Resolution transaction failed');
      }

    } catch (error) {
      console.error(`❌ Failed to resolve cycle ${cycle.cycle_id}:`, error);
      throw error;
    }
  }

  /**
   * Get match results from database
   */
  async getMatchResults(matchIds) {
    const results = [];
    
    for (const matchId of matchIds) {
      // 🚨 CRITICAL FIX: Get actual match results with scores
      const result = await db.query(`
        SELECT 
          f.id as fixture_id,
          f.status,
          f.match_date,
          f.home_team,
          f.away_team,
          fr.outcome_1x2,
          fr.outcome_ou25,
          fr.home_score,
          fr.away_score,
          fr.finished_at
        FROM oracle.fixtures f
        LEFT JOIN oracle.fixture_results fr ON f.id::VARCHAR = fr.fixture_id::VARCHAR
        WHERE f.id = $1
      `, [matchId]);

      if (result.rows.length > 0) {
        const match = result.rows[0];
        
        // 🚨 CRITICAL: Calculate results from scores if outcomes are missing
        let outcome1x2 = match.outcome_1x2;
        let outcomeOU25 = match.outcome_ou25;
        
        // If we have scores but no outcomes, calculate them
        if (match.home_score !== null && match.away_score !== null) {
          if (!outcome1x2) {
            if (match.home_score > match.away_score) {
              outcome1x2 = 'Home';
            } else if (match.home_score < match.away_score) {
              outcome1x2 = 'Away';
            } else {
              outcome1x2 = 'Draw';
            }
          }
          
          if (!outcomeOU25) {
            const totalGoals = match.home_score + match.away_score;
            outcomeOU25 = totalGoals > 2.5 ? 'Over' : 'Under';
          }
        }
        
        // 🚨 CRITICAL: Only include matches that have actual results
        if (outcome1x2 && outcomeOU25 && 
            outcome1x2 !== 'null' && outcomeOU25 !== 'null' &&
            outcome1x2 !== 'undefined' && outcomeOU25 !== 'undefined') {
          
          console.log(`✅ Match ${matchId}: ${outcome1x2}/${outcomeOU25} (${match.home_score}-${match.away_score})`);
          
          results.push({
            matchId: match.fixture_id,
            result1x2: outcome1x2,    // ← Keep as 'Home'/'Draw'/'Away' string
            resultOU25: outcomeOU25,  // ← Keep as 'Over'/'Under' string
            home_score: match.home_score,
            away_score: match.away_score,
            finished_at: match.finished_at
          });
        } else {
          console.log(`⏳ Match ${matchId}: No results yet (status: ${match.status}, 1x2: ${outcome1x2}, OU: ${outcomeOU25})`);
        }
      } else {
        console.log(`❌ Match ${matchId}: Not found in database`);
      }
    }

    return results;
  }

  /**
   * Store cycle data in database for tracking
   */
  async storeCycleData(receipt, selectedMatches, summary) {
    try {
      const cycleId = await this.oddysseyContract.dailyCycleId();
      const matchIds = selectedMatches.map(m => m.fixtureId);
      const endTime = Math.min(...selectedMatches.map(m => m.matchDate.getTime())) - 60000; // 1 min before earliest match

      await db.query(`
        INSERT INTO oracle.oddyssey_cycles (
          cycle_id, matches_data, tx_hash, cycle_end_time
        ) VALUES ($1, $2, $3, $4)
        ON CONFLICT (cycle_id) DO UPDATE SET
          matches_data = EXCLUDED.matches_data,
          tx_hash = EXCLUDED.tx_hash,
          cycle_end_time = EXCLUDED.cycle_end_time
      `, [
        cycleId.toString(),
        JSON.stringify(matchIds, (key, value) => typeof value === 'bigint' ? value.toString() : value),
        receipt.hash,
        new Date(endTime)
      ]);

      console.log(`💾 Stored cycle ${cycleId} data in database`);

    } catch (error) {
      console.warn('⚠️ Failed to store cycle data:', error);
    }
  }

  /**
   * Get status of current operations
   */
  async getStatus() {
    try {
      const currentCycleId = await this.oddysseyContract.dailyCycleId();
      const endTime = await this.oddysseyContract.dailyCycleEndTimes(currentCycleId);
      const isResolved = await this.oddysseyContract.isCycleResolved(currentCycleId);

      return {
        isRunning: this.isRunning,
        currentCycleId: currentCycleId.toString(),
        cycleEndTime: new Date(Number(endTime) * 1000),
        isCurrentCycleResolved: isResolved,
        walletAddress: this.wallet.address,
        contractAddress: this.oddysseyContract.target
      };

    } catch (error) {
      return {
        isRunning: this.isRunning,
        error: error.message
      };
    }
  }

  /**
   * 🚨 CRITICAL FIX: Update cycle matches_data with actual match results
   */
  async updateCycleMatchResults(cycleId, matchResults) {
    try {
      console.log(`🔄 Updating matches_data for cycle ${cycleId} with actual results...`);
      
      // Get current cycle data
      const cycleQuery = `SELECT matches_data FROM oracle.oddyssey_cycles WHERE cycle_id = $1`;
      const cycleResult = await db.query(cycleQuery, [cycleId]);
      
      if (cycleResult.rows.length === 0) {
        throw new Error(`Cycle ${cycleId} not found`);
      }
      
      const currentMatchesData = cycleResult.rows[0].matches_data;
      
      // 🚨 CRITICAL FIX: Update matches_data with actual results from database
      const updatedMatchesData = currentMatchesData.map(match => {
        const result = matchResults.find(r => r.matchId === match.id);
        if (result) {
          console.log(`✅ Updating match ${match.id} with results: ${result.result1x2}/${result.resultOU25}`);
          
          // 🚨 CRITICAL: Store actual results in the format expected by frontend
          return {
            ...match,
            result: {
              // Store both formats for compatibility
              moneyline: result.result1x2,  // For contract compatibility
              overUnder: result.resultOU25, // For contract compatibility
              // Frontend format
              outcome_1x2: result.result1x2,
              outcome_ou25: result.resultOU25,
              home_score: result.home_score || null,
              away_score: result.away_score || null,
              finished_at: new Date().toISOString()
            }
          };
        }
        return match;
      });
      
      // Update BOTH cycle tables with the updated matches_data
      const updateQuery = `
        UPDATE oracle.oddyssey_cycles 
        SET matches_data = $1, updated_at = NOW()
        WHERE cycle_id = $2
      `;
      
      const updateCurrentQuery = `
        UPDATE oracle.current_oddyssey_cycle 
        SET matches_data = $1, updated_at = NOW()
        WHERE cycle_id = $2
      `;
      
      await db.query(updateQuery, [JSON.stringify(updatedMatchesData), cycleId]);
      await db.query(updateCurrentQuery, [JSON.stringify(updatedMatchesData), cycleId]);
      
      console.log(`✅ Updated matches_data for cycle ${cycleId} in both tables with actual results`);
      
      // 🚨 CRITICAL: Also update the fixture_results table with actual scores
      for (const result of matchResults) {
        if (result.home_score !== null && result.away_score !== null) {
          await db.query(`
            INSERT INTO oracle.fixture_results (
              fixture_id, home_score, away_score, outcome_1x2, outcome_ou25, finished_at, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
            ON CONFLICT (fixture_id) DO UPDATE SET
              home_score = EXCLUDED.home_score,
              away_score = EXCLUDED.away_score,
              outcome_1x2 = EXCLUDED.outcome_1x2,
              outcome_ou25 = EXCLUDED.outcome_ou25,
              finished_at = EXCLUDED.finished_at,
              updated_at = NOW()
          `, [
            result.matchId,
            result.home_score,
            result.away_score,
            result.result1x2,
            result.resultOU25,
            new Date().toISOString()
          ]);
          
          console.log(`✅ Updated fixture_results for match ${result.matchId}: ${result.home_score}-${result.away_score} (${result.result1x2}/${result.resultOU25})`);
        }
      }
      
    } catch (error) {
      console.error(`❌ Failed to update matches_data for cycle ${cycleId}:`, error);
      throw error;
    }
  }

  /**
   * Manual cycle start (for testing/admin)
   */
  async manualStartCycle(targetDate = null) {
    console.log('🔧 Manual cycle start triggered...');
    await this.startNewDailyCycle(targetDate);
  }

  /**
   * Manual cycle resolution (for testing/admin)
   */
  async manualResolveCycle(cycleId) {
    console.log(`🔧 Manual resolution triggered for cycle ${cycleId}...`);
    
    const result = await db.query(`
      SELECT cycle_id, matches_data, cycle_end_time
      FROM oracle.oddyssey_cycles 
      WHERE cycle_id = $1
    `, [cycleId]);

    if (result.rows.length === 0) {
      throw new Error(`Cycle ${cycleId} not found`);
    }

    await this.resolveCycleIfReady(result.rows[0]);
  }

  /**
   * Validate that all matches have finished (FT state) using SportMonks API
   * This is the proper way to check if matches are ready for resolution
   */
  async validateMatchStateForResolution(cycle) {
    try {
      // Extract match data
      const matchData = cycle.matches_data;
      if (!matchData || !Array.isArray(matchData)) {
        console.log(`❌ [Cycle ${cycle.cycle_id}] No match data available, BLOCKING resolution`);
        return false; // FIXED: Block resolution if no match data
      }

      // Get fixture IDs from match data
      const fixtureIds = matchData.map(match => {
        if (typeof match === 'string') {
          return match;
        } else if (typeof match === 'object' && match.id) {
          return match.id;
        }
        return null;
      }).filter(id => id);

      if (fixtureIds.length === 0) {
        console.log(`❌ [Cycle ${cycle.cycle_id}] No fixture IDs found, BLOCKING resolution`);
        return false; // FIXED: Block resolution if no fixture IDs
      }
      
      if (fixtureIds.length !== 10) {
        console.log(`❌ [Cycle ${cycle.cycle_id}] Expected 10 fixtures, found ${fixtureIds.length}, BLOCKING resolution`);
        return false; // FIXED: Require exactly 10 matches
      }

      console.log(`🔍 [Cycle ${cycle.cycle_id}] Checking state for ${fixtureIds.length} matches...`);

      // Check current status in database first
      const dbStatusQuery = `
        SELECT 
          f.id,
          f.home_team,
          f.away_team,
          f.status,
          f.match_date
        FROM oracle.fixtures f
        WHERE f.id = ANY($1)
        ORDER BY f.match_date DESC
      `;

      const dbResult = await db.query(dbStatusQuery, [fixtureIds]);
      const fixtures = dbResult.rows;

      let finishedCount = 0;
      let inPlayCount = 0;
      let notStartedCount = 0;

      // Count current states
      for (const fixture of fixtures) {
        const status = fixture.status?.toUpperCase() || 'UNKNOWN';
        
        if (['FT', 'AET', 'FT_PEN'].includes(status)) {
          finishedCount++;
        } else if (['INPLAY_1ST_HALF', 'INPLAY_2ND_HALF', 'INPLAY_ET', 'INPLAY_PENALTIES', 'HT'].includes(status)) {
          inPlayCount++;
        } else {
          notStartedCount++;
        }
      }

      console.log(`📊 [Cycle ${cycle.cycle_id}] Match states:`);
      console.log(`   • Finished (FT/AET/FT_PEN): ${finishedCount}/${fixtures.length}`);
      console.log(`   • In-play: ${inPlayCount}/${fixtures.length}`);
      console.log(`   • Not started/Other: ${notStartedCount}/${fixtures.length}`);

      // 🚨 CRITICAL: Only allow resolution if ALL matches are finished
      if (finishedCount === fixtures.length) {
        console.log(`✅ [Cycle ${cycle.cycle_id}] All matches finished - ready for resolution`);
        return true;
      } else {
        console.log(`❌ [Cycle ${cycle.cycle_id}] BLOCKING resolution: ${fixtures.length - finishedCount} matches not finished yet`);
        return false;
      }

      // If there are in-play matches, update their states from SportMonks
      if (inPlayCount > 0 || notStartedCount > 0) {
        console.log(`🔄 [Cycle ${cycle.cycle_id}] Updating match states from SportMonks API...`);
        
        let updatedFinishedCount = finishedCount;
        
        for (const fixture of fixtures) {
          const status = fixture.status?.toUpperCase() || 'UNKNOWN';
          
          // Skip already finished matches
          if (['FT', 'AET', 'FT_PEN'].includes(status)) {
            continue;
          }

          try {
            // Fetch current state from SportMonks
            const response = await this.sportmonksService.axios.get(`/fixtures/${fixture.id}`, {
              params: {
                'api_token': this.sportmonksService.apiToken,
                'include': 'state'
              }
            });

            const fixtureData = response.data.data;
            const currentState = fixtureData.state?.state?.toUpperCase() || 'UNKNOWN';
            
            console.log(`   📍 ${fixture.home_team} vs ${fixture.away_team}: ${fixture.status} → ${currentState}`);

            // Update database if state changed
            if (currentState !== fixture.status) {
              await db.query(`
                UPDATE oracle.fixtures 
                SET status = $1, updated_at = NOW() 
                WHERE id = $2
              `, [currentState, fixture.id]);
            }

            // Check if match is now finished
            if (['FT', 'AET', 'FT_PEN'].includes(currentState)) {
              updatedFinishedCount++;
            }

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 200));

          } catch (error) {
            console.warn(`⚠️  Failed to update state for fixture ${fixture.id}:`, error.message);
          }
        }

        console.log(`📊 [Cycle ${cycle.cycle_id}] Updated states: ${updatedFinishedCount}/${fixtures.length} finished`);

        // Check if all matches are now finished
        if (updatedFinishedCount === fixtures.length) {
          console.log(`✅ [Cycle ${cycle.cycle_id}] All matches now finished - ready for resolution`);
          return true;
        }
      }

      // Not all matches are finished yet
      const remainingMatches = fixtures.length - finishedCount;
      console.log(`⏳ [Cycle ${cycle.cycle_id}] Cannot resolve yet - ${remainingMatches} matches still pending completion`);
      
      // Show which matches are still pending
      for (const fixture of fixtures) {
        const status = fixture.status?.toUpperCase() || 'UNKNOWN';
        if (!['FT', 'AET', 'FT_PEN'].includes(status)) {
          console.log(`   ⏳ ${fixture.home_team} vs ${fixture.away_team}: ${status}`);
        }
      }

      return false;

    } catch (error) {
      console.error(`❌ Error validating match states for cycle ${cycle.cycle_id}:`, error);
      // 🚨 CRITICAL FIX: NEVER allow resolution on error - this causes premature resolution!
      // If we can't validate match states, we MUST block resolution for safety
      console.error(`🚫 BLOCKING resolution due to validation error - safety first!`);
      return false; // FIXED: Block resolution on error to prevent premature resolution
    }
  }

  /**
   * 🚨 CRITICAL FIX: UTC-based timing validation to prevent premature resolution
   * This function ensures cycles are only resolved after all matches have finished
   */
  async validateMatchTimingForResolution(cycle) {
    // 🚨 CRITICAL: Force UTC timezone for all calculations
    const originalTZ = process.env.TZ;
    process.env.TZ = 'UTC';
    
    try {
      
      // Extract match data
      const matchData = cycle.matches_data;
      if (!matchData || !Array.isArray(matchData)) {
        console.log(`❌ [Cycle ${cycle.cycle_id}] No match data available, BLOCKING resolution`);
        return false; // 🚨 CRITICAL: Block resolution if no match data
      }

      // Get fixture IDs from match data
      const fixtureIds = matchData.map(match => {
        if (typeof match === 'string') {
          return match;
        } else if (typeof match === 'object' && match.id) {
          return match.id;
        }
        return null;
      }).filter(id => id);

      if (fixtureIds.length === 0) {
        console.log(`❌ [Cycle ${cycle.cycle_id}] No fixture IDs found, BLOCKING resolution`);
        return false; // 🚨 CRITICAL: Block resolution if no fixture IDs
      }

      // 🚨 CRITICAL: Get latest match start time using UTC
      const matchQuery = `
        SELECT 
          MAX(f.match_date) as latest_match_start_time
        FROM oracle.fixtures f
        WHERE f.id = ANY($1)
      `;

      const result = await db.query(matchQuery, [fixtureIds]);
      const latestMatchStartTime = result.rows[0]?.latest_match_start_time;

      if (!latestMatchStartTime) {
        console.log(`❌ [Cycle ${cycle.cycle_id}] Cannot determine match time, BLOCKING resolution`);
        return false; // 🚨 CRITICAL: Block resolution if can't determine match time
      }

      // 🚨 CRITICAL: All time calculations in UTC
      const now = new Date(); // This will be UTC due to TZ=UTC
      const matchStart = new Date(latestMatchStartTime);
      const MATCH_DURATION_MS = 105 * 60 * 1000; // 105 minutes (90 + 15 extra time)
      const earliestResolutionTime = new Date(matchStart.getTime() + MATCH_DURATION_MS);

      console.log(`⏱️  [Cycle ${cycle.cycle_id}] UTC Match timing validation:`);
      console.log(`   • Latest match start (UTC): ${matchStart.toISOString()}`);
      console.log(`   • Earliest resolution allowed (UTC): ${earliestResolutionTime.toISOString()}`);
      console.log(`   • Current time (UTC): ${now.toISOString()}`);
      console.log(`   • Timezone: ${process.env.TZ || 'Not set'}`);

      if (now.getTime() < earliestResolutionTime.getTime()) {
        const minutesUntil = Math.ceil((earliestResolutionTime.getTime() - now.getTime()) / (60 * 1000));
        const minutesSinceStart = Math.round((now.getTime() - matchStart.getTime()) / (60 * 1000));
        console.log(`❌ [Cycle ${cycle.cycle_id}] BLOCKING resolution - must wait ${minutesUntil} more minutes`);
        console.log(`   Latest match started ${minutesSinceStart} minutes ago, needs ${105 - minutesSinceStart} more minutes`);
        return false;
      }

      const minutesPastAllowed = Math.round((now.getTime() - earliestResolutionTime.getTime()) / (60 * 1000));
      console.log(`✅ [Cycle ${cycle.cycle_id}] UTC timing validation passed - ${minutesPastAllowed} minutes past minimum resolution time`);
      return true;

    } catch (error) {
      console.error(`⚠️  Error validating match timing for cycle ${cycle.cycle_id}:`, error);
      return false; // 🚨 CRITICAL FIX: BLOCK resolution on error to prevent premature resolution
    } finally {
      // Restore original timezone
      if (originalTZ) {
        process.env.TZ = originalTZ;
      } else {
        delete process.env.TZ;
      }
    }
  }
}

module.exports = OddysseyOracleBot; 