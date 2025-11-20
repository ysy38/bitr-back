const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Running database migration...');
    
    // Add evaluation columns
    await client.query(`
      ALTER TABLE oracle.oddyssey_slips 
      ADD COLUMN IF NOT EXISTS evaluation_data JSONB DEFAULT '{}'
    `);
    console.log('✅ Added evaluation_data column');
    
    await client.query(`
      ALTER TABLE oracle.oddyssey_slips 
      ADD COLUMN IF NOT EXISTS correct_count INTEGER DEFAULT 0
    `);
    console.log('✅ Added correct_count column');
    
    await client.query(`
      ALTER TABLE oracle.oddyssey_slips 
      ADD COLUMN IF NOT EXISTS final_score DECIMAL(10,2) DEFAULT 0
    `);
    console.log('✅ Added final_score column');
    
    await client.query(`
      ALTER TABLE oracle.oddyssey_slips 
      ADD COLUMN IF NOT EXISTS leaderboard_rank INTEGER
    `);
    console.log('✅ Added leaderboard_rank column');
    
    console.log('🎉 Database migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch(console.error);
