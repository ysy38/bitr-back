#!/usr/bin/env node

const { ethers } = require('ethers');
const config = require('../config');

/**
 * Check all pools (0, 1, 2) and attempt manual settlement
 */
class AllPoolsChecker {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    this.wallet = new ethers.Wallet('0x92961421b053ae691cde04f131bd6ebf8745c5a501be3cab8ddedb341c52afc4', this.provider);
    
    // Load contract ABIs
    let PoolCoreABI, GuidedOracleABI;
    try {
      PoolCoreABI = require('../solidity/BitredictPoolCore.json').abi;
    } catch (error) {
      PoolCoreABI = [
        'function pools(uint256) external view returns (tuple(uint256 poolId, address creator, uint256 totalStake, uint256 creatorStake, uint256 bettorStake, uint8 oracleType, string memory title, string memory description, string memory category, string memory homeTeam, string memory awayTeam, string memory predictedOutcome, uint256 eventEndTime, bool isSettled, string memory result) memory)',
        'function settlePool(uint256 poolId, bytes32 outcome) external',
        'function poolCount() external view returns (uint256)'
      ];
    }
    
    try {
      GuidedOracleABI = require('../solidity/GuidedOracle.json').abi;
    } catch (error) {
      GuidedOracleABI = [
        'function getOutcome(string memory marketId) external view returns (bool isSet, bytes memory resultData)',
        'function executeCall(address target, bytes calldata data) external'
      ];
    }
    
    this.poolContract = new ethers.Contract(
      config.blockchain.contractAddresses.poolCore,
      PoolCoreABI,
      this.provider
    );
    
    this.guidedOracleContract = new ethers.Contract(
      config.blockchain.contractAddresses.guidedOracle,
      GuidedOracleABI,
      this.wallet
    );
  }

  async checkAllPools() {
    try {
      console.log('🏊 CHECKING ALL POOLS (0, 1, 2)');
      console.log('=================================');
      
      // Get total pool count
      const poolCount = await this.poolContract.poolCount();
      console.log(`📊 Total pools in contract: ${poolCount}`);
      
      // Check each pool
      for (let poolId = 0; poolId < Math.min(3, Number(poolCount)); poolId++) {
        await this.checkPool(poolId);
      }
      
      console.log('\n🎉 Pool check completed!');
      
    } catch (error) {
      console.error('❌ Error checking pools:', error);
      throw error;
    }
  }

  async checkPool(poolId) {
    try {
      console.log(`\n🏊 POOL ${poolId} DETAILS:`);
      console.log('========================');
      
      const pool = await this.poolContract.pools(poolId);
      
      // Basic pool info
      console.log(`Creator: ${pool.creator}`);
      console.log(`Oracle Type: ${pool.oracleType} (${pool.oracleType === 0 ? 'GUIDED' : 'OPEN'})`);
      console.log(`Title: ${pool.title}`);
      console.log(`Home Team: ${pool.homeTeam}`);
      console.log(`Away Team: ${pool.awayTeam}`);
      console.log(`Predicted Outcome: ${pool.predictedOutcome}`);
      console.log(`Event End Time: ${pool.eventEndTime} (${new Date(Number(pool.eventEndTime) * 1000).toISOString()})`);
      console.log(`Is Settled: ${pool.isSettled}`);
      console.log(`Result: ${pool.result}`);
      
      // Check if event has ended
      const currentTime = Math.floor(Date.now() / 1000);
      const timeRemaining = Number(pool.eventEndTime) - currentTime;
      console.log(`Time Remaining: ${timeRemaining} seconds (${timeRemaining > 0 ? 'Not ended' : 'Ended'})`);
      
      // Decode predicted outcome
      const predictedOutcome = ethers.toUtf8String(pool.predictedOutcome);
      console.log(`Predicted Outcome (decoded): ${predictedOutcome}`);
      
      // Check if pool can be settled
      if (pool.isSettled) {
        console.log(`✅ Pool ${poolId} is already settled`);
        return;
      }
      
      if (timeRemaining > 0) {
        console.log(`⏰ Pool ${poolId} event has not ended yet`);
        return;
      }
      
      // Try to find oracle outcome for this pool
      console.log(`\n🔍 Looking for oracle outcome for Pool ${poolId}...`);
      
      // Check common market IDs
      const possibleMarketIds = [
        '19391153', // Pool 0
        '19433520', // Pool 1
        '19433521', // Pool 2 (if exists)
        '19433522', // Pool 2 (alternative)
        '19433523'  // Pool 2 (alternative)
      ];
      
      let foundOutcome = null;
      let foundMarketId = null;
      
      for (const marketId of possibleMarketIds) {
        try {
          const outcome = await this.guidedOracleContract.getOutcome(marketId);
          if (outcome[0]) {
            const resultData = outcome[1];
            const decodedResult = ethers.toUtf8String(resultData);
            console.log(`✅ Found outcome for market ${marketId}: ${decodedResult}`);
            foundOutcome = decodedResult;
            foundMarketId = marketId;
            break;
          }
        } catch (error) {
          // Continue to next market ID
        }
      }
      
      if (!foundOutcome) {
        console.log(`❌ No oracle outcome found for Pool ${poolId}`);
        return;
      }
      
      // Check if outcome matches predicted outcome
      const outcomeHash = ethers.keccak256(ethers.toUtf8Bytes(foundOutcome));
      const predictedHash = pool.predictedOutcome;
      
      console.log(`\n🎯 Settlement Analysis for Pool ${poolId}:`);
      console.log(`Oracle Result: ${foundOutcome}`);
      console.log(`Outcome Hash: ${outcomeHash}`);
      console.log(`Predicted Hash: ${predictedHash}`);
      console.log(`Match: ${outcomeHash.toLowerCase() === predictedHash.toLowerCase() ? '✅ Yes' : '❌ No'}`);
      
      if (outcomeHash.toLowerCase() === predictedHash.toLowerCase()) {
        console.log(`📤 Attempting to settle Pool ${poolId}...`);
        
        try {
          const settlePoolInterface = new ethers.Interface([
            'function settlePool(uint256 poolId, bytes32 outcome) external'
          ]);
          const callData = settlePoolInterface.encodeFunctionData('settlePool', [poolId, outcomeHash]);
          
          const tx = await this.guidedOracleContract.executeCall(
            this.poolContract.target,
            callData,
            {
              gasLimit: 1000000
            }
          );
          
          console.log(`📤 Settlement transaction: ${tx.hash}`);
          const receipt = await tx.wait();
          console.log(`✅ Pool ${poolId} settled in block ${receipt.blockNumber}`);
          
          // Check final status
          const finalPool = await this.poolContract.pools(poolId);
          console.log(`Final Status: Settled: ${finalPool.isSettled} | Result: ${finalPool.result}`);
          
        } catch (settlementError) {
          console.error(`❌ Settlement failed for Pool ${poolId}: ${settlementError.message}`);
        }
      } else {
        console.log(`❌ Pool ${poolId} cannot be settled - outcome doesn't match predicted outcome`);
      }
      
    } catch (error) {
      console.error(`❌ Error checking Pool ${poolId}:`, error.message);
    }
  }
}

// Run the check
async function main() {
  const checker = new AllPoolsChecker();
  await checker.checkAllPools();
  process.exit(0);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = AllPoolsChecker;
