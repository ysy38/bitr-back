const db = require('./db/db');

async function check() {
  try {
    const result = await db.query(`
      SELECT id, fixture_id, home_team, away_team 
      FROM oracle.fixtures 
      WHERE home_team = 'Internacional' AND away_team = 'Sport Recife'
      LIMIT 1
    `);
    
    if (result.rows.length > 0) {
      const f = result.rows[0];
      console.log('\n✅ Found fixture:');
      console.log(`  id (varchar): "${f.id}"`);
      console.log(`  fixture_id (bigint): ${f.fixture_id}`);
      console.log(`  Type of id: ${typeof f.id}`);
      console.log(`  Type of fixture_id: ${typeof f.fixture_id}`);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
  process.exit(0);
}

check();
