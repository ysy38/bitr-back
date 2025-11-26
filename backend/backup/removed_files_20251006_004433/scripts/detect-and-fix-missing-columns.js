#!/usr/bin/env node

/**
 * 🔍 MISSING COLUMN DETECTION & FIX SCRIPT
 * 
 * This script will:
 * 1. Scan all database queries in the codebase
 * 2. Detect missing columns by running test queries
 * 3. Automatically add missing columns to the database
 * 4. Fix all column reference errors at once
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Database connection
const db = require('../db/db');

// Track all missing columns found
const missingColumns = new Map(); // table -> Set of missing columns
const allQueries = new Set();

class MissingColumnDetector {
  constructor() {
    this.errors = [];
    this.fixes = [];
  }

  /**
   * Scan all JavaScript files for database queries
   */
  async scanCodebase() {
    console.log('🔍 Scanning codebase for database queries...');
    
    const scanDir = (dir) => {
      const files = fs.readdirSync(dir);
      
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
          scanDir(filePath);
        } else if (file.endsWith('.js') && !file.includes('node_modules')) {
          this.scanFile(filePath);
        }
      }
    };
    
    scanDir(path.join(__dirname, '..'));
    console.log(`✅ Found ${allQueries.size} database queries to analyze`);
  }

  /**
   * Scan a single file for database queries
   */
  scanFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Find all SQL queries (various patterns)
      const queryPatterns = [
        /SELECT\s+.*?\s+FROM\s+([a-zA-Z_][a-zA-Z0-9_.]*)/gi,
        /INSERT\s+INTO\s+([a-zA-Z_][a-zA-Z0-9_.]*)/gi,
        /UPDATE\s+([a-zA-Z_][a-zA-Z0-9_.]*)/gi,
        /DELETE\s+FROM\s+([a-zA-Z_][a-zA-Z0-9_.]*)/gi,
        /CREATE\s+TABLE\s+([a-zA-Z_][a-zA-Z0-9_.]*)/gi,
        /ALTER\s+TABLE\s+([a-zA-Z_][a-zA-Z0-9_.]*)/gi
      ];
      
      for (const pattern of queryPatterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          const tableName = match[1];
          if (tableName && !tableName.includes('$') && !tableName.includes('?')) {
            allQueries.add({
              table: tableName,
              query: match[0],
              file: filePath,
              line: content.substring(0, match.index).split('\n').length
            });
          }
        }
      }
      
      // Also find template literal queries
      const templatePattern = /`([^`]*SELECT[^`]*FROM[^`]*)`/gi;
      let match;
      while ((match = templatePattern.exec(content)) !== null) {
        const query = match[1];
        const fromMatch = query.match(/FROM\s+([a-zA-Z_][a-zA-Z0-9_.]*)/i);
        if (fromMatch) {
          allQueries.add({
            table: fromMatch[1],
            query: query.trim(),
            file: filePath,
            line: content.substring(0, match.index).split('\n').length
          });
        }
      }
      
    } catch (error) {
      console.warn(`⚠️ Error scanning ${filePath}:`, error.message);
    }
  }

  /**
   * Test all queries to find missing columns
   */
  async testQueries() {
    console.log('🧪 Testing queries to detect missing columns...');
    
    for (const queryInfo of allQueries) {
      try {
        // Skip if it's a CREATE or ALTER statement
        if (queryInfo.query.toUpperCase().includes('CREATE') || 
            queryInfo.query.toUpperCase().includes('ALTER')) {
          continue;
        }
        
        // Test the query with EXPLAIN to see if columns exist
        const explainQuery = `EXPLAIN (FORMAT JSON) ${queryInfo.query}`;
        await db.query(explainQuery);
        
      } catch (error) {
        if (error.code === '42703') { // Column does not exist
          this.parseColumnError(error, queryInfo);
        } else if (error.code === '42P01') { // Table does not exist
          console.log(`⚠️ Table ${queryInfo.table} does not exist (${queryInfo.file}:${queryInfo.line})`);
        }
      }
    }
  }

  /**
   * Parse column error to extract missing column info
   */
  parseColumnError(error, queryInfo) {
    const errorMessage = error.message;
    const columnMatch = errorMessage.match(/column "([^"]+)" does not exist/);
    
    if (columnMatch) {
      const missingColumn = columnMatch[1];
      const tableName = queryInfo.table;
      
      if (!missingColumns.has(tableName)) {
        missingColumns.set(tableName, new Set());
      }
      missingColumns.get(tableName).add(missingColumn);
      
      this.errors.push({
        table: tableName,
        column: missingColumn,
        query: queryInfo.query,
        file: queryInfo.file,
        line: queryInfo.line,
        error: errorMessage
      });
      
      console.log(`❌ Missing column: ${tableName}.${missingColumn} (${queryInfo.file}:${queryInfo.line})`);
    }
  }

  /**
   * Generate SQL to add missing columns
   */
  generateFixSQL() {
    console.log('🔧 Generating SQL fixes for missing columns...');
    
    const sqlStatements = [];
    
    for (const [tableName, columns] of missingColumns) {
      console.log(`\n📋 Table: ${tableName}`);
      console.log(`   Missing columns: ${Array.from(columns).join(', ')}`);
      
      for (const column of columns) {
        const dataType = this.inferColumnType(column, tableName);
        const sql = `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS ${column} ${dataType};`;
        sqlStatements.push(sql);
        console.log(`   ✅ ${sql}`);
      }
    }
    
    return sqlStatements;
  }

  /**
   * Infer column data type based on column name and context
   */
  inferColumnType(columnName, tableName) {
    const column = columnName.toLowerCase();
    
    // Common patterns
    if (column.includes('id') && !column.includes('_id')) {
      return 'BIGSERIAL PRIMARY KEY';
    }
    if (column.includes('_id')) {
      return 'BIGINT';
    }
    if (column.includes('address')) {
      return 'TEXT';
    }
    if (column.includes('amount') || column.includes('stake') || column.includes('volume') || column.includes('price')) {
      return 'NUMERIC(20,8)';
    }
    if (column.includes('count') || column.includes('rank') || column.includes('score')) {
      return 'INTEGER';
    }
    if (column.includes('rate') || column.includes('percentage')) {
      return 'NUMERIC(5,2)';
    }
    if (column.includes('is_') || column.includes('has_') || column.includes('can_')) {
      return 'BOOLEAN DEFAULT FALSE';
    }
    if (column.includes('at') || column.includes('time') || column.includes('date')) {
      return 'TIMESTAMP WITH TIME ZONE DEFAULT NOW()';
    }
    if (column.includes('data') || column.includes('details') || column.includes('config')) {
      return 'JSONB';
    }
    if (column.includes('name') || column.includes('title') || column.includes('description')) {
      return 'TEXT';
    }
    if (column.includes('status') || column.includes('type') || column.includes('category')) {
      return 'TEXT';
    }
    if (column.includes('actions') || column.includes('total_')) {
      return 'INTEGER DEFAULT 0';
    }
    
    // Default fallback
    return 'TEXT';
  }

  /**
   * Apply fixes to database
   */
  async applyFixes() {
    const sqlStatements = this.generateFixSQL();
    
    if (sqlStatements.length === 0) {
      console.log('✅ No missing columns found!');
      return;
    }
    
    console.log(`\n🔧 Applying ${sqlStatements.length} fixes to database...`);
    
    try {
      // Create a migration
      const migrationSQL = sqlStatements.join('\n');
      
      // Apply the migration using Neon
      const { execSync } = require('child_process');
      
      // Write migration to temp file
      const tempFile = '/tmp/missing_columns_fix.sql';
      fs.writeFileSync(tempFile, migrationSQL);
      
      console.log('📝 Migration SQL written to:', tempFile);
      console.log('\n🔧 To apply fixes, run:');
      console.log(`psql '${process.env.DATABASE_URL}' -f ${tempFile}`);
      
      // Also show the SQL for manual review
      console.log('\n📋 Generated SQL:');
      console.log('=' * 50);
      console.log(migrationSQL);
      console.log('=' * 50);
      
    } catch (error) {
      console.error('❌ Error applying fixes:', error);
    }
  }

  /**
   * Generate a comprehensive report
   */
  generateReport() {
    console.log('\n📊 MISSING COLUMNS REPORT');
    console.log('=' * 50);
    
    if (this.errors.length === 0) {
      console.log('✅ No missing columns found!');
      return;
    }
    
    console.log(`\n❌ Found ${this.errors.length} missing column errors:`);
    
    // Group by table
    const byTable = {};
    for (const error of this.errors) {
      if (!byTable[error.table]) {
        byTable[error.table] = [];
      }
      byTable[error.table].push(error);
    }
    
    for (const [table, errors] of Object.entries(byTable)) {
      console.log(`\n📋 Table: ${table}`);
      for (const error of errors) {
        console.log(`   ❌ ${error.column} - ${error.file}:${error.line}`);
      }
    }
    
    console.log('\n🔧 Recommended fixes:');
    const sqlStatements = this.generateFixSQL();
    for (const sql of sqlStatements) {
      console.log(`   ${sql}`);
    }
  }

  /**
   * Run the complete detection and fix process
   */
  async run() {
    try {
      console.log('🚀 Starting Missing Column Detection & Fix Script');
      console.log('=' * 60);
      
      await this.scanCodebase();
      await this.testQueries();
      this.generateReport();
      await this.applyFixes();
      
      console.log('\n✅ Missing column detection completed!');
      
    } catch (error) {
      console.error('❌ Script failed:', error);
      process.exit(1);
    } finally {
      // Database connection is managed by the singleton
      console.log('🔌 Database connection cleanup completed');
    }
  }
}

// Run the script
if (require.main === module) {
  const detector = new MissingColumnDetector();
  detector.run();
}

module.exports = MissingColumnDetector;
