#!/usr/bin/env node

/**
 * Test Guided Oracle Contract
 * Test the guided oracle contract functionality
 */

require('dotenv').config();
const { ethers } = require('ethers');
const config = require('../config');

class GuidedOracleContractTester {
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
        'function settlePool(uint256 poolId, bytes32 outcome) external'
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

  async testGuidedOracleContract() {
    try {
      console.log('🔍 Testing Guided Oracle Contract...');
      console.log(`📊 Contract Address: ${config.blockchain.contractAddresses.guidedOracle}`);
      console.log(`📊 Wallet Address: ${this.wallet.address}`);
      
      // Test 1: Check oracle bot address
      console.log('\n📋 Test 1: Checking oracle bot address...');
      const oracleBot = await this.guidedOracleContract.oracleBot();
      console.log(`📊 Oracle Bot: ${oracleBot}`);
      console.log(`📊 Our Wallet: ${this.wallet.address}`);
      console.log(`📊 Match: ${oracleBot.toLowerCase() === this.wallet.address.toLowerCase()}`);
      
      if (oracleBot.toLowerCase() !== this.wallet.address.toLowerCase()) {
        console.log('❌ Wallet is not the oracle bot!');
        return false;
      }
      
      // Test 2: Check if outcome exists
      console.log('\n📋 Test 2: Checking existing outcome...');
      const marketId = ethers.id('19568522');
      const [isSet, resultData] = await this.guidedOracleContract.getOutcome(marketId);
      console.log(`📊 Market ID: ${marketId}`);
      console.log(`📊 Is Set: ${isSet}`);
      console.log(`📊 Result Data: ${resultData}`);
      
      if (isSet && resultData) {
        const decodedResult = ethers.toUtf8String(resultData);
        console.log(`📊 Decoded Result: ${decodedResult}`);
      }
      
      // Test 3: Test executeCall function
      console.log('\n📋 Test 3: Testing executeCall function...');
      
      // Create a simple test call to check if executeCall works
      const testCalldata = this.poolContract.interface.encodeFunctionData('pools', [0]);
      
      try {
        console.log(`📊 Test calldata: ${testCalldata}`);
        console.log(`📊 Target: ${config.blockchain.contractAddresses.poolCore}`);
        
        // This should work - it's just a view function call
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
        
      } catch (error) {
        console.error(`❌ executeCall test failed:`, error);
        return false;
      }
      
      console.log('\n✅ All tests passed! Guided Oracle Contract is working correctly.');
      return true;
      
    } catch (error) {
      console.error('❌ Error testing guided oracle contract:', error);
      return false;
    }
  }

  async testPoolSettlement() {
    try {
      console.log('\n🔍 Testing Pool Settlement...');
      
      const poolId = 0;
      const marketId = '19568522';
      const outcome = 'Under 2.5';
      
      // Create outcome hash
      const outcomeHash = ethers.keccak256(ethers.toUtf8Bytes(outcome));
      console.log(`📊 Outcome: ${outcome}`);
      console.log(`📊 Outcome Hash: ${outcomeHash}`);
      
      // Create settlement calldata
      const settlePoolCalldata = this.poolContract.interface.encodeFunctionData(
        'settlePool',
        [poolId, outcomeHash]
      );
      
      console.log(`📊 Settlement calldata: ${settlePoolCalldata}`);
      
      // Test the settlement call
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
      console.error('❌ Error testing pool settlement:', error);
      return false;
    }
  }

  async run() {
    try {
      console.log('🚀 Starting Guided Oracle Contract Tester...');
      
      // Test the guided oracle contract
      const contractWorking = await this.testGuidedOracleContract();
      
      if (!contractWorking) {
        console.log('❌ Guided Oracle Contract is not working correctly');
        return;
      }
      
      // Test pool settlement
      const settlementWorking = await this.testPoolSettlement();
      
      if (settlementWorking) {
        console.log('\n🎉 SUCCESS! Pool settlement is working!');
        console.log('📊 Pool 0 should now be settled');
        console.log('📊 Winners can now claim their prizes');
      } else {
        console.log('\n❌ Pool settlement failed');
      }
      
    } catch (error) {
      console.error('❌ Guided Oracle Contract Tester failed:', error);
      process.exit(1);
    }
  }
}

// Run the tester
const tester = new GuidedOracleContractTester();
tester.run();
