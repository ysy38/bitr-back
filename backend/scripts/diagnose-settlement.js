#!/usr/bin/env node

const { ethers } = require('ethers');
const config = require('../config');

/**
 * Comprehensive settlement diagnosis
 */
class SettlementDiagnosis {
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
      this.provider
    );
  }

  async diagnose() {
    try {
      console.log('🔍 Settlement Diagnosis');
      console.log('======================');
      
      // Check contract addresses
      console.log('\n📋 Contract Addresses:');
      console.log(`PoolCore: ${this.poolContract.target}`);
      console.log(`GuidedOracle: ${this.guidedOracleContract.target}`);
      console.log(`Oracle Bot: ${await this.wallet.getAddress()}`);
      
      // Check GuidedOracle authorization
      try {
        const authorizedBot = await this.guidedOracleContract.oracleBot();
        console.log(`Authorized Oracle Bot: ${authorizedBot}`);
        console.log(`Bot Authorization: ${authorizedBot.toLowerCase() === (await this.wallet.getAddress()).toLowerCase() ? '✅ Authorized' : '❌ Not Authorized'}`);
      } catch (error) {
        console.log(`❌ Error checking oracle bot authorization: ${error.message}`);
      }
      
      // Check pool details
      console.log('\n🏊 Pool Details:');
      for (let poolId = 0; poolId <= 1; poolId++) {
        try {
          const pool = await this.poolContract.pools(poolId);
          console.log(`\nPool ${poolId}:`);
          console.log(`  Creator: ${pool.creator}`);
          console.log(`  Oracle Type: ${pool.oracleType} (${pool.oracleType === 0 ? 'GUIDED' : 'OPEN'})`);
          console.log(`  Title: ${pool.title}`);
          console.log(`  Home Team: ${pool.homeTeam}`);
          console.log(`  Away Team: ${pool.awayTeam}`);
          console.log(`  Predicted Outcome: ${pool.predictedOutcome}`);
          console.log(`  Event End Time: ${pool.eventEndTime} (${new Date(Number(pool.eventEndTime) * 1000).toISOString()})`);
          console.log(`  Is Settled: ${pool.isSettled}`);
          console.log(`  Result: ${pool.result}`);
          
          // Check if event has ended
          const currentTime = Math.floor(Date.now() / 1000);
          const timeRemaining = Number(pool.eventEndTime) - currentTime;
          console.log(`  Time Remaining: ${timeRemaining} seconds (${timeRemaining > 0 ? 'Not ended' : 'Ended'})`);
          
        } catch (error) {
          console.log(`❌ Pool ${poolId}: Error reading contract - ${error.message}`);
        }
      }
      
      // Check GuidedOracle outcomes
      console.log('\n🔗 GuidedOracle Outcomes:');
      const marketIds = ['19391153', '19433520'];
      for (const marketId of marketIds) {
        try {
          const outcome = await this.guidedOracleContract.getOutcome(marketId);
          if (outcome[0]) {
            const resultData = outcome[1];
            const decodedResult = ethers.toUtf8String(resultData);
            console.log(`✅ Market ${marketId}: ${decodedResult}`);
            
            // Calculate outcome hash
            const outcomeHash = ethers.keccak256(ethers.toUtf8Bytes(decodedResult));
            console.log(`   Outcome Hash: ${outcomeHash}`);
          } else {
            console.log(`❌ Market ${marketId}: No outcome`);
          }
        } catch (error) {
          console.log(`❌ Market ${marketId}: Error - ${error.message}`);
        }
      }
      
      // Test settlement with detailed error handling
      console.log('\n🧪 Testing Settlement:');
      for (let poolId = 0; poolId <= 1; poolId++) {
        try {
          const pool = await this.poolContract.pools(poolId);
          if (pool.isSettled) {
            console.log(`✅ Pool ${poolId} is already settled`);
            continue;
          }
          
          const marketId = poolId === 0 ? '19391153' : '19433520';
          const outcome = await this.guidedOracleContract.getOutcome(marketId);
          
          if (!outcome[0]) {
            console.log(`❌ Pool ${poolId}: No outcome available`);
            continue;
          }
          
          const resultData = outcome[1];
          const decodedResult = ethers.toUtf8String(resultData);
          const outcomeHash = ethers.keccak256(ethers.toUtf8Bytes(decodedResult));
          
          console.log(`\n🎯 Pool ${poolId} Settlement Test:`);
          console.log(`  Oracle Result: ${decodedResult}`);
          console.log(`  Outcome Hash: ${outcomeHash}`);
          console.log(`  Predicted Outcome: ${pool.predictedOutcome}`);
          console.log(`  Match: ${outcomeHash.toLowerCase() === pool.predictedOutcome.toLowerCase() ? '✅ Yes' : '❌ No'}`);
          
          // Try to estimate gas for settlement
          try {
            const settlePoolInterface = new ethers.Interface([
              'function settlePool(uint256 poolId, bytes32 outcome) external'
            ]);
            const callData = settlePoolInterface.encodeFunctionData('settlePool', [poolId, outcomeHash]);
            
            const gasEstimate = await this.guidedOracleContract.executeCall.estimateGas(
              this.poolContract.target,
              callData
            );
            console.log(`  Gas Estimate: ${gasEstimate.toString()}`);
            
          } catch (gasError) {
            console.log(`  Gas Estimate Failed: ${gasError.message}`);
          }
          
        } catch (error) {
          console.log(`❌ Pool ${poolId}: Error - ${error.message}`);
        }
      }
      
      console.log('\n🎉 Diagnosis completed!');
      
    } catch (error) {
      console.error('❌ Error in diagnosis:', error);
      throw error;
    }
  }
}

// Run the diagnosis
async function main() {
  const diagnosis = new SettlementDiagnosis();
  await diagnosis.diagnose();
  process.exit(0);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = SettlementDiagnosis;
