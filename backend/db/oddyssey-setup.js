const db = require('./db.js');

class OddysseyDatabaseSetup {
  constructor() {
    this.requiredTables = [
      'oracle.oddyssey_cycles',
      'oracle.oddyssey_slips',
      'oracle.daily_game_matches',
      'oracle.fixture_results',
      'oracle.fixtures',
      'oracle.fixture_odds'
    ];
  }

  async setupOddysseyDatabase() {
    try {
      console.log('🔄 Setting up Oddyssey database tables...');
      
      // Create schemas if they don't exist
      await this.createSchemas();
      
      // Create tables with all required columns
      await this.createTables();
      
      // Create indexes
      await this.createIndexes();
      
      // Apply any missing columns
      await this.applyMissingColumns();
      
      console.log('✅ Oddyssey database setup completed!');
      
    } catch (error) {
      console.error('❌ Oddyssey database setup failed:', error);
      throw error;
    }
  }

  async createSchemas() {
    console.log('📋 Creating schemas...');
    
    const schemas = ['oracle', 'oddyssey'];
    for (const schema of schemas) {
      try {
        await db.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
        console.log(`✅ Created schema: ${schema}`);
      } catch (error) {
        console.log(`⚠️ Schema ${schema} already exists`);
      }
    }
  }

  async createTables() {
    console.log('📋 Creating tables...');
    
    const tables = [
      // Oracle cycles table
      `CREATE TABLE IF NOT EXISTS oracle.oddyssey_cycles (
        cycle_id BIGINT PRIMARY KEY,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        matches_count INTEGER NOT NULL DEFAULT 10,
        matches_data JSONB NOT NULL,
        cycle_start_time TIMESTAMP WITH TIME ZONE,
        cycle_end_time TIMESTAMP WITH TIME ZONE,
        resolved_at TIMESTAMP WITH TIME ZONE,
        is_resolved BOOLEAN DEFAULT FALSE,
        tx_hash TEXT,
        resolution_tx_hash TEXT,
        resolution_data JSONB,
        ready_for_resolution BOOLEAN DEFAULT FALSE,
        resolution_prepared_at TIMESTAMP WITH TIME ZONE
      )`,
      
      // Oracle slips table
      `CREATE TABLE IF NOT EXISTS oracle.oddyssey_slips (
        slip_id BIGINT PRIMARY KEY,
        cycle_id BIGINT NOT NULL,
        player_address TEXT NOT NULL,
        placed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        predictions JSONB NOT NULL,
        final_score NUMERIC DEFAULT 0,
        correct_count INTEGER DEFAULT 0,
        is_evaluated BOOLEAN DEFAULT FALSE,
        leaderboard_rank INTEGER,
        prize_claimed BOOLEAN DEFAULT FALSE,
        tx_hash TEXT
      )`,
      
      // Oddyssey daily game matches table
      `CREATE TABLE IF NOT EXISTS oracle.daily_game_matches (
        id BIGSERIAL PRIMARY KEY,
        fixture_id BIGINT NOT NULL,
        home_team TEXT NOT NULL,
        away_team TEXT NOT NULL,
        league_name TEXT NOT NULL,
        match_date TIMESTAMP WITH TIME ZONE NOT NULL,
        game_date DATE NOT NULL,
        home_odds DECIMAL(10,2) NOT NULL,
        draw_odds DECIMAL(10,2) NOT NULL,
        away_odds DECIMAL(10,2) NOT NULL,
        over_25_odds DECIMAL(10,2) NOT NULL,
        under_25_odds DECIMAL(10,2) NOT NULL,
        selection_type TEXT DEFAULT '1x2_ou25',
        priority_score INTEGER DEFAULT 0,
        cycle_id INTEGER NOT NULL,
        display_order INTEGER NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )`,
      
      // Oracle fixture results table
      `CREATE TABLE IF NOT EXISTS oracle.fixture_results (
        id BIGSERIAL PRIMARY KEY,
        fixture_id BIGINT NOT NULL,
        home_score INTEGER,
        away_score INTEGER,
        outcome_1x2 TEXT,
        outcome_ou25 TEXT,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )`,
      
      // Oracle fixtures table
      `CREATE TABLE IF NOT EXISTS oracle.fixtures (
        id BIGINT PRIMARY KEY,
        name TEXT NOT NULL,
        home_team TEXT NOT NULL,
        away_team TEXT NOT NULL,
        home_team_id BIGINT,
        away_team_id BIGINT,
        match_date TIMESTAMPTZ NOT NULL,
        league_id BIGINT,
        league_name TEXT,
        venue_id BIGINT,
        referee_id BIGINT,
        season_id BIGINT,
        round_id BIGINT,
        state_id BIGINT,
        status TEXT,
        starting_at TIMESTAMPTZ,
        result_info JSONB,
        leg TEXT,
        venue JSONB,
        referee JSONB,
        league JSONB,
        season JSONB,
        stage JSONB,
        round JSONB,
        state JSONB,
        participants JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      
      // Oracle fixture odds table
      `CREATE TABLE IF NOT EXISTS oracle.fixture_odds (
        id BIGSERIAL PRIMARY KEY,
        fixture_id BIGINT NOT NULL,
        bookmaker_id BIGINT,
        market_id BIGINT,
        label TEXT,
        value JSONB,
        suspend BOOLEAN DEFAULT FALSE,
        is_main BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )`
    ];
    
    for (const tableSQL of tables) {
      try {
        await db.query(tableSQL);
        console.log('✅ Table created/verified');
      } catch (error) {
        console.log(`⚠️ Table already exists: ${error.message}`);
      }
    }
  }

  async createIndexes() {
    console.log('📋 Creating indexes...');
    
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_oddyssey_cycles_created_at ON oracle.oddyssey_cycles(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_oddyssey_cycles_resolved ON oracle.oddyssey_cycles(is_resolved)',
      'CREATE INDEX IF NOT EXISTS idx_oddyssey_slips_cycle_id ON oracle.oddyssey_slips(cycle_id)',
      'CREATE INDEX IF NOT EXISTS idx_oddyssey_slips_player ON oracle.oddyssey_slips(player_address)',
      'CREATE INDEX IF NOT EXISTS idx_oddyssey_slips_placed_at ON oracle.oddyssey_slips(placed_at)',
      'CREATE INDEX IF NOT EXISTS idx_daily_game_matches_game_date ON oracle.daily_game_matches(game_date)',
      'CREATE INDEX IF NOT EXISTS idx_daily_game_matches_fixture_id ON oracle.daily_game_matches(fixture_id)',
      'CREATE INDEX IF NOT EXISTS idx_daily_game_matches_cycle_id ON oracle.daily_game_matches(cycle_id)',
      'CREATE INDEX IF NOT EXISTS idx_daily_game_matches_selection_type ON oracle.daily_game_matches(selection_type)',
      'CREATE INDEX IF NOT EXISTS idx_fixture_results_fixture_id ON oracle.fixture_results(fixture_id)',
      'CREATE INDEX IF NOT EXISTS idx_fixtures_home_team_id ON oracle.fixtures(home_team_id)',
      'CREATE INDEX IF NOT EXISTS idx_fixtures_away_team_id ON oracle.fixtures(away_team_id)'
    ];
    
    for (const indexSQL of indexes) {
      try {
        await db.query(indexSQL);
        console.log('✅ Index created/verified');
      } catch (error) {
        console.log(`⚠️ Index already exists: ${error.message}`);
      }
    }
  }

  async applyMissingColumns() {
    console.log('🔧 Applying missing columns...');
    
    const columnFixes = [
      // Add unique constraint for daily_game_matches
      `DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'unique_fixture_cycle') THEN
          ALTER TABLE oracle.daily_game_matches ADD CONSTRAINT unique_fixture_cycle UNIQUE (fixture_id, cycle_id);
        END IF;
      END $$;`
    ];
    
    for (const fix of columnFixes) {
      try {
        await db.query(fix);
        console.log('✅ Column fix applied');
      } catch (error) {
        console.log(`⚠️ Column fix already applied: ${error.message}`);
      }
    }
  }

  async verifySetup() {
    try {
      console.log('🔍 Verifying Oddyssey database setup...');
      
      for (const table of this.requiredTables) {
        const result = await db.query(`SELECT COUNT(*) as count FROM ${table}`);
        console.log(`✅ ${table}: ${result.rows[0].count} rows`);
      }
      
      console.log('🎉 Oddyssey database verification completed!');
      
    } catch (error) {
      console.error('❌ Oddyssey database verification failed:', error);
      throw error;
    }
  }
}

// Run setup if called directly
if (require.main === module) {
  const setup = new OddysseyDatabaseSetup();
  setup.setupOddysseyDatabase()
    .then(() => setup.verifySetup())
    .then(() => {
      console.log('🚀 Oddyssey database setup completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Oddyssey database setup failed:', error);
      process.exit(1);
    });
}

module.exports = OddysseyDatabaseSetup; 