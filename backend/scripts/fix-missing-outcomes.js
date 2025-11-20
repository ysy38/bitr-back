const db = require('../db/db');

/**
 * Fix Missing Outcomes Script
 * Calculates missing outcome_1x2 and outcome_ou25 for fixtures with scores
 */

class MissingOutcomesFixer {
  constructor() {
    this.fixedCount = 0;
    this.errorCount = 0;
  }

  async fixAllMissingOutcomes() {
    console.log('🔧 Fixing missing outcome calculations...');
    
    try {
      // Get all fixtures with scores but missing outcomes
      const result = await db.query(`
        SELECT fixture_id, home_score, away_score
        FROM oracle.fixture_results 
        WHERE home_score IS NOT NULL 
          AND away_score IS NOT NULL 
          AND (outcome_1x2 IS NULL OR outcome_ou25 IS NULL)
        ORDER BY fixture_id
        LIMIT 1000
      `);

      console.log(`📊 Found ${result.rows.length} fixtures with missing outcomes`);

      for (const fixture of result.rows) {
        try {
          await this.calculateOutcomes(fixture);
          this.fixedCount++;
          
          if (this.fixedCount % 100 === 0) {
            console.log(`✅ Fixed ${this.fixedCount} fixtures...`);
          }
        } catch (error) {
          console.warn(`⚠️ Failed to fix fixture ${fixture.fixture_id}: ${error.message}`);
          this.errorCount++;
        }
      }

      console.log(`\n🎉 Outcome calculation complete!`);
      console.log(`✅ Fixed: ${this.fixedCount} fixtures`);
      console.log(`❌ Errors: ${this.errorCount} fixtures`);
      
    } catch (error) {
      console.error('❌ Failed to fix missing outcomes:', error);
      throw error;
    }
  }

  async calculateOutcomes(fixture) {
    const { fixture_id, home_score, away_score } = fixture;
    
    // Calculate 1X2 outcome
    let outcome_1x2;
    if (home_score > away_score) {
      outcome_1x2 = '1'; // Home wins
    } else if (away_score > home_score) {
      outcome_1x2 = '2'; // Away wins
    } else {
      outcome_1x2 = 'X'; // Draw
    }
    
    // Calculate Over/Under 2.5 outcome
    const total_goals = home_score + away_score;
    const outcome_ou25 = total_goals > 2.5 ? 'Over' : 'Under';
    
    // Update the fixture results
    await db.query(`
      UPDATE oracle.fixture_results 
      SET outcome_1x2 = $1, outcome_ou25 = $2, updated_at = NOW()
      WHERE fixture_id = $3
    `, [outcome_1x2, outcome_ou25, fixture_id]);
    
    console.log(`📊 Fixture ${fixture_id}: ${home_score}-${away_score} → 1X2: ${outcome_1x2}, OU2.5: ${outcome_ou25}`);
  }

  async fixSpecificFixture(fixtureId) {
    console.log(`🔧 Fixing specific fixture: ${fixtureId}`);
    
    try {
      const result = await db.query(`
        SELECT fixture_id, home_score, away_score
        FROM oracle.fixture_results 
        WHERE fixture_id = $1
      `, [fixtureId]);

      if (result.rows.length === 0) {
        console.log(`❌ Fixture ${fixtureId} not found`);
        return;
      }

      const fixture = result.rows[0];
      await this.calculateOutcomes(fixture);
      console.log(`✅ Fixed fixture ${fixtureId}`);
      
    } catch (error) {
      console.error(`❌ Failed to fix fixture ${fixtureId}:`, error);
      throw error;
    }
  }
}

// Run the fixer if called directly
if (require.main === module) {
  const fixer = new MissingOutcomesFixer();
  
  // Check if specific fixture ID provided
  const fixtureId = process.argv[2];
  if (fixtureId) {
    fixer.fixSpecificFixture(fixtureId).catch(console.error);
  } else {
    fixer.fixAllMissingOutcomes().catch(console.error);
  }
}

module.exports = MissingOutcomesFixer;
