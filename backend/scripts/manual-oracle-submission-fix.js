#!/usr/bin/env node

const { ethers } = require('ethers');
const config = require('../config');

/**
 * Manual oracle submission fix - directly submit outcomes to GuidedOracle contract
 * This bypasses the Football Oracle Bot and directly submits outcomes for pools 0 and 1
 */
class ManualOracleSubmissionFix {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    this.wallet = new ethers.Wallet('0x92961421b053ae691cde04f131bd6ebf8745c5a501be3cab8ddedb341c52afc4', this.provider);
    
    // Load GuidedOracle ABI
    let GuidedOracleABI;
    try {
      GuidedOracleABI = require('../solidity/GuidedOracle.json').abi;
    } catch (error) {
      console.warn('⚠️ GuidedOracle ABI not found, using minimal ABI');
      GuidedOracleABI = [
        'function submitOutcome(string memory marketId, bytes calldata resultData) external',
        'function getOutcome(string memory marketId) external view returns (bool isSet, bytes memory resultData)',
        'function oracleBot() external view returns (address)',
        'event OutcomeSubmitted(string indexed marketId, bytes resultData, uint256 timestamp)'
      ];
    }
    
    this.guidedOracleContract = new ethers.Contract(
      config.blockchain.contractAddresses.guidedOracle,
      GuidedOracleABI,
      this.wallet
    );
  }

  async fixOracleSubmissions() {
    try {
      console.log('🔧 Manual Oracle Submission Fix - Direct Contract Submission');
      console.log('============================================================');
      
      // Verify oracle bot authorization
      const botAddress = await this.wallet.getAddress();
      const authorizedBot = await this.guidedOracleContract.oracleBot();
      console.log(`Oracle bot wallet: ${botAddress}`);
      console.log(`Authorized bot: ${authorizedBot}`);
      
      if (botAddress.toLowerCase() !== authorizedBot.toLowerCase()) {
        console.error(`❌ CRITICAL: Wallet ${botAddress} is not the authorized oracle bot (${authorizedBot})`);
        console.error('This is why oracle submissions are failing!');
        return false;
      }
      
      console.log('✅ Oracle bot authorization verified');
      
      // Define the markets that need oracle submission
      const markets = [
        {
          pool_id: '0',
          market_id: '19391153',
          outcome_type: '1X2',
          result: 'Home wins',
          home_team: 'Coritiba',
          away_team: 'Botafogo SP'
        },
        {
          pool_id: '1', 
          market_id: '19433520',
          outcome_type: '1X2',
          result: 'Home wins',
          home_team: 'Bayer 04 Leverkusen',
          away_team: 'FC Union Berlin'
        }
      ];
      
      console.log(`📊 Processing ${markets.length} markets for oracle submission:`);
      markets.forEach(market => {
        console.log(`Pool ${market.pool_id}: Market ${market.market_id} | Result: ${market.result}`);
      });
      
      let successCount = 0;
      let failureCount = 0;
      
      for (const market of markets) {
        console.log(`\n🔄 Processing Pool ${market.pool_id} (Market ${market.market_id})...`);
        
        try {
          // Check if outcome already exists in contract
          const existingOutcome = await this.guidedOracleContract.getOutcome(market.market_id);
          if (existingOutcome[0]) {
            console.log(`⚠️ Pool ${market.pool_id}: Outcome already exists in contract`);
            successCount++;
            continue;
          }
          
          // Prepare result data
          const resultData = ethers.toUtf8Bytes(market.result);
          console.log(`📤 Submitting outcome: ${market.market_id} -> ${market.result}`);
          
          // Submit outcome to GuidedOracle contract
          const tx = await this.guidedOracleContract.submitOutcome(
            market.market_id,
            resultData,
            {
              gasLimit: 500000
            }
          );
          
          console.log(`📤 Transaction submitted: ${tx.hash}`);
          const receipt = await tx.wait();
          console.log(`✅ Pool ${market.pool_id}: Outcome submitted successfully in block ${receipt.blockNumber}`);
          
          successCount++;
          
        } catch (error) {
          console.error(`❌ Pool ${market.pool_id}: Failed to submit outcome:`, error.message);
          failureCount++;
        }
      }
      
      console.log(`\n🎉 Manual oracle submission fix completed!`);
      console.log(`✅ Successful submissions: ${successCount}`);
      console.log(`❌ Failed submissions: ${failureCount}`);
      
      if (successCount > 0) {
        console.log('\n📋 Next steps:');
        console.log('1. Pool Settlement Service should detect OutcomeSubmitted events');
        console.log('2. Pools will be automatically settled');
        console.log('3. Bettors can claim their winnings');
        console.log('\n🔍 Check the deployed backend logs to see settlement activity');
      }
      
      return successCount > 0;
      
    } catch (error) {
      console.error('❌ Error in manual oracle submission fix:', error);
      throw error;
    }
  }
}

// Run the fix
async function main() {
  const fixer = new ManualOracleSubmissionFix();
  const success = await fixer.fixOracleSubmissions();
  process.exit(success ? 0 : 1);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = ManualOracleSubmissionFix;
