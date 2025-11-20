#!/usr/bin/env node

/**
 * Manual Football Oracle Trigger
 * Manually trigger the football oracle bot to process fixture 19568522
 */

require('dotenv').config();
const { ethers } = require('ethers');
const config = require('../config');

class ManualFootballOracleTrigger {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    this.wallet = new ethers.Wallet(process.env.ORACLE_PRIVATE_KEY || process.env.ORACLE_SIGNER_PRIVATE_KEY, this.provider);
    
    // Load contract ABIs
    let GuidedOracleABI;
    
    try {
      GuidedOracleABI = require('../solidity/GuidedOracle.json').abi;
      console.log('✅ GuidedOracle ABI loaded');
    } catch (error) {
      console.warn('⚠️ GuidedOracle ABI not found, using minimal ABI');
      GuidedOracleABI = [
        'function submitOutcome(bytes32 marketId, bytes calldata resultData) external',
        'function getOutcome(bytes32 marketId) external view returns (bool isSet, bytes memory resultData)',
        'function oracleBot() external view returns (address)'
      ];
    }
    
    this.guidedOracleContract = new ethers.Contract(
      config.blockchain.contractAddresses.guidedOracle,
      GuidedOracleABI,
      this.wallet
    );
  }

  async checkOracleBotPermission() {
    try {
      console.log('🔍 Checking oracle bot permission...');
      
      const oracleBot = await this.guidedOracleContract.oracleBot();
      console.log(`📊 Oracle Bot: ${oracleBot}`);
      console.log(`📊 Our Wallet: ${this.wallet.address}`);
      
      if (oracleBot.toLowerCase() !== this.wallet.address.toLowerCase()) {
        console.log('❌ Wallet is not the oracle bot, cannot submit outcomes');
        return false;
      }
      
      console.log('✅ Wallet is the oracle bot, can submit outcomes');
      return true;
      
    } catch (error) {
      console.error('❌ Error checking oracle bot permission:', error);
      return false;
    }
  }

  async submitOutcomeToOracle(marketId, outcome) {
    try {
      console.log(`📡 Submitting outcome to guided oracle: ${marketId} -> ${outcome}`);
      
      const marketIdBytes32 = ethers.id(marketId.toString());
      const resultData = ethers.toUtf8Bytes(outcome);
      
      console.log(`📊 Market ID (bytes32): ${marketIdBytes32}`);
      console.log(`📊 Result Data: ${resultData}`);
      
      // Check if outcome already exists
      const [isSet] = await this.guidedOracleContract.getOutcome(marketIdBytes32);
      
      if (isSet) {
        console.log(`⚠️ Outcome already set for market ${marketId}`);
        return true;
      }
      
      // Estimate gas and submit
      const gasEstimate = await this.guidedOracleContract.submitOutcome.estimateGas(
        marketIdBytes32,
        resultData
      );
      
      console.log(`📊 Gas estimate: ${gasEstimate}`);
      
      const tx = await this.guidedOracleContract.submitOutcome(
        marketIdBytes32,
        resultData,
        {
          gasLimit: gasEstimate * 110n / 100n, // Add 10% buffer
          gasPrice: ethers.parseUnits('20', 'gwei')
        }
      );
      
      console.log(`📤 Transaction submitted: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);
      
      return true;
      
    } catch (error) {
      console.error(`❌ Error submitting outcome to oracle:`, error);
      throw error;
    }
  }

  async run() {
    try {
      console.log('🚀 Starting Manual Football Oracle Trigger...');
      
      const marketId = '19568522';
      const outcome = 'Under 2.5';
      
      console.log(`📊 Market ID: ${marketId}`);
      console.log(`📊 Outcome: ${outcome}`);
      console.log(`📊 Guided Oracle: ${config.blockchain.contractAddresses.guidedOracle}`);
      console.log(`📊 Wallet: ${this.wallet.address}`);
      
      // Check oracle bot permission
      const hasPermission = await this.checkOracleBotPermission();
      if (!hasPermission) {
        console.log('❌ No permission to submit outcomes');
        return;
      }
      
      // Submit outcome to oracle
      const success = await this.submitOutcomeToOracle(marketId, outcome);
      
      if (success) {
        console.log('🎉 SUCCESS! Outcome submitted to guided oracle!');
        console.log('📊 The pool should now be able to be settled');
      } else {
        console.log('❌ FAILED! Could not submit outcome to oracle');
      }
      
    } catch (error) {
      console.error('❌ Manual Football Oracle Trigger failed:', error);
      process.exit(1);
    }
  }
}

// Run the trigger
const trigger = new ManualFootballOracleTrigger();
trigger.run();
