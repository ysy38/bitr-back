#!/usr/bin/env node

/**
 * Schema Reference Update Script
 * 
 * This script automatically updates all references from oddyssey schema to oracle schema
 * for the duplicate tables that are being consolidated:
 * - oracle.daily_game_matches -> oracle.daily_game_matches
 * - oracle.oddyssey_cycles -> oracle.oddyssey_cycles  
 * - oracle.oddyssey_slips -> oracle.oddyssey_slips
 * 
 * Usage: node scripts/update-schema-references.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const BACKEND_DIR = path.join(__dirname, '..');
const SCHEMA_MAPPINGS = {
  'oracle.daily_game_matches': 'oracle.daily_game_matches',
  'oracle.oddyssey_cycles': 'oracle.oddyssey_cycles',
  'oracle.oddyssey_slips': 'oracle.oddyssey_slips'
};

// File patterns to search
const SEARCH_PATTERNS = [
  '**/*.js',
  '**/*.ts',
  '**/*.sql',
  '**/*.md'
];

// Files to exclude
const EXCLUDE_PATTERNS = [
  'node_modules/**',
  '.git/**',
  'dist/**',
  'build/**',
  'coverage/**',
  '*.log',
  '*.tmp'
];

class SchemaReferenceUpdater {
  constructor() {
    this.stats = {
      filesProcessed: 0,
      filesModified: 0,
      totalReplacements: 0,
      errors: []
    };
  }

  /**
   * Main execution method
   */
  async run() {
    console.log('🚀 Starting Schema Reference Update...');
    console.log('📋 Schema mappings:');
    Object.entries(SCHEMA_MAPPINGS).forEach(([from, to]) => {
      console.log(`   ${from} -> ${to}`);
    });
    console.log('');

    try {
      // Find all JavaScript files in the backend directory
      const files = this.findFiles();
      console.log(`📁 Found ${files.length} files to process`);

      // Process each file
      for (const file of files) {
        await this.processFile(file);
      }

      // Print summary
      this.printSummary();

    } catch (error) {
      console.error('❌ Error during schema reference update:', error);
      process.exit(1);
    }
  }

  /**
   * Find all relevant files to process
   */
  findFiles() {
    const files = [];
    
    // Use find command to get all JS files
    try {
      const findCommand = `find ${BACKEND_DIR} -name "*.js" -type f -not -path "*/node_modules/*" -not -path "*/.git/*"`;
      const result = execSync(findCommand, { encoding: 'utf8' });
      const fileList = result.trim().split('\n').filter(line => line.length > 0);
      files.push(...fileList);
    } catch (error) {
      console.error('❌ Error finding files:', error.message);
    }

    return files;
  }

  /**
   * Process a single file
   */
  async processFile(filePath) {
    try {
      this.stats.filesProcessed++;
      
      // Read file content
      const content = fs.readFileSync(filePath, 'utf8');
      let modifiedContent = content;
      let fileModified = false;
      let fileReplacements = 0;

      // Apply all schema mappings
      for (const [fromSchema, toSchema] of Object.entries(SCHEMA_MAPPINGS)) {
        const beforeCount = (modifiedContent.match(new RegExp(this.escapeRegex(fromSchema), 'g')) || []).length;
        
        if (beforeCount > 0) {
          modifiedContent = modifiedContent.replace(new RegExp(this.escapeRegex(fromSchema), 'g'), toSchema);
          const afterCount = (modifiedContent.match(new RegExp(this.escapeRegex(toSchema), 'g')) || []).length;
          fileReplacements += beforeCount;
          
          if (beforeCount !== afterCount) {
            console.log(`   🔄 ${filePath}: ${beforeCount} replacements for ${fromSchema} -> ${toSchema}`);
          }
        }
      }

      // Write back if modified
      if (modifiedContent !== content) {
        fs.writeFileSync(filePath, modifiedContent, 'utf8');
        fileModified = true;
        this.stats.filesModified++;
        this.stats.totalReplacements += fileReplacements;
      }

    } catch (error) {
      this.stats.errors.push({
        file: filePath,
        error: error.message
      });
      console.error(`❌ Error processing ${filePath}:`, error.message);
    }
  }

  /**
   * Escape special regex characters
   */
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Print summary of changes
   */
  printSummary() {
    console.log('\n📊 Schema Reference Update Summary:');
    console.log('=====================================');
    console.log(`📁 Files processed: ${this.stats.filesProcessed}`);
    console.log(`✏️  Files modified: ${this.stats.filesModified}`);
    console.log(`🔄 Total replacements: ${this.stats.totalReplacements}`);
    
    if (this.stats.errors.length > 0) {
      console.log(`❌ Errors: ${this.stats.errors.length}`);
      this.stats.errors.forEach(error => {
        console.log(`   - ${error.file}: ${error.error}`);
      });
    }

    console.log('\n✅ Schema reference update completed!');
    
    if (this.stats.filesModified > 0) {
      console.log('\n🔍 Next steps:');
      console.log('1. Review the changes to ensure they are correct');
      console.log('2. Test the application to ensure functionality is preserved');
      console.log('3. Run database cleanup to drop duplicate tables');
    }
  }

  /**
   * Verify changes by counting remaining references
   */
  async verifyChanges() {
    console.log('\n🔍 Verifying changes...');
    
    for (const [fromSchema] of Object.entries(SCHEMA_MAPPINGS)) {
      try {
        const findCommand = `grep -r "${fromSchema}" ${BACKEND_DIR} --include="*.js" --exclude-dir=node_modules --exclude-dir=.git | wc -l`;
        const result = execSync(findCommand, { encoding: 'utf8' });
        const count = parseInt(result.trim());
        
        if (count > 0) {
          console.log(`⚠️  Found ${count} remaining references to ${fromSchema}`);
        } else {
          console.log(`✅ No remaining references to ${fromSchema}`);
        }
      } catch (error) {
        console.log(`✅ No remaining references to ${fromSchema}`);
      }
    }
  }
}

// CLI usage
if (require.main === module) {
  const updater = new SchemaReferenceUpdater();
  
  updater.run()
    .then(() => updater.verifyChanges())
    .then(() => {
      console.log('\n🎉 Schema reference update completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Schema reference update failed:', error);
      process.exit(1);
    });
}

module.exports = SchemaReferenceUpdater;
