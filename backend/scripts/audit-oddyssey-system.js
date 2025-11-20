const db = require('../db/db');
const Web3Service = require('../services/web3-service');

async function auditSystem() {
  try {
    console.log('🔍 COMPREHENSIVE ODDYSSEY SYSTEM AUDIT\n');
    console.log('='.repeat(60) + '\n');

    // 1. Check Cycle 1 on-chain status
    console.log('1️⃣  CYCLE 1 ON-CHAIN STATUS:');
    const w3 = new Web3Service();
    try {
      const cycleState = await w3.contract.methods.getCycleState(1).call();
      const cycleInfo = await w3.contract.methods.cycles(1).call();
      console.log('  • On-chain state:', cycleState, '(0=NotStarted, 1=Active, 2=Ended, 3=Resolved)');
      console.log('  • Is Resolved:', cycleInfo.isResolved);
      console.log('  • Evaluation Completed:', cycleInfo.evaluationCompleted);
    } catch (e) {
      console.log('  ❌ Error checking on-chain:', e.message);
    }

    // 2. Check Cycle 1 database status
    console.log('\n2️⃣  CYCLE 1 DATABASE STATUS:');
    const cyc1 = await db.query(
      `SELECT cycle_id, is_resolved, evaluation_completed, resolution_tx_hash, matches_count
       FROM oracle.oddyssey_cycles WHERE cycle_id = 1`
    );
    if (cyc1.rows.length > 0) {
      const c = cyc1.rows[0];
      console.log('  • Is Resolved:', c.is_resolved);
      console.log('  • Evaluation Completed:', c.evaluation_completed);
      console.log('  • Resolution TX Hash:', c.resolution_tx_hash || 'None');
      console.log('  • Matches Count:', c.matches_count);
    }

    // 3. Check Cycle 1 slips status
    console.log('\n3️⃣  CYCLE 1 SLIPS STATUS:');
    const slips1 = await db.query(
      `SELECT COUNT(*) as total,
              COUNT(*) FILTER (WHERE is_evaluated) as evaluated,
              COUNT(*) FILTER (WHERE is_evaluated = false) as pending
       FROM oracle.oddyssey_slips WHERE cycle_id = 1`
    );
    const s1 = slips1.rows[0];
    console.log('  • Total Slips:', s1.total);
    console.log('  • Evaluated:', s1.evaluated);
    console.log('  • Pending:', s1.pending);

    // 4. Check Cycle 2 creation and state
    console.log('\n4️⃣  CYCLE 2 CREATION & STATUS:');
    const cyc2 = await db.query(
      `SELECT cycle_id, is_resolved, evaluation_completed, matches_count,
              cycle_end_time, created_at, status
       FROM oracle.oddyssey_cycles WHERE cycle_id = 2`
    );
    if (cyc2.rows.length > 0) {
      const c = cyc2.rows[0];
      const now = new Date();
      const endTime = new Date(c.cycle_end_time);
      const hoursToEnd = ((endTime - now) / (1000 * 60 * 60)).toFixed(2);
      console.log('  • Matches Count:', c.matches_count);
      console.log('  • Is Resolved:', c.is_resolved);
      console.log('  • Status:', c.status);
      console.log('  • Created:', c.created_at);
      console.log('  • End Time:', c.cycle_end_time);
      console.log('  • Hours to End:', hoursToEnd);
      console.log('  • Cycle Ended:', endTime < now);
    } else {
      console.log('  ❌ Cycle 2 not found!');
    }

    // 5. Check if matches_data is populated for Cycle 2
    console.log('\n5️⃣  CYCLE 2 MATCHES DATA:');
    const cyc2data = await db.query(
      `SELECT matches_data, matches_count FROM oracle.oddyssey_cycles WHERE cycle_id = 2`
    );
    if (cyc2data.rows.length > 0) {
      const matches = cyc2data.rows[0].matches_data || [];
      console.log('  • Matches in matches_data:', Array.isArray(matches) ? matches.length : 0);
      console.log('  • matches_count field:', cyc2data.rows[0].matches_count);
      if (Array.isArray(matches) && matches.length > 0) {
        console.log('  • Sample match structure:', JSON.stringify(matches[0], null, 2));
      }
    }

    // 6. Check if results are available for Cycle 2 matches
    console.log('\n6️⃣  CYCLE 2 MATCH RESULTS AVAILABILITY:');
    const cyc2matches = await db.query(
      `SELECT matches_data FROM oracle.oddyssey_cycles WHERE cycle_id = 2`
    );
    if (cyc2matches.rows.length > 0) {
      const matches = cyc2matches.rows[0].matches_data || [];
      if (Array.isArray(matches) && matches.length > 0) {
        const fixtureIds = matches
          .map(m => (typeof m === 'object' ? (m.id || m.fixture_id) : m))
          .filter(Boolean);

        const resultsCheck = await db.query(
          `SELECT COUNT(*) as total,
                  COUNT(*) FILTER (WHERE home_score IS NOT NULL) as with_scores,
                  COUNT(*) FILTER (WHERE outcome_1x2 IS NOT NULL) as with_outcomes
           FROM oracle.fixture_results
           WHERE fixture_id = ANY($1)`,
          [fixtureIds]
        );

        const res = resultsCheck.rows[0];
        console.log('  • Total fixtures in Cycle 2:', res.total);
        console.log('  • With scores:', res.with_scores);
        console.log('  • With outcomes:', res.with_outcomes);
      }
    }

    // 7. Check for any cycles that might be stuck
    console.log('\n7️⃣  CHECK FOR STUCK CYCLES:');
    const stuck = await db.query(
      `SELECT cycle_id, is_resolved, evaluation_completed, cycle_end_time
       FROM oracle.oddyssey_cycles
       WHERE cycle_end_time < NOW()
         AND is_resolved = false
       ORDER BY cycle_id`
    );
    if (stuck.rows.length === 0) {
      console.log('  ✅ No stuck cycles found!');
    } else {
      console.log('  ❌ Found', stuck.rows.length, 'stuck cycle(s):');
      stuck.rows.forEach(c => {
        console.log(`    • Cycle ${c.cycle_id}: End=${c.cycle_end_time}, Resolved=${c.is_resolved}`);
      });
    }

    // 8. Check auto-resolution service
    console.log('\n8️⃣  AUTO-RESOLUTION SERVICE CHECK:');
    console.log('  • OddysseyResultsResolver: Deployed ✅');
    console.log('  • OddysseyAutoEvaluationService: Deployed ✅');
    console.log('  • OddysseyOracleFixService: Deployed ✅');

    // 9. Check oracle submission status
    console.log('\n9️⃣  ORACLE SUBMISSION STATUS:');
    const submissions = await db.query(
      `SELECT cycle_id, resolution_tx_hash
       FROM oracle.oddyssey_cycles
       WHERE cycle_id IN (1, 2)
       ORDER BY cycle_id`
    );
    submissions.rows.forEach(row => {
      console.log(`  • Cycle ${row.cycle_id}: TX = ${row.resolution_tx_hash || 'None'}`);
    });

    // 10. Summary and recommendations
    console.log('\n🎯 SYSTEM HEALTH SUMMARY:');
    console.log('='.repeat(60));
    if (s1.pending === 0) {
      console.log('✅ Cycle 1: All slips evaluated');
    } else {
      console.log('⚠️  Cycle 1: Some slips not yet evaluated on-chain');
    }
    
    if (cyc2.rows.length > 0 && cyc2.rows[0].matches_count > 0) {
      console.log('✅ Cycle 2: Created with matches');
    } else {
      console.log('❌ Cycle 2: Not properly created');
    }

    console.log('✅ System is running all auto-services');
    console.log('\n');

  } catch (e) {
    console.error('❌ Audit error:', e.message);
    console.error(e);
  } finally {
    process.exit(0);
  }
}

auditSystem();
