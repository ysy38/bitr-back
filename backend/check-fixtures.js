const db = require('./db/db');

async function checkFixtures() {
  console.log('\n========== CHECKING FIXTURES DATABASE ==========\n');
  
  try {
    // Check if any fixtures exist
    const allFixtures = await db.query(`
      SELECT COUNT(*) as count FROM oracle.fixtures
    `);
    console.log(`Total fixtures in database: ${allFixtures.rows[0].count}`);
    
    // Check if our specific fixture exists
    const fixture19387190 = await db.query(`
      SELECT id, home_team, away_team, league FROM oracle.fixtures WHERE id = '19387190'
    `);
    
    if (fixture19387190.rows.length > 0) {
      console.log('\n✅ Fixture 19387190 found:');
      console.log(fixture19387190.rows[0]);
    } else {
      console.log('\n❌ Fixture 19387190 NOT found!');
      console.log('\nSearching for similar fixtures...');
      const similarFixtures = await db.query(`
        SELECT id, home_team, away_team, league FROM oracle.fixtures 
        WHERE home_team ILIKE '%Internacional%' OR away_team ILIKE '%Sport%'
        LIMIT 5
      `);
      
      if (similarFixtures.rows.length > 0) {
        console.log('Found similar fixtures:');
        similarFixtures.rows.forEach(f => {
          console.log(`  - ID: ${f.id}, ${f.home_team} vs ${f.away_team} (${f.league})`);
        });
      } else {
        console.log('No similar fixtures found either!');
      }
    }
    
    // Check latest fixtures
    console.log('\n📋 Latest 5 fixtures:');
    const latest = await db.query(`
      SELECT id, home_team, away_team, league FROM oracle.fixtures 
      ORDER BY created_at DESC LIMIT 5
    `);
    latest.rows.forEach(f => {
      console.log(`  - ID: ${f.id}, ${f.home_team} vs ${f.away_team} (${f.league})`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  
  process.exit(0);
}

checkFixtures();
