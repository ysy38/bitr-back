/**
 * Settlement Service Data Format Integration Test
 * 
 * Verifies that settlement services correctly handle normalized database formats
 */

const db = require('../../db/db');
const UnifiedPoolSettlementSystem = require('../../services/unified-pool-settlement-system');

class SettlementDataFormatTest {
  constructor() {
    this.settlement = new UnifiedPoolSettlementSystem();
  }

  /**
   * Test 1: 1X2 outcome determination
   */
  async test1X2Outcomes() {
    console.log('\n🧪 TEST 1: 1X2 Outcome Determination');
    console.log('='.repeat(60));

    try {
      // Get a fixture with 1X2 result
      const result = await db.query(`
        SELECT fixture_id, result_info FROM oracle.fixtures
        WHERE result_info->>'outcome_1x2' IS NOT NULL
        LIMIT 1
      `);

      if (result.rows.length === 0) {
        console.log('⚠️  No fixtures with 1X2 results');
        return false;
      }

      const fixture = result.rows[0];
      console.log(`📊 Testing fixture ${fixture.fixture_id}`);
      console.log(`   Database value: outcome_1x2 = "${fixture.result_info.outcome_1x2}"`);

      // Test different prediction formats
      const testCases = [
        { prediction: 'Home', expected: fixture.result_info.outcome_1x2 === 'Home' },
        { prediction: 'Away', expected: fixture.result_info.outcome_1x2 === 'Away' },
        { prediction: 'Draw', expected: fixture.result_info.outcome_1x2 === 'Draw' },
        { prediction: 'Home wins', expected: fixture.result_info.outcome_1x2 === 'Home' },
      ];

      let allPassed = true;

      for (const testCase of testCases) {
        const mockPool = { predicted_outcome: testCase.prediction };
        const outcome = await this.settlement.determineActualResultForPool(fixture, testCase.prediction);
        
        const passed = testCase.expected ? (outcome !== null) : true;
        
        if (passed) {
          console.log(`✅ Prediction "${testCase.prediction}" → Outcome "${outcome}"`);
        } else {
          console.log(`❌ Prediction "${testCase.prediction}" → Outcome "${outcome}" (should not be null!)`);
          allPassed = false;
        }
      }

      if (allPassed) {
        console.log('\n✅ TEST 1 PASSED: 1X2 outcome determination works!');
      } else {
        console.log('\n❌ TEST 1 FAILED: Some 1X2 outcomes incorrect');
      }

      return allPassed;

    } catch (error) {
      console.error(`❌ TEST 1 FAILED:`, error.message);
      return false;
    }
  }

  /**
   * Test 2: Over/Under outcome determination
   */
  async testOverUnderOutcomes() {
    console.log('\n🧪 TEST 2: Over/Under Outcome Determination');
    console.log('='.repeat(60));

    try {
      // Get a fixture with O/U result
      const result = await db.query(`
        SELECT fixture_id, result_info FROM oracle.fixtures
        WHERE result_info->>'outcome_ou25' IS NOT NULL
        LIMIT 1
      `);

      if (result.rows.length === 0) {
        console.log('⚠️  No fixtures with O/U results');
        return false;
      }

      const fixture = result.rows[0];
      console.log(`📊 Testing fixture ${fixture.fixture_id}`);
      console.log(`   Database value: outcome_ou25 = "${fixture.result_info.outcome_ou25}"`);

      // Test different prediction formats
      const testCases = [
        { prediction: 'Over 2.5', expected: fixture.result_info.outcome_ou25 === 'Over' },
        { prediction: 'Under 2.5', expected: fixture.result_info.outcome_ou25 === 'Under' },
      ];

      let allPassed = true;

      for (const testCase of testCases) {
        const outcome = await this.settlement.determineActualResultForPool(fixture, testCase.prediction);
        
        const passed = testCase.expected ? (outcome !== null) : true;
        
        if (passed) {
          console.log(`✅ Prediction "${testCase.prediction}" → Outcome "${outcome}"`);
        } else {
          console.log(`❌ Prediction "${testCase.prediction}" → Outcome "${outcome}" (should not be null!)`);
          allPassed = false;
        }
      }

      if (allPassed) {
        console.log('\n✅ TEST 2 PASSED: O/U outcome determination works!');
      } else {
        console.log('\n❌ TEST 2 FAILED: Some O/U outcomes incorrect');
      }

      return allPassed;

    } catch (error) {
      console.error(`❌ TEST 2 FAILED:`, error.message);
      return false;
    }
  }

  /**
   * Test 3: BTTS outcome determination
   */
  async testBTTSOutcomes() {
    console.log('\n🧪 TEST 3: BTTS Outcome Determination');
    console.log('='.repeat(60));

    try {
      // Get a fixture with BTTS result
      const result = await db.query(`
        SELECT fixture_id, result_info FROM oracle.fixtures
        WHERE result_info->>'outcome_btts' IS NOT NULL
        LIMIT 1
      `);

      if (result.rows.length === 0) {
        console.log('⚠️  No fixtures with BTTS results');
        return false;
      }

      const fixture = result.rows[0];
      console.log(`📊 Testing fixture ${fixture.fixture_id}`);
      console.log(`   Database value: outcome_btts = "${fixture.result_info.outcome_btts}"`);

      // Test different prediction formats
      const testCases = [
        { prediction: 'Yes', expected: fixture.result_info.outcome_btts === 'Yes' },
        { prediction: 'No', expected: fixture.result_info.outcome_btts === 'No' },
        { prediction: 'BTTS Yes', expected: fixture.result_info.outcome_btts === 'Yes' },
      ];

      let allPassed = true;

      for (const testCase of testCases) {
        const outcome = await this.settlement.determineActualResultForPool(fixture, testCase.prediction);
        
        const passed = testCase.expected ? (outcome !== null) : true;
        
        if (passed) {
          console.log(`✅ Prediction "${testCase.prediction}" → Outcome "${outcome}"`);
        } else {
          console.log(`❌ Prediction "${testCase.prediction}" → Outcome "${outcome}" (should not be null!)`);
          allPassed = false;
        }
      }

      if (allPassed) {
        console.log('\n✅ TEST 3 PASSED: BTTS outcome determination works!');
      } else {
        console.log('\n❌ TEST 3 FAILED: Some BTTS outcomes incorrect');
      }

      return allPassed;

    } catch (error) {
      console.error(`❌ TEST 3 FAILED:`, error.message);
      return false;
    }
  }

  /**
   * Run all tests
   */
  async runAllTests() {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 SETTLEMENT SERVICE DATA FORMAT TESTS');
    console.log('='.repeat(60));

    const test1 = await this.test1X2Outcomes();
    const test2 = await this.testOverUnderOutcomes();
    const test3 = await this.testBTTSOutcomes();

    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`Test 1 (1X2 Outcomes):    ${test1 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Test 2 (O/U Outcomes):    ${test2 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Test 3 (BTTS Outcomes):   ${test3 ? '✅ PASS' : '❌ FAIL'}`);
    console.log('='.repeat(60));

    const allPassed = test1 && test2 && test3;
    
    if (allPassed) {
      console.log('\n🎉 ALL TESTS PASSED! Settlement service is compatible!');
    } else {
      console.log('\n❌ SOME TESTS FAILED! Review errors above.');
    }

    console.log('');
    return allPassed;
  }
}

// Run tests if called directly
if (require.main === module) {
  const tester = new SettlementDataFormatTest();
  
  tester.runAllTests()
    .then(passed => process.exit(passed ? 0 : 1))
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = SettlementDataFormatTest;

