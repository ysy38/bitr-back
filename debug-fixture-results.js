const SportMonksService = require('./backend/services/sportmonks');
const db = require('./backend/db/db');

async function debugFixture() {
  try {
    const sportmonksService = new SportMonksService();
    
    // Test Match 9: Telstar vs Excelsior (19429285)
    console.log('\n=== FETCHING FIXTURE 19429285 (Telstar vs Excelsior) ===');
    const result1 = await sportmonksService.fetchFixtureResults('19429285');
    console.log('Raw result:', JSON.stringify(result1, null, 2));
    
    // Test Match 10: Auxerre vs Olympique Marseille (19467794)
    console.log('\n=== FETCHING FIXTURE 19467794 (Auxerre vs Olympique Marseille) ===');
    const result2 = await sportmonksService.fetchFixtureResults('19467794');
    console.log('Raw result:', JSON.stringify(result2, null, 2));
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

debugFixture();
