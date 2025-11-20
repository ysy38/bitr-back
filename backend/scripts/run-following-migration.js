// Script to run following system migration
// Usage: node scripts/run-following-migration.js

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
      path.join(__dirname, '../database/migrations/add-following-system.sql'),
      'utf8'
    );

    console.log('📝 Running migration: add-following-system.sql');
    await pool.query(migrationSQL);
    console.log('✅ Migration completed successfully!');

    // Verify tables were created
    const tablesCheck = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'core' 
      AND table_name = 'user_follows'
    `);
    console.log('📊 Created tables:', tablesCheck.rows.map(r => r.table_name).join(', '));

    await pool.end();
  } catch (error) {
    console.error('❌ Migration failed:', error);
    await pool.end();
    process.exit(1);
  }
}

runMigration();

