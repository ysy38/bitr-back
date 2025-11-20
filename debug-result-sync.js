const db = require('./backend/db/db');

async function debugResultSync() {
  try {
    console.log('🔍 Debugging result sync issues...');
    
    // Check specific matches that should have been fixed
    const debugResult = await db.query(`
      SELECT 
        f.id,
        f.fixture_id,
        f.home_team,
        f.away_team,
        f.status,
        f.result_info->>'home_score' as result_info_home,
        f.result_info->>'away_score' as result_info_away,
        f.result_info->>'result_1x2' as result_info_1x2,
        f.result_info->>'result_ou25' as result_info_ou25,
        fr.home_score as fixture_results_home,
        fr.away_score as fixture_results_away,
        fr.outcome_1x2 as fixture_results_1x2,
        fr.outcome_ou25 as fixture_results_ou25,
        f.updated_at
      FROM oracle.fixtures f
      LEFT JOIN oracle.fixture_results fr ON f.id::text = fr.fixture_id::text
      WHERE f.match_date >= NOW() - INTERVAL '7 days'
        AND f.status = 'FT'
        AND f.result_info IS NOT NULL 
        AND f.result_info != '{}'::jsonb
        AND f.home_team IN ('Lazio', 'Rayo Vallecano', 'Olympique Lyonnais')
      ORDER BY f.match_date DESC
    `);
    
    console.log(`Found ${debugResult.rows.length} specific matches to debug:`);
    debugResult.rows.forEach((match, idx) => {
      console.log(`\n${idx + 1}. ${match.home_team} vs ${match.away_team}`);
      console.log(`   result_info: ${match.result_info_home}-${match.result_info_away} (${match.result_info_1x2}/${match.result_info_ou25})`);
      console.log(`   fixture_results: ${match.fixture_results_home || 'NULL'}-${match.fixture_results_away || 'NULL'} (${match.fixture_results_1x2 || 'NULL'}/${match.fixture_results_ou25 || 'NULL'})`);
      console.log(`   Updated: ${match.updated_at}`);
      
      // Check if fixture_results exists but has NULL values
      if (match.fixture_results_home === null && match.result_info_home !== null) {
        console.log(`   🚨 ISSUE: fixture_results exists but has NULL home_score`);
      }
      if (match.fixture_results_away === null && match.result_info_away !== null) {
        console.log(`   🚨 ISSUE: fixture_results exists but has NULL away_score`);
      }
    });
    
    // Check the fixture_results table structure
    console.log('\n📊 Checking fixture_results table structure...');
    const structureResult = await db.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'fixture_results' 
        AND table_schema = 'oracle'
      ORDER BY ordinal_position
    `);
    
    console.log('fixture_results table columns:');
    structureResult.rows.forEach(col => {
      console.log(`   ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
    });
    
    // Check for constraint issues
    console.log('\n📊 Checking for constraint violations...');
    const constraintResult = await db.query(`
      SELECT 
        conname as constraint_name,
        contype as constraint_type,
        pg_get_constraintdef(oid) as constraint_definition
      FROM pg_constraint 
      WHERE conrelid = 'oracle.fixture_results'::regclass
    `);
    
    console.log('fixture_results constraints:');
    constraintResult.rows.forEach(constraint => {
      console.log(`   ${constraint.constraint_name}: ${constraint.constraint_definition}`);
    });
    
  } catch (error) {
    console.error('❌ Error debugging result sync:', error);
  } finally {
    await db.disconnect();
  }
}

debugResultSync();
