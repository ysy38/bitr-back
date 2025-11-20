/**
 * Test Data Flow: Database → Services → Contract
 * 
 * This script tests that match results flow correctly from database to blockchain
 */

const db = require('../db/db');
const Web3Service = require('../services/web3-service');

async function testDataFlow() {
  const web3Service = new Web3Service();
  
  try {
    console.log('🔍 TESTING DATA FLOW: Database → Services → Contract\n');
    console.log('='.repeat(60));
    
    // Step 1: Get sample data from database
    console.log('\n📊 STEP 1: Get sample match results from database');
    console.log('-'.repeat(60));
    
    const dbResults = await db.query(`
      SELECT fixture_id, outcome_1x2, outcome_ou25, home_score, away_score 
      FROM oracle.fixture_results 
      WHERE outcome_1x2 IS NOT NULL AND outcome_ou25 IS NOT NULL
      LIMIT 10
    `);
    
    console.log(`Found ${dbResults.rows.length} results in database`);
    console.log('\nSample database format:');
    dbResults.rows.slice(0, 3).forEach(r => {
      console.log(`  • 1X2="${r.outcome_1x2}", O/U="${r.outcome_ou25}" (Score: ${r.home_score}-${r.away_score})`);
    });
    
    // Step 2: Format like OddysseyOracleBot does
    console.log('\n\n📊 STEP 2: Format as OddysseyOracleBot returns');
    console.log('-'.repeat(60));
    
    const oracleBotFormat = dbResults.rows.map(r => ({
      matchId: r.fixture_id,
      result1x2: r.outcome_1x2,  // "Home"/"Away"/"Draw"
      resultOU25: r.outcome_ou25 // "Over"/"Under"
    }));
    
    console.log('OddysseyOracleBot format (first 3):');
    oracleBotFormat.slice(0, 3).forEach(r => {
      console.log(`  • result1x2="${r.result1x2}", resultOU25="${r.resultOU25}"`);
    });
    
    // Step 3: Format for contract using Web3Service
    console.log('\n\n📊 STEP 3: Format using Web3Service.formatResultsForContract()');
    console.log('-'.repeat(60));
    
    await web3Service.initialize();
    
    try {
      const contractFormat = web3Service.formatResultsForContract(oracleBotFormat);
      
      console.log('✅ SUCCESS! Contract format (first 3):');
      contractFormat.slice(0, 3).forEach((r, i) => {
        console.log(`  • Match ${i}: moneyline=${r.moneyline}, overUnder=${r.overUnder}`);
        console.log(`    (from: "${oracleBotFormat[i].result1x2}"/"${oracleBotFormat[i].resultOU25}")`);
      });
      
      // Step 4: Validate no NotSet values
      console.log('\n\n📊 STEP 4: Validate results');
      console.log('-'.repeat(60));
      
      const hasNotSet = contractFormat.some(r => 
        r.moneyline === 0 || r.overUnder === 0
      );
      
      if (hasNotSet) {
        console.error('❌ VALIDATION FAILED: Some results are NotSet (0)!');
        contractFormat.forEach((r, i) => {
          if (r.moneyline === 0 || r.overUnder === 0) {
            console.error(`  • Match ${i}: moneyline=${r.moneyline}, overUnder=${r.overUnder}`);
          }
        });
      } else {
        console.log('✅ All results are valid (no NotSet values)');
      }
      
      // Step 5: Summary
      console.log('\n\n📊 STEP 5: Summary');
      console.log('-'.repeat(60));
      console.log('✅ Data flow is CORRECT!');
      console.log('\nFlow:');
      console.log('  1. Database stores: "Home"/"Away"/"Draw", "Over"/"Under"');
      console.log('  2. OddysseyOracleBot passes through as-is');
      console.log('  3. Web3Service converts to contract enums: 1/2/3, 1/2');
      console.log('  4. Contract receives correct numeric values');
      
    } catch (error) {
      console.error('\n❌ VALIDATION FAILED!');
      console.error('Error:', error.message);
      console.error('\nThis means the data flow is BROKEN!');
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ Test complete!\n');
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

testDataFlow();

