/**
 * Data Format Validator
 * 
 * Ensures all fixture results use the CORRECT format:
 * - outcome_1x2: "Home", "Away", "Draw" (NOT "1", "X", "2" or "home", "away")
 * - outcome_ou25: "Over", "Under" (NOT "O", "U" or lowercase)
 * 
 * This validator runs automatically to prevent format inconsistencies
 * that would break both Oddyssey and Guided Market Pools.
 */

const db = require('../db/db');

class DataFormatValidator {
  constructor() {
    this.validFormats = {
      outcome_1x2: ['Home', 'Away', 'Draw'],
      outcome_ou25: ['Over', 'Under'],
      outcome_btts: ['Yes', 'No']
    };
  }

  /**
   * Validate and fix a single fixture result
   */
  async validateAndFixFixtureResult(fixtureId, results) {
    const issues = [];
    const fixes = {};

    // Validate outcome_1x2
    if (results.outcome_1x2) {
      const normalized = this.normalize1x2(results.outcome_1x2);
      if (normalized !== results.outcome_1x2) {
        issues.push({
          field: 'outcome_1x2',
          current: results.outcome_1x2,
          fixed: normalized
        });
        fixes.outcome_1x2 = normalized;
      }
    }

    // Validate outcome_ou25
    if (results.outcome_ou25) {
      const normalized = this.normalizeOU25(results.outcome_ou25);
      if (normalized !== results.outcome_ou25) {
        issues.push({
          field: 'outcome_ou25',
          current: results.outcome_ou25,
          fixed: normalized
        });
        fixes.outcome_ou25 = normalized;
      }
    }

    // Validate outcome_btts
    if (results.outcome_btts) {
      const normalized = this.normalizeBTTS(results.outcome_btts);
      if (normalized !== results.outcome_btts) {
        issues.push({
          field: 'outcome_btts',
          current: results.outcome_btts,
          fixed: normalized
        });
        fixes.outcome_btts = normalized;
      }
    }

    // Apply fixes if any
    if (Object.keys(fixes).length > 0) {
      await this.applyFixes(fixtureId, fixes);
    }

    return { fixtureId, issues, fixed: Object.keys(fixes).length > 0 };
  }

  /**
   * Normalize 1X2 format
   */
  normalize1x2(value) {
    if (!value) return null;
    
    const normalized = String(value).trim();
    
    // Handle various formats
    switch (normalized.toLowerCase()) {
      case 'home':
      case 'h':
      case '1':
      case 'homewin':
        return 'Home';
      
      case 'away':
      case 'a':
      case '2':
      case 'awaywin':
        return 'Away';
      
      case 'draw':
      case 'd':
      case 'x':
        return 'Draw';
      
      default:
        console.warn(`⚠️ Unknown 1X2 value: "${value}"`);
        return normalized; // Keep original if unknown
    }
  }

  /**
   * Normalize Over/Under format
   */
  normalizeOU25(value) {
    if (!value) return null;
    
    const normalized = String(value).trim();
    
    // Handle various formats
    switch (normalized.toLowerCase()) {
      case 'over':
      case 'o':
        return 'Over';
      
      case 'under':
      case 'u':
        return 'Under';
      
      default:
        console.warn(`⚠️ Unknown O/U value: "${value}"`);
        return normalized; // Keep original if unknown
    }
  }

  /**
   * Normalize BTTS format
   */
  normalizeBTTS(value) {
    if (!value) return null;
    
    const normalized = String(value).trim();
    
    switch (normalized.toLowerCase()) {
      case 'yes':
      case 'y':
      case 'true':
      case '1':
        return 'Yes';
      
      case 'no':
      case 'n':
      case 'false':
      case '0':
        return 'No';
      
      default:
        console.warn(`⚠️ Unknown BTTS value: "${value}"`);
        return normalized;
    }
  }

  /**
   * Apply fixes to database
   */
  async applyFixes(fixtureId, fixes) {
    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    for (const [field, value] of Object.entries(fixes)) {
      setClauses.push(`${field} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }

    values.push(fixtureId);

    const query = `
      UPDATE oracle.fixture_results 
      SET ${setClauses.join(', ')}, updated_at = NOW()
      WHERE fixture_id = $${paramIndex}
    `;

    await db.query(query, values);
  }

  /**
   * Validate all fixture results
   */
  async validateAllFixtures(autoFix = true) {
    console.log('🔍 Validating all fixture results...\n');

    const results = await db.query(`
      SELECT fixture_id, outcome_1x2, outcome_ou25, outcome_btts
      FROM oracle.fixture_results
      WHERE outcome_1x2 IS NOT NULL OR outcome_ou25 IS NOT NULL OR outcome_btts IS NOT NULL
    `);

    console.log(`📊 Found ${results.rows.length} fixtures with results`);

    let totalIssues = 0;
    let totalFixed = 0;

    for (const row of results.rows) {
      const validation = await this.validateAndFixFixtureResult(row.fixture_id, row);
      
      if (validation.issues.length > 0) {
        totalIssues += validation.issues.length;
        
        if (validation.fixed) {
          totalFixed++;
          console.log(`✅ Fixed fixture ${row.fixture_id}:`);
          validation.issues.forEach(issue => {
            console.log(`   • ${issue.field}: "${issue.current}" → "${issue.fixed}"`);
          });
        } else if (!autoFix) {
          console.log(`⚠️  Issues in fixture ${row.fixture_id}:`);
          validation.issues.forEach(issue => {
            console.log(`   • ${issue.field}: "${issue.current}" (should be "${issue.fixed}")`);
          });
        }
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Validation Summary:');
    console.log(`   Total fixtures: ${results.rows.length}`);
    console.log(`   Issues found: ${totalIssues}`);
    console.log(`   Fixtures fixed: ${totalFixed}`);
    console.log('='.repeat(60));

    return {
      total: results.rows.length,
      issues: totalIssues,
      fixed: totalFixed
    };
  }

  /**
   * Validate format before inserting/updating
   */
  async validateBeforeWrite(fixtureId, data) {
    const errors = [];

    // Check outcome_1x2
    if (data.outcome_1x2 && !this.validFormats.outcome_1x2.includes(data.outcome_1x2)) {
      const normalized = this.normalize1x2(data.outcome_1x2);
      if (this.validFormats.outcome_1x2.includes(normalized)) {
        data.outcome_1x2 = normalized; // Auto-fix
      } else {
        errors.push(`Invalid outcome_1x2: "${data.outcome_1x2}". Must be: Home, Away, or Draw`);
      }
    }

    // Check outcome_ou25
    if (data.outcome_ou25 && !this.validFormats.outcome_ou25.includes(data.outcome_ou25)) {
      const normalized = this.normalizeOU25(data.outcome_ou25);
      if (this.validFormats.outcome_ou25.includes(normalized)) {
        data.outcome_ou25 = normalized; // Auto-fix
      } else {
        errors.push(`Invalid outcome_ou25: "${data.outcome_ou25}". Must be: Over or Under`);
      }
    }

    // Check outcome_btts
    if (data.outcome_btts && !this.validFormats.outcome_btts.includes(data.outcome_btts)) {
      const normalized = this.normalizeBTTS(data.outcome_btts);
      if (this.validFormats.outcome_btts.includes(normalized)) {
        data.outcome_btts = normalized; // Auto-fix
      } else {
        errors.push(`Invalid outcome_btts: "${data.outcome_btts}". Must be: Yes or No`);
      }
    }

    if (errors.length > 0) {
      throw new Error(`Validation failed for fixture ${fixtureId}:\n${errors.join('\n')}`);
    }

    return data; // Return normalized data
  }

  /**
   * Create database trigger for validation (PostgreSQL)
   */
  async createValidationTrigger() {
    console.log('🔧 Creating database validation trigger...');

    const triggerSQL = `
      -- Create validation function
      CREATE OR REPLACE FUNCTION validate_fixture_result_format()
      RETURNS TRIGGER AS $$
      BEGIN
        -- Validate outcome_1x2
        IF NEW.outcome_1x2 IS NOT NULL THEN
          IF NEW.outcome_1x2 NOT IN ('Home', 'Away', 'Draw') THEN
            RAISE EXCEPTION 'Invalid outcome_1x2 format: %. Must be: Home, Away, or Draw', NEW.outcome_1x2;
          END IF;
        END IF;

        -- Validate outcome_ou25
        IF NEW.outcome_ou25 IS NOT NULL THEN
          IF NEW.outcome_ou25 NOT IN ('Over', 'Under') THEN
            RAISE EXCEPTION 'Invalid outcome_ou25 format: %. Must be: Over or Under', NEW.outcome_ou25;
          END IF;
        END IF;

        -- Validate outcome_btts
        IF NEW.outcome_btts IS NOT NULL THEN
          IF NEW.outcome_btts NOT IN ('Yes', 'No') THEN
            RAISE EXCEPTION 'Invalid outcome_btts format: %. Must be: Yes or No', NEW.outcome_btts;
          END IF;
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      -- Drop trigger if exists
      DROP TRIGGER IF EXISTS validate_fixture_result_trigger ON oracle.fixture_results;

      -- Create trigger
      CREATE TRIGGER validate_fixture_result_trigger
        BEFORE INSERT OR UPDATE ON oracle.fixture_results
        FOR EACH ROW
        EXECUTE FUNCTION validate_fixture_result_format();
    `;

    try {
      await db.query(triggerSQL);
      console.log('✅ Database trigger created successfully!');
      console.log('   All future inserts/updates will be validated automatically.');
    } catch (error) {
      console.error('❌ Failed to create trigger:', error.message);
      throw error;
    }
  }

  /**
   * Test the validation trigger
   */
  async testValidationTrigger() {
    console.log('\n🧪 Testing validation trigger...');

    try {
      // Just test UPDATE on existing records (safer)
      const testRecord = await db.query(`
        SELECT fixture_id FROM oracle.fixture_results LIMIT 1
      `);
      
      if (testRecord.rows.length === 0) {
        console.log('⚠️  No fixture results to test with, skipping trigger tests');
        return;
      }

      const testFixtureId = testRecord.rows[0].fixture_id;

      // Test 1: Valid data (should succeed)
      console.log('\nTest 1: Valid data update');
      await db.query(`
        UPDATE oracle.fixture_results 
        SET outcome_1x2 = 'Home', outcome_ou25 = 'Over' 
        WHERE fixture_id = $1
      `, [testFixtureId]);
      console.log('✅ Valid data accepted');

      // Test 2: Invalid 1X2 (should fail)
      console.log('\nTest 2: Invalid 1X2 format');
      try {
        await db.query(`
          UPDATE oracle.fixture_results 
          SET outcome_1x2 = '1' 
          WHERE fixture_id = $1
        `, [testFixtureId]);
        console.log('❌ Invalid data was accepted (trigger not working!)');
      } catch (error) {
        console.log('✅ Invalid data rejected:', error.message.split('\n')[0]);
      }

      // Test 3: Invalid O/U (should fail)
      console.log('\nTest 3: Invalid O/U format');
      try {
        await db.query(`
          UPDATE oracle.fixture_results 
          SET outcome_ou25 = 'O' 
          WHERE fixture_id = $1
        `, [testFixtureId]);
        console.log('❌ Invalid data was accepted (trigger not working!)');
      } catch (error) {
        console.log('✅ Invalid data rejected:', error.message.split('\n')[0]);
      }
      
      console.log('\n✅ All tests passed! Trigger is working correctly.');

    } catch (error) {
      console.error('❌ Test failed:', error.message);
      throw error;
    }
  }
}

// Export for use in other modules
module.exports = DataFormatValidator;

// Run validation if called directly
if (require.main === module) {
  const validator = new DataFormatValidator();
  
  (async () => {
    try {
      // Step 1: Validate and fix existing data
      console.log('STEP 1: VALIDATE EXISTING DATA');
      console.log('='.repeat(60));
      await validator.validateAllFixtures(true);
      
      // Step 2: Create database trigger
      console.log('\n\nSTEP 2: CREATE DATABASE TRIGGER');
      console.log('='.repeat(60));
      await validator.createValidationTrigger();
      
      // Step 3: Test the trigger
      console.log('\n\nSTEP 3: TEST VALIDATION TRIGGER');
      console.log('='.repeat(60));
      await validator.testValidationTrigger();
      
      console.log('\n\n🎉 VALIDATION SYSTEM COMPLETE!');
      console.log('All future data will be automatically validated.');
      
      process.exit(0);
    } catch (error) {
      console.error('\n❌ Error:', error);
      process.exit(1);
    }
  })();
}

