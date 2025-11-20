/**
 * Comprehensive System Audit
 * 
 * This script audits the entire system to identify missing components, services, and issues.
 */

const Web3Service = require('./backend/services/web3-service.js');
const ResultsFetcherService = require('./backend/services/results-fetcher-service.js');
const db = require('./backend/db/db.js');
const fs = require('fs');
const path = require('path');

async function auditSystem() {
  console.log('🔍 Running Comprehensive System Audit...\n');
  
  const issues = [];
  const warnings = [];
  const successes = [];
  
  try {
    // 1. Check Core Services
    console.log('1️⃣ Core Services Audit...');
    
    // Web3Service
    try {
      const web3Service = new Web3Service();
      await web3Service.initialize();
      successes.push('✅ Web3Service: Initialized successfully');
    } catch (error) {
      issues.push(`❌ Web3Service: ${error.message}`);
    }
    
    // ResultsFetcherService
    try {
      const resultsFetcher = new ResultsFetcherService();
      successes.push('✅ ResultsFetcherService: Initialized successfully');
    } catch (error) {
      issues.push(`❌ ResultsFetcherService: ${error.message}`);
    }
    
    // 2. Check Database Connectivity
    console.log('\n2️⃣ Database Connectivity Audit...');
    try {
      await db.query('SELECT 1');
      successes.push('✅ Database: Connected successfully');
    } catch (error) {
      issues.push(`❌ Database: ${error.message}`);
    }
    
    // 3. Check Required Files
    console.log('\n3️⃣ Required Files Audit...');
    const requiredFiles = [
      './backend/services/web3-service.js',
      './backend/services/results-fetcher-service.js',
      './backend/services/oddyssey-oracle-bot.js',
      './backend/services/oddyssey-match-selector.js',
      './backend/indexer.js',
      './backend/indexer_oddyssey.js',
      './backend/cron/master-consolidated-cron.js',
      './backend/cron/results-fetcher-cron.js',
      './backend/api/matches.js',
      './backend/config.js',
      './backend/oddyssey-contract-abi.json'
    ];
    
    for (const file of requiredFiles) {
      if (fs.existsSync(file)) {
        successes.push(`✅ File: ${file} exists`);
      } else {
        issues.push(`❌ File: ${file} missing`);
      }
    }
    
    // 4. Check Database Tables
    console.log('\n4️⃣ Database Tables Audit...');
    const requiredTables = [
      'oracle.oddyssey_cycles',
      'oracle.oddyssey_slips',
      'oracle.fixtures',
      'oracle.blockchain_events'
    ];
    
    for (const table of requiredTables) {
      try {
        await db.query(`SELECT 1 FROM ${table} LIMIT 1`);
        successes.push(`✅ Table: ${table} exists`);
      } catch (error) {
        issues.push(`❌ Table: ${table} missing or inaccessible`);
      }
    }
    
    // 5. Check Environment Variables
    console.log('\n5️⃣ Environment Variables Audit...');
    const requiredEnvVars = [
      'RPC_URL',
      'PRIVATE_KEY',
      'SPORTMONKS_API_TOKEN',
      'DATABASE_URL'
    ];
    
    for (const envVar of requiredEnvVars) {
      if (process.env[envVar]) {
        successes.push(`✅ Env Var: ${envVar} set`);
      } else {
        issues.push(`❌ Env Var: ${envVar} missing`);
      }
    }
    
    // 6. Check Cron Jobs
    console.log('\n6️⃣ Cron Jobs Audit...');
    try {
      const cronFile = './backend/cron/master-consolidated-cron.js';
      if (fs.existsSync(cronFile)) {
        const cronContent = fs.readFileSync(cronFile, 'utf8');
        const hasResultsFetcher = cronContent.includes('results_fetcher');
        const hasIndexer = cronContent.includes('indexer');
        
        if (hasResultsFetcher) {
          successes.push('✅ Cron: Results fetcher configured');
        } else {
          issues.push('❌ Cron: Results fetcher not configured');
        }
        
        if (hasIndexer) {
          successes.push('✅ Cron: Indexer configured');
        } else {
          issues.push('❌ Cron: Indexer not configured');
        }
      } else {
        issues.push('❌ Cron: Consolidated workers file missing');
      }
    } catch (error) {
      issues.push(`❌ Cron: ${error.message}`);
    }
    
    // 7. Check API Endpoints
    console.log('\n7️⃣ API Endpoints Audit...');
    try {
      const apiFile = './backend/api/matches.js';
      if (fs.existsSync(apiFile)) {
        const apiContent = fs.readFileSync(apiFile, 'utf8');
        const hasMatchesEndpoint = apiContent.includes('router.get(\'/matches\'');
        
        if (hasMatchesEndpoint) {
          successes.push('✅ API: /matches endpoint exists');
        } else {
          issues.push('❌ API: /matches endpoint missing');
        }
      } else {
        issues.push('❌ API: matches.js file missing');
      }
    } catch (error) {
      issues.push(`❌ API: ${error.message}`);
    }
    
    // 8. Check Current System Status
    console.log('\n8️⃣ Current System Status Audit...');
    
    // Check current cycle
    try {
      const cycleResult = await db.query(`
        SELECT cycle_id, is_resolved, created_at, end_time
        FROM oracle.oddyssey_cycles 
        ORDER BY cycle_id DESC 
        LIMIT 1
      `);
      
      if (cycleResult.rows.length > 0) {
        const currentCycle = cycleResult.rows[0];
        successes.push(`✅ Current Cycle: ${currentCycle.cycle_id} (${currentCycle.is_resolved ? 'RESOLVED' : 'ACTIVE'})`);
      } else {
        warnings.push('⚠️ No cycles found in database');
      }
    } catch (error) {
      issues.push(`❌ Cycle Check: ${error.message}`);
    }
    
    // Check results status
    try {
      const resultsResult = await db.query(`
        SELECT 
          COUNT(*) as total_fixtures,
          COUNT(CASE WHEN status IN ('FT', 'AET', 'PEN') THEN 1 END) as completed_fixtures,
          COUNT(CASE WHEN status IN ('FT', 'AET', 'PEN') AND (result_info IS NULL OR result_info = '{}' OR result_info = 'null') THEN 1 END) as missing_results
        FROM oracle.fixtures 
        WHERE match_date >= NOW() - INTERVAL '7 days'
      `);
      
      const stats = resultsResult.rows[0];
      if (stats.missing_results > 0) {
        warnings.push(`⚠️ Results: ${stats.missing_results} fixtures missing results`);
      } else {
        successes.push('✅ Results: All completed fixtures have results');
      }
    } catch (error) {
      issues.push(`❌ Results Check: ${error.message}`);
    }
    
    // 9. Check Slip Evaluation
    console.log('\n9️⃣ Slip Evaluation Audit...');
    try {
      const slipsResult = await db.query(`
        SELECT 
          COUNT(*) as total_slips,
          COUNT(CASE WHEN is_evaluated = true THEN 1 END) as evaluated_slips,
          COUNT(CASE WHEN is_evaluated = false THEN 1 END) as unevaluated_slips
        FROM oracle.oddyssey_slips 
        WHERE cycle_id IN (SELECT cycle_id FROM oracle.oddyssey_cycles WHERE is_resolved = true)
      `);
      
      const slipStats = slipsResult.rows[0];
      if (slipStats.unevaluated_slips > 0) {
        issues.push(`❌ Slip Evaluation: ${slipStats.unevaluated_slips} slips not evaluated`);
      } else {
        successes.push('✅ Slip Evaluation: All resolved cycle slips evaluated');
      }
    } catch (error) {
      issues.push(`❌ Slip Evaluation Check: ${error.message}`);
    }
    
    // 10. Check Frontend Integration
    console.log('\n🔟 Frontend Integration Audit...');
    const frontendDir = '../predict-linux';
    if (fs.existsSync(frontendDir)) {
      successes.push('✅ Frontend: predict-linux directory exists');
      
      // Check if frontend has Oddyssey components
      const frontendFiles = [
        path.join(frontendDir, 'app/oddyssey'),
        path.join(frontendDir, 'app/components/Oddyssey'),
        path.join(frontendDir, 'app/services/OddysseyService')
      ];
      
      for (const file of frontendFiles) {
        if (fs.existsSync(file)) {
          successes.push(`✅ Frontend: ${path.basename(file)} exists`);
        } else {
          warnings.push(`⚠️ Frontend: ${path.basename(file)} missing`);
        }
      }
    } else {
      issues.push('❌ Frontend: predict-linux directory not found');
    }
    
    // Print Summary
    console.log('\n📋 AUDIT SUMMARY:');
    console.log('================');
    
    if (successes.length > 0) {
      console.log('\n✅ SUCCESSES:');
      successes.forEach(success => console.log(`   ${success}`));
    }
    
    if (warnings.length > 0) {
      console.log('\n⚠️ WARNINGS:');
      warnings.forEach(warning => console.log(`   ${warning}`));
    }
    
    if (issues.length > 0) {
      console.log('\n❌ CRITICAL ISSUES:');
      issues.forEach(issue => console.log(`   ${issue}`));
    }
    
    console.log(`\n📊 Total: ${successes.length} successes, ${warnings.length} warnings, ${issues.length} critical issues`);
    
    if (issues.length === 0) {
      console.log('\n🎉 System audit passed! All critical components are working.');
    } else {
      console.log('\n🚨 System audit failed! Critical issues need to be resolved.');
    }
    
  } catch (error) {
    console.error('❌ Audit failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  auditSystem().catch(console.error);
}

module.exports = auditSystem;
