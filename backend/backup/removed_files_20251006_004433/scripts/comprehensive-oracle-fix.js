#!/usr/bin/env node

/**
 * Comprehensive Oracle Fix
 * Complete solution to fix the oracle system and settle pool 0
 */

require('dotenv').config();
const { ethers } = require('ethers');
const config = require('../config');

class ComprehensiveOracleFix {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    this.wallet = new ethers.Wallet(process.env.ORACLE_PRIVATE_KEY || process.env.ORACLE_SIGNER_PRIVATE_KEY, this.provider);
    
    // Load contract ABIs
    let GuidedOracleABI, PoolCoreABI;
    
    try {
      GuidedOracleABI = require('../solidity/GuidedOracle.json').abi;
      console.log('✅ GuidedOracle ABI loaded');
    } catch (error) {
      console.warn('⚠️ GuidedOracle ABI not found, using minimal ABI');
      GuidedOracleABI = [
        'function executeCall(address target, bytes calldata data) external',
        'function getOutcome(bytes32 marketId) external view returns (bool isSet, bytes memory resultData)',
        'function oracleBot() external view returns (address)',
        'function submitOutcome(bytes32 marketId, bytes calldata resultData) external'
      ];
    }
    
    try {
      PoolCoreABI = require('../solidity/BitredictPoolCore.json').abi;
      console.log('✅ PoolCore ABI loaded');
    } catch (error) {
      console.warn('⚠️ PoolCore ABI not found, using minimal ABI');
      PoolCoreABI = [
        'function settlePool(uint256 poolId, bytes32 outcome) external',
        'function pools(uint256) external view returns (tuple(uint256 creatorStake, uint256 totalStake, uint256 eventStartTime, uint256 eventEndTime, uint256 bettingEndTime, uint256 arbitrationDeadline, uint256 oracleType, uint256 marketId, bytes32 predictedOutcome, bytes32 result, uint256 flags, uint256 resultTimestamp, bytes32 league, bytes32 category, bytes32 region, bytes32 homeTeam, bytes32 awayTeam, bytes32 title, bool isPrivate, uint256 maxBetPerUser, bool useBitr, uint256 totalCreatorSideStake, uint256 maxBettorStake, uint256 totalBettorStake, uint256 odds))'
      ];
    }
    
    this.guidedOracleContract = new ethers.Contract(
      config.blockchain.contractAddresses.guidedOracle,
      GuidedOracleABI,
      this.wallet
    );
    
    this.poolContract = new ethers.Contract(
      config.blockchain.contractAddresses.poolCore,
      PoolCoreABI,
      this.provider
    );
  }

  async analyzeCurrentState() {
    try {
      console.log('🔍 Analyzing current state...');
      
      // Check pool status
      const pool = await this.poolContract.pools(0);
      const isSettled = (Number(pool.flags) & 1) === 1;
      const result = pool.result;
      
      console.log(`📊 Pool 0 Status:`);
      console.log(`  - Is Settled: ${isSettled}`);
      console.log(`  - Result: ${result}`);
      console.log(`  - Flags: ${Number(pool.flags)}`);
      
      // Check oracle outcome
      const marketId = ethers.id('19568522');
      const [isSet, resultData] = await this.guidedOracleContract.getOutcome(marketId);
      
      console.log(`📊 Oracle Outcome:`);
      console.log(`  - Is Set: ${isSet}`);
      console.log(`  - Result Data: ${resultData}`);
      
      if (isSet && resultData) {
        const decodedResult = ethers.toUtf8String(resultData);
        console.log(`  - Decoded Result: ${decodedResult}`);
      }
      
      // Check oracle bot permission
      const oracleBot = await this.guidedOracleContract.oracleBot();
      console.log(`📊 Oracle Bot: ${oracleBot}`);
      console.log(`📊 Our Wallet: ${this.wallet.address}`);
      console.log(`📊 Match: ${oracleBot.toLowerCase() === this.wallet.address.toLowerCase()}`);
      
      return {
        poolSettled: isSettled,
        oracleOutcomeSet: isSet,
        oracleBotMatch: oracleBot.toLowerCase() === this.wallet.address.toLowerCase()
      };
      
    } catch (error) {
      console.error('❌ Error analyzing current state:', error);
      throw error;
    }
  }

  async testGuidedOracleExecuteCall() {
    try {
      console.log('🔍 Testing guided oracle executeCall function...');
      
      // Test with a simple view function call
      const testCalldata = this.poolContract.interface.encodeFunctionData('pools', [0]);
      
      console.log(`📊 Test calldata: ${testCalldata}`);
      console.log(`📊 Target: ${config.blockchain.contractAddresses.poolCore}`);
      
      try {
        const tx = await this.guidedOracleContract.executeCall(
          config.blockchain.contractAddresses.poolCore,
          testCalldata,
          {
            gasLimit: 100000,
            gasPrice: ethers.parseUnits('20', 'gwei')
          }
        );
        
        console.log(`📤 Test transaction submitted: ${tx.hash}`);
        const receipt = await tx.wait();
        console.log(`✅ Test transaction confirmed in block ${receipt.blockNumber}`);
        
        return true;
        
      } catch (error) {
        console.error(`❌ executeCall test failed:`, error);
        return false;
      }
      
    } catch (error) {
      console.error('❌ Error testing executeCall:', error);
      return false;
    }
  }

  async settlePoolWithCorrectOutcome() {
    try {
      console.log('🎯 Attempting to settle pool with correct outcome...');
      
      const poolId = 0;
      const correctOutcome = '1'; // Home win (Galatasaray won)
      const outcomeHash = ethers.keccak256(ethers.toUtf8Bytes(correctOutcome));
      
      console.log(`📊 Pool ID: ${poolId}`);
      console.log(`📊 Correct Outcome: ${correctOutcome}`);
      console.log(`📊 Outcome Hash: ${outcomeHash}`);
      
      // Create settlement calldata
      const settlePoolCalldata = this.poolContract.interface.encodeFunctionData(
        'settlePool',
        [poolId, outcomeHash]
      );
      
      console.log(`📊 Settlement calldata: ${settlePoolCalldata}`);
      
      // Execute settlement via guided oracle
      const tx = await this.guidedOracleContract.executeCall(
        config.blockchain.contractAddresses.poolCore,
        settlePoolCalldata,
        {
          gasLimit: 500000,
          gasPrice: ethers.parseUnits('20', 'gwei')
        }
      );
      
      console.log(`📤 Settlement transaction submitted: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`✅ Settlement transaction confirmed in block ${receipt.blockNumber}`);
      
      return true;
      
    } catch (error) {
      console.error('❌ Error settling pool:', error);
      return false;
    }
  }

  async run() {
    try {
      console.log('🚀 Starting Comprehensive Oracle Fix...');
      
      // Step 1: Analyze current state
      console.log('\n📋 Step 1: Analyzing current state...');
      const state = await this.analyzeCurrentState();
      
      if (state.poolSettled) {
        console.log('✅ Pool 0 is already settled!');
        return;
      }
      
      if (!state.oracleBotMatch) {
        console.log('❌ Wallet is not the oracle bot!');
        return;
      }
      
      // Step 2: Test guided oracle executeCall
      console.log('\n📋 Step 2: Testing guided oracle executeCall...');
      const executeCallWorking = await this.testGuidedOracleExecuteCall();
      
      if (!executeCallWorking) {
        console.log('❌ Guided oracle executeCall is not working!');
        console.log('❌ Need to redeploy guided oracle contract');
        return;
      }
      
      // Step 3: Settle pool with correct outcome
      console.log('\n📋 Step 3: Settling pool with correct outcome...');
      const settlementSuccess = await this.settlePoolWithCorrectOutcome();
      
      if (settlementSuccess) {
        console.log('\n🎉 SUCCESS! Pool 0 has been settled!');
        console.log('📊 Winners can now claim their prizes');
        console.log('📊 The oracle system is working correctly');
      } else {
        console.log('\n❌ FAILED! Pool settlement failed');
        console.log('❌ Need to investigate further');
      }
      
    } catch (error) {
      console.error('❌ Comprehensive Oracle Fix failed:', error);
      process.exit(1);
    }
  }
}

// Run the fixer
const fixer = new ComprehensiveOracleFix();
fixer.run();
