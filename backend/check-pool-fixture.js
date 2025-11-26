const db = require('./db/db');

async function check() {
  try {
    const result = await db.query(`
      SELECT pool_id, market_id, fixture_id, home_team, away_team
      FROM oracle.pools WHERE pool_id = 2
    `);
    
    if (result.rows.length > 0) {
      const p = result.rows[0];
      console.log('\n✅ Pool 2:');
      console.log(`  pool_id: ${p.pool_id}`);
      console.log(`  market_id: ${p.market_id}`);
      console.log(`  fixture_id: ${p.fixture_id}`);
      console.log(`  home_team: ${p.home_team}`);
      console.log(`  away_team: ${p.away_team}`);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
  process.exit(0);
}

check();
