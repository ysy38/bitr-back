#!/usr/bin/env node

/**
 * Fix Oddyssey Pool Settlement
 * Complete solution to settle Oddyssey pools by submitting outcomes to guided oracle first
 */

require('dotenv').config();
const { ethers } = require('ethers');
const config = require('../config');

class OddysseyPoolSettlementFixer {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    this.wallet = new ethers.Wallet(process.env.ORACLE_PRIVATE_KEY || process.env.ORACLE_SIGNER_PRIVATE_KEY, this.provider);
    
    // Load contract ABIs
    let PoolCoreABI, GuidedOracleABI;
    
    try {
      PoolCoreABI = require('../solidity/BitredictPoolCore.json').abi;
      console.log('✅ PoolCore ABI loaded');
    } catch (error) {
      console.warn('⚠️ PoolCore ABI not found, using minimal ABI');
      PoolCoreABI = [
        'function pools(uint256) external view returns (tuple(uint256 creatorStake, uint256 totalStake, uint256 eventStartTime, uint256 eventEndTime, uint256 bettingEndTime, uint256 arbitrationDeadline, bytes32 predictedOutcome, bytes32 result, bytes32 marketId, uint8 oracleType, uint8 flags, uint256 resultTimestamp))',
        'function settlePoolAutomatically(uint256 poolId) external',
        'function settlePool(uint256 poolId, bytes32 outcome) external',
        'event PoolSettled(uint256 indexed poolId, bytes32 outcome, bool creatorSideWon, uint256 timestamp)'
      ];
    }
    
    try {
      GuidedOracleABI = require('../solidity/GuidedOracle.json').abi;
      console.log('✅ GuidedOracle ABI loaded');
    } catch (error) {
      console.warn('⚠️ GuidedOracle ABI not found, using minimal ABI');
      GuidedOracleABI = [
        'function submitOutcome(bytes32 marketId, bytes calldata resultData) external',
        'function getOutcome(bytes32 marketId) external view returns (bool isSet, bytes memory resultData)',
        'event OutcomeSubmitted(bytes32 indexed marketId, bytes resultData, uint256 timestamp)'
      ];
    }
    
    // Initialize contracts
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
    
    if (config.blockchain.contractAddresses?.guidedOracle) {
      this.oracleContract = new ethers.Contract(
        config.blockchain.contractAddresses.guidedOracle,
        GuidedOracleABI,
        this.wallet
      );
    } else {
      console.error('❌ GuidedOracle contract address not configured');
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

  async determineOutcomeFromMatch(match) {
    try {
      console.log(`🎯 Determining outcome from match result...`);
      
      if (!match.result) {
        console.log(`❌ No result data in match`);
        return null;
      }
      
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

  async submitOutcomeToOracle(marketId, outcome) {
    try {
      console.log(`📡 Submitting outcome to guided oracle...`);
      console.log(`  - Market ID: ${marketId}`);
      console.log(`  - Outcome: ${outcome}`);
      
      // Convert market ID to bytes32 if it's a number
      let marketIdBytes32;
      if (typeof marketId === 'number' || /^\d+$/.test(marketId.toString())) {
        marketIdBytes32 = ethers.keccak256(ethers.solidityPacked(['uint256'], [marketId.toString()]));
        console.log(`📊 Converted market ID ${marketId} to bytes32: ${marketIdBytes32}`);
      } else {
        marketIdBytes32 = marketId;
      }
      
      // Check if outcome already exists
      const [isSet, existingResult] = await this.oracleContract.getOutcome(marketIdBytes32);
      
      if (isSet) {
        console.log(`⚠️ Outcome already exists: ${ethers.toUtf8String(existingResult)}`);
        return { success: true, alreadyExists: true };
      }
      
      // Prepare result data
      const resultData = ethers.toUtf8Bytes(outcome);
      
      // Estimate gas and submit
      const gasEstimate = await this.oracleContract.submitOutcome.estimateGas(
        marketIdBytes32,
        resultData
      );
      
      console.log(`⛽ Gas estimate: ${gasEstimate}`);
      
      const tx = await this.oracleContract.submitOutcome(
        marketIdBytes32,
        resultData,
        {
          gasLimit: gasEstimate * 110n / 100n, // 10% buffer
          gasPrice: ethers.parseUnits('20', 'gwei')
        }
      );
      
      console.log(`📤 Oracle submission transaction: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`✅ Oracle outcome submitted in block ${receipt.blockNumber}`);
      
      return { success: true, txHash: tx.hash, blockNumber: receipt.blockNumber };
      
    } catch (error) {
      console.error(`❌ Error submitting to oracle:`, error);
      return { success: false, error: error.message };
    }
  }

  async settlePoolAutomatically(poolId) {
    try {
      console.log(`🎯 Attempting automatic settlement for pool ${poolId}...`);
      
      // Estimate gas
      const gasEstimate = await this.poolContract.settlePoolAutomatically.estimateGas(poolId);
      console.log(`⛽ Gas estimate: ${gasEstimate}`);
      
      // Submit transaction
      const tx = await this.poolContract.settlePoolAutomatically(poolId, {
        gasLimit: gasEstimate * 120n / 100n // 20% buffer
      });
      
      console.log(`📤 Automatic settlement transaction: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`✅ Pool ${poolId} automatically settled in block ${receipt.blockNumber}`);
      
      return { success: true, txHash: tx.hash, blockNumber: receipt.blockNumber };
      
    } catch (error) {
      console.error(`❌ Error in automatic settlement:`, error);
      return { success: false, error: error.message };
    }
  }

  async run(poolId, fixtureId, cycleId) {
    try {
      console.log('🚀 Starting Oddyssey Pool Settlement Fixer...');
      console.log(`📊 Pool ID: ${poolId}`);
      console.log(`📊 Fixture ID: ${fixtureId}`);
      console.log(`📊 Cycle ID: ${cycleId}`);
      
      // Step 1: Get cycle results
      console.log('\n📋 Step 1: Getting cycle results...');
      const cycle = await this.getOddysseyCycleResult(cycleId);
      if (!cycle) {
        console.log(`❌ Cannot proceed without cycle results`);
        return;
      }
      
      // Step 2: Get match result from cycle
      console.log('\n📋 Step 2: Getting match result...');
      const match = await this.getMatchResultFromCycle(cycle, fixtureId);
      if (!match) {
        console.log(`❌ Cannot proceed without match result`);
        return;
      }
      
      // Step 3: Determine actual outcome
      console.log('\n📋 Step 3: Determining outcome...');
      const actualOutcome = await this.determineOutcomeFromMatch(match);
      if (!actualOutcome) {
        console.log(`❌ Cannot proceed without determined outcome`);
        return;
      }
      
      // Step 4: Submit outcome to guided oracle
      console.log('\n📋 Step 4: Submitting outcome to guided oracle...');
      const oracleResult = await this.submitOutcomeToOracle(fixtureId, actualOutcome);
      if (!oracleResult.success) {
        console.log(`❌ Failed to submit to oracle: ${oracleResult.error}`);
        return;
      }
      
      if (oracleResult.alreadyExists) {
        console.log(`✅ Outcome already exists in oracle`);
      } else {
        console.log(`✅ Outcome submitted to oracle: ${oracleResult.txHash}`);
      }
      
      // Step 5: Settle the pool automatically
      console.log('\n📋 Step 5: Settling pool automatically...');
      const settlementResult = await this.settlePoolAutomatically(poolId);
      
      if (settlementResult.success) {
        console.log(`\n🎉 SUCCESS! Pool ${poolId} settled successfully!`);
        console.log(`📤 Settlement Transaction: ${settlementResult.txHash}`);
        console.log(`📦 Block: ${settlementResult.blockNumber}`);
        console.log(`🎯 Outcome: ${actualOutcome}`);
      } else {
        console.log(`❌ Failed to settle pool: ${settlementResult.error}`);
      }
      
    } catch (error) {
      console.error('❌ Oddyssey pool settlement fixer failed:', error);
      process.exit(1);
    }
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length < 3) {
  console.log('Usage: node fix-oddyssey-pool-settlement.js <poolId> <fixtureId> <cycleId>');
  console.log('Example: node fix-oddyssey-pool-settlement.js 0 19568522 10');
  process.exit(1);
}

const [poolId, fixtureId, cycleId] = args;

// Run the fixer
const fixer = new OddysseyPoolSettlementFixer();
fixer.run(parseInt(poolId), fixtureId, parseInt(cycleId));
