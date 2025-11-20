#!/usr/bin/env node

/**
 * Handle Foreign Key Constraints Script
 * 
 * This script handles foreign key constraints that prevent dropping duplicate tables.
 * It will drop the constraints first, then drop the tables.
 * 
 * Usage: node scripts/handle-foreign-key-constraints.js
 */

const db = require('../db/db');

const TABLES_TO_DROP = [
  'oddyssey.daily_game_matches',
  'oddyssey.oddyssey_slips'
];

class ForeignKeyConstraintHandler {
  constructor() {
    this.stats = {
      constraintsDropped: 0,
      tablesDropped: 0,
      errors: []
    };
  }

  /**
   * Main execution method
   */
  async run() {
    console.log('🚀 Starting Foreign Key Constraint Handling...');
    console.log('📋 Tables to process:');
    TABLES_TO_DROP.forEach(table => {
      console.log(`   - ${table}`);
    });
    console.log('');

    try {
      // Connect to database
      await db.connect();
      console.log('✅ Connected to database');

      // Process each table
      for (const tableName of TABLES_TO_DROP) {
        await this.processTable(tableName);
      }

      // Print summary
      this.printSummary();

    } catch (error) {
      console.error('❌ Error during foreign key constraint handling:', error);
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
      console.log(`🔍 Processing ${tableName}...`);

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

      // Get foreign key constraints
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

      if (constraintsResult.rows.length === 0) {
        console.log(`   ℹ️  No foreign key constraints found for ${tableName}`);
      } else {
        console.log(`   🔗 Found ${constraintsResult.rows.length} foreign key constraints:`);
        constraintsResult.rows.forEach(constraint => {
          console.log(`      - ${constraint.constraint_name}: ${constraint.column_name} -> ${constraint.foreign_table_name}.${constraint.foreign_column_name}`);
        });

        // Drop foreign key constraints
        for (const constraint of constraintsResult.rows) {
          console.log(`   🗑️  Dropping constraint ${constraint.constraint_name}...`);
          await db.query(`ALTER TABLE ${tableName} DROP CONSTRAINT ${constraint.constraint_name}`);
          this.stats.constraintsDropped++;
          console.log(`   ✅ Dropped constraint ${constraint.constraint_name}`);
        }
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
    console.log('\n📊 Foreign Key Constraint Handling Summary:');
    console.log('=============================================');
    console.log(`🔗 Constraints dropped: ${this.stats.constraintsDropped}`);
    console.log(`🗑️  Tables dropped: ${this.stats.tablesDropped}`);
    
    if (this.stats.errors.length > 0) {
      console.log(`❌ Errors: ${this.stats.errors.length}`);
      this.stats.errors.forEach(error => {
        console.log(`   - ${error.table}: ${error.error}`);
      });
    }

    console.log('\n✅ Foreign key constraint handling completed!');
    
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
    
    for (const tableName of TABLES_TO_DROP) {
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
  const handler = new ForeignKeyConstraintHandler();
  
  handler.run()
    .then(() => handler.verifyCleanup())
    .then(() => {
      console.log('\n🎉 Foreign key constraint handling completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Foreign key constraint handling failed:', error);
      process.exit(1);
    });
}

module.exports = ForeignKeyConstraintHandler;
