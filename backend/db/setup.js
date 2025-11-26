const fs = require('fs');
const path = require('path');
const db = require('./db.js');

class DatabaseSetup {
  constructor() {
    this.schemaFiles = [
      'schema.sql',
      'oddyssey_schema.sql',
      'crypto_schema.sql',
      'fixtures_schema.sql',
      'football_markets_schema.sql',
      'airdrop_schema.sql',
      'oddyssey_indexer_schema.sql'
    ];
  }

  async setupDatabase() {
    try {
      console.log('🔄 Setting up database schemas...');
      
      // Apply all schema files in order
      for (const schemaFile of this.schemaFiles) {
        const schemaPath = path.join(__dirname, schemaFile);
        
        if (fs.existsSync(schemaPath)) {
          console.log(`📋 Applying schema: ${schemaFile}`);
          const schemaSQL = fs.readFileSync(schemaPath, 'utf8');
          
          // Split by semicolon and execute each statement
          const statements = schemaSQL
            .split(';')
            .map(stmt => stmt.trim())
            .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
          
          for (const statement of statements) {
            try {
              await db.query(statement);
            } catch (error) {
              // Ignore errors for statements that might already exist
              if (!error.message.includes('already exists') && 
                  !error.message.includes('duplicate key') &&
                  !error.message.includes('relation') &&
                  !error.message.includes('column')) {
                console.error(`❌ Error executing statement: ${error.message}`);
                console.error(`Statement: ${statement.substring(0, 100)}...`);
              }
            }
          }
          
          console.log(`✅ Applied schema: ${schemaFile}`);
        } else {
          console.log(`⚠️ Schema file not found: ${schemaFile}`);
        }
      }
      
      // Apply any additional permanent fixes
      await this.applyPermanentFixes();
      
      console.log('🎉 Database setup completed successfully!');
      
    } catch (error) {
      console.error('❌ Database setup failed:', error);
      throw error;
    }
  }

  async applyPermanentFixes() {
    console.log('🔧 Applying permanent schema fixes...');
    
    const fixes = [
      // Ensure fixture_results table has all required columns
      `DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'oracle' AND table_name = 'fixture_results' AND column_name = 'outcome_1x2') THEN
          ALTER TABLE oracle.fixture_results ADD COLUMN outcome_1x2 TEXT;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'oracle' AND table_name = 'fixture_results' AND column_name = 'outcome_ou25') THEN
          ALTER TABLE oracle.fixture_results ADD COLUMN outcome_ou25 TEXT;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'oracle' AND table_name = 'fixture_results' AND column_name = 'status') THEN
          ALTER TABLE oracle.fixture_results ADD COLUMN status TEXT DEFAULT 'pending';
        END IF;
      END $$;`,
      
      // Ensure daily_game_matches table has all required columns
      `DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'oddyssey' AND table_name = 'daily_game_matches' AND column_name = 'cycle_id') THEN
          ALTER TABLE oracle.daily_game_matches ADD COLUMN cycle_id INTEGER;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'oddyssey' AND table_name = 'daily_game_matches' AND column_name = 'display_order') THEN
          ALTER TABLE oracle.daily_game_matches ADD COLUMN display_order INTEGER;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.constraint_column_usage WHERE constraint_name = 'unique_fixture_cycle') THEN
          ALTER TABLE oracle.daily_game_matches ADD CONSTRAINT unique_fixture_cycle UNIQUE (fixture_id, cycle_id);
        END IF;
      END $$;`,
      
      // Ensure oddyssey_cycles table has all required columns
      `DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'oracle' AND table_name = 'oddyssey_cycles' AND column_name = 'is_resolved') THEN
          ALTER TABLE oracle.oddyssey_cycles ADD COLUMN is_resolved BOOLEAN DEFAULT FALSE;
        END IF;
      END $$;`
    ];
    
    for (const fix of fixes) {
      try {
        await db.query(fix);
      } catch (error) {
        console.log(`⚠️ Fix already applied or not needed: ${error.message}`);
      }
    }
    
    console.log('✅ Permanent fixes applied');
  }

  async verifySetup() {
    try {
      console.log('🔍 Verifying database setup...');
      
      const tables = [
        'oracle.oddyssey_cycles',
        'oracle.oddyssey_slips', 
        'oracle.daily_game_matches',
        'oracle.fixture_results',
        'oracle.fixtures',
        'oracle.fixture_odds'
      ];
      
      for (const table of tables) {
        const result = await db.query(`SELECT COUNT(*) as count FROM ${table}`);
        console.log(`✅ ${table}: ${result.rows[0].count} rows`);
      }
      
      console.log('🎉 Database verification completed!');
      
    } catch (error) {
      console.error('❌ Database verification failed:', error);
      throw error;
    }
  }
}

// Run setup if called directly
if (require.main === module) {
  const setup = new DatabaseSetup();
  setup.setupDatabase()
    .then(() => setup.verifySetup())
    .then(() => {
      console.log('🚀 Database setup completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Database setup failed:', error);
      process.exit(1);
    });
}

module.exports = DatabaseSetup; 