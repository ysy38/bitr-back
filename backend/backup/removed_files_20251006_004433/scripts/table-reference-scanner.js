const fs = require('fs');
const path = require('path');

class TableReferenceScanner {
  constructor() {
    this.referencedTables = new Set();
    this.tableReferences = [];
    this.potentialIssues = [];
  }

  /**
   * Scan all JavaScript files for database table references
   */
  async scanCodebase() {
    console.log('🔍 Scanning codebase for database table references...');
    
    const backendDir = path.join(__dirname, '..');
    await this.scanDirectory(backendDir);
    
    console.log(`📊 Found ${this.referencedTables.size} unique table references in code`);
    
    return this.analyzeIssues();
  }

  /**
   * Recursively scan directory for JavaScript files
   */
  async scanDirectory(dir) {
    try {
      const files = fs.readdirSync(dir);
      
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
          await this.scanDirectory(fullPath);
        } else if (file.endsWith('.js')) {
          await this.scanFile(fullPath);
        }
      }
    } catch (error) {
      console.error(`❌ Error scanning directory ${dir}:`, error.message);
    }
  }

  /**
   * Scan a single JavaScript file for table references
   */
  async scanFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Find all oracle table references (excluding sequences and JavaScript methods)
      const oracleTableRegex = /oracle\.(\w+)/g;
      let match;
      
      while ((match = oracleTableRegex.exec(content)) !== null) {
        const tableName = match[1];
        
        // Skip sequences and JavaScript methods
        if (tableName.endsWith('_seq') || 
            tableName === 'toLowerCase' || 
            tableName === 'toString' || 
            tableName === 'toUpperCase' || 
            tableName === 'toFixed' || 
            tableName === 'toJSON') {
          continue;
        }
        
        this.referencedTables.add(tableName);
        
        // Store context for better error reporting
        const lines = content.split('\n');
        const lineNumber = content.substring(0, match.index).split('\n').length;
        const lineContent = lines[lineNumber - 1]?.trim() || '';
        
        this.tableReferences.push({
          table: tableName,
          file: filePath.replace(process.cwd(), ''),
          line: lineNumber,
          context: lineContent.substring(0, 100)
        });
      }
    } catch (error) {
      console.error(`❌ Error scanning file ${filePath}:`, error.message);
    }
  }

  /**
   * Analyze issues and generate report
   */
  async analyzeIssues() {
    console.log('\n🔍 Analyzing table reference issues...');
    
    const namingIssues = this.checkNamingInconsistencies();
    const suspiciousReferences = this.findSuspiciousReferences();

    return {
      summary: {
        totalReferencedTables: this.referencedTables.size,
        namingIssues: namingIssues.length,
        suspiciousReferences: suspiciousReferences.length
      },
      namingIssues,
      suspiciousReferences,
      allReferencedTables: Array.from(this.referencedTables).sort(),
      tableReferences: this.tableReferences
    };
  }

  /**
   * Check for naming inconsistencies
   */
  checkNamingInconsistencies() {
    const issues = [];
    const tableNames = Array.from(this.referencedTables);
    
    // Check for similar table names that might be typos
    for (let i = 0; i < tableNames.length; i++) {
      for (let j = i + 1; j < tableNames.length; j++) {
        const name1 = tableNames[i];
        const name2 = tableNames[j];
        
        // Check for common typos
        if (this.isSimilarName(name1, name2)) {
          issues.push({
            type: 'similar_names',
            table1: name1,
            table2: name2,
            similarity: this.calculateSimilarity(name1, name2),
            suggestion: `Potential typo: "${name1}" vs "${name2}"`
          });
        }
      }
    }

    // Check for inconsistent naming patterns
    const patterns = this.analyzeNamingPatterns(tableNames);
    if (patterns.inconsistencies.length > 0) {
      issues.push(...patterns.inconsistencies);
    }

    return issues;
  }

  /**
   * Find suspicious references (likely errors)
   */
  findSuspiciousReferences() {
    const suspicious = [];
    const tableNames = Array.from(this.referencedTables);
    
    // Check for JavaScript method names that might be mistaken for tables
    const jsMethods = ['toLowerCase', 'toString', 'toUpperCase', 'toFixed', 'toJSON'];
    
    for (const table of tableNames) {
      if (jsMethods.includes(table)) {
        suspicious.push({
          type: 'js_method_as_table',
          table,
          suggestion: `"${table}" looks like a JavaScript method, not a database table`
        });
      }
      
      // Check for very short names
      if (table.length <= 2) {
        suspicious.push({
          type: 'very_short_name',
          table,
          suggestion: `"${table}" is very short and might be a typo`
        });
      }
      
      // Check for names with unusual characters
      if (/[^a-zA-Z0-9_]/.test(table)) {
        suspicious.push({
          type: 'unusual_characters',
          table,
          suggestion: `"${table}" contains unusual characters`
        });
      }
    }

    return suspicious;
  }

  /**
   * Check if two table names are similar (potential typo)
   */
  isSimilarName(name1, name2) {
    if (name1 === name2) return false;
    
    // Check for common typos
    const commonTypos = [
      ['oddyssey_matches', 'oddyssey_matches'],
      ['oddyssey_cycles', 'oddyssey_cycle'],
      ['daily_game_matches', 'daily_game_match'],
      ['fixture_odds', 'fixture_odd'],
      ['fixture_results', 'fixture_result'],
      ['crypto_coins', 'crypto_coin'],
      ['crypto_markets', 'crypto_market'],
      ['football_markets', 'football_market']
    ];

    for (const [typo1, typo2] of commonTypos) {
      if ((name1 === typo1 && name2 === typo2) || (name1 === typo2 && name2 === typo1)) {
        return true;
      }
    }

    // Check for Levenshtein distance
    const distance = this.levenshteinDistance(name1, name2);
    const maxLength = Math.max(name1.length, name2.length);
    const similarity = 1 - (distance / maxLength);
    
    return similarity > 0.8; // 80% similarity threshold
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  /**
   * Calculate similarity percentage
   */
  calculateSimilarity(name1, name2) {
    const distance = this.levenshteinDistance(name1, name2);
    const maxLength = Math.max(name1.length, name2.length);
    return Math.round((1 - (distance / maxLength)) * 100);
  }

  /**
   * Analyze naming patterns for inconsistencies
   */
  analyzeNamingPatterns(tableNames) {
    const inconsistencies = [];
    
    // Check for inconsistent pluralization
    const singularForms = tableNames.filter(name => !name.endsWith('s'));
    const pluralForms = tableNames.filter(name => name.endsWith('s'));
    
    // Look for potential singular/plural pairs
    for (const singular of singularForms) {
      const plural = singular + 's';
      if (pluralForms.includes(plural)) {
        inconsistencies.push({
          type: 'pluralization_inconsistency',
          singular,
          plural,
          suggestion: `Choose either singular or plural form consistently`
        });
      }
    }

    return { inconsistencies };
  }

  /**
   * Generate detailed report
   */
  generateReport(analysis) {
    console.log('\n📋 TABLE REFERENCE ANALYSIS REPORT');
    console.log('=====================================');
    
    console.log(`\n📊 SUMMARY:`);
    console.log(`   • Referenced tables in code: ${analysis.summary.totalReferencedTables}`);
    console.log(`   • Naming issues: ${analysis.summary.namingIssues}`);
    console.log(`   • Suspicious references: ${analysis.summary.suspiciousReferences}`);

    if (analysis.namingIssues.length > 0) {
      console.log(`\n🔍 NAMING INCONSISTENCIES:`);
      analysis.namingIssues.forEach(issue => {
        if (issue.type === 'similar_names') {
          console.log(`   • Similar names: "${issue.table1}" vs "${issue.table2}" (${issue.similarity}% similar)`);
        } else if (issue.type === 'pluralization_inconsistency') {
          console.log(`   • Pluralization: "${issue.singular}" vs "${issue.plural}"`);
        }
        console.log(`     Suggestion: ${issue.suggestion}`);
      });
    }

    if (analysis.suspiciousReferences.length > 0) {
      console.log(`\n⚠️ SUSPICIOUS REFERENCES:`);
      analysis.suspiciousReferences.forEach(issue => {
        console.log(`   • ${issue.type}: "${issue.table}"`);
        console.log(`     Suggestion: ${issue.suggestion}`);
      });
    }

    console.log(`\n📋 ALL REFERENCED TABLES:`);
    analysis.allReferencedTables.forEach(table => {
      console.log(`   • ${table}`);
    });

    // Show files with most table references
    const fileStats = {};
    analysis.tableReferences.forEach(ref => {
      fileStats[ref.file] = (fileStats[ref.file] || 0) + 1;
    });

    const topFiles = Object.entries(fileStats)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10);

    console.log(`\n📁 FILES WITH MOST TABLE REFERENCES:`);
    topFiles.forEach(([file, count]) => {
      console.log(`   • ${file}: ${count} references`);
    });

    return analysis;
  }
}

// Main execution
async function main() {
  const scanner = new TableReferenceScanner();
  
  try {
    // Scan codebase
    const analysis = await scanner.scanCodebase();
    
    // Generate report
    scanner.generateReport(analysis);
    
    // Save detailed report to file
    const reportPath = path.join(__dirname, 'table-reference-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(analysis, null, 2));
    console.log(`\n📄 Detailed report saved to: ${reportPath}`);
    
  } catch (error) {
    console.error('❌ Error during table reference scan:', error);
  } finally {
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

module.exports = TableReferenceScanner;
