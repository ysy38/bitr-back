#!/usr/bin/env node

const { ethers } = require('ethers');
const config = require('../config');
const db = require('../db/db');

/**
 * Fix the oracle submission gap - submit outcomes to GuidedOracle contract
 * This addresses the critical issue where results exist but are not submitted to the contract
 */
class OracleSubmissionFixer {
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
      console.log('🔧 Starting Oracle Submission Gap Fix...');
      
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
      
      // Get resolved markets that need oracle submission
      const markets = await db.query(`
        SELECT 
          fpm.pool_id,
          fpm.market_id,
          fpm.fixture_id,
          fpm.outcome_type,
          fpm.resolved,
          fpm.result,
          f.home_team,
          f.away_team,
          fr.home_score,
          fr.away_score,
          fr.outcome_1x2,
          fr.outcome_ou25
        FROM oracle.football_prediction_markets fpm
        JOIN oracle.fixtures f ON fpm.fixture_id::VARCHAR = f.id::VARCHAR
        LEFT JOIN oracle.fixture_results fr ON f.id::VARCHAR = fr.fixture_id::VARCHAR
        WHERE fpm.pool_id IN ('0', '1') 
          AND fpm.resolved = true
          AND fr.fixture_id IS NOT NULL
        ORDER BY fpm.pool_id
      `);
      
      console.log(`📊 Found ${markets.rows.length} resolved markets needing oracle submission:`);
      markets.rows.forEach(market => {
        console.log(`Pool ${market.pool_id}: Market ${market.market_id} | Result: ${market.result} | Score: ${market.home_score}-${market.away_score}`);
      });
      
      let successCount = 0;
      let failureCount = 0;
      
      for (const market of markets.rows) {
        console.log(`\n🔄 Processing Pool ${market.pool_id} (Market ${market.market_id})...`);
        
        try {
          // Check if outcome already exists in contract
          const existingOutcome = await this.guidedOracleContract.getOutcome(market.market_id);
          if (existingOutcome[0]) {
            console.log(`⚠️ Pool ${market.pool_id}: Outcome already exists in contract`);
            successCount++;
            continue;
          }
          
          // Prepare result data based on outcome type
          let resultData;
          switch (market.outcome_type) {
            case '1X2':
              const moneylineResult = market.outcome_1x2;
              if (moneylineResult === '1') resultData = ethers.toUtf8Bytes('Home wins');
              else if (moneylineResult === 'X') resultData = ethers.toUtf8Bytes('Draw');
              else if (moneylineResult === '2') resultData = ethers.toUtf8Bytes('Away wins');
              break;
            case 'OU25':
              const ou25Result = market.outcome_ou25;
              if (ou25Result === 'Over') resultData = ethers.toUtf8Bytes('Over 2.5 goals');
              else if (ou25Result === 'Under') resultData = ethers.toUtf8Bytes('Under 2.5 goals');
              break;
            default:
              resultData = ethers.toUtf8Bytes(market.result || 'Unknown');
          }
          
          console.log(`📤 Submitting outcome: ${market.market_id} -> ${ethers.toUtf8String(resultData)}`);
          
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
          
          // Record the submission in database
          await db.query(`
            INSERT INTO public.oracle_submissions (match_id, oracle_address, outcome_data, submitted_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (match_id) DO NOTHING
          `, [
            market.market_id,
            botAddress,
            JSON.stringify({
              result: ethers.toUtf8String(resultData),
              outcome_type: market.outcome_type,
              pool_id: market.pool_id,
              home_score: market.home_score,
              away_score: market.away_score
            })
          ]);
          
          console.log(`✅ Pool ${market.pool_id}: Oracle submission recorded in database`);
          successCount++;
          
        } catch (error) {
          console.error(`❌ Pool ${market.pool_id}: Failed to submit outcome:`, error.message);
          failureCount++;
        }
      }
      
      console.log(`\n🎉 Oracle submission fix completed!`);
      console.log(`✅ Successful submissions: ${successCount}`);
      console.log(`❌ Failed submissions: ${failureCount}`);
      
      if (successCount > 0) {
        console.log('\n📋 Next steps:');
        console.log('1. Pool Settlement Service should detect OutcomeSubmitted events');
        console.log('2. Pools will be automatically settled');
        console.log('3. Bettors can claim their winnings');
      }
      
      return successCount > 0;
      
    } catch (error) {
      console.error('❌ Error in oracle submission fix:', error);
      throw error;
    }
  }
}

// Run the fix
async function main() {
  const fixer = new OracleSubmissionFixer();
  const success = await fixer.fixOracleSubmissions();
  process.exit(success ? 0 : 1);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = OracleSubmissionFixer;
