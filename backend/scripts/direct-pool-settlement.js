#!/usr/bin/env node

const { ethers } = require('ethers');
const config = require('../config');

/**
 * Direct Pool Settlement - manually settle pools 0 and 1 using contract calls
 */
class DirectPoolSettlement {
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
        'function getOutcome(string memory marketId) external view returns (bool isSet, bytes memory resultData)'
      ];
    }
    
    this.poolContract = new ethers.Contract(
      config.blockchain.contractAddresses.poolCore,
      PoolCoreABI,
      this.wallet
    );
    
    this.guidedOracleContract = new ethers.Contract(
      config.blockchain.contractAddresses.guidedOracle,
      GuidedOracleABI,
      this.provider
    );
  }

  async settlePools() {
    try {
      console.log('🎯 Direct Pool Settlement - Manual Settlement');
      console.log('============================================');
      
      // Check current pool status
      console.log('\n📊 Current pool status:');
      for (let poolId = 0; poolId <= 1; poolId++) {
        try {
          const pool = await this.poolContract.pools(poolId);
          console.log(`Pool ${poolId}: Settled: ${pool.isSettled} | Result: ${pool.result}`);
        } catch (error) {
          console.log(`Pool ${poolId}: Error reading contract - ${error.message}`);
        }
      }
      
      // Check GuidedOracle outcomes
      console.log('\n🔗 Checking GuidedOracle outcomes:');
      const marketIds = ['19391153', '19433520'];
      const outcomes = {};
      
      for (const marketId of marketIds) {
        try {
          const outcome = await this.guidedOracleContract.getOutcome(marketId);
          if (outcome[0]) {
            const resultData = outcome[1];
            const decodedResult = ethers.toUtf8String(resultData);
            outcomes[marketId] = decodedResult;
            console.log(`✅ Market ${marketId}: Outcome exists - ${decodedResult}`);
          } else {
            console.log(`❌ Market ${marketId}: No outcome in contract`);
          }
        } catch (error) {
          console.log(`❌ Market ${marketId}: Error checking outcome - ${error.message}`);
        }
      }
      
      // Settle pools
      console.log('\n🎯 Settling pools:');
      for (let poolId = 0; poolId <= 1; poolId++) {
        try {
          const pool = await this.poolContract.pools(poolId);
          if (pool.isSettled) {
            console.log(`✅ Pool ${poolId} is already settled`);
            continue;
          }
          
          const marketId = poolId === 0 ? '19391153' : '19433520';
          const outcome = outcomes[marketId];
          
          if (!outcome) {
            console.log(`❌ Pool ${poolId}: No outcome available for market ${marketId}`);
            continue;
          }
          
          console.log(`📤 Settling Pool ${poolId} with outcome: ${outcome}`);
          
          // Create outcome hash
          const outcomeHash = ethers.keccak256(ethers.toUtf8Bytes(outcome));
          console.log(`📝 Outcome hash: ${outcomeHash}`);
          
          // Try to settle the pool
          const tx = await this.poolContract.settlePool(poolId, outcomeHash, {
            gasLimit: 500000
          });
          
          console.log(`📤 Settlement transaction: ${tx.hash}`);
          const receipt = await tx.wait();
          console.log(`✅ Pool ${poolId} settled in block ${receipt.blockNumber}`);
          
        } catch (error) {
          console.error(`❌ Pool ${poolId}: Settlement failed - ${error.message}`);
        }
      }
      
      // Check final pool status
      console.log('\n📊 Final pool status:');
      for (let poolId = 0; poolId <= 1; poolId++) {
        try {
          const pool = await this.poolContract.pools(poolId);
          console.log(`Pool ${poolId}: Settled: ${pool.isSettled} | Result: ${pool.result}`);
        } catch (error) {
          console.log(`Pool ${poolId}: Error reading contract - ${error.message}`);
        }
      }
      
      console.log('\n🎉 Direct pool settlement completed!');
      
    } catch (error) {
      console.error('❌ Error in direct pool settlement:', error);
      throw error;
    }
  }
}

// Run the settlement
async function main() {
  const settler = new DirectPoolSettlement();
  await settler.settlePools();
  process.exit(0);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = DirectPoolSettlement;
