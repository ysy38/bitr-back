// Script to run migration on Neon.tech production database
// Usage: node scripts/run-social-stats-migration.js

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔗 Connecting to Neon.tech database...');
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, '../database/migrations/add-social-stats.sql'),
      'utf8'
    );

    console.log('📝 Running migration: add-social-stats.sql');
    await pool.query(migrationSQL);
    console.log('✅ Migration completed successfully!');

    // Verify tables/columns were created
    const tablesCheck = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'core' 
      AND table_name IN ('pool_views')
    `);
    console.log('📊 Created tables:', tablesCheck.rows.map(r => r.table_name).join(', '));

    const columnsCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'oracle' 
      AND table_name = 'pools' 
      AND column_name = 'social_stats'
    `);
    console.log('📊 Added columns:', columnsCheck.rows.length > 0 ? 'social_stats' : 'none');

    await pool.end();
  } catch (error) {
    console.error('❌ Migration failed:', error);
    await pool.end();
    process.exit(1);
  }
}

runMigration();
