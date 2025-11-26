const db = require('../db/db');

(async () => {
  try {
    console.log('🔍 INVESTIGATING SCORE MISMATCHES - CYCLE 1');
    console.log('='.repeat(70));
    
    const matchIds = ['19575013', '19575014', '19506142', '19585747', '19585748', 
                     '19585749', '19571058', '19431102', '19427297', '19578228'];
    
    // Get data from both tables
    const query = `
      SELECT 
        f.id,
        f.home_team,
        f.away_team,
        f.status,
        -- match_results data
        mr.home_score as mr_home,
        mr.away_score as mr_away,
        mr.outcome_1x2 as mr_1x2,
        mr.outcome_ou25 as mr_ou25,
        -- fixture_results data
        fr.home_score as fr_home,
        fr.away_score as fr_away,
        fr.outcome_1x2 as fr_1x2,
        fr.outcome_ou25 as fr_ou25
      FROM oracle.fixtures f
      LEFT JOIN oracle.match_results mr ON f.id::TEXT = mr.match_id::TEXT
      LEFT JOIN oracle.fixture_results fr ON f.id::TEXT = fr.fixture_id::TEXT
      WHERE f.id = ANY($1)
      ORDER BY f.id
    `;
    
    const result = await db.query(query, [matchIds]);
    
    let mismatchCount = 0;
    
    result.rows.forEach(row => {
      const scoreMatch = row.mr_home === row.fr_home && row.mr_away === row.fr_away;
      const outcome1x2Match = row.mr_1x2 === row.fr_1x2;
      const outcomeOu25Match = row.mr_ou25 === row.fr_ou25;
      
      const hasConflict = !scoreMatch || !outcome1x2Match || !outcomeOu25Match;
      
      if (hasConflict) {
        mismatchCount++;
        console.log(`\n❌ MISMATCH: ${row.id} - ${row.home_team} vs ${row.away_team}`);
        console.log(`   Status: ${row.status}`);
        console.log(`   match_results:   ${row.mr_home}-${row.mr_away} | ${row.mr_1x2} | ${row.mr_ou25}`);
        console.log(`   fixture_results: ${row.fr_home}-${row.fr_away} | ${row.fr_1x2} | ${row.fr_ou25}`);
        
        // Calculate what SHOULD be the correct outcome based on fixture_results score
        if (row.fr_home !== null && row.fr_away !== null) {
          const correctTotal = row.fr_home + row.fr_away;
          const correct1x2 = row.fr_home > row.fr_away ? 'Home' : row.fr_home < row.fr_away ? 'Away' : 'Draw';
          const correctOu25 = correctTotal > 2.5 ? 'Over' : 'Under';
          console.log(`   CORRECT (calculated): ${row.fr_home}-${row.fr_away} | ${correct1x2} | ${correctOu25}`);
        }
      } else {
        console.log(`✅ MATCH: ${row.id} - ${row.home_team} vs ${row.away_team}`);
        console.log(`   ${row.mr_home}-${row.mr_away} | ${row.mr_1x2} | ${row.mr_ou25}`);
      }
    });
    
    console.log(`\n${'='.repeat(70)}`);
    console.log(`📊 SUMMARY: ${mismatchCount}/10 matches have conflicts`);
    
    if (mismatchCount > 0) {
      console.log(`\n❌ CRITICAL: Data inconsistency detected!`);
      console.log(`   This means different services are writing different data.`);
      console.log(`   We need to find which service wrote to which table and when.`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
})();

