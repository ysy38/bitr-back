const db = require('../db/db');
const Web3Service = require('./web3-service');

/**
 * Oddyssey Oracle Fix Service
 * 
 * This service fixes oracle submission issues and ensures cycles are properly resolved on blockchain.
 * It addresses the gap where cycles are resolved in database but not on blockchain.
 */
class OddysseyOracleFixService {
  constructor() {
    this.serviceName = 'OddysseyOracleFixService';
    this.web3Service = new Web3Service();
    this.isRunning = false;
    this.fixInterval = null;
  }

  /**
   * Start the oracle fix service
   */
  async start() {
    if (this.isRunning) {
      console.log(`⚠️ ${this.serviceName}: Already running`);
      return;
    }

    try {
      console.log(`🚀 Starting ${this.serviceName}...`);
      
      this.isRunning = true;
      
      // Check for oracle submission issues every 5 minutes
      this.fixInterval = setInterval(async () => {
        if (!this.isRunning) return;
        
        try {
          await this.checkAndFixOracleSubmissions();
        } catch (error) {
          console.error(`❌ Error during oracle fix check:`, error);
        }
      }, 5 * 60 * 1000); // 5 minutes
      
      // Run initial check after 30 seconds
      setTimeout(async () => {
        try {
          await this.checkAndFixOracleSubmissions();
        } catch (error) {
          console.error(`❌ Error during initial oracle fix check:`, error);
        }
      }, 30000);
      
      console.log(`✅ ${this.serviceName} started successfully`);
      
    } catch (error) {
      console.error(`❌ Failed to start ${this.serviceName}:`, error);
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Stop the oracle fix service
   */
  async stop() {
    if (!this.isRunning) {
      console.log(`⚠️ ${this.serviceName}: Not running`);
      return;
    }

    try {
      console.log(`🛑 Stopping ${this.serviceName}...`);
      
      this.isRunning = false;
      
      if (this.fixInterval) {
        clearInterval(this.fixInterval);
        this.fixInterval = null;
      }
      
      console.log(`✅ ${this.serviceName} stopped successfully`);
      
    } catch (error) {
      console.error(`❌ Error stopping ${this.serviceName}:`, error);
      throw error;
    }
  }

  /**
   * Check for oracle submission issues and fix them
   */
  async checkAndFixOracleSubmissions() {
    try {
      console.log(`🔍 ${this.serviceName}: Checking for oracle submission issues...`);
      
      // Get cycles that are resolved in database but not on blockchain
      const problematicCycles = await this.findProblematicCycles();
      
      if (problematicCycles.length === 0) {
        console.log(`✅ ${this.serviceName}: No oracle submission issues found`);
        return;
      }

      console.log(`📊 Found ${problematicCycles.length} cycles with oracle submission issues`);

      for (const cycle of problematicCycles) {
        try {
          await this.fixCycleOracleSubmission(cycle);
        } catch (error) {
          console.error(`❌ Failed to fix oracle submission for cycle ${cycle.cycle_id}:`, error);
        }
      }

    } catch (error) {
      console.error(`❌ Error in checkAndFixOracleSubmissions:`, error);
      throw error;
    }
  }

  /**
   * Find cycles that have oracle submission issues
   */
  async findProblematicCycles() {
    try {
      // Get the current active cycle ID to exclude it from checks
      const currentCycleResult = await db.query(`
        SELECT cycle_id FROM oracle.current_oddyssey_cycle LIMIT 1
      `);
      
      const currentCycleId = currentCycleResult.rows.length > 0 ? currentCycleResult.rows[0].cycle_id : null;
      
      if (currentCycleId) {
        console.log(`🔄 Excluding current active cycle ${currentCycleId} from oracle fix checks`);
      }
      
      // Get cycles resolved in database, but EXCLUDE the current active cycle
      const dbResolvedCycles = await db.query(`
        SELECT cycle_id, resolution_tx_hash, matches_data, cycle_end_time
        FROM oracle.oddyssey_cycles 
        WHERE is_resolved = true 
          AND cycle_end_time < NOW() - INTERVAL '1 hour'
          AND cycle_id != $1
        ORDER BY cycle_id ASC
      `, [currentCycleId]);

      const problematicCycles = [];

      for (const cycle of dbResolvedCycles.rows) {
        try {
          // Check if cycle is resolved on blockchain
          const contract = await this.web3Service.getOddysseyContract();
          const isResolvedOnChain = await contract.isCycleResolved(cycle.cycle_id);
          
          if (!isResolvedOnChain) {
            console.log(`❌ Cycle ${cycle.cycle_id}: Resolved in DB but not on blockchain`);
            problematicCycles.push(cycle);
          } else {
            console.log(`✅ Cycle ${cycle.cycle_id}: Properly resolved on blockchain`);
          }
          
        } catch (error) {
          console.error(`❌ Error checking cycle ${cycle.cycle_id} on blockchain:`, error);
          // Assume it's problematic if we can't check
          problematicCycles.push(cycle);
        }
      }

      return problematicCycles;

    } catch (error) {
      console.error(`❌ Error finding problematic cycles:`, error);
      throw error;
    }
  }

  /**
   * Fix oracle submission for a specific cycle
   */
  async fixCycleOracleSubmission(cycle) {
    try {
      console.log(`🔧 ${this.serviceName}: Fixing oracle submission for cycle ${cycle.cycle_id}...`);
      
      // Get match results for this cycle
      const matchResults = await this.getCycleMatchResults(cycle.cycle_id);
      
      if (matchResults.length !== 10) {
        console.log(`⏳ Cycle ${cycle.cycle_id}: Only ${matchResults.length}/10 matches have results, skipping...`);
        return;
      }

      console.log(`✅ All ${matchResults.length} matches have results for cycle ${cycle.cycle_id}`);

      // Format results for contract submission
      const formattedResults = this.web3Service.formatResultsForContract(matchResults);
      
      // Submit results to blockchain - let ethers.js estimate gas automatically
      const tx = await this.web3Service.resolveDailyCycle(cycle.cycle_id, formattedResults, {
        // Remove fixed gas limit - let ethers.js estimate automatically
        // gasPrice: '7000000000' // Let ethers.js determine optimal gas price
      });

      if (tx && tx.hash) {
        console.log(`✅ Cycle ${cycle.cycle_id} oracle submission fixed: ${tx.hash}`);
        
        // Update database with the new transaction hash
        await db.query(`
          UPDATE oracle.oddyssey_cycles 
          SET resolution_tx_hash = $1, resolved_at = NOW()
          WHERE cycle_id = $2
        `, [tx.hash, cycle.cycle_id]);
        
        console.log(`📊 Cycle ${cycle.cycle_id}: Oracle submission completed successfully`);
        
      } else {
        console.error(`❌ Failed to fix oracle submission for cycle ${cycle.cycle_id}: No transaction hash returned`);
        throw new Error(`Oracle submission failed: No transaction hash returned`);
      }

    } catch (error) {
      console.error(`❌ Error fixing oracle submission for cycle ${cycle.cycle_id}:`, error);
      throw error;
    }
  }

  /**
   * Get match results for a cycle
   */
  async getCycleMatchResults(cycleId) {
    try {
      // Get cycle matches
      const cycleResult = await db.query(`
        SELECT matches_data FROM oracle.oddyssey_cycles WHERE cycle_id = $1
      `, [cycleId]);

      if (cycleResult.rows.length === 0) {
        throw new Error(`Cycle ${cycleId} not found`);
      }

      const matchesData = cycleResult.rows[0].matches_data;
      if (!Array.isArray(matchesData)) {
        throw new Error(`Invalid matches_data format for cycle ${cycleId}`);
      }

      const results = [];

      for (const match of matchesData) {
        if (match.result && match.result.outcome_1x2 && match.result.outcome_ou25) {
          // Convert text-based outcomes to numeric format expected by contract
          let result1x2;
          switch (match.result.outcome_1x2) {
            case 'Home':
              result1x2 = '1';
              break;
            case 'Draw':
              result1x2 = 'X';
              break;
            case 'Away':
              result1x2 = '2';
              break;
            default:
              console.warn(`Unknown outcome_1x2 value: ${match.result.outcome_1x2}`);
              result1x2 = null;
          }
          
          results.push({
            fixture_id: match.id,
            result1x2: result1x2,
            resultOU25: match.result.outcome_ou25,
            home_score: match.result.home_score,
            away_score: match.result.away_score
          });
        }
      }

      return results;

    } catch (error) {
      console.error(`❌ Error getting match results for cycle ${cycleId}:`, error);
      throw error;
    }
  }

  /**
   * Manually fix oracle submission for a specific cycle (for testing/debugging)
   */
  async fixCycleManually(cycleId) {
    try {
      console.log(`🔧 Manual oracle fix for cycle ${cycleId}...`);
      
      const cycle = await db.query(`
        SELECT cycle_id, resolution_tx_hash, matches_data, cycle_end_time
        FROM oracle.oddyssey_cycles 
        WHERE cycle_id = $1
      `, [cycleId]);

      if (cycle.rows.length === 0) {
        throw new Error(`Cycle ${cycleId} not found`);
      }

      await this.fixCycleOracleSubmission(cycle.rows[0]);
      
      console.log(`✅ Manual oracle fix completed for cycle ${cycleId}`);
      
    } catch (error) {
      console.error(`❌ Manual oracle fix failed for cycle ${cycleId}:`, error);
      throw error;
    }
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      serviceName: this.serviceName,
      isRunning: this.isRunning
    };
  }
}

module.exports = OddysseyOracleFixService;
