const db = require('./db/db');

async function checkReputationError() {
  console.log('\n========== CHECKING REPUTATION_ACTIONS TABLE ==========\n');
  
  try {
    // Get table schema
    const schemaResult = await db.query(`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_schema = 'core' AND table_name = 'reputation_actions'
      ORDER BY ordinal_position
    `);
    
    console.log('📋 Table Schema:');
    schemaResult.rows.forEach(col => {
      console.log(`  ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'} ${col.column_default ? `DEFAULT ${col.column_default}` : ''}`);
    });
    
    // Get constraints
    const constraintsResult = await db.query(`
      SELECT constraint_name, constraint_type 
      FROM information_schema.table_constraints 
      WHERE table_schema = 'core' AND table_name = 'reputation_actions'
    `);
    
    console.log('\n🔒 Constraints:');
    constraintsResult.rows.forEach(c => {
      console.log(`  ${c.constraint_name}: ${c.constraint_type}`);
    });
    
    // Try to see what records exist
    const recordsResult = await db.query(`
      SELECT * FROM core.reputation_actions LIMIT 5
    `);
    
    console.log(`\n📊 Sample records (${recordsResult.rows.length} found):`);
    if (recordsResult.rows.length > 0) {
      console.log(JSON.stringify(recordsResult.rows[0], null, 2));
    } else {
      console.log('  No records found');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  
  process.exit(0);
}

checkReputationError();
