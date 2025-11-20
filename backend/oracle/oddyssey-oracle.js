const { ethers } = require('ethers');
const db = require('../db/db');
const OddysseyManager = require('../services/oddyssey-manager');
const Web3Service = require('../services/web3-service');
const config = require('../config');

class OddysseyOracle {
  constructor() {
    this.web3Service = new Web3Service();
    this.oddysseyManager = new OddysseyManager();
    this.oddysseyContract = null;
    this.guidedOracle = null;
    this.isInitialized = false;
  }

  async initialize() {
    try {
      console.log('🔧 Initializing Oddyssey Oracle...');
      
      // Check if Oracle private key is configured
      if (!process.env.ORACLE_SIGNER_PRIVATE_KEY) {
        throw new Error('Oracle private key not configured');
      }
      
      // Initialize services
      await this.oddysseyManager.initialize();
      this.oddysseyContract = await this.web3Service.getOddysseyContract();
      this.guidedOracle = await this.web3Service.getGuidedOracleContract();
      
      // Check if backend is oracle
      const oracle = await this.oddysseyContract.oracle();
      const backendAddress = this.web3Service.getWalletAddress();
      
      if (oracle !== backendAddress) {
        console.warn('⚠️ Backend is not set as oracle in contract');
        console.warn(`Contract oracle: ${oracle}`);
        console.warn(`Backend address: ${backendAddress}`);
      } else {
        console.log('✅ Backend is set as oracle');
      }
      
      this.isInitialized = true;
      console.log('✅ Oddyssey Oracle initialized');
      
    } catch (error) {
      console.error('❌ Failed to initialize Oddyssey Oracle:', error);
      throw error;
    }
  }

  /**
   * Start a new Oddyssey cycle using backend match selection
   */
  async startNewCycle() {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      console.log('🎯 Starting new Oddyssey cycle...');
      
      // Use backend match selection logic
      const matches = await this.oddysseyManager.getDailyMatches();
      
      if (matches.length < 10) {
        console.error(`❌ Not enough matches (${matches.length}/10) to start cycle`);
        return false;
      }

      console.log(`📊 Selected ${matches.length} matches for new cycle`);
      
      // Format matches for contract
      const formattedMatches = this.formatMatchesForContract(matches);
      
      // Start cycle on contract
      const tx = await this.oddysseyContract.startDailyCycle(formattedMatches);
      console.log(`🚀 Cycle start transaction: ${tx.hash}`);
      
      await tx.wait();
      console.log('✅ Cycle started successfully');
      
      // Save to database
      await this.saveCycleToDatabase(matches);
      
      return true;
      
    } catch (error) {
      console.error('❌ Failed to start new cycle:', error);
      return false;
    }
  }

  /**
   * Resolve current Oddyssey cycle - FIXED TO CHECK ready_for_resolution
   */
  async resolveCurrentCycle() {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      console.log('🏁 Checking for cycles ready for resolution...');
      
      // CRITICAL FIX: Check for ANY cycle with ready_for_resolution=true
      const readyCycles = await db.query(`
        SELECT cycle_id, resolution_data, matches_data
        FROM oracle.oddyssey_cycles
        WHERE ready_for_resolution = true
          AND is_resolved = false
        ORDER BY cycle_id ASC
      `);
      
      if (readyCycles.rows.length === 0) {
        console.log('ℹ️ No cycles ready for resolution');
        return false;
      }
      
      console.log(`📋 Found ${readyCycles.rows.length} cycles ready for resolution`);
      
      // Resolve each ready cycle
      let successCount = 0;
      for (const cycleData of readyCycles.rows) {
        const resolved = await this.resolveSingleCycle(cycleData);
        if (resolved) successCount++;
      }
      
      console.log(`✅ Resolved ${successCount}/${readyCycles.rows.length} cycles`);
      return successCount > 0;
      
    } catch (error) {
      console.error('❌ Failed to resolve cycles:', error);
      return false;
    }
  }

  /**
   * Resolve a single cycle using prepared resolution_data
   */
  async resolveSingleCycle(cycleData) {
    try {
      const cycleId = cycleData.cycle_id;
      console.log(`📊 Resolving cycle ${cycleId}`);
      
      // Use prepared resolution_data if available
      let results;
      if (cycleData.resolution_data && cycleData.resolution_data.formattedResults) {
        console.log(`✅ Using prepared resolution data for cycle ${cycleId}`);
        results = cycleData.resolution_data.formattedResults;
      } else {
        console.log(`⚠️ No prepared data, fetching results for cycle ${cycleId}`);
        // Fallback: Get cycle data from database
        if (!cycleData) {
          console.error(`❌ No cycle data found for cycle ${cycleId}`);
          return false;
        }
        
        // Get match results - handle both JSON string and object formats
        let matches;
        if (typeof cycleData.matches_data === 'string') {
          matches = JSON.parse(cycleData.matches_data);
        } else if (Array.isArray(cycleData.matches_data)) {
          matches = cycleData.matches_data;
        } else {
          console.error('❌ Invalid matches_data format:', typeof cycleData.matches_data);
          throw new Error('Invalid matches_data format');
        }
        
        results = await this.getMatchResults(matches);
      }
      
      // Validate results
      if (!results || results.length < 10) {
        console.error(`❌ Not enough results (${results?.length || 0}/10) to resolve cycle ${cycleId}`);
        return false;
      }
      
      // Check for any invalid results
      const invalidResults = results.filter(r => 
        typeof r.moneyline !== 'number' || 
        typeof r.overUnder !== 'number' ||
        r.moneyline < 0 || r.moneyline > 3 ||
        r.overUnder < 0 || r.overUnder > 2
      );
      
      if (invalidResults.length > 0) {
        console.error(`❌ Invalid results found for cycle ${cycleId}:`, invalidResults);
        return false;
      }
      
      console.log(`📊 Submitting cycle ${cycleId} to blockchain with results:`, results);
      
      // Resolve cycle on contract
      const tx = await this.oddysseyContract.resolveDailyCycle(cycleId, results);
      console.log(`🚀 Transaction sent: ${tx.hash}`);
      
      const receipt = await tx.wait();
      
      if (receipt.status === 1) {
        console.log(`✅ Cycle ${cycleId} resolved successfully on-chain!`);
        
        // Update database
        await db.query(`
          UPDATE oracle.oddyssey_cycles
          SET 
            is_resolved = true,
            resolution_tx_hash = $1,
            resolved_at = NOW()
          WHERE cycle_id = $2
        `, [tx.hash, cycleId]);
        
        console.log(`✅ Database updated for cycle ${cycleId}`);
        return true;
      } else {
        console.error(`❌ Transaction failed for cycle ${cycleId}`);
        return false;
      }
      
    } catch (error) {
      console.error(`❌ Failed to resolve cycle ${cycleData.cycle_id}:`, error);
      return false;
    }
  }

  /**
   * Format matches for contract
   */
  formatMatchesForContract(matches) {
    return matches.map(match => {
      // Fix: Handle startTime correctly - can be epoch (number) or Date string
      let startTime;
      if (match.startTime !== undefined && typeof match.startTime === 'number') {
        // Already epoch seconds
        startTime = match.startTime;
      } else if (match.startTime !== undefined && typeof match.startTime === 'string') {
        // Date string - convert to epoch
        startTime = Math.floor(new Date(match.startTime).getTime() / 1000);
      } else if (match.match_date) {
        // Use match_date if startTime doesn't exist
        startTime = Math.floor(new Date(match.match_date).getTime() / 1000);
      } else if (match.starting_at) {
        // Use starting_at if match_date doesn't exist
        startTime = Math.floor(new Date(match.starting_at).getTime() / 1000);
      } else {
        // Fallback to current time + 1 hour
        console.warn(`⚠️ No startTime found for match ${match.id}, using fallback`);
        startTime = Math.floor(Date.now() / 1000) + 3600;
      }
      
      return {
        id: match.id,
        startTime: startTime,
        oddsHome: Math.floor(match.odds.home * 1000),
        oddsDraw: Math.floor(match.odds.draw * 1000),
        oddsAway: Math.floor(match.odds.away * 1000),
        oddsOver: Math.floor(match.odds.over25 * 1000),
        oddsUnder: Math.floor(match.odds.under25 * 1000),
        result: { moneyline: 0, overUnder: 0 } // NotSet
      };
    });
  }

  /**
   * Save cycle to database
   */
  async saveCycleToDatabase(matches) {
    try {
      const currentCycleId = await this.oddysseyContract.dailyCycleId();
      
      // Check if cycle already exists to preserve match consistency
      const existingCycle = await db.query(
        'SELECT cycle_id FROM oracle.oddyssey_cycles WHERE cycle_id = $1',
        [Number(currentCycleId)]
      );
      
      if (existingCycle.rows.length > 0) {
        console.log(`⚠️ Cycle ${currentCycleId} already exists. Preserving original matches to maintain consistency.`);
        return; // Don't overwrite existing cycles
      }
      
      const query = `
        INSERT INTO oracle.oddyssey_cycles (
          cycle_id, created_at, matches_count, matches_data, cycle_start_time, cycle_end_time
        ) VALUES ($1, NOW(), $2, $3, NOW(), NOW() + INTERVAL '24 hours')
      `;

      await db.query(query, [
        Number(currentCycleId),
        matches.length,
        JSON.stringify(matches)
      ]);

      console.log(`💾 Saved cycle ${currentCycleId} to database`);
      
    } catch (error) {
      console.error('❌ Failed to save cycle to database:', error);
    }
  }

  /**
   * Get cycle data from database
   */
  async getCycleData(cycleId) {
    try {
      const query = `
        SELECT * FROM oracle.oddyssey_cycles WHERE cycle_id = $1
      `;
      
      const result = await db.query(query, [cycleId]);
      return result.rows[0];
      
    } catch (error) {
      console.error('❌ Failed to get cycle data:', error);
      return null;
    }
  }

  /**
   * Get match results from database
   */
  async getMatchResults(matches) {
    try {
      const matchIds = matches.map(m => m.id);
      
      const query = `
        SELECT 
          f.id as match_id,
          fr.outcome_1x2,
          fr.outcome_ou25
        FROM oracle.fixtures f
        LEFT JOIN oracle.fixture_results fr ON f.id::VARCHAR = fr.fixture_id::VARCHAR
        WHERE f.id = ANY($1)
        ORDER BY f.id
      `;
      
      const result = await db.query(query, [matchIds]);
      const results = result.rows;
      
      if (results.length < 10) {
        console.warn(`⚠️ Only ${results.length}/10 matches have results`);
      }
      
      const formattedResults = results.map((row, index) => {
        const moneyline = this.mapMoneylineResult(row.outcome_1x2);
        const overUnder = this.mapOverUnderResult(row.outcome_ou25);
        
        // Log any problematic results for debugging
        if (moneyline === 0 || overUnder === 0) {
          console.warn(`⚠️ Match ${index + 1} (ID: ${row.match_id}) has incomplete results:`, {
            outcome_1x2: row.outcome_1x2,
            outcome_ou25: row.outcome_ou25,
            moneyline,
            overUnder
          });
        }
        
        return { moneyline, overUnder };
      });
      
      // Validate that we have at least some complete results
      const completeResults = formattedResults.filter(r => r.moneyline > 0 && r.overUnder > 0);
      if (completeResults.length < 5) {
        console.warn(`⚠️ Only ${completeResults.length}/10 matches have complete results`);
      }
      
      return formattedResults;
      
    } catch (error) {
      console.error('❌ Failed to get match results:', error);
      return [];
    }
  }

  /**
   * Map moneyline result - HANDLES BOTH FORMATS
   */
  mapMoneylineResult(outcome) {
    if (!outcome || outcome === null || outcome === undefined) {
      return 0; // NotSet
    }
    
    switch (outcome.toString()) {
      case '1':
      case 'Home':  // Database format
        return 1; // HomeWin
      case 'X':
      case 'Draw':  // Database format
        return 2; // Draw
      case '2':
      case 'Away':  // Database format
        return 3; // AwayWin
      default: 
        console.warn(`⚠️ Unknown moneyline outcome: ${outcome}`);
        return 0;  // NotSet
    }
  }

  /**
   * Map over/under result - HANDLES BOTH FORMATS
   */
  mapOverUnderResult(outcome) {
    if (!outcome || outcome === null || outcome === undefined) {
      return 0; // NotSet
    }
    
    switch (outcome.toString()) {
      case 'Over':
      case 'O':  // Short format
        return 1; // Over
      case 'Under':
      case 'U':  // Short format
        return 2; // Under
      default: 
        console.warn(`⚠️ Unknown over/under outcome: ${outcome}`);
        return 0;      // NotSet
    }
  }

  /**
   * Get oracle status
   */
  async getStatus() {
    try {
      const currentCycleId = await this.oddysseyContract.dailyCycleId();
      const oracle = await this.oddysseyContract.oracle();
      const backendAddress = this.web3Service.getWalletAddress();
      
      return {
        isInitialized: this.isInitialized,
        currentCycleId: Number(currentCycleId),
        contractOracle: oracle,
        backendAddress: backendAddress,
        isOracle: oracle && backendAddress ? oracle.toLowerCase() === backendAddress.toLowerCase() : false
      };
      
    } catch (error) {
      console.error('❌ Failed to get oracle status:', error);
      return { error: error.message };
    }
  }
}

module.exports = OddysseyOracle; 