#!/usr/bin/env node

/**
 * Fix Oracle Outcome
 * Submit the correct outcome for the moneyline pool
 */

require('dotenv').config();
const { ethers } = require('ethers');
const config = require('../config');

class OracleOutcomeFixer {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    this.wallet = new ethers.Wallet(process.env.ORACLE_PRIVATE_KEY || process.env.ORACLE_SIGNER_PRIVATE_KEY, this.provider);
    
    // Load contract ABI
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

  async checkCurrentOutcome() {
    try {
      console.log('🔍 Checking current oracle outcome...');
      
      const marketId = ethers.id('19568522');
      const [isSet, resultData] = await this.guidedOracleContract.getOutcome(marketId);
      
      console.log(`📊 Market ID: ${marketId}`);
      console.log(`📊 Is Set: ${isSet}`);
      console.log(`📊 Result Data: ${resultData}`);
      
      if (isSet && resultData) {
        const decodedResult = ethers.toUtf8String(resultData);
        console.log(`📊 Decoded Result: ${decodedResult}`);
        return { isSet, resultData, decodedResult };
      }
      
      return { isSet, resultData, decodedResult: null };
      
    } catch (error) {
      console.error('❌ Error checking current outcome:', error);
      throw error;
    }
  }

  async submitCorrectOutcome() {
    try {
      console.log('📡 Submitting correct outcome to oracle...');
      
      const marketId = ethers.id('19568522');
      const correctOutcome = '1'; // Home win (Galatasaray won)
      const resultData = ethers.toUtf8Bytes(correctOutcome);
      
      console.log(`📊 Market ID: ${marketId}`);
      console.log(`📊 Correct Outcome: ${correctOutcome}`);
      console.log(`📊 Result Data: ${resultData}`);
      
      // Check if outcome already exists
      const [isSet] = await this.guidedOracleContract.getOutcome(marketId);
      
      if (isSet) {
        console.log('⚠️ Outcome already set for market 19568522');
        console.log('❌ Cannot update existing outcome - need to redeploy contract');
        return false;
      }
      
      // Submit the correct outcome
      const gasEstimate = await this.guidedOracleContract.submitOutcome.estimateGas(
        marketId,
        resultData
      );
      
      console.log(`📊 Gas estimate: ${gasEstimate}`);
      
      const tx = await this.guidedOracleContract.submitOutcome(
        marketId,
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
      console.error('❌ Error submitting correct outcome:', error);
      throw error;
    }
  }

  async run() {
    try {
      console.log('🚀 Starting Oracle Outcome Fixer...');
      
      const marketId = '19568522';
      const correctOutcome = '1'; // Home win (Galatasaray won)
      
      console.log(`📊 Market ID: ${marketId}`);
      console.log(`📊 Correct Outcome: ${correctOutcome}`);
      console.log(`📊 Match Result: Galatasaray 1-0 Liverpool`);
      console.log(`📊 Pool Type: MONEYLINE`);
      console.log(`📊 Guided Oracle: ${config.blockchain.contractAddresses.guidedOracle}`);
      console.log(`📊 Wallet: ${this.wallet.address}`);
      
      // Check current outcome
      console.log('\n📋 Checking current outcome...');
      const currentOutcome = await this.checkCurrentOutcome();
      
      if (currentOutcome.isSet) {
        console.log(`📊 Current outcome: ${currentOutcome.decodedResult}`);
        
        if (currentOutcome.decodedResult === correctOutcome) {
          console.log('✅ Outcome is already correct!');
          return;
        } else {
          console.log(`❌ Outcome is incorrect: ${currentOutcome.decodedResult} (should be ${correctOutcome})`);
          console.log('❌ Cannot update existing outcome - need to redeploy contract');
          return;
        }
      }
      
      // Submit correct outcome
      console.log('\n📋 Submitting correct outcome...');
      const success = await this.submitCorrectOutcome();
      
      if (success) {
        console.log('🎉 SUCCESS! Correct outcome submitted to oracle!');
        console.log('📊 Pool 0 should now be able to be settled with the correct outcome');
      } else {
        console.log('❌ FAILED! Could not submit correct outcome');
      }
      
    } catch (error) {
      console.error('❌ Oracle Outcome Fixer failed:', error);
      process.exit(1);
    }
  }
}

// Run the fixer
const fixer = new OracleOutcomeFixer();
fixer.run();
