require('dotenv').config();
const db = require('../db/db');

async function checkCycleData() {
  try {
    const result = await db.query(`
      SELECT 
        cycle_id, 
        fixture_id,
        home_team,
        away_team,
        display_order
      FROM oracle.daily_game_matches 
      WHERE cycle_id = 1
      ORDER BY display_order
    `);

    console.log(`Found ${result.rows.length} matches in cycle 1:`);
    result.rows.forEach((row, idx) => {
      console.log(`${idx + 1}. [Order: ${row.display_order}] ${row.home_team} vs ${row.away_team} (Fixture: ${row.fixture_id})`);
    });

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    process.exit(0);
  }
}

checkCycleData();

