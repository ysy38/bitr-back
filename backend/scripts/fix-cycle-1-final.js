const db = require('../db/db');

async function fixCycle1() {
  try {
    console.log('🔧 FINAL FIX: Cycle 1 resolution with merged results...\n');

    const cycleId = 1;

    // Step 1: Get current matches_data
    const cycleData = await db.query(
      'SELECT matches_data FROM oracle.oddyssey_cycles WHERE cycle_id = $1',
      [cycleId]
    );

    if (cycleData.rows.length === 0) {
      console.log('❌ Cycle 1 not found');
      process.exit(0);
    }

    const matches = cycleData.rows[0].matches_data || [];
    if (!Array.isArray(matches) || matches.length === 0) {
      console.log('❌ Cycle 1 has no matches');
      process.exit(0);
    }

    console.log(`📌 Found ${matches.length} matches in Cycle 1`);

    // Step 2: Extract fixture IDs
    const fixtureIds = matches
      .map(m => (typeof m === 'object' ? (m.id || m.fixture_id) : m))
      .filter(Boolean)
      .map(x => x.toString());

    console.log(`📌 Fixture IDs: ${fixtureIds.join(', ')}\n`);

    // Step 3: Fetch results from oracle.fixture_results
    const resultsQuery = `
      SELECT 
        f.id::text as id,
        f.home_team,
        f.away_team,
        f.league_name,
        f.starting_at,
        f.status,
        fr.home_score,
        fr.away_score,
        fr.ht_home_score,
        fr.ht_away_score,
        fr.outcome_1x2,
        fr.outcome_ou25,
        fr.finished_at
      FROM oracle.fixtures f
      LEFT JOIN oracle.fixture_results fr ON f.id::varchar = fr.fixture_id::varchar
      WHERE f.id = ANY($1)
      ORDER BY f.id
    `;

    const resultsData = await db.query(resultsQuery, [fixtureIds]);
    const resultsById = {};

    for (const row of resultsData.rows) {
      resultsById[row.id] = {
        home_score: row.home_score,
        away_score: row.away_score,
        ht_home_score: row.ht_home_score,
        ht_away_score: row.ht_away_score,
        outcome_1x2: row.outcome_1x2,
        outcome_ou25: row.outcome_ou25 === 'O' ? 'Over' : (row.outcome_ou25 === 'U' ? 'Under' : row.outcome_ou25),
        finished_at: row.finished_at
      };
    }

    // Step 4: Merge results into matches_data
    const updatedMatches = matches.map(m => {
      const id = (typeof m === 'object' ? (m.id || m.fixture_id) : m).toString();
      const base = typeof m === 'object' ? m : { id, fixture_id: id };
      return {
        ...base,
        result: {
          ...(base.result || {}),
          ...(resultsById[id] || {})
        }
      };
    });

    console.log('📊 Updated matches with results:');
    updatedMatches.forEach((m, i) => {
      const res = m.result;
      const score = res.home_score !== null ? `${res.home_score}-${res.away_score}` : 'No score';
      const outcome = res.outcome_1x2 && res.outcome_ou25 ? `${res.outcome_1x2}/${res.outcome_ou25}` : 'No outcome';
      console.log(`  ${i + 1}. Fixture ${m.id}: ${score} → ${outcome}`);
    });

    // Step 5: Update oracle.oddyssey_cycles
    console.log('\n✏️ Updating oracle.oddyssey_cycles...');
    await db.query(
      `UPDATE oracle.oddyssey_cycles
       SET matches_data = $1::jsonb,
           is_resolved = true,
           evaluation_completed = false,
           updated_at = NOW()
       WHERE cycle_id = $2`,
      [JSON.stringify(updatedMatches), cycleId]
    );

    // Step 6: Update oracle.current_oddyssey_cycle
    console.log('✏️ Updating oracle.current_oddyssey_cycle...');
    const curCheck = await db.query(
      'SELECT 1 FROM oracle.current_oddyssey_cycle WHERE cycle_id = $1',
      [cycleId]
    );

    if (curCheck.rows.length === 0) {
      await db.query(
        `INSERT INTO oracle.current_oddyssey_cycle (cycle_id, matches_data, matches_count, is_resolved)
         VALUES ($1, $2::jsonb, $3, true)`,
        [cycleId, JSON.stringify(updatedMatches), updatedMatches.length]
      );
    } else {
      await db.query(
        `UPDATE oracle.current_oddyssey_cycle
         SET matches_data = $1::jsonb,
             matches_count = $2,
             is_resolved = true,
             updated_at = NOW()
         WHERE cycle_id = $3`,
        [JSON.stringify(updatedMatches), updatedMatches.length, cycleId]
      );
    }

    // Step 7: Verify
    const verifyResult = await db.query(
      'SELECT cycle_id, is_resolved, matches_count FROM oracle.oddyssey_cycles WHERE cycle_id = $1',
      [cycleId]
    );
    console.log('✅ Cycle 1 status:', verifyResult.rows[0]);

    // Step 8: Trigger auto-evaluation
    console.log('\n⚙️ Triggering auto-evaluation for Cycle 1 slips...');
    const UnifiedSlipEvaluationService = require('../services/unified-slip-evaluation-service');
    const autoEval = new UnifiedSlipEvaluationService();
    await autoEval.evaluateCycle(cycleId);

    // Step 9: Check slip status
    const slipStats = await db.query(
      `SELECT COUNT(*) FILTER (WHERE is_evaluated) as evaluated, COUNT(*) as total 
       FROM oracle.oddyssey_slips WHERE cycle_id = $1`,
      [cycleId]
    );

    console.log('\n🏁 Final Cycle 1 Status:');
    console.log('  • Is Resolved:', verifyResult.rows[0].is_resolved);
    console.log('  • Matches Count:', verifyResult.rows[0].matches_count);
    console.log('  • Slips Evaluated:', slipStats.rows[0].evaluated, '/', slipStats.rows[0].total);

  } catch (e) {
    console.error('❌ Error:', e.message);
    console.error(e);
  } finally {
    process.exit(0);
  }
}

fixCycle1();
