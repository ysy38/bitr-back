/*
  Backfill Cycle 1 matches_data from slips and fixtures, run resolver, and auto-evaluate slips.
*/

const db = require('../db/db');

async function collectFixtureIdsFromSlips(cycleId) {
  const slips = await db.query(
    'SELECT predictions FROM oracle.oddyssey_slips WHERE cycle_id = $1',
    [cycleId]
  );
  const fixtureIdSet = new Set();
  for (const row of slips.rows) {
    let predictions = row.predictions;
    if (typeof predictions === 'string') {
      try {
        predictions = JSON.parse(predictions);
      } catch (_) {
        predictions = [];
      }
    }
    if (!Array.isArray(predictions)) continue;
    for (const p of predictions) {
      const matchId = p && (p.matchId || p.match_id || p[0]);
      if (matchId !== undefined && matchId !== null && matchId !== '') {
        fixtureIdSet.add(String(matchId));
      }
    }
  }
  return Array.from(fixtureIdSet);
}

async function fetchFixturesAndResults(fixtureIds) {
  if (fixtureIds.length === 0) return [];
  const result = await db.query(
    `SELECT 
       f.fixture_id,
       f.home_team,
       f.away_team,
       f.league_name,
       f.starting_at,
       r.home_score,
       r.away_score,
       r.ht_home_score,
       r.ht_away_score,
       r.outcome_1x2,
       r.outcome_ou25,
       r.finished_at
     FROM oracle.fixtures f
     LEFT JOIN oracle.fixture_results r ON r.fixture_id = f.fixture_id
     WHERE f.fixture_id = ANY($1)`,
    [fixtureIds]
  );
  return result.rows.map(f => ({
    id: String(f.fixture_id),
    fixture_id: String(f.fixture_id),
    homeTeam: f.home_team,
    awayTeam: f.away_team,
    leagueName: f.league_name,
    starting_at: f.starting_at,
    result: {
      home_score: f.home_score,
      away_score: f.away_score,
      ht_home_score: f.ht_home_score,
      ht_away_score: f.ht_away_score,
      outcome_1x2: f.outcome_1x2,
      outcome_ou25: f.outcome_ou25,
      finished_at: f.finished_at
    }
  }));
}

async function updateCycleMatches(cycleId, matchesData) {
  const upd = await db.query(
    `UPDATE oracle.oddyssey_cycles
     SET matches_data = $1::jsonb,
         matches_count = $2,
         updated_at = NOW()
     WHERE cycle_id = $3
     RETURNING cycle_id, matches_count, is_resolved`,
    [JSON.stringify(matchesData), matchesData.length, cycleId]
  );
  return upd.rows[0];
}

async function run() {
  const cycleId = 1;
  try {
    console.log('🔧 Backfilling Cycle %s...', cycleId);
    const fixtureIds = await collectFixtureIdsFromSlips(cycleId);
    if (fixtureIds.length === 0) {
      console.log('❌ No fixture IDs found in slips for cycle %s', cycleId);
      process.exit(0);
    }
    console.log('📌 Fixture IDs:', fixtureIds.join(','));

    const matchesData = await fetchFixturesAndResults(fixtureIds);
    const upd = await updateCycleMatches(cycleId, matchesData);
    console.log('✅ Cycle updated:', upd);

    // Resolve cycle
    const OddysseyResultsResolver = require('../services/oddyssey-results-resolver');
    const resolver = new OddysseyResultsResolver();
    console.log('🔁 Running resolver for Cycle %s...', cycleId);
    await resolver.manualResolveCycle(cycleId);

    const ver = await db.query(
      'SELECT cycle_id, is_resolved, evaluation_completed, matches_count FROM oracle.oddyssey_cycles WHERE cycle_id = $1',
      [cycleId]
    );
    console.log('📊 Post-resolution status:', ver.rows[0]);

    // Auto-evaluate slips if resolved
    if (ver.rows[0].is_resolved) {
      const UnifiedSlipEvaluationService = require('../services/unified-slip-evaluation-service');
      const unified = new UnifiedSlipEvaluationService();
      console.log('⚙️ Running auto-evaluation for Cycle %s...', cycleId);
      await unified.evaluateCycle(cycleId);
      const stats = await db.query(
        'SELECT COUNT(*) FILTER (WHERE is_evaluated) AS evaluated, COUNT(*) AS total FROM oracle.oddyssey_slips WHERE cycle_id = $1',
        [cycleId]
      );
      console.log('🏁 Slip evaluation stats:', stats.rows[0]);
    } else {
      console.log('⏳ Cycle %s not resolved yet after resolver run.', cycleId);
    }
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    process.exit(0);
  }
}

run();


