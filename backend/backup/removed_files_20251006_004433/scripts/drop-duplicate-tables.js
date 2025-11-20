#!/usr/bin/env node

/**
 * Drop Duplicate Tables Script
 * 
 * This script safely drops the empty duplicate tables from the oddyssey schema
 * that have been consolidated into the oracle schema:
 * - oddyssey.daily_game_matches (empty, use oracle.daily_game_matches)
 * - oddyssey.oddyssey_cycles (empty, use oracle.oddyssey_cycles)
 * - oddyssey.oddyssey_slips (empty, use oracle.oddyssey_slips)
 * 
 * Usage: node scripts/drop-duplicate-tables.js
 */

const db = require('../db/db');

const DUPLICATE_TABLES = [
  'oddyssey.daily_game_matches',
  'oddyssey.oddyssey_cycles', 
  'oddyssey.oddyssey_slips'
];

class DuplicateTableDropper {
  constructor() {
    this.stats = {
      tablesChecked: 0,
      tablesDropped: 0,
      errors: []
    };
  }

  /**
   * Main execution method
   */
  async run() {
    console.log('🚀 Starting Duplicate Table Cleanup...');
    console.log('📋 Tables to drop:');
    DUPLICATE_TABLES.forEach(table => {
      console.log(`   - ${table}`);
    });
    console.log('');

    try {
      // Connect to database
      await db.connect();
      console.log('✅ Connected to database');

      // Check and drop each table
      for (const tableName of DUPLICATE_TABLES) {
        await this.processTable(tableName);
      }

      // Print summary
      this.printSummary();

    } catch (error) {
      console.error('❌ Error during duplicate table cleanup:', error);
      process.exit(1);
    } finally {
      await db.disconnect();
    }
  }

  /**
   * Process a single table
   */
  async processTable(tableName) {
    try {
      this.stats.tablesChecked++;
      console.log(`🔍 Checking ${tableName}...`);

      // Check if table exists
      const existsResult = await db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = $1 AND table_name = $2
        ) as exists
      `, [tableName.split('.')[0], tableName.split('.')[1]]);

      if (!existsResult.rows[0].exists) {
        console.log(`   ℹ️  Table ${tableName} does not exist, skipping`);
        return;
      }

      // Check if table is empty
      const countResult = await db.query(`SELECT COUNT(*) as count FROM ${tableName}`);
      const rowCount = parseInt(countResult.rows[0].count);

      if (rowCount > 0) {
        console.log(`   ⚠️  Table ${tableName} has ${rowCount} rows - SKIPPING (not empty)`);
        this.stats.errors.push({
          table: tableName,
          error: `Table has ${rowCount} rows, not dropping`
        });
        return;
      }

      // Check for foreign key constraints
      const constraintsResult = await db.query(`
        SELECT 
          tc.constraint_name,
          tc.table_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = $1
          AND tc.table_name = $2
      `, [tableName.split('.')[0], tableName.split('.')[1]]);

      if (constraintsResult.rows.length > 0) {
        console.log(`   ⚠️  Table ${tableName} has foreign key constraints - SKIPPING`);
        console.log(`      Constraints found: ${constraintsResult.rows.length}`);
        this.stats.errors.push({
          table: tableName,
          error: `Table has ${constraintsResult.rows.length} foreign key constraints`
        });
        return;
      }

      // Check for indexes
      const indexesResult = await db.query(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = $1 AND tablename = $2
      `, [tableName.split('.')[0], tableName.split('.')[1]]);

      console.log(`   📊 Table ${tableName}: ${rowCount} rows, ${indexesResult.rows.length} indexes`);

      // Drop the table
      console.log(`   🗑️  Dropping ${tableName}...`);
      await db.query(`DROP TABLE IF EXISTS ${tableName} CASCADE`);
      
      this.stats.tablesDropped++;
      console.log(`   ✅ Successfully dropped ${tableName}`);

    } catch (error) {
      console.error(`   ❌ Error processing ${tableName}:`, error.message);
      this.stats.errors.push({
        table: tableName,
        error: error.message
      });
    }
  }

  /**
   * Print summary of changes
   */
  printSummary() {
    console.log('\n📊 Duplicate Table Cleanup Summary:');
    console.log('=====================================');
    console.log(`📋 Tables checked: ${this.stats.tablesChecked}`);
    console.log(`🗑️  Tables dropped: ${this.stats.tablesDropped}`);
    
    if (this.stats.errors.length > 0) {
      console.log(`❌ Errors: ${this.stats.errors.length}`);
      this.stats.errors.forEach(error => {
        console.log(`   - ${error.table}: ${error.error}`);
      });
    }

    console.log('\n✅ Duplicate table cleanup completed!');
    
    if (this.stats.tablesDropped > 0) {
      console.log('\n🔍 Next steps:');
      console.log('1. Verify the application still works correctly');
      console.log('2. Test database operations to ensure no broken references');
      console.log('3. Update any remaining documentation if needed');
    }
  }

  /**
   * Verify cleanup by checking remaining tables
   */
  async verifyCleanup() {
    console.log('\n🔍 Verifying cleanup...');
    
    for (const tableName of DUPLICATE_TABLES) {
      try {
        const existsResult = await db.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = $1 AND table_name = $2
          ) as exists
        `, [tableName.split('.')[0], tableName.split('.')[1]]);

        if (existsResult.rows[0].exists) {
          console.log(`⚠️  Table ${tableName} still exists`);
        } else {
          console.log(`✅ Table ${tableName} successfully removed`);
        }
      } catch (error) {
        console.log(`✅ Table ${tableName} successfully removed`);
      }
    }
  }
}

// CLI usage
if (require.main === module) {
  const dropper = new DuplicateTableDropper();
  
  dropper.run()
    .then(() => dropper.verifyCleanup())
    .then(() => {
      console.log('\n🎉 Duplicate table cleanup completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Duplicate table cleanup failed:', error);
      process.exit(1);
    });
}

module.exports = DuplicateTableDropper;
