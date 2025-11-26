const SportMonksService = require('./backend/services/sportmonks');

async function checkStatus() {
  try {
    const sportmonksService = new SportMonksService();
    
    const fixtureIds = ['19429285', '19467794'];
    
    console.log('\n=== CHECKING SPORTMONKS API DIRECTLY ===\n');
    
    for (const fixtureId of fixtureIds) {
      try {
        console.log(`\n=== Fixture ${fixtureId} ===`);
        const response = await sportmonksService.axios.get(`/fixtures/${fixtureId}`, {
          params: {
            'api_token': sportmonksService.apiToken,
            'include': 'scores;participants;state;league'
          }
        });
        
        const fixture = response.data.data;
        if (!fixture) {
          console.log('❌ Fixture not found');
          continue;
        }
        
        console.log(`Match: ${fixture.name || 'N/A'}`);
        console.log(`Status: ${fixture.state?.state || 'N/A'}`);
        console.log(`Time: ${fixture.state?.minute || 'N/A'} min`);
        
        console.log('\nAvailable scores:');
        if (fixture.scores && Array.isArray(fixture.scores)) {
          for (const score of fixture.scores) {
            console.log(`  ${score.description || 'N/A'}:`, score.score || 'N/A');
          }
        } else {
          console.log('  No scores available');
        }
        
        // Check if we can calculate a result even if not FT
        if (fixture.scores && Array.isArray(fixture.scores)) {
          const currentScore = fixture.scores.find(s => s.description === 'CURRENT');
          const firstHalf = fixture.scores.find(s => s.description === '1ST_HALF');
          const secondHalf = fixture.scores.find(s => s.description === '2ND_HALF');
          
          console.log('\nScore analysis:');
          console.log(`  CURRENT: ${currentScore ? JSON.stringify(currentScore.score) : 'N/A'}`);
          console.log(`  1ST_HALF: ${firstHalf ? JSON.stringify(firstHalf.score) : 'N/A'}`);
          console.log(`  2ND_HALF: ${secondHalf ? JSON.stringify(secondHalf.score) : 'N/A'}`);
        }
        
      } catch (error) {
        console.error(`❌ Error fetching fixture ${fixtureId}:`, error.message);
      }
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkStatus();
