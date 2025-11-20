#!/usr/bin/env node

const { ethers } = require('ethers');
const config = require('../config');

/**
 * Check what the Football Oracle Bot is actually submitting
 */
class OracleOutcomeChecker {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    this.wallet = new ethers.Wallet('0x92961421b053ae691cde04f131bd6ebf8745c5a501be3cab8ddedb341c52afc4', this.provider);
    
    try {
      const GuidedOracleABI = require('../solidity/GuidedOracle.json').abi;
      this.guidedOracleContract = new ethers.Contract(
        config.blockchain.contractAddresses.guidedOracle,
        GuidedOracleABI,
        this.provider
      );
    } catch (error) {
      console.error('Error loading GuidedOracle ABI:', error);
      process.exit(1);
    }
  }

  async checkOutcomes() {
    try {
      console.log('🔮 CHECKING ORACLE OUTCOMES');
      console.log('===========================');
      
      const marketIds = ['19391153', '19433520'];
      
      for (const marketId of marketIds) {
        console.log(`\n📊 Market ${marketId}:`);
        
        try {
          const outcome = await this.guidedOracleContract.getOutcome(marketId);
          
          if (outcome[0]) {
            const resultData = outcome[1];
            const decodedResult = ethers.toUtf8String(resultData);
            
            console.log(`✅ Outcome exists:`);
            console.log(`  Raw bytes: ${resultData}`);
            console.log(`  Decoded: "${decodedResult}"`);
            console.log(`  Length: ${decodedResult.length} characters`);
            
            // Check what this should be for each pool
            if (marketId === '19391153') {
              console.log(`\n🎯 Pool 0 Analysis (Coritiba vs Botafogo):`);
              console.log(`  Pool predicted: "Coritiba wins"`);
              console.log(`  Oracle result: "${decodedResult}"`);
              console.log(`  Should be: "Home wins" (Coritiba is home team)`);
              console.log(`  Match: ${decodedResult === 'Home wins' ? '✅ Yes' : '❌ No'}`);
            } else if (marketId === '19433520') {
              console.log(`\n🎯 Pool 1 Analysis (Bayer vs Union):`);
              console.log(`  Pool predicted: "Bayer 04 Leverkusen vs FC Union"`);
              console.log(`  Oracle result: "${decodedResult}"`);
              console.log(`  Should be: "Home wins" (Bayer is home team)`);
              console.log(`  Match: ${decodedResult === 'Home wins' ? '✅ Yes' : '❌ No'}`);
            }
            
          } else {
            console.log(`❌ No outcome set for market ${marketId}`);
          }
          
        } catch (error) {
          console.error(`❌ Error checking market ${marketId}:`, error.message);
        }
      }
      
      console.log('\n💡 ANALYSIS:');
      console.log('The Football Oracle Bot is submitting generic outcomes ("Home wins")');
      console.log('But the pools have team-specific predictions ("Coritiba wins", "Bayer vs Union")');
      console.log('This is a format mismatch that prevents settlement.');
      
      console.log('\n🔧 SOLUTION:');
      console.log('1. Frontend should submit generic predictions ("Home wins", "Away wins", "Draw")');
      console.log('2. Oracle Bot should submit matching generic outcomes');
      console.log('3. Both should use the same standardized format');
      
    } catch (error) {
      console.error('❌ Error checking outcomes:', error);
      throw error;
    }
  }
}

// Run the check
async function main() {
  const checker = new OracleOutcomeChecker();
  await checker.checkOutcomes();
  process.exit(0);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = OracleOutcomeChecker;
