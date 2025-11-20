const SportMonksService = require('./backend/services/sportmonks');
const db = require('./backend/db/db');

async function fetchMatches() {
  try {
    const sportmonksService = new SportMonksService();
    
    // Match 9: Telstar vs Excelsior (fixture_id: 19429285)
    // Match 10: Auxerre vs Olympique Marseille (fixture_id: 19467794)
    const fixtureIds = ['19429285', '19467794'];
    
    console.log('\n=== FETCHING CYCLE 6 MISSING MATCHES ===');
    console.log(`Fixtures: ${fixtureIds.join(', ')}\n`);
    
    // Fetch results for both fixtures
    const results = await sportmonksService.fetchFixtureResults(fixtureIds);
    console.log(`\n✅ Fetched ${results.length} results`);
    
    // Save results to database
    if (results.length > 0) {
      console.log('\n=== SAVING RESULTS TO DATABASE ===');
      await sportmonksService.saveFixtureResults(fixtureIds);
      console.log('✅ Results saved to database');
    }
    
    // Verify results were saved
    console.log('\n=== VERIFYING SAVED RESULTS ===');
    const savedResults = await db.query(`
      SELECT fixture_id, home_score, away_score, outcome_1x2, outcome_ou25, finished_at, created_at
      FROM oracle.fixture_results 
      WHERE fixture_id IN ($1, $2)
      ORDER BY fixture_id, created_at DESC
    `, fixtureIds);
    
    if (savedResults.rows.length > 0) {
      console.log(`\n✅ Found ${savedResults.rows.length} saved results:\n`);
      for (const result of savedResults.rows) {
        console.log(`Fixture ${result.fixture_id}:`);
        if (result.home_score !== null && result.away_score !== null) {
          console.log(`  Score: ${result.home_score}-${result.away_score}`);
          console.log(`  Outcome 1X2: ${result.outcome_1x2 || 'NULL'}`);
          console.log(`  Outcome O/U: ${result.outcome_ou25 || 'NULL'}`);
          console.log(`  Finished At: ${result.finished_at || 'NULL'}`);
        } else {
          console.log('  ❌ No score available');
        }
      }
    } else {
      console.log('\n❌ No results saved yet');
      console.log('\nPossible reasons:');
      console.log('  1. Matches are still in progress (not FT/AET/PEN status)');
      console.log('  2. SportMonks API does not have results yet');
      console.log('  3. Missing required score data (1ST_HALF, 2ND_HALF, etc.)');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

fetchMatches();
