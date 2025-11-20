#!/usr/bin/env node

const { enrichPoolWithArbitrationInfo } = require('./backend/utils/arbitration-helper');
const UnifiedPoolSettlementSystem = require('./backend/services/unified-pool-settlement-system');
const db = require('./backend/db/db');

async function testComprehensiveSystem() {
  console.log('🧪 Testing Comprehensive Pool System...\n');
  
  try {
    // Test 1: Arbitration Helper
    console.log('📊 Testing Arbitration Helper:');
    
    // Get Pool 0 from database
    const poolResult = await db.query('SELECT * FROM oracle.pools WHERE pool_id = 0');
    const pool = poolResult.rows[0];
    
    console.log('  Pool 0 raw data:');
    console.log('    Arbitration Deadline:', new Date(Number(pool.arbitration_deadline) * 1000).toISOString());
    console.log('    Total Bettor Stake:', pool.total_bettor_stake);
    console.log('    Is Settled:', pool.is_settled);
    
    const enrichedPool = enrichPoolWithArbitrationInfo(pool);
    
    console.log('  ✅ Enriched Pool 0:');
    console.log('    Arbitration Status:', enrichedPool.arbitration.status);
    console.log('    Time Remaining:', enrichedPool.arbitration.timeRemainingFormatted);
    console.log('    Message:', enrichedPool.arbitration.message);
    console.log('    Settlement Eligible:', enrichedPool.settlement.eligible);
    console.log('    Settlement Action:', enrichedPool.settlement.action);
    console.log('    Settlement Message:', enrichedPool.settlement.message);
    
    // Test 2: Outcome Determination for Different Market Types
    console.log('\n🎯 Testing Outcome Determination:');
    
    const settlementSystem = new UnifiedPoolSettlementSystem();
    
    // Get fixture with results
    const fixtureResult = await db.query('SELECT * FROM oracle.fixtures WHERE fixture_id = $1', ['19425985']);
    const fixture = fixtureResult.rows[0];
    
    const testPredictions = [
      'Over 2.5',
      'Under 2.5', 
      'Over 3.5',
      'Home',
      'Draw',
      'Away',
      'Yes', // BTTS
      'No',  // BTTS
      '2-1', // Correct Score
      'HT Home', // Half Time
      '1X',  // Double Chance
      'AH +0.5' // Asian Handicap
    ];
    
    for (const prediction of testPredictions) {
      try {
        const result = await settlementSystem.determineActualResultForPool(fixture, prediction);
        console.log(`    "${prediction}" -> "${result || 'Not Found'}"`);
      } catch (error) {
        console.log(`    "${prediction}" -> Error: ${error.message}`);
      }
    }
    
    // Test 3: Full Settlement Processing
    console.log('\n🔧 Testing Full Settlement Processing:');
    try {
      await settlementSystem.processAllPools();
      console.log('  ✅ Settlement processing completed successfully');
    } catch (error) {
      console.log('  ❌ Settlement processing error:', error.message);
    }
    
    console.log('\n🎉 All tests completed!');
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
  }
}

testComprehensiveSystem().catch(console.error);
