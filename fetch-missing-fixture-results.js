const SportMonksService = require('./backend/services/sportmonks');
const db = require('./backend/db/db');

async function fetchResults() {
  try {
    const sportmonksService = new SportMonksService();
    
    // Match 9: Telstar vs Excelsior (fixture_id: 19429285)
    console.log('\n=== FETCHING MATCH 9: Telstar vs Excelsior (19429285) ===');
    try {
      await sportmonksService.saveFixtureResults('19429285');
      console.log('✅ Match 9 results fetched and saved');
    } catch (error) {
      console.error('❌ Match 9 error:', error.message);
    }
    
    // Match 10: Auxerre vs Olympique Marseille (fixture_id: 19467794)
    console.log('\n=== FETCHING MATCH 10: Auxerre vs Olympique Marseille (19467794) ===');
    try {
      await sportmonksService.saveFixtureResults('19467794');
      console.log('✅ Match 10 results fetched and saved');
    } catch (error) {
      console.error('❌ Match 10 error:', error.message);
    }
    
    // Verify results were saved
    console.log('\n=== VERIFYING RESULTS ===');
    const results = await db.query(`
      SELECT fixture_id, home_score, away_score, outcome_1x2, outcome_ou25, finished_at
      FROM oracle.fixture_results 
      WHERE fixture_id IN ('19429285', '19467794')
      ORDER BY fixture_id, created_at DESC
    `);
    
    for (const result of results.rows) {
      console.log(`\nFixture ${result.fixture_id}:`);
      if (result.home_score !== null && result.away_score !== null) {
        console.log(`  Score: ${result.home_score}-${result.away_score}`);
        console.log(`  Outcome 1X2: ${result.outcome_1x2 || 'NULL'}`);
        console.log(`  Outcome O/U: ${result.outcome_ou25 || 'NULL'}`);
        console.log(`  Finished At: ${result.finished_at || 'NULL'}`);
      } else {
        console.log('  ❌ No score available');
      }
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fetchResults();
