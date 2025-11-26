const db = require('../db/db');

/**
 * Update Fixture Statuses Script
 * 
 * This script updates fixture statuses to "FT" (Full Time) for matches
 * that have results but are still showing as "HT", "INPLAY_1ST_HALF", etc.
 */
class UpdateFixtureStatuses {
  async run() {
    console.log('🔄 Starting fixture status updates...');
    
    try {
      // Get fixtures that have results but wrong status
      const result = await db.query(`
        SELECT 
          f.id,
          f.home_team,
          f.away_team,
          f.status,
          f.match_date,
          fr.home_score,
          fr.away_score
        FROM oracle.fixtures f
        INNER JOIN oracle.fixture_results fr ON f.id::VARCHAR = fr.fixture_id::VARCHAR
        WHERE f.status NOT IN ('FT', 'AET', 'PEN')
        AND fr.home_score IS NOT NULL
        AND fr.away_score IS NOT NULL
        AND f.match_date < NOW() - INTERVAL '1 hour'
        ORDER BY f.match_date
      `);

      if (result.rows.length === 0) {
        console.log('✅ No fixtures need status updates');
        return;
      }

      console.log(`📊 Found ${result.rows.length} fixtures that need status updates`);

      let updatedCount = 0;
      for (const fixture of result.rows) {
        try {
          await db.query(`
            UPDATE oracle.fixtures 
            SET status = 'FT', updated_at = NOW()
            WHERE id = $1
          `, [fixture.id]);

          console.log(`✅ Updated fixture ${fixture.id}: ${fixture.home_team} vs ${fixture.away_team} [${fixture.status} → FT] (${fixture.home_score}-${fixture.away_score})`);
          updatedCount++;

        } catch (error) {
          console.error(`❌ Failed to update fixture ${fixture.id}:`, error.message);
        }
      }

      console.log(`🎉 Updated status for ${updatedCount}/${result.rows.length} fixtures`);

    } catch (error) {
      console.error('❌ Error updating fixture statuses:', error);
    }
  }
}

// Run the update if this script is executed directly
if (require.main === module) {
  const updater = new UpdateFixtureStatuses();
  updater.run()
    .then(() => {
      console.log('✅ Status updates completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Status updates failed:', error);
      process.exit(1);
    });
}

module.exports = UpdateFixtureStatuses;
