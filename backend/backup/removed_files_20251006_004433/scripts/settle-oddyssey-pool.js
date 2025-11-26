#!/usr/bin/env node

/**
 * Settle Oddyssey Pool
 * Script to manually settle Oddyssey pools using cycle results
 */

require('dotenv').config();
const { ethers } = require('ethers');
const config = require('../config');

class OddysseyPoolSettler {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    this.wallet = new ethers.Wallet(process.env.ORACLE_PRIVATE_KEY || process.env.ORACLE_SIGNER_PRIVATE_KEY, this.provider);
    
    // Load contract ABIs
    let PoolCoreABI;
    
    try {
      PoolCoreABI = require('../solidity/BitredictPoolCore.json').abi;
      console.log('✅ PoolCore ABI loaded');
    } catch (error) {
      console.warn('⚠️ PoolCore ABI not found, using minimal ABI');
      PoolCoreABI = [
        'function pools(uint256) external view returns (tuple(uint256 creatorStake, uint256 totalStake, uint256 eventStartTime, uint256 eventEndTime, uint256 bettingEndTime, uint256 arbitrationDeadline, bytes32 predictedOutcome, bytes32 result, bytes32 marketId, uint8 oracleType, uint8 flags, uint256 resultTimestamp))',
        'function settlePool(uint256 poolId, bytes32 outcome) external',
        'event PoolSettled(uint256 indexed poolId, bytes32 outcome, bool creatorSideWon, uint256 timestamp)'
      ];
    }
    
    // Initialize contract
    if (config.blockchain.contractAddresses?.poolCore) {
      this.poolContract = new ethers.Contract(
        config.blockchain.contractAddresses.poolCore,
        PoolCoreABI,
        this.wallet
      );
    } else {
      console.error('❌ PoolCore contract address not configured');
      process.exit(1);
    }
  }

  async getOddysseyCycleResult(cycleId) {
    try {
      console.log(`🔍 Fetching Oddyssey cycle ${cycleId} results...`);
      
      // Connect to database
      const db = require('../db/db');
      await db.connect();
      
      const result = await db.query(`
        SELECT cycle_id, matches_data, is_resolved, resolved_at, resolution_tx_hash
        FROM oracle.oddyssey_cycles 
        WHERE cycle_id = $1
      `, [cycleId]);
      
      if (result.rows.length === 0) {
        console.log(`❌ Cycle ${cycleId} not found`);
        return null;
      }
      
      const cycle = result.rows[0];
      console.log(`📊 Cycle ${cycleId} status:`);
      console.log(`  - Is Resolved: ${cycle.is_resolved}`);
      console.log(`  - Resolved At: ${cycle.resolved_at}`);
      console.log(`  - Resolution TX: ${cycle.resolution_tx_hash}`);
      
      if (!cycle.is_resolved) {
        console.log(`❌ Cycle ${cycleId} is not resolved yet`);
        return null;
      }
      
      return cycle;
      
    } catch (error) {
      console.error(`❌ Error fetching cycle ${cycleId}:`, error);
      throw error;
    }
  }

  async getMatchResultFromCycle(cycle, fixtureId) {
    try {
      console.log(`🔍 Looking for fixture ${fixtureId} in cycle results...`);
      
      if (!cycle.matches_data || !Array.isArray(cycle.matches_data)) {
        console.log(`❌ No matches data in cycle`);
        return null;
      }
      
      const match = cycle.matches_data.find(m => m.id === fixtureId.toString());
      
      if (!match) {
        console.log(`❌ Fixture ${fixtureId} not found in cycle matches`);
        return null;
      }
      
      console.log(`📊 Match found:`);
      console.log(`  - Home Team: ${match.homeTeam || 'N/A'}`);
      console.log(`  - Away Team: ${match.awayTeam || 'N/A'}`);
      console.log(`  - Result: ${JSON.stringify(match.result)}`);
      
      return match;
      
    } catch (error) {
      console.error(`❌ Error getting match result:`, error);
      throw error;
    }
  }

  async determineOutcomeFromMatch(match, predictedOutcome) {
    try {
      console.log(`🎯 Determining outcome for predicted: ${predictedOutcome}`);
      
      if (!match.result) {
        console.log(`❌ No result data in match`);
        return null;
      }
      
      // For Oddyssey pools, we need to determine the actual outcome
      // based on the match result and the predicted outcome
      
      // Common Oddyssey outcomes:
      // - "1" (Home win)
      // - "X" (Draw) 
      // - "2" (Away win)
      // - "Over 2.5" / "Under 2.5"
      // - "BTTS Yes" / "BTTS No"
      
      let actualOutcome = null;
      
      // Determine moneyline result
      if (match.result.moneyline !== undefined) {
        if (match.result.moneyline === 1) {
          actualOutcome = "1"; // Home win
        } else if (match.result.moneyline === 0) {
          actualOutcome = "X"; // Draw
        } else if (match.result.moneyline === 2) {
          actualOutcome = "2"; // Away win
        }
      }
      
      // Determine over/under result
      if (match.result.overUnder !== undefined) {
        if (match.result.overUnder === 1) {
          actualOutcome = "Over 2.5";
        } else if (match.result.overUnder === 0) {
          actualOutcome = "Under 2.5";
        }
      }
      
      console.log(`📊 Determined actual outcome: ${actualOutcome}`);
      
      if (!actualOutcome) {
        console.log(`❌ Could not determine outcome from match result`);
        return null;
      }
      
      return actualOutcome;
      
    } catch (error) {
      console.error(`❌ Error determining outcome:`, error);
      throw error;
    }
  }

  async settlePool(poolId, outcome) {
    try {
      console.log(`🎯 Settling pool ${poolId} with outcome: ${outcome}`);
      
      // Hash the outcome
      const outcomeHash = ethers.keccak256(ethers.toUtf8Bytes(outcome));
      console.log(`📊 Outcome hash: ${outcomeHash}`);
      
      // Estimate gas
      const gasEstimate = await this.poolContract.settlePool.estimateGas(poolId, outcomeHash);
      console.log(`⛽ Gas estimate: ${gasEstimate}`);
      
      // Submit transaction
      const tx = await this.poolContract.settlePool(poolId, outcomeHash, {
        gasLimit: gasEstimate * 120n / 100n // 20% buffer
      });
      
      console.log(`📤 Settlement transaction submitted: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`✅ Pool ${poolId} settled in block ${receipt.blockNumber}`);
      
      return { success: true, txHash: tx.hash, blockNumber: receipt.blockNumber };
      
    } catch (error) {
      console.error(`❌ Error settling pool:`, error);
      return { success: false, error: error.message };
    }
  }

  async run(poolId, fixtureId, cycleId) {
    try {
      console.log('🚀 Starting Oddyssey Pool Settler...');
      console.log(`📊 Pool ID: ${poolId}`);
      console.log(`📊 Fixture ID: ${fixtureId}`);
      console.log(`📊 Cycle ID: ${cycleId}`);
      
      // Get cycle results
      const cycle = await this.getOddysseyCycleResult(cycleId);
      if (!cycle) {
        console.log(`❌ Cannot proceed without cycle results`);
        return;
      }
      
      // Get match result from cycle
      const match = await this.getMatchResultFromCycle(cycle, fixtureId);
      if (!match) {
        console.log(`❌ Cannot proceed without match result`);
        return;
      }
      
      // Determine actual outcome
      const actualOutcome = await this.determineOutcomeFromMatch(match, "Unknown");
      if (!actualOutcome) {
        console.log(`❌ Cannot proceed without determined outcome`);
        return;
      }
      
      // Settle the pool
      const result = await this.settlePool(poolId, actualOutcome);
      
      if (result.success) {
        console.log(`🎉 Pool ${poolId} settled successfully!`);
        console.log(`📤 Transaction: ${result.txHash}`);
        console.log(`📦 Block: ${result.blockNumber}`);
      } else {
        console.log(`❌ Failed to settle pool: ${result.error}`);
      }
      
    } catch (error) {
      console.error('❌ Oddyssey pool settler failed:', error);
      process.exit(1);
    }
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length < 3) {
  console.log('Usage: node settle-oddyssey-pool.js <poolId> <fixtureId> <cycleId>');
  console.log('Example: node settle-oddyssey-pool.js 0 19568522 10');
  process.exit(1);
}

const [poolId, fixtureId, cycleId] = args;

// Run the settler
const settler = new OddysseyPoolSettler();
settler.run(parseInt(poolId), fixtureId, parseInt(cycleId));
