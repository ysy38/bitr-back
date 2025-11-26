require('dotenv').config({ path: '../.env' });
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function initDatabase() {
  console.log('🚀 Initializing complete database setup...');
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  try {
    const client = await pool.connect();
    console.log('✅ Database connected successfully');

    // Create all schemas first
    console.log('📊 Creating schemas...');
    await client.query(`
      CREATE SCHEMA IF NOT EXISTS oracle;
      CREATE SCHEMA IF NOT EXISTS analytics;
      CREATE SCHEMA IF NOT EXISTS oddyssey;
      CREATE SCHEMA IF NOT EXISTS crypto;
    `);
    console.log('✅ Schemas created');

    // List of schema files to execute in dependency order
    const schemaFiles = [
      'fixtures_schema.sql',           // Base fixtures and leagues
      'football_markets_schema.sql',   // Football markets (depends on fixtures)
      'oddyssey_schema.sql',           // Oracle schema oddyssey tables (complete structure)
      'crypto_schema.sql',             // Crypto markets
      'airdrop_schema.sql',            // Airdrop tracking
      'oddyssey_indexer_schema.sql'    // Oddyssey indexing
    ];

    for (const schemaFile of schemaFiles) {
      try {
        console.log(`📊 Setting up ${schemaFile}...`);
        
        const schemaPath = path.join(__dirname, '..', 'db', schemaFile);
        
        if (!fs.existsSync(schemaPath)) {
          console.log(`⚠️ Schema file ${schemaFile} not found, skipping...`);
          continue;
        }
        
        const schema = fs.readFileSync(schemaPath, 'utf8');
        await client.query(schema);
        console.log(`✅ Successfully set up ${schemaFile}`);
        
      } catch (error) {
        console.error(`❌ Failed to set up ${schemaFile}:`, error.message);
        
        // Special handling for common issues
        if (error.message.includes('column "created_at" does not exist')) {
          console.log('🔧 Fixing missing created_at column...');
          try {
            await client.query(`
              ALTER TABLE oracle.football_resolution_logs 
              ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
            `);
            console.log('✅ Fixed created_at column');
          } catch (fixError) {
            console.error('❌ Failed to fix created_at:', fixError.message);
          }
        }
      }
    }

    // Create additional required tables
    console.log('📊 Creating additional required tables...');
    
    // Analytics staking events
    await client.query(`
      CREATE TABLE IF NOT EXISTS analytics.staking_events (
        id SERIAL PRIMARY KEY,
        user_address VARCHAR(42) NOT NULL,
        action_type VARCHAR(20) NOT NULL CHECK (action_type IN ('STAKE', 'UNSTAKE', 'CLAIM_REWARDS')),
        amount NUMERIC(78,0) NOT NULL,
        tier_id INTEGER,
        duration_option INTEGER,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        tx_hash VARCHAR(66),
        block_number BIGINT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // Oddyssey daily game matches
    await client.query(`
      CREATE TABLE IF NOT EXISTS oracle.daily_game_matches (
        id SERIAL PRIMARY KEY,
        fixture_id BIGINT NOT NULL,
        home_team VARCHAR(255) NOT NULL,
        away_team VARCHAR(255) NOT NULL,
        league_name VARCHAR(255) NOT NULL,
        match_date TIMESTAMP WITH TIME ZONE NOT NULL,
        game_date DATE NOT NULL,
        home_odds NUMERIC(10,2),
        draw_odds NUMERIC(10,2),
        away_odds NUMERIC(10,2),
        selection_type VARCHAR(20) NOT NULL DEFAULT 'auto',
        priority_score INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // Create indexes for performance
    console.log('📊 Creating indexes...');
    await client.query(`
      -- Analytics indexes
      CREATE INDEX IF NOT EXISTS idx_staking_events_user_address ON analytics.staking_events(user_address);
      CREATE INDEX IF NOT EXISTS idx_staking_events_action_type ON analytics.staking_events(action_type);
      CREATE INDEX IF NOT EXISTS idx_staking_events_timestamp ON analytics.staking_events(timestamp);
      
      -- Oddyssey indexes
      CREATE INDEX IF NOT EXISTS idx_daily_game_matches_game_date ON oracle.daily_game_matches(game_date);
      CREATE INDEX IF NOT EXISTS idx_daily_game_matches_fixture_id ON oracle.daily_game_matches(fixture_id);
      CREATE INDEX IF NOT EXISTS idx_daily_game_matches_selection_type ON oracle.daily_game_matches(selection_type);
    `);

    // Verify all critical tables
    console.log('🔍 Verifying all critical tables...');
    
    const criticalTables = [
      { schema: 'oracle', table: 'fixtures' },
      { schema: 'oracle', table: 'leagues' },
      { schema: 'oracle', table: 'fixture_odds' },
      { schema: 'oracle', table: 'football_prediction_markets' },
      { schema: 'oracle', table: 'football_resolution_logs' },
      { schema: 'oracle', table: 'oddyssey_cycles' },
      { schema: 'analytics', table: 'staking_events' },
      { schema: 'oddyssey', table: 'daily_game_matches' }
    ];

    let allTablesExist = true;
    for (const { schema, table } of criticalTables) {
      try {
        const result = await client.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = $1 
            AND table_name = $2
          );
        `, [schema, table]);
        
        if (result.rows[0]?.exists) {
          console.log(`✅ ${schema}.${table} table verified`);
        } else {
          console.log(`❌ ${schema}.${table} table NOT found`);
          allTablesExist = false;
        }
      } catch (error) {
        console.log(`⚠️ Could not verify ${schema}.${table}: ${error.message}`);
        allTablesExist = false;
      }
    }

    client.release();
    await pool.end();
    
    if (allTablesExist) {
      console.log('✅ Database initialization completed successfully!');
      return true;
    } else {
      console.log('⚠️ Some tables are missing. Please check the setup.');
      return false;
    }
    
  } catch (error) {
    console.error('❌ Error initializing database:', error);
    throw error;
  }
}

// Run the initialization
if (require.main === module) {
  initDatabase()
    .then((success) => {
      if (success) {
        console.log('✅ Database initialization completed successfully!');
        process.exit(0);
      } else {
        console.log('⚠️ Database initialization completed with warnings');
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('❌ Database initialization failed:', error);
      process.exit(1);
    });
}

module.exports = initDatabase; 