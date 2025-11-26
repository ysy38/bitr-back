#!/usr/bin/env node

/**
 * Settle Pool via Guided Oracle
 * Use the GuidedOracle's executeCall function to settle the pool
 */

require('dotenv').config();
const { ethers } = require('ethers');
const config = require('../config');

class PoolSettlementViaGuidedOracle {
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
        'function settlePoolAutomatically(uint256 poolId) external',
        'function pools(uint256) external view returns (tuple(uint256 creatorStake, uint256 totalStake, uint256 eventStartTime, uint256 eventEndTime, uint256 bettingEndTime, uint256 arbitrationDeadline, bytes32 predictedOutcome, bytes32 result, bytes32 marketId, uint8 oracleType, uint8 flags, uint256 resultTimestamp))'
      ];
    }
    
    try {
      GuidedOracleABI = require('../solidity/GuidedOracle.json').abi;
      console.log('✅ GuidedOracle ABI loaded');
    } catch (error) {
      console.warn('⚠️ GuidedOracle ABI not found, using minimal ABI');
      GuidedOracleABI = [
        'function executeCall(address target, bytes calldata data) external',
        'function oracleBot() external view returns (address)',
        'function getOutcome(bytes32 marketId) external view returns (bool isSet, bytes memory resultData)'
      ];
    }
    
    // Initialize contracts
    if (config.blockchain.contractAddresses?.poolCore) {
      this.poolContract = new ethers.Contract(
        config.blockchain.contractAddresses.poolCore,
        PoolCoreABI,
        this.provider // Read-only for getting pool data
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

  async checkOracleBotPermission() {
    try {
      console.log('🔍 Checking oracle bot permissions...');
      
      const oracleBotAddress = await this.oracleContract.oracleBot();
      const walletAddress = this.wallet.address;
      
      console.log(`📊 Oracle Bot Address: ${oracleBotAddress}`);
      console.log(`📊 Wallet Address: ${walletAddress}`);
      console.log(`📊 Is Oracle Bot: ${oracleBotAddress.toLowerCase() === walletAddress.toLowerCase()}`);
      
      if (oracleBotAddress.toLowerCase() !== walletAddress.toLowerCase()) {
        console.log(`❌ Wallet is not the oracle bot!`);
        console.log(`   Oracle Bot: ${oracleBotAddress}`);
        console.log(`   Wallet: ${walletAddress}`);
        return false;
      }
      
      console.log(`✅ Wallet is authorized as oracle bot`);
      return true;
      
    } catch (error) {
      console.error(`❌ Error checking oracle bot permission:`, error);
      return false;
    }
  }

  async checkPoolStatus(poolId) {
    try {
      console.log(`🔍 Checking pool ${poolId} status...`);
      
      const pool = await this.poolContract.pools(poolId);
      console.log(`📊 Pool ${poolId} data:`);
      console.log(`  - Oracle Type: ${pool.oracleType}`);
      console.log(`  - Market ID: ${pool.marketId}`);
      console.log(`  - Event End: ${new Date(Number(pool.eventEndTime) * 1000).toISOString()}`);
      console.log(`  - Result: ${pool.result}`);
      console.log(`  - Flags: ${pool.flags}`);
      
      // Check if pool is settled
      const isSettled = pool.result !== '0x0000000000000000000000000000000000000000000000000000000000000000' && (Number(pool.flags) & 1) === 1;
      console.log(`  - Is Settled: ${isSettled}`);
      
      return { pool, isSettled };
      
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

  async settlePoolViaGuidedOracle(poolId) {
    try {
      console.log(`🎯 Settling pool ${poolId} via guided oracle...`);
      
      // Get pool contract address
      const poolContractAddress = config.blockchain.contractAddresses.poolCore;
      console.log(`📊 Pool Contract: ${poolContractAddress}`);
      
      // Encode the settlePoolAutomatically call
      const poolContractInterface = new ethers.Interface([
        'function settlePoolAutomatically(uint256 poolId) external'
      ]);
      
      const callData = poolContractInterface.encodeFunctionData('settlePoolAutomatically', [poolId]);
      console.log(`📊 Call Data: ${callData}`);
      
      // Estimate gas for the executeCall
      const gasEstimate = await this.oracleContract.executeCall.estimateGas(
        poolContractAddress,
        callData
      );
      console.log(`⛽ Gas estimate: ${gasEstimate}`);
      
      // Execute the call through guided oracle
      const tx = await this.oracleContract.executeCall(
        poolContractAddress,
        callData,
        {
          gasLimit: gasEstimate * 120n / 100n // 20% buffer
        }
      );
      
      console.log(`📤 Settlement transaction via guided oracle: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`✅ Pool ${poolId} settled via guided oracle in block ${receipt.blockNumber}`);
      
      return { success: true, txHash: tx.hash, blockNumber: receipt.blockNumber };
      
    } catch (error) {
      console.error(`❌ Error settling pool via guided oracle:`, error);
      return { success: false, error: error.message };
    }
  }

  async run(poolId) {
    try {
      console.log('🚀 Starting Pool Settlement via Guided Oracle...');
      console.log(`📊 Pool ID: ${poolId}`);
      
      // Step 1: Check oracle bot permission
      console.log('\n📋 Step 1: Checking oracle bot permission...');
      const hasPermission = await this.checkOracleBotPermission();
      if (!hasPermission) {
        console.log(`❌ Cannot proceed without oracle bot permission`);
        return;
      }
      
      // Step 2: Check pool status
      console.log('\n📋 Step 2: Checking pool status...');
      const { pool, isSettled } = await this.checkPoolStatus(poolId);
      
      if (isSettled) {
        console.log(`✅ Pool ${poolId} is already settled`);
        return;
      }
      
      // Step 3: Check oracle outcome
      console.log('\n📋 Step 3: Checking oracle outcome...');
      const oracleResult = await this.checkOracleOutcome(pool.marketId);
      
      if (!oracleResult.isSet) {
        console.log(`❌ No oracle outcome available for settlement`);
        return;
      }
      
      console.log(`✅ Oracle outcome available: ${oracleResult.decodedResult}`);
      
      // Step 4: Settle pool via guided oracle
      console.log('\n📋 Step 4: Settling pool via guided oracle...');
      const settlementResult = await this.settlePoolViaGuidedOracle(poolId);
      
      if (settlementResult.success) {
        console.log(`\n🎉 SUCCESS! Pool ${poolId} settled via guided oracle!`);
        console.log(`📤 Transaction: ${settlementResult.txHash}`);
        console.log(`📦 Block: ${settlementResult.blockNumber}`);
        console.log(`🎯 Outcome: ${oracleResult.decodedResult}`);
      } else {
        console.log(`❌ Failed to settle pool: ${settlementResult.error}`);
      }
      
    } catch (error) {
      console.error('❌ Pool settlement via guided oracle failed:', error);
      process.exit(1);
    }
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length < 1) {
  console.log('Usage: node settle-pool-via-guided-oracle.js <poolId>');
  console.log('Example: node settle-pool-via-guided-oracle.js 0');
  process.exit(1);
}

const [poolId] = args;

// Run the settlement
const settler = new PoolSettlementViaGuidedOracle();
settler.run(parseInt(poolId));
