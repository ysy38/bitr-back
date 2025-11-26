const db = require('../db/db');

(async () => {
  try {
    console.log('🔍 CHECKING CYCLE 1 STATUS');
    console.log('='.repeat(60));
    
    // Get cycle 1 info
    const cycleResult = await db.query(`
      SELECT 
        cycle_id,
        matches_data,
        is_resolved,
        cycle_end_time,
        created_at
      FROM oracle.oddyssey_cycles
      WHERE cycle_id = 1
    `);
    
    if (cycleResult.rows.length === 0) {
      console.log('❌ Cycle 1 not found!');
      process.exit(1);
    }
    
    const cycle = cycleResult.rows[0];
    const matches = cycle.matches_data;
    const matchIds = matches.map(m => m.id);
    
    console.log(`Cycle 1 Info:`);
    console.log(`  Resolved: ${cycle.is_resolved}`);
    console.log(`  Cycle End Time: ${cycle.cycle_end_time}`);
    console.log(`  Created: ${cycle.created_at}`);
    console.log(`  Match IDs: ${matchIds.join(', ')}`);
    console.log('');
    
    // Check match_results table
    const matchResults = await db.query(`
      SELECT 
        match_id, 
        home_score, 
        away_score, 
        outcome_1x2, 
        outcome_ou25,
        finished_at
      FROM oracle.match_results
      WHERE match_id = ANY($1)
      ORDER BY match_id
    `, [matchIds]);
    
    console.log(`Match Results Table: ${matchResults.rows.length}/10 matches`);
    let resolvedInMatchResults = 0;
    matchResults.rows.forEach(m => {
      const hasScores = m.home_score !== null && m.away_score !== null;
      const hasOutcomes = m.outcome_1x2 !== null && m.outcome_ou25 !== null;
      const isResolved = hasScores && hasOutcomes;
      if (isResolved) resolvedInMatchResults++;
      console.log(`  ${isResolved ? '✅' : '❌'} ${m.match_id}: ${m.home_score}-${m.away_score}, ${m.outcome_1x2}/${m.outcome_ou25}`);
    });
    
    console.log(`\n📊 match_results: ${resolvedInMatchResults}/10 resolved`);
    
    // Check fixture_results table
    const fixtureResults = await db.query(`
      SELECT 
        f.id,
        f.home_team,
        f.away_team,
        f.status,
        fr.home_score,
        fr.away_score,
        fr.outcome_1x2,
        fr.outcome_ou25
      FROM oracle.fixtures f
      LEFT JOIN oracle.fixture_results fr ON f.id::TEXT = fr.fixture_id::TEXT
      WHERE f.id = ANY($1)
      ORDER BY f.id
    `, [matchIds]);
    
    console.log(`\nFixture Results Table: ${fixtureResults.rows.length}/10 matches`);
    let resolvedInFixtureResults = 0;
    fixtureResults.rows.forEach(m => {
      const hasScores = m.home_score !== null && m.away_score !== null;
      const hasOutcomes = m.outcome_1x2 !== null && m.outcome_ou25 !== null;
      const isFinished = ['FT', 'AET', 'PEN', 'FT_PEN'].includes(m.status);
      const isResolved = isFinished && hasScores && hasOutcomes;
      if (isResolved) resolvedInFixtureResults++;
      console.log(`  ${isResolved ? '✅' : '❌'} ${m.id}: ${m.home_team} vs ${m.away_team}`);
      console.log(`     Status: ${m.status}, Score: ${m.home_score}-${m.away_score}, Outcomes: ${m.outcome_1x2}/${m.outcome_ou25}`);
    });
    
    console.log(`\n📊 fixture_results: ${resolvedInFixtureResults}/10 resolved`);
    
    // Summary
    console.log(`\n${'='.repeat(60)}`);
    console.log('SUMMARY:');
    console.log(`  Cycle 1 Database Status: ${cycle.is_resolved ? 'RESOLVED ✅' : 'NOT RESOLVED ❌'}`);
    console.log(`  match_results: ${resolvedInMatchResults}/10 resolved`);
    console.log(`  fixture_results: ${resolvedInFixtureResults}/10 resolved`);
    
    if (resolvedInMatchResults === 10 && resolvedInFixtureResults === 10) {
      console.log('\n✅ ALL DATA COMPLETE - Cycle 1 should be resolvable!');
    } else if (resolvedInFixtureResults === 10 && resolvedInMatchResults < 10) {
      console.log('\n⚠️  fixture_results is complete, but match_results needs sync');
    } else {
      console.log('\n❌ INCOMPLETE DATA - Cannot resolve cycle!');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
})();

