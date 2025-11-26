#!/usr/bin/env node

/**
 * Check Pool Settlement Status
 * Script to check if pool 0 is settled and manually settle if needed
 */

require('dotenv').config();
const { ethers } = require('ethers');
const config = require('../config');

class PoolSettlementChecker {
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
        'function settlePool(uint256 poolId, bytes32 outcome) external',
        'function settlePoolAutomatically(uint256 poolId) external',
        'function isPoolSettled(uint256 poolId) external view returns (bool)',
        'event PoolSettled(uint256 indexed poolId, bytes32 outcome, bool creatorSideWon, uint256 timestamp)'
      ];
    }
    
    try {
      GuidedOracleABI = require('../solidity/GuidedOracle.json').abi;
      console.log('✅ GuidedOracle ABI loaded');
    } catch (error) {
      console.warn('⚠️ GuidedOracle ABI not found, using minimal ABI');
      GuidedOracleABI = [
        'function getOutcome(bytes32 marketId) external view returns (bool isSet, bytes memory resultData)',
        'event OutcomeSubmitted(uint256 indexed marketId, string resultData, uint256 timestamp)'
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
        this.provider
      );
    } else {
      console.error('❌ GuidedOracle contract address not configured');
      process.exit(1);
    }
  }

  async checkPoolStatus(poolId) {
    try {
      console.log(`🔍 Checking pool ${poolId} status...`);
      
      // Get pool data from contract
      const pool = await this.poolContract.pools(poolId);
      console.log('📊 Pool data from contract:');
      console.log(`  - Creator Stake: ${pool.creatorStake ? ethers.formatEther(pool.creatorStake) : 'null'} ETH`);
      console.log(`  - Total Stake: ${pool.totalStake ? ethers.formatEther(pool.totalStake) : 'null'} ETH`);
      console.log(`  - Event Start: ${pool.eventStartTime ? new Date(Number(pool.eventStartTime) * 1000).toISOString() : 'null'}`);
      console.log(`  - Event End: ${pool.eventEndTime ? new Date(Number(pool.eventEndTime) * 1000).toISOString() : 'null'}`);
      console.log(`  - Betting End: ${pool.bettingEndTime ? new Date(Number(pool.bettingEndTime) * 1000).toISOString() : 'null'}`);
      console.log(`  - Arbitration Deadline: ${pool.arbitrationDeadline ? new Date(Number(pool.arbitrationDeadline) * 1000).toISOString() : 'null'}`);
      console.log(`  - Oracle Type: ${pool.oracleType}`);
      console.log(`  - Market ID: ${pool.marketId}`);
      console.log(`  - Predicted Outcome: ${pool.predictedOutcome}`);
      console.log(`  - Result: ${pool.result}`);
      console.log(`  - Flags: ${pool.flags}`);
      console.log(`  - Result Timestamp: ${pool.resultTimestamp}`);
      
      // Check if pool is settled (result is not all zeros and flags bit 0 is set)
      const isSettled = pool.result !== '0x0000000000000000000000000000000000000000000000000000000000000000' && (Number(pool.flags) & 1) === 1;
      console.log(`  - Is Settled: ${isSettled}`);
      
      // Check current time vs event times
      const currentTime = Math.floor(Date.now() / 1000);
      const eventEnded = pool.eventEndTime ? currentTime >= Number(pool.eventEndTime) : false;
      const bettingEnded = pool.bettingEndTime ? currentTime >= Number(pool.bettingEndTime) : false;
      const arbitrationPassed = pool.arbitrationDeadline ? currentTime >= Number(pool.arbitrationDeadline) : false;
      
      console.log(`\n⏰ Time Analysis:`);
      console.log(`  - Current Time: ${new Date(currentTime * 1000).toISOString()}`);
      console.log(`  - Event Ended: ${eventEnded}`);
      console.log(`  - Betting Ended: ${bettingEnded}`);
      console.log(`  - Arbitration Passed: ${arbitrationPassed}`);
      
      return {
        pool,
        isSettled,
        eventEnded,
        bettingEnded,
        arbitrationPassed
      };
      
    } catch (error) {
      console.error(`❌ Error checking pool ${poolId}:`, error);
      throw error;
    }
  }

  async checkOracleOutcome(marketId) {
    try {
      console.log(`🔍 Checking oracle outcome for market ${marketId}...`);
      
      // Convert market ID to bytes32 if it's a number
      let marketIdBytes32;
      if (typeof marketId === 'number' || /^\d+$/.test(marketId.toString())) {
        // Convert number to bytes32
        marketIdBytes32 = ethers.keccak256(ethers.solidityPacked(['uint256'], [marketId.toString()]));
        console.log(`📊 Converted market ID ${marketId} to bytes32: ${marketIdBytes32}`);
      } else {
        marketIdBytes32 = marketId;
      }
      
      const [isSet, resultData] = await this.oracleContract.getOutcome(marketIdBytes32);
      console.log(`📊 Oracle outcome:`);
      console.log(`  - Is Set: ${isSet}`);
      console.log(`  - Result Data: ${resultData}`);
      
      if (isSet && resultData) {
        const decodedResult = ethers.toUtf8String(resultData);
        console.log(`  - Decoded Result: ${decodedResult}`);
        return { isSet, resultData, decodedResult };
      }
      
      return { isSet, resultData, decodedResult: null };
      
    } catch (error) {
      console.error(`❌ Error checking oracle outcome:`, error);
      throw error;
    }
  }

  async attemptSettlement(poolId) {
    try {
      console.log(`🎯 Attempting to settle pool ${poolId}...`);
      
      // First try automatic settlement
      try {
        console.log('🔄 Trying automatic settlement...');
        const gasEstimate = await this.poolContract.settlePoolAutomatically.estimateGas(poolId);
        console.log(`⛽ Gas estimate: ${gasEstimate}`);
        
        const tx = await this.poolContract.settlePoolAutomatically(poolId, {
          gasLimit: gasEstimate * 120n / 100n // 20% buffer
        });
        
        console.log(`📤 Automatic settlement transaction submitted: ${tx.hash}`);
        const receipt = await tx.wait();
        console.log(`✅ Pool ${poolId} automatically settled in block ${receipt.blockNumber}`);
        return { success: true, method: 'automatic', txHash: tx.hash };
        
      } catch (autoError) {
        console.log(`⚠️ Automatic settlement failed: ${autoError.message}`);
        
        // Try manual settlement if we have the outcome
        try {
          console.log('🔄 Trying manual settlement...');
          
          // Get the pool data to find market ID
          const pool = await this.poolContract.pools(poolId);
          const marketId = pool.marketId;
          
          // Check oracle outcome
          const oracleResult = await this.checkOracleOutcome(marketId);
          
          if (oracleResult.isSet && oracleResult.resultData) {
            const outcomeHash = ethers.keccak256(oracleResult.resultData);
            console.log(`🎯 Using outcome hash: ${outcomeHash}`);
            
            const gasEstimate = await this.poolContract.settlePool.estimateGas(poolId, outcomeHash);
            console.log(`⛽ Gas estimate: ${gasEstimate}`);
            
            const tx = await this.poolContract.settlePool(poolId, outcomeHash, {
              gasLimit: gasEstimate * 120n / 100n // 20% buffer
            });
            
            console.log(`📤 Manual settlement transaction submitted: ${tx.hash}`);
            const receipt = await tx.wait();
            console.log(`✅ Pool ${poolId} manually settled in block ${receipt.blockNumber}`);
            return { success: true, method: 'manual', txHash: tx.hash };
          } else {
            console.log(`❌ No oracle outcome available for manual settlement`);
            return { success: false, error: 'No oracle outcome available' };
          }
          
        } catch (manualError) {
          console.error(`❌ Manual settlement failed: ${manualError.message}`);
          return { success: false, error: manualError.message };
        }
      }
      
    } catch (error) {
      console.error(`❌ Error attempting settlement:`, error);
      return { success: false, error: error.message };
    }
  }

  async run() {
    try {
      console.log('🚀 Starting Pool Settlement Checker...');
      
      const poolId = 0;
      
      // Check pool status
      const status = await this.checkPoolStatus(poolId);
      
      if (status.isSettled) {
        console.log(`✅ Pool ${poolId} is already settled`);
        return;
      }
      
      if (!status.eventEnded) {
        console.log(`⏳ Pool ${poolId} event has not ended yet`);
        return;
      }
      
      console.log(`🎯 Pool ${poolId} is ready for settlement`);
      
      // Attempt settlement
      const result = await this.attemptSettlement(poolId);
      
      if (result.success) {
        console.log(`🎉 Pool ${poolId} settled successfully using ${result.method} method`);
        console.log(`📤 Transaction: ${result.txHash}`);
      } else {
        console.log(`❌ Failed to settle pool ${poolId}: ${result.error}`);
      }
      
    } catch (error) {
      console.error('❌ Pool settlement checker failed:', error);
      process.exit(1);
    }
  }
}

// Run the checker
const checker = new PoolSettlementChecker();
checker.run();
