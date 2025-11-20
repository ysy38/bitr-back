#!/usr/bin/env node

const { ethers } = require('ethers');
const config = require('../config');
const db = require('../db/db');

/**
 * Comprehensive settlement system checker and fixer
 */
class SettlementSystemChecker {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    this.wallet = new ethers.Wallet('0x92961421b053ae691cde04f131bd6ebf8745c5a501be3cab8ddedb341c52afc4', this.provider);
    
    // Load contract ABIs
    let PoolCoreABI, GuidedOracleABI;
    try {
      PoolCoreABI = require('../solidity/BitredictPoolCore.json').abi;
    } catch (error) {
      PoolCoreABI = [
        'function pools(uint256) external view returns (tuple(uint256 poolId, address creator, uint256 totalStake, uint256 creatorStake, uint256 bettorStake, uint8 oracleType, string memory title, string memory description, string memory category, string memory homeTeam, string memory awayTeam, string memory predictedOutcome, uint256 eventEndTime, bool isSettled, string memory result) memory)',
        'function settlePool(uint256 poolId, bytes32 outcome) external',
        'function poolCount() external view returns (uint256)'
      ];
    }
    
    try {
      GuidedOracleABI = require('../solidity/GuidedOracle.json').abi;
    } catch (error) {
      GuidedOracleABI = [
        'function getOutcome(string memory marketId) external view returns (bool isSet, bytes memory resultData)',
        'function submitOutcome(string memory marketId, bytes calldata resultData) external'
      ];
    }
    
    this.poolCoreContract = new ethers.Contract(
      config.blockchain.contractAddresses.poolCore,
      PoolCoreABI,
      this.provider
    );
    
    this.guidedOracleContract = new ethers.Contract(
      config.blockchain.contractAddresses.guidedOracle,
      GuidedOracleABI,
      this.wallet
    );
  }

  async checkSettlementStatus() {
    console.log('🔍 Checking settlement system status...\n');
    
    try {
      // 1. Check pools in database
      console.log('📊 Database Status:');
      const pools = await db.query(`
        SELECT pool_id, title, oracle_type, is_settled, result, home_team, away_team, event_end_time
        FROM oracle.pools 
        WHERE pool_id IN (0, 1) 
        ORDER BY pool_id
      `);
      
      pools.rows.forEach(pool => {
        console.log(`Pool ${pool.pool_id}: ${pool.title || 'N/A'} | Settled: ${pool.is_settled} | Result: ${pool.result || 'N/A'}`);
      });
      
      // 2. Check football prediction markets
      console.log('\n🏈 Football Markets:');
      const markets = await db.query(`
        SELECT fpm.pool_id, fpm.market_id, fpm.resolved, fpm.result, f.home_team, f.away_team
        FROM oracle.football_prediction_markets fpm
        JOIN oracle.fixtures f ON fpm.fixture_id::VARCHAR = f.id::VARCHAR
        WHERE fpm.pool_id IN ('0', '1')
        ORDER BY fpm.pool_id
      `);
      
      markets.rows.forEach(market => {
        console.log(`Pool ${market.pool_id}: Market ${market.market_id} | Resolved: ${market.resolved} | Result: ${market.result}`);
      });
      
      // 3. Check oracle submissions
      console.log('\n📤 Oracle Submissions:');
      const submissions = await db.query(`
        SELECT match_id, oracle_address, submitted_at
        FROM public.oracle_submissions 
        WHERE match_id IN ('19391153', '19433520')
        ORDER BY submitted_at
      `);
      
      if (submissions.rows.length === 0) {
        console.log('❌ No oracle submissions found - this is the problem!');
      } else {
        submissions.rows.forEach(sub => {
          console.log(`Market ${sub.match_id}: Submitted by ${sub.oracle_address} at ${sub.submitted_at}`);
        });
      }
      
      // 4. Check contract state
      console.log('\n🔗 Contract State:');
      for (let poolId = 0; poolId <= 1; poolId++) {
        try {
          const pool = await this.poolCoreContract.pools(poolId);
          console.log(`Pool ${poolId}: Settled: ${pool.isSettled} | Result: ${pool.result}`);
        } catch (error) {
          console.log(`Pool ${poolId}: Error reading contract - ${error.message}`);
        }
      }
      
      // 5. Check GuidedOracle outcomes
      console.log('\n🎯 GuidedOracle Outcomes:');
      for (const market of markets.rows) {
        try {
          const outcome = await this.guidedOracleContract.getOutcome(market.market_id);
          if (outcome[0]) {
            console.log(`Market ${market.market_id}: Outcome exists - ${ethers.toUtf8String(outcome[1])}`);
          } else {
            console.log(`Market ${market.market_id}: No outcome in contract`);
          }
        } catch (error) {
          console.log(`Market ${market.market_id}: Error checking outcome - ${error.message}`);
        }
      }
      
      return {
        pools: pools.rows,
        markets: markets.rows,
        submissions: submissions.rows
      };
      
    } catch (error) {
      console.error('❌ Error checking settlement status:', error);
      throw error;
    }
  }

  async fixOracleSubmissions() {
    console.log('\n🔧 Fixing oracle submissions...\n');
    
    try {
      // Get resolved markets
      const markets = await db.query(`
        SELECT 
          fpm.pool_id,
          fpm.market_id,
          fpm.outcome_type,
          fpm.result,
          f.home_team,
          f.away_team,
          fr.outcome_1x2,
          fr.outcome_ou25
        FROM oracle.football_prediction_markets fpm
        JOIN oracle.fixtures f ON fpm.fixture_id::VARCHAR = f.id::VARCHAR
        LEFT JOIN oracle.fixture_results fr ON f.id::VARCHAR = fr.fixture_id::VARCHAR
        WHERE fpm.pool_id IN ('0', '1') 
          AND fpm.resolved = true
        ORDER BY fpm.pool_id
      `);
      
      let successCount = 0;
      
      for (const market of markets.rows) {
        console.log(`🔄 Processing Pool ${market.pool_id} (Market ${market.market_id})...`);
        
        try {
          // Check if outcome already exists
          const existingOutcome = await this.guidedOracleContract.getOutcome(market.market_id);
          if (existingOutcome[0]) {
            console.log(`⚠️ Pool ${market.pool_id}: Outcome already exists in contract`);
            successCount++;
            continue;
          }
          
          // Prepare result data
          let resultData;
          switch (market.outcome_type) {
            case '1X2':
              const moneylineResult = market.outcome_1x2;
              if (moneylineResult === '1') resultData = ethers.toUtf8Bytes('Home wins');
              else if (moneylineResult === 'X') resultData = ethers.toUtf8Bytes('Draw');
              else if (moneylineResult === '2') resultData = ethers.toUtf8Bytes('Away wins');
              break;
            default:
              resultData = ethers.toUtf8Bytes(market.result || 'Unknown');
          }
          
          console.log(`📤 Submitting outcome: ${market.market_id} -> ${ethers.toUtf8String(resultData)}`);
          
          // Submit to GuidedOracle contract
          const tx = await this.guidedOracleContract.submitOutcome(
            market.market_id,
            resultData,
            { gasLimit: 500000 }
          );
          
          console.log(`📤 Transaction: ${tx.hash}`);
          const receipt = await tx.wait();
          console.log(`✅ Pool ${market.pool_id}: Outcome submitted in block ${receipt.blockNumber}`);
          
          // Record submission
          await db.query(`
            INSERT INTO public.oracle_submissions (match_id, oracle_address, outcome_data, submitted_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (match_id) DO NOTHING
          `, [
            market.market_id,
            this.wallet.address,
            JSON.stringify({
              result: ethers.toUtf8String(resultData),
              outcome_type: market.outcome_type,
              pool_id: market.pool_id
            })
          ]);
          
          successCount++;
          
        } catch (error) {
          console.error(`❌ Pool ${market.pool_id}: Failed to submit outcome:`, error.message);
        }
      }
      
      console.log(`\n🎉 Oracle submission fix completed!`);
      console.log(`✅ Successful submissions: ${successCount}`);
      
      return successCount > 0;
      
    } catch (error) {
      console.error('❌ Error fixing oracle submissions:', error);
      throw error;
    }
  }
}

// Main execution
async function main() {
  const checker = new SettlementSystemChecker();
  
  // Check current status
  await checker.checkSettlementStatus();
  
  // Fix oracle submissions
  const success = await checker.fixOracleSubmissions();
  
  if (success) {
    console.log('\n🎉 Settlement system fix completed!');
    console.log('📋 Next steps:');
    console.log('1. Pool Settlement Service should detect OutcomeSubmitted events');
    console.log('2. Pools will be automatically settled');
    console.log('3. Check logs for settlement confirmation');
  } else {
    console.log('\n❌ Settlement system fix failed');
  }
  
  process.exit(success ? 0 : 1);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = SettlementSystemChecker;
