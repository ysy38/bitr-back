#!/usr/bin/env node

/**
 * Check Guided Oracle Outcome
 * Check which guided oracle contract has the outcome for market 19568522
 */

require('dotenv').config();
const { ethers } = require('ethers');
const config = require('../config');

class GuidedOracleOutcomeChecker {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    this.wallet = new ethers.Wallet(process.env.ORACLE_PRIVATE_KEY || process.env.ORACLE_SIGNER_PRIVATE_KEY, this.provider);
    
    // Load GuidedOracle ABI
    let GuidedOracleABI;
    
    try {
      GuidedOracleABI = require('../solidity/GuidedOracle.json').abi;
      console.log('✅ GuidedOracle ABI loaded');
    } catch (error) {
      console.warn('⚠️ GuidedOracle ABI not found, using minimal ABI');
      GuidedOracleABI = [
        'function getOutcome(bytes32 marketId) external view returns (bool isSet, bytes memory resultData)',
        'function oracleBot() external view returns (address)'
      ];
    }
    
    this.GuidedOracleABI = GuidedOracleABI;
  }

  async checkOracleOutcome(oracleAddress, marketId) {
    try {
      console.log(`🔍 Checking oracle outcome for market ${marketId} at ${oracleAddress}...`);
      
      const oracleContract = new ethers.Contract(
        oracleAddress,
        this.GuidedOracleABI,
        this.provider
      );
      
      const marketIdBytes32 = ethers.id(marketId.toString());
      const [isSet, resultData] = await oracleContract.getOutcome(marketIdBytes32);
      
      console.log(`📊 Oracle outcome at ${oracleAddress}:`);
      console.log(`  - Is Set: ${isSet}`);
      console.log(`  - Result Data: ${resultData}`);
      
      if (isSet && resultData) {
        const decodedResult = ethers.toUtf8String(resultData);
        console.log(`  - Decoded Result: ${decodedResult}`);
        return { isSet, resultData, decodedResult };
      }
      
      return { isSet, resultData, decodedResult: null };
      
    } catch (error) {
      console.error(`❌ Error checking oracle outcome at ${oracleAddress}:`, error);
      return { isSet: false, resultData: null, decodedResult: null };
    }
  }

  async checkOracleBot(oracleAddress) {
    try {
      console.log(`🔍 Checking oracle bot for ${oracleAddress}...`);
      
      const oracleContract = new ethers.Contract(
        oracleAddress,
        this.GuidedOracleABI,
        this.provider
      );
      
      const oracleBot = await oracleContract.oracleBot();
      console.log(`📊 Oracle Bot: ${oracleBot}`);
      console.log(`📊 Our Wallet: ${this.wallet.address}`);
      console.log(`📊 Match: ${oracleBot.toLowerCase() === this.wallet.address.toLowerCase()}`);
      
      return oracleBot;
      
    } catch (error) {
      console.error(`❌ Error checking oracle bot at ${oracleAddress}:`, error);
      return null;
    }
  }

  async run() {
    try {
      console.log('🚀 Starting Guided Oracle Outcome Checker...');
      
      const marketId = '19568522';
      const configOracleAddress = '0x9CFB1097577480BD0eDe1795018c89786c541097';
      const cursorRulesOracleAddress = '0x2103cCfc9a15F2876765487F594481D5f8EC160a';
      
      console.log(`📊 Market ID: ${marketId}`);
      console.log(`📊 Config Oracle: ${configOracleAddress}`);
      console.log(`📊 Cursor Rules Oracle: ${cursorRulesOracleAddress}`);
      console.log(`📊 Our Wallet: ${this.wallet.address}`);
      
      // Check config oracle
      console.log('\n📋 Checking Config Oracle...');
      await this.checkOracleBot(configOracleAddress);
      const configOutcome = await this.checkOracleOutcome(configOracleAddress, marketId);
      
      // Check cursor rules oracle
      console.log('\n📋 Checking Cursor Rules Oracle...');
      await this.checkOracleBot(cursorRulesOracleAddress);
      const cursorRulesOutcome = await this.checkOracleOutcome(cursorRulesOracleAddress, marketId);
      
      // Summary
      console.log('\n📊 SUMMARY:');
      console.log(`📊 Config Oracle (${configOracleAddress}): ${configOutcome.isSet ? '✅ HAS OUTCOME' : '❌ NO OUTCOME'}`);
      console.log(`📊 Cursor Rules Oracle (${cursorRulesOracleAddress}): ${cursorRulesOutcome.isSet ? '✅ HAS OUTCOME' : '❌ NO OUTCOME'}`);
      
      if (configOutcome.isSet) {
        console.log(`📊 Config Oracle Result: ${configOutcome.decodedResult}`);
      }
      
      if (cursorRulesOutcome.isSet) {
        console.log(`📊 Cursor Rules Oracle Result: ${cursorRulesOutcome.decodedResult}`);
      }
      
    } catch (error) {
      console.error('❌ Guided Oracle Outcome Checker failed:', error);
      process.exit(1);
    }
  }
}

// Run the checker
const checker = new GuidedOracleOutcomeChecker();
checker.run();
