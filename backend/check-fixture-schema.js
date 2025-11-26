const db = require('./db/db');

async function checkSchema() {
  try {
    const result = await db.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'oracle' AND table_name = 'fixtures'
      ORDER BY ordinal_position
    `);
    
    console.log('\n========== FIXTURES TABLE SCHEMA ==========\n');
    result.rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type}`);
    });
  } catch (error) {
    console.error('Error:', error.message);
  }
  process.exit(0);
}

checkSchema();
