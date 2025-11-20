const ethers = require('ethers');
const db = require('./db/db');
const fs = require('fs');

async function checkPool2() {
  console.log('\n========== CHECKING POOL 2 ==========\n');
  
  // 1. Check database
  console.log('1️⃣ DATABASE VALUES:\n');
  try {
    const dbResult = await db.query(`
      SELECT 
        pool_id,
        market_id,
        fixture_id,
        home_team,
        away_team,
        category,
        predicted_outcome,
        market_type
      FROM oracle.pools 
      WHERE pool_id = 2
    `);
    
    if (dbResult.rows.length > 0) {
      const pool = dbResult.rows[0];
      console.log('✅ Database Pool 2:');
      console.log(`  pool_id: ${pool.pool_id}`);
      console.log(`  market_id: ${pool.market_id}`);
      console.log(`  fixture_id: ${pool.fixture_id}`);
      console.log(`  market_type: ${pool.market_type}`);
      console.log(`  home_team: ${pool.home_team}`);
      console.log(`  away_team: ${pool.away_team}`);
      console.log(`  category: ${pool.category}`);
      console.log(`  predicted_outcome: ${pool.predicted_outcome}`);
    } else {
      console.log('❌ Pool 2 NOT FOUND in database!');
    }
  } catch (err) {
    console.error('❌ Database error:', err.message);
  }
  
  // 2. Check contract
  console.log('\n2️⃣ CONTRACT VALUES:\n');
  try {
    const provider = new ethers.JsonRpcProvider('https://sepolia.drpc.org');
    const abiPath = './solidity/BitredictPoolCore.json';
    if (!fs.existsSync(abiPath)) {
      console.log(`⚠️ ABI file not found at ${abiPath}`);
      console.log('Trying alternate path...');
    }
    
    const POOL_CORE_ABI = require('./abis/BitredictPoolCore.json');
    const POOL_CORE_ADDRESS = '0xf6C56Ef095d88a04a3C594ECA30F6e275EEbe3db';
    
    const contract = new ethers.Contract(POOL_CORE_ADDRESS, POOL_CORE_ABI, provider);
    
    const pool = await contract.getPool(2);
    console.log('✅ Contract Pool 2:');
    console.log(`  marketId (raw): "${pool.marketId}"`);
    console.log(`  marketId is hex: ${typeof pool.marketId === 'string' && pool.marketId.startsWith('0x')}`);
    console.log(`  predictedOutcome: ${pool.predictedOutcome}`);
    console.log(`  creator: ${pool.creator}`);
    console.log(`  odds: ${pool.odds.toString()}`);
  } catch (err) {
    console.error('❌ Contract error:', err.message);
  }
  
  // 3. Check API response
  console.log('\n3️⃣ API RESPONSE:\n');
  try {
    const response = await fetch('https://bitredict-backend.fly.dev/api/pools/2?t=' + Date.now());
    const data = await response.json();
    if (data.success && data.data.pool) {
      const pool = data.data.pool;
      console.log('✅ API Pool 2:');
      console.log(`  marketId: "${pool.marketId}"`);
      console.log(`  fixtureId: "${pool.fixtureId}"`);
      console.log(`  market_type: ${pool.marketType}`);
      console.log(`  homeTeam: ${pool.homeTeam}`);
      console.log(`  awayTeam: ${pool.awayTeam}`);
      console.log(`  category: ${pool.category}`);
    } else {
      console.error('❌ API error:', data.error);
    }
  } catch (err) {
    console.error('❌ API fetch error:', err.message);
  }
  
  process.exit(0);
}

checkPool2().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
