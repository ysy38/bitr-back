/**
 * Normalize Database O/U Format
 * 
 * Converts "O" → "Over" and "U" → "Under" for consistency
 */

const db = require('../db/db');

async function normalizeOUFormat() {
  try {
    console.log('🔧 Normalizing Over/Under format in database...\n');
    
    // Check current state
    const before = await db.query(`
      SELECT outcome_ou25, COUNT(*) as count 
      FROM oracle.fixture_results 
      WHERE outcome_ou25 IN ('O', 'U', 'Over', 'Under')
      GROUP BY outcome_ou25 
      ORDER BY outcome_ou25
    `);
    
    console.log('📊 Current state:');
    before.rows.forEach(r => console.log(`  ${r.outcome_ou25}: ${r.count}`));
    
    // Normalize
    console.log('\n🔧 Normalizing...');
    
    const updateO = await db.query(`
      UPDATE oracle.fixture_results 
      SET outcome_ou25 = 'Over' 
      WHERE outcome_ou25 = 'O'
    `);
    console.log(`  ✅ Converted ${updateO.rowCount} "O" → "Over"`);
    
    const updateU = await db.query(`
      UPDATE oracle.fixture_results 
      SET outcome_ou25 = 'Under' 
      WHERE outcome_ou25 = 'U'
    `);
    console.log(`  ✅ Converted ${updateU.rowCount} "U" → "Under"`);
    
    // Check after
    const after = await db.query(`
      SELECT outcome_ou25, COUNT(*) as count 
      FROM oracle.fixture_results 
      WHERE outcome_ou25 IN ('O', 'U', 'Over', 'Under')
      GROUP BY outcome_ou25 
      ORDER BY outcome_ou25
    `);
    
    console.log('\n📊 After normalization:');
    after.rows.forEach(r => console.log(`  ${r.outcome_ou25}: ${r.count}`));
    
    console.log('\n✅ Database normalized!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

normalizeOUFormat();

