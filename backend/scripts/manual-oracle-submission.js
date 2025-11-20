#!/usr/bin/env node

const { ethers } = require('ethers');
const config = require('../config');
const db = require('../db/db');

/**
 * Manually submit oracle outcomes for pools 0 and 1
 */
class ManualOracleSubmission {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    this.wallet = new ethers.Wallet('0x92961421b053ae691cde04f131bd6ebf8745c5a501be3cab8ddedb341c52afc4', this.provider);
    
    // Load contract ABIs
    let GuidedOracleABI;
    try {
      GuidedOracleABI = require('../solidity/GuidedOracle.json').abi;
    } catch (error) {
      console.warn('⚠️ GuidedOracle ABI not found, using minimal ABI');
      GuidedOracleABI = [
        'function submitOutcome(string memory marketId, bytes calldata resultData) external',
        'function getOutcome(string memory marketId) external view returns (bool isSet, bytes memory resultData)',
        'event OutcomeSubmitted(uint256 indexed marketId, string resultData, uint256 timestamp)'
      ];
    }
    
    this.guidedOracleContract = new ethers.Contract(
      config.blockchain.contractAddresses.guidedOracle,
      GuidedOracleABI,
      this.wallet
    );
  }

  async submitOutcomes() {
    try {
      console.log('🚀 Starting manual oracle submission for pools 0 and 1...');
      
      // Get football prediction markets
      const markets = await db.query(`
        SELECT pool_id, market_id, outcome_type, resolved, result 
        FROM oracle.football_prediction_markets 
        WHERE pool_id IN ('0', '1') AND resolved = true
        ORDER BY pool_id
      `);
      
      console.log(`📊 Found ${markets.rows.length} resolved markets:`);
      markets.rows.forEach(market => {
        console.log(`Pool ${market.pool_id}: Market ${market.market_id} | Result: ${market.result}`);
      });
      
      for (const market of markets.rows) {
        console.log(`\n🔄 Processing Pool ${market.pool_id} (Market ${market.market_id})...`);
        
        try {
          // Check if outcome already exists
          const existingOutcome = await this.guidedOracleContract.getOutcome(market.market_id);
          if (existingOutcome[0]) {
            console.log(`⚠️ Pool ${market.pool_id}: Outcome already exists in contract`);
            continue;
          }
          
          // Prepare result data
          const resultData = ethers.toUtf8Bytes(market.result);
          console.log(`📤 Submitting outcome: ${market.market_id} -> ${market.result}`);
          
          // Submit outcome
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
          
          // Record the submission
          await db.query(`
            INSERT INTO public.oracle_submissions (match_id, oracle_address, outcome_data, submitted_at)
            VALUES ($1, $2, $3, NOW())
          `, [
            market.market_id,
            this.wallet.address,
            JSON.stringify({
              result: market.result,
              outcome_type: market.outcome_type,
              pool_id: market.pool_id
            })
          ]);
          
          console.log(`✅ Pool ${market.pool_id}: Oracle submission recorded in database`);
          
        } catch (error) {
          console.error(`❌ Pool ${market.pool_id}: Failed to submit outcome:`, error.message);
        }
      }
      
      console.log('\n🎉 Manual oracle submission completed!');
      console.log('📋 Next steps:');
      console.log('1. Pool Settlement Service should detect OutcomeSubmitted events');
      console.log('2. Pools will be automatically settled');
      
    } catch (error) {
      console.error('❌ Error in manual oracle submission:', error);
      throw error;
    }
  }
}

// Run the submission
async function main() {
  const submitter = new ManualOracleSubmission();
  await submitter.submitOutcomes();
  process.exit(0);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = ManualOracleSubmission;
