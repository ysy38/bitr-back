#!/usr/bin/env node

/**
 * Settle Pool via Guided Oracle Execute Call
 * Use the GuidedOracle's executeCall function to settle the pool
 */

require('dotenv').config();
const { ethers } = require('ethers');
const config = require('../config');

class PoolSettlementViaGuidedOracleExecute {
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
        'function settlePool(uint256 poolId, bytes32 outcome) external',
        'function settlePoolAutomatically(uint256 poolId) external'
      ];
    }
    
    try {
      GuidedOracleABI = require('../solidity/GuidedOracle.json').abi;
      console.log('✅ GuidedOracle ABI loaded');
    } catch (error) {
      console.warn('⚠️ GuidedOracle ABI not found, using minimal ABI');
      GuidedOracleABI = [
        'function executeCall(address target, bytes calldata data) external',
        'function getOutcome(bytes32 marketId) external view returns (bool isSet, bytes resultData)'
      ];
    }
    
    // Initialize contracts
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

  async checkOracleOutcome(marketId) {
    try {
      console.log(`🔍 Checking oracle outcome for market ${marketId}...`);
      
      const marketIdBytes32 = ethers.id(marketId.toString());
      const [isSet, resultData] = await this.guidedOracleContract.getOutcome(marketIdBytes32);
      
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

  async settlePoolViaGuidedOracle(poolId, marketId) {
    try {
      console.log(`🎯 Settling pool ${poolId} via guided oracle execute call...`);
      
      // Check oracle outcome first
      const oracleOutcome = await this.checkOracleOutcome(marketId);
      
      if (!oracleOutcome.isSet) {
        console.log('❌ Oracle outcome not set, cannot settle pool');
        return false;
      }
      
      console.log(`📊 Oracle outcome: ${oracleOutcome.decodedResult}`);
      
      // Create outcome hash
      const outcomeHash = ethers.keccak256(ethers.toUtf8Bytes(oracleOutcome.decodedResult));
      console.log(`🎯 Using outcome hash: ${outcomeHash}`);
      
      // Create the settlement call data
      const settlePoolCalldata = this.poolContract.interface.encodeFunctionData(
        'settlePool',
        [poolId, outcomeHash]
      );
      
      console.log(`📡 Settlement calldata: ${settlePoolCalldata}`);
      
      // Execute the call through guided oracle
      console.log(`🔄 Executing settlement via guided oracle...`);
      
      const tx = await this.guidedOracleContract.executeCall(
        config.blockchain.contractAddresses.poolCore,
        settlePoolCalldata,
        {
          gasLimit: 500000,
          gasPrice: ethers.parseUnits('20', 'gwei')
        }
      );
      
      console.log(`📤 Transaction submitted: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);
      
      return true;
      
    } catch (error) {
      console.error(`❌ Error settling pool via guided oracle:`, error);
      throw error;
    }
  }

  async run(poolId, marketId) {
    try {
      console.log('🚀 Starting Pool Settlement via Guided Oracle Execute...');
      console.log(`📊 Pool ID: ${poolId}`);
      console.log(`📊 Market ID: ${marketId}`);
      console.log(`📊 Guided Oracle: ${config.blockchain.contractAddresses.guidedOracle}`);
      console.log(`📊 Pool Core: ${config.blockchain.contractAddresses.poolCore}`);
      console.log(`📊 Wallet: ${this.wallet.address}`);
      
      // Check if wallet is the oracle bot
      const oracleBot = await this.guidedOracleContract.oracleBot();
      console.log(`📊 Oracle Bot: ${oracleBot}`);
      
      if (this.wallet.address.toLowerCase() !== oracleBot.toLowerCase()) {
        console.log('❌ Wallet is not the oracle bot, cannot execute calls');
        return;
      }
      
      // Settle the pool
      const success = await this.settlePoolViaGuidedOracle(poolId, marketId);
      
      if (success) {
        console.log('🎉 SUCCESS! Pool settled via guided oracle execute call!');
      } else {
        console.log('❌ FAILED! Pool settlement failed');
      }
      
    } catch (error) {
      console.error('❌ Pool settlement via guided oracle failed:', error);
      process.exit(1);
    }
  }
}

// Get command line arguments
const poolId = process.argv[2] || '0';
const marketId = process.argv[3] || '19568522';

// Run the settlement
const settler = new PoolSettlementViaGuidedOracleExecute();
settler.run(poolId, marketId);
