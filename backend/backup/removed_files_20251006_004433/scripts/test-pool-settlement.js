const { ethers } = require('ethers');
const config = require('../config');
const db = require('../db/db');

async function testPoolSettlement() {
  console.log('🧪 Testing Pool Settlement System...');
  
  try {
    // Check database status
    console.log('\n📊 Database Status:');
    const pools = await db.query('SELECT pool_id, market_id, predicted_outcome, status, result FROM oracle.pools WHERE pool_id IN (0, 1) ORDER BY pool_id');
    console.log('Pools:', pools.rows);
    
    const markets = await db.query('SELECT market_id, fixture_id, status, result FROM oracle.football_prediction_markets WHERE market_id IN (\'19391153\', \'19433520\') ORDER BY market_id');
    console.log('Football Markets:', markets.rows);
    
    // Check if results exist
    const results = await db.query('SELECT fixture_id, home_score, away_score, outcome_1x2 FROM oracle.fixture_results WHERE fixture_id IN (\'19391153\', \'19433520\') ORDER BY fixture_id');
    console.log('Fixture Results:', results.rows);
    
    // Test contract interaction
    console.log('\n🔗 Contract Status:');
    const provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    
    // Load contract ABIs
    const PoolCoreABI = require('../solidity/BitredictPoolCore.json').abi;
    const GuidedOracleABI = require('../solidity/GuidedOracle.json').abi;
    
    const poolCoreAddress = config.blockchain.contractAddresses.poolCore;
    const guidedOracleAddress = config.blockchain.contractAddresses.guidedOracle;
    
    const poolCoreContract = new ethers.Contract(poolCoreAddress, PoolCoreABI, provider);
    const guidedOracleContract = new ethers.Contract(guidedOracleAddress, GuidedOracleABI, provider);
    
    // Check Pool 0 status
    console.log('\n🎯 Pool 0 Analysis:');
    const pool0 = await poolCoreContract.getPool(0);
    console.log('Pool 0 Contract Status:');
    console.log('  Market ID:', pool0.marketId);
    console.log('  Predicted Outcome:', pool0.predictedOutcome);
    console.log('  Result:', pool0.result);
    console.log('  Is Settled:', pool0.isSettled);
    
    // Check GuidedOracle for Pool 0
    try {
      const outcome = await guidedOracleContract.getOutcome('19391153');
      console.log('  GuidedOracle Outcome:', outcome);
    } catch (error) {
      console.log('  GuidedOracle Error:', error.message);
    }
    
    // Check Pool 1 status
    console.log('\n🎯 Pool 1 Analysis:');
    const pool1 = await poolCoreContract.getPool(1);
    console.log('Pool 1 Contract Status:');
    console.log('  Market ID:', pool1.marketId);
    console.log('  Predicted Outcome:', pool1.predictedOutcome);
    console.log('  Result:', pool1.result);
    console.log('  Is Settled:', pool1.isSettled);
    
    // Check GuidedOracle for Pool 1
    try {
      const outcome = await guidedOracleContract.getOutcome('19433520');
      console.log('  GuidedOracle Outcome:', outcome);
    } catch (error) {
      console.log('  GuidedOracle Error:', error.message);
    }
    
    console.log('\n✅ Pool Settlement Test Complete');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

if (require.main === module) {
  testPoolSettlement().catch(console.error);
}

module.exports = { testPoolSettlement };
