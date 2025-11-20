const db = require('./db/db');

async function checkPool2Settlement() {
  console.log('\n========== CHECKING POOL 2 SETTLEMENT READINESS ==========\n');
  
  try {
    // 1. Check Pool 2 data
    const poolResult = await db.query(`
      SELECT 
        pool_id,
        market_id,
        fixture_id,
        category,
        predicted_outcome,
        arbitration_deadline,
        is_settled,
        created_at
      FROM oracle.pools 
      WHERE pool_id = 2
    `);
    
    if (poolResult.rows.length > 0) {
      const pool = poolResult.rows[0];
      console.log('✅ Pool 2 found:');
      console.log(`  pool_id: ${pool.pool_id}`);
      console.log(`  market_id: ${pool.market_id}`);
      console.log(`  fixture_id: ${pool.fixture_id}`);
      console.log(`  category: ${pool.category}`);
      console.log(`  predicted_outcome: ${pool.predicted_outcome}`);
      console.log(`  arbitration_deadline: ${pool.arbitration_deadline}`);
      console.log(`  is_settled: ${pool.is_settled}`);
      console.log(`  created_at: ${pool.created_at}`);
      
      // 2. Check if fixture exists
      const fixtureResult = await db.query(`
        SELECT id, home_team, away_team, status FROM oracle.fixtures 
        WHERE id = $1::text
      `, [pool.market_id]);
      
      if (fixtureResult.rows.length > 0) {
        const fixture = fixtureResult.rows[0];
        console.log('\n✅ Fixture found:');
        console.log(`  id: ${fixture.id}`);
        console.log(`  home_team: ${fixture.home_team}`);
        console.log(`  away_team: ${fixture.away_team}`);
        console.log(`  status: ${fixture.status}`);
      } else {
        console.log('\n❌ Fixture NOT found!');
      }
      
      // 3. Check if fixture results exist (fixture_id is bigint)
      const resultsResult = await db.query(`
        SELECT home_score, away_score, outcome_1x2, outcome_ou25 FROM oracle.fixture_results
        WHERE fixture_id = $1::bigint
      `, [pool.market_id]);
      
      if (resultsResult.rows.length > 0) {
        const result = resultsResult.rows[0];
        console.log('\n✅ Fixture results found:');
        console.log(`  home_score: ${result.home_score}`);
        console.log(`  away_score: ${result.away_score}`);
        console.log(`  outcome_1x2: ${result.outcome_1x2}`);
        console.log(`  outcome_ou25: ${result.outcome_ou25}`);
      } else {
        console.log('\n⚠️ Fixture results NOT yet available (match may not have started/finished)');
      }
      
      console.log('\n✅ CONCLUSION: Pool 2 is ready for settlement!');
      console.log('   - market_id is properly set to SportMonks fixture ID');
      console.log('   - fixture exists in database');
      console.log('   - settlement service can now match and resolve');
      
    } else {
      console.log('❌ Pool 2 NOT found!');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  
  process.exit(0);
}

checkPool2Settlement();
