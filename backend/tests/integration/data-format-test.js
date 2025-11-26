/**
 * Integration Test: End-to-End Data Format Validation
 * 
 * Tests that data flows correctly from database → services → contracts
 * for BOTH Oddyssey and Guided Market Pools
 */

const db = require('../../db/db');
const DataFormatValidator = require('../../utils/data-format-validator');
const Web3Service = require('../../services/web3-service');

class DataFormatIntegrationTest {
  constructor() {
    this.validator = new DataFormatValidator();
    this.web3Service = new Web3Service();
  }

  /**
   * Test 1: Database → Web3Service (Oddyssey)
   */
  async testOddysseyFlow() {
    console.log('\n🧪 TEST 1: Oddyssey Data Flow');
    console.log('='.repeat(60));

    try {
      // Get a real fixture from database
      const result = await db.query(`
        SELECT fixture_id, outcome_1x2, outcome_ou25
        FROM oracle.fixture_results
        WHERE outcome_1x2 IS NOT NULL AND outcome_ou25 IS NOT NULL
        LIMIT 1
      `);

      if (result.rows.length === 0) {
        console.log('⚠️  No fixtures to test with');
        return false;
      }

      const fixture = result.rows[0];
      console.log(`📊 Testing fixture ${fixture.fixture_id}`);
      console.log(`   1X2: "${fixture.outcome_1x2}"`);
      console.log(`   O/U: "${fixture.outcome_ou25}"`);

      // Test conversion methods directly (not formatResultsForContract which expects 10 results)
      const moneyline = this.web3Service.convertMoneylineResult(fixture.outcome_1x2);
      const overUnder = this.web3Service.convertOverUnderResult(fixture.outcome_ou25);
      
      console.log(`\n✅ Converted to contract enums:`);
      console.log(`   Moneyline: ${moneyline} (${this.getMoneylineName(moneyline)})`);
      console.log(`   Over/Under: ${overUnder} (${this.getOverUnderName(overUnder)})`);

      // Validate no NotSet values
      if (moneyline === 0 || overUnder === 0) {
        console.error(`❌ FAILED: Contains NotSet values!`);
        return false;
      }

      console.log(`\n✅ TEST 1 PASSED: Oddyssey data flow works!`);
      return true;

    } catch (error) {
      console.error(`❌ TEST 1 FAILED:`, error.message);
      return false;
    }
  }

  /**
   * Test 2: Database → GuidedOracle (Guided Markets)
   */
  async testGuidedMarketFlow() {
    console.log('\n🧪 TEST 2: Guided Market Data Flow');
    console.log('='.repeat(60));

    try {
      // Get a real fixture from database
      const result = await db.query(`
        SELECT fixture_id, outcome_1x2, outcome_ou25
        FROM oracle.fixture_results
        WHERE outcome_1x2 IS NOT NULL AND outcome_ou25 IS NOT NULL
        LIMIT 1
      `);

      if (result.rows.length === 0) {
        console.log('⚠️  No fixtures to test with');
        return false;
      }

      const fixture = result.rows[0];
      console.log(`📊 Testing fixture ${fixture.fixture_id}`);
      console.log(`   1X2: "${fixture.outcome_1x2}"`);
      console.log(`   O/U: "${fixture.outcome_ou25}"`);

      // Simulate what would be sent to GuidedOracle
      const outcome1x2 = fixture.outcome_1x2; // e.g., "Home"
      const outcomeOU = fixture.outcome_ou25;  // e.g., "Over"

      console.log(`\n✅ Would submit to GuidedOracle:`);
      console.log(`   resultData (1X2): ${outcome1x2}`);
      console.log(`   resultData (O/U): ${outcomeOU}`);

      // Check format is correct
      const valid1x2 = ['Home', 'Away', 'Draw'].includes(outcome1x2);
      const validOU = ['Over', 'Under'].includes(outcomeOU);

      if (!valid1x2 || !validOU) {
        console.error(`❌ FAILED: Invalid format!`);
        console.error(`   1X2 valid: ${valid1x2}`);
        console.error(`   O/U valid: ${validOU}`);
        return false;
      }

      // Simulate bytes comparison (what PoolCore does)
      const predictedOutcome = "Home"; // Example pool prediction
      const actualOutcome = outcome1x2;
      const wouldMatch = predictedOutcome === actualOutcome;

      console.log(`\n✅ Bytes comparison test:`);
      console.log(`   Predicted: "${predictedOutcome}"`);
      console.log(`   Actual: "${actualOutcome}"`);
      console.log(`   Match: ${wouldMatch ? '✅ YES' : '❌ NO'}`);

      console.log(`\n✅ TEST 2 PASSED: Guided Market data flow works!`);
      return true;

    } catch (error) {
      console.error(`❌ TEST 2 FAILED:`, error.message);
      return false;
    }
  }

  /**
   * Test 3: Validator normalization
   */
  async testValidatorNormalization() {
    console.log('\n🧪 TEST 3: Validator Auto-Normalization');
    console.log('='.repeat(60));

    try {
      // Test various input formats
      const testCases = [
        { input: { outcome_1x2: '1', outcome_ou25: 'O' }, 
          expected: { outcome_1x2: 'Home', outcome_ou25: 'Over' } },
        { input: { outcome_1x2: 'X', outcome_ou25: 'U' }, 
          expected: { outcome_1x2: 'Draw', outcome_ou25: 'Under' } },
        { input: { outcome_1x2: '2' }, 
          expected: { outcome_1x2: 'Away' } },
      ];

      let allPassed = true;

      for (const testCase of testCases) {
        const normalized = await this.validator.validateBeforeWrite(999999999, { ...testCase.input });
        
        const match1x2 = !testCase.expected.outcome_1x2 || normalized.outcome_1x2 === testCase.expected.outcome_1x2;
        const matchOU = !testCase.expected.outcome_ou25 || normalized.outcome_ou25 === testCase.expected.outcome_ou25;

        if (match1x2 && matchOU) {
          console.log(`✅ ${JSON.stringify(testCase.input)} → ${JSON.stringify(normalized)}`);
        } else {
          console.log(`❌ ${JSON.stringify(testCase.input)} → ${JSON.stringify(normalized)} (expected ${JSON.stringify(testCase.expected)})`);
          allPassed = false;
        }
      }

      if (allPassed) {
        console.log(`\n✅ TEST 3 PASSED: Validator normalization works!`);
      } else {
        console.log(`\n❌ TEST 3 FAILED: Some normalizations incorrect`);
      }

      return allPassed;

    } catch (error) {
      console.error(`❌ TEST 3 FAILED:`, error.message);
      return false;
    }
  }

  /**
   * Test 4: Database trigger enforcement
   */
  async testDatabaseTrigger() {
    console.log('\n🧪 TEST 4: Database Trigger Enforcement');
    console.log('='.repeat(60));

    try {
      const testRecord = await db.query(`
        SELECT fixture_id FROM oracle.fixture_results LIMIT 1
      `);
      
      if (testRecord.rows.length === 0) {
        console.log('⚠️  No fixtures to test with');
        return false;
      }

      const fixtureId = testRecord.rows[0].fixture_id;

      // Try to insert invalid data (should fail)
      let triggerWorks = true;

      // Test invalid 1X2
      try {
        await db.query(`UPDATE oracle.fixture_results SET outcome_1x2 = '1' WHERE fixture_id = $1`, [fixtureId]);
        console.error(`❌ Trigger allowed invalid 1X2 format!`);
        triggerWorks = false;
      } catch (error) {
        console.log(`✅ Trigger blocked invalid 1X2: "1"`);
      }

      // Test invalid O/U
      try {
        await db.query(`UPDATE oracle.fixture_results SET outcome_ou25 = 'O' WHERE fixture_id = $1`, [fixtureId]);
        console.error(`❌ Trigger allowed invalid O/U format!`);
        triggerWorks = false;
      } catch (error) {
        console.log(`✅ Trigger blocked invalid O/U: "O"`);
      }

      // Test valid data (should succeed)
      try {
        await db.query(`UPDATE oracle.fixture_results SET outcome_1x2 = 'Home', outcome_ou25 = 'Over' WHERE fixture_id = $1`, [fixtureId]);
        console.log(`✅ Trigger allowed valid format: "Home", "Over"`);
      } catch (error) {
        console.error(`❌ Trigger blocked VALID data!`);
        triggerWorks = false;
      }

      if (triggerWorks) {
        console.log(`\n✅ TEST 4 PASSED: Database trigger enforcement works!`);
      } else {
        console.log(`\n❌ TEST 4 FAILED: Trigger not working correctly`);
      }

      return triggerWorks;

    } catch (error) {
      console.error(`❌ TEST 4 FAILED:`, error.message);
      return false;
    }
  }

  /**
   * Helper methods
   */
  getMoneylineName(value) {
    const names = ['NotSet', 'HomeWin', 'Draw', 'AwayWin'];
    return names[value] || 'Unknown';
  }

  getOverUnderName(value) {
    const names = ['NotSet', 'Over', 'Under'];
    return names[value] || 'Unknown';
  }

  /**
   * Run all tests
   */
  async runAllTests() {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 DATA FORMAT INTEGRATION TESTS');
    console.log('='.repeat(60));

    const test1 = await this.testOddysseyFlow();
    const test2 = await this.testGuidedMarketFlow();
    const test3 = await this.testValidatorNormalization();
    const test4 = await this.testDatabaseTrigger();

    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`Test 1 (Oddyssey Flow):       ${test1 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Test 2 (Guided Market Flow):  ${test2 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Test 3 (Validator):           ${test3 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Test 4 (Database Trigger):    ${test4 ? '✅ PASS' : '❌ FAIL'}`);
    console.log('='.repeat(60));

    const allPassed = test1 && test2 && test3 && test4;
    
    if (allPassed) {
      console.log('\n🎉 ALL TESTS PASSED! System is production ready!');
    } else {
      console.log('\n❌ SOME TESTS FAILED! Review errors above.');
    }

    console.log('');
    return allPassed;
  }
}

// Run tests if called directly
if (require.main === module) {
  const tester = new DataFormatIntegrationTest();
  
  tester.runAllTests()
    .then(passed => process.exit(passed ? 0 : 1))
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = DataFormatIntegrationTest;

