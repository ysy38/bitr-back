#!/usr/bin/env node

/**
 * Quick Schema Audit - Focus on Critical Issues
 * 
 * Simplified version that focuses on the most critical schema mismatches
 * that can break production (like the ones we just fixed)
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../db/db');

class QuickSchemaAuditor {
  constructor() {
    this.criticalIssues = [];
    this.schemaCache = new Map();
    
    // Critical patterns that break production
    this.criticalPatterns = [
      {
        name: 'Getting odds from fixtures table',
        pattern: /oracle\.fixtures.*\.(home_odds|draw_odds|away_odds|over_.*odds|under_.*odds)/gi,
        severity: 'CRITICAL',
        fix: 'Use oracle.daily_game_matches table for odds data'
      },
      {
        name: 'Getting scores from fixtures table', 
        pattern: /oracle\.fixtures.*\.(home_score|away_score)/gi,
        severity: 'CRITICAL',
        fix: 'Use oracle.fixture_results table for score data'
      },
      {
        name: 'Non-existent finished_at column',
        pattern: /f\.finished_at|fixtures\.finished_at/gi,
        severity: 'CRITICAL',
        fix: 'Use fixture_results.finished_at instead'
      },
      {
        name: 'Missing table schema prefix',
        pattern: /FROM\s+(?!oracle\.|public\.|information_schema\.)[a-z_]+\s/gi,
        severity: 'WARNING',
        fix: 'Always use schema.table format (oracle.table_name)'
      }
    ];
  }

  async runQuickAudit() {
    console.log('⚡ Quick Schema Audit - Critical Issues Only\n');
    
    try {
      // Load schema for validation
      await this.loadCriticalSchema();
      
      // Scan only API and services directories
      await this.scanCriticalFiles();
      
      // Generate focused report
      this.generateQuickReport();
      
    } catch (error) {
      console.error('❌ Quick audit failed:', error);
      process.exit(1);
    } finally {
      await db.disconnect();
    }
  }

  async loadCriticalSchema() {
    console.log('📋 Loading critical table schemas...');
    
    const criticalTables = [
      'oracle.fixtures',
      'oracle.fixture_results', 
      'oracle.daily_game_matches',
      'oracle.oddyssey_cycles'
    ];
    
    for (const tableName of criticalTables) {
      const [schema, table] = tableName.split('.');
      
      const result = await db.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = $1 AND table_name = $2
        ORDER BY ordinal_position
      `, [schema, table]);
      
      this.schemaCache.set(tableName, {
        columns: result.rows.map(r => r.column_name)
      });
    }
    
    console.log(`✅ Loaded ${this.schemaCache.size} critical tables`);
  }

  async scanCriticalFiles() {
    console.log('🔍 Scanning critical files...');
    
    const criticalDirs = ['api', 'services'];
    const files = [];
    
    for (const dir of criticalDirs) {
      const dirPath = path.join(__dirname, '..', dir);
      if (fs.existsSync(dirPath)) {
        const dirFiles = fs.readdirSync(dirPath)
          .filter(f => f.endsWith('.js'))
          .map(f => path.join(dirPath, f));
        files.push(...dirFiles);
      }
    }
    
    console.log(`📁 Scanning ${files.length} critical files...`);
    
    for (const filePath of files) {
      const content = fs.readFileSync(filePath, 'utf8');
      const relativePath = path.relative(path.join(__dirname, '..'), filePath);
      
      this.scanFileForCriticalIssues(content, relativePath);
    }
  }

  scanFileForCriticalIssues(content, filePath) {
    const lines = content.split('\n');
    
    for (const pattern of this.criticalPatterns) {
      const matches = content.match(pattern.pattern) || [];
      
      for (const match of matches) {
        // Find line number
        let lineNumber = 1;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes(match)) {
            lineNumber = i + 1;
            break;
          }
        }
        
        this.criticalIssues.push({
          type: pattern.name,
          severity: pattern.severity,
          file: filePath,
          line: lineNumber,
          match: match,
          fix: pattern.fix
        });
      }
    }
  }

  generateQuickReport() {
    console.log('\n' + '='.repeat(60));
    console.log('⚡ QUICK SCHEMA AUDIT REPORT');
    console.log('='.repeat(60));
    
    const critical = this.criticalIssues.filter(i => i.severity === 'CRITICAL');
    const warnings = this.criticalIssues.filter(i => i.severity === 'WARNING');
    
    console.log(`\n📊 SUMMARY:`);
    console.log(`   🔴 Critical Issues: ${critical.length}`);
    console.log(`   🟡 Warnings: ${warnings.length}`);
    
    if (critical.length > 0) {
      console.log(`\n🔴 CRITICAL ISSUES (${critical.length}):`);
      console.log('-'.repeat(40));
      
      critical.forEach((issue, index) => {
        console.log(`\n${index + 1}. ${issue.type}`);
        console.log(`   📁 ${issue.file}:${issue.line}`);
        console.log(`   🔍 Found: ${issue.match}`);
        console.log(`   💡 Fix: ${issue.fix}`);
      });
    }
    
    if (warnings.length > 0) {
      console.log(`\n🟡 WARNINGS (${warnings.length}):`);
      console.log('-'.repeat(40));
      
      warnings.slice(0, 10).forEach((issue, index) => {
        console.log(`\n${index + 1}. ${issue.type}`);
        console.log(`   📁 ${issue.file}:${issue.line}`);
        console.log(`   💡 Fix: ${issue.fix}`);
      });
      
      if (warnings.length > 10) {
        console.log(`\n   ... and ${warnings.length - 10} more warnings`);
      }
    }
    
    // Schema reference
    console.log(`\n📚 SCHEMA REFERENCE:`);
    console.log('-'.repeat(40));
    
    for (const [tableName, info] of this.schemaCache) {
      console.log(`\n🗄️  ${tableName}:`);
      console.log(`   Columns: ${info.columns.join(', ')}`);
    }
    
    console.log('\n' + '='.repeat(60));
    
    if (critical.length === 0) {
      console.log('✅ NO CRITICAL ISSUES - Production safe!');
    } else {
      console.log(`❌ ${critical.length} CRITICAL ISSUES - Fix before deployment!`);
    }
    
    console.log('='.repeat(60));
  }
}

// Run if executed directly
if (require.main === module) {
  const auditor = new QuickSchemaAuditor();
  auditor.runQuickAudit().catch(console.error);
}

module.exports = QuickSchemaAuditor;
