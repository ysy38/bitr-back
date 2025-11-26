require('dotenv').config();
const db = require('../db/db');

async function cleanupCycle1() {
  try {
    console.log('🧹 Cleaning up cycle 1...');
    
    // Delete from daily_game_matches
    const dgmResult = await db.query(`DELETE FROM oracle.daily_game_matches WHERE cycle_id = 1`);
    console.log(`✅ Deleted ${dgmResult.rowCount} rows from daily_game_matches`);
    
    // Delete from oddyssey_cycles
    const cycleResult = await db.query(`DELETE FROM oracle.oddyssey_cycles WHERE cycle_id = 1`);
    console.log(`✅ Deleted ${cycleResult.rowCount} rows from oddyssey_cycles`);
    
    console.log('✅ Cleanup complete!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    process.exit(0);
  }
}

cleanupCycle1();

