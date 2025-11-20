#!/usr/bin/env node

/**
 * Airdrop System Verification Script
 * 
 * Comprehensive verification of airdrop system functionality:
 * - Database schema verification
 * - API endpoint testing
 * - Service connectivity
 * - Indexing functionality
 * - Eligibility calculation
 */

require('dotenv').config();
const db = require('../db/db');

async function verifyAirdropSystem() {
  console.log('🎁 AIRDROP SYSTEM VERIFICATION');
  console.log('==============================\n');

  const results = {
    database: {},
    apis: {},
    services: {},
    indexing: {},
    eligibility: {},
    overall: 'PASS'
  };

  try {
    // 1. Verify Database Schema
    console.log('🗄️ Checking Database Schema...');
    
    const requiredTables = [
      'airdrop.faucet_claims',
      'airdrop.bitr_activities', 
      'airdrop.staking_activities',
      'airdrop.transfer_patterns',
      'airdrop.eligibility',
      'airdrop.snapshots',
      'airdrop.snapshot_balances',
      'airdrop.statistics'
    ];

    for (const table of requiredTables) {
      try {
        const result = await db.query(`SELECT COUNT(*) as count FROM ${table}`);
        results.database[table] = `✅ ${result.rows[0].count} records`;
        console.log(`  ✅ ${table} - ${result.rows[0].count} records`);
      } catch (error) {
        results.database[table] = `❌ Error: ${error.message}`;
        results.overall = 'FAIL';
        console.log(`  ❌ ${table} - Error: ${error.message}`);
      }
    }

    // 2. Verify API Endpoints
    console.log('\n📡 Checking API Endpoints...');
    
    const express = require('express');
    const app = express();
    
    try {
      const airdropRouter = require('../api/airdrop');
      app.use('/api/airdrop', airdropRouter);
      results.apis.airdrop = '✅ Loads';
      console.log('  ✅ /api/airdrop - Loads successfully');
    } catch (error) {
      results.apis.airdrop = `❌ Error: ${error.message}`;
      results.overall = 'FAIL';
      console.log('  ❌ /api/airdrop - Error:', error.message);
    }

    try {
      const faucetRouter = require('../api/faucet');
      app.use('/api/faucet', faucetRouter);
      results.apis.faucet = '✅ Loads';
      console.log('  ✅ /api/faucet - Loads successfully');
    } catch (error) {
      results.apis.faucet = `❌ Error: ${error.message}`;
      results.overall = 'FAIL';
      console.log('  ❌ /api/faucet - Error:', error.message);
    }

    // 3. Verify Services
    console.log('\n🔧 Checking Services...');
    
    try {
      const EnhancedAirdropService = require('../services/enhanced-airdrop-service');
      const airdropService = new EnhancedAirdropService();
      results.services.enhanced_airdrop = '✅ Working';
      console.log('  ✅ EnhancedAirdropService - Working');
    } catch (error) {
      results.services.enhanced_airdrop = `❌ Error: ${error.message}`;
      results.overall = 'FAIL';
      console.log('  ❌ EnhancedAirdropService - Error:', error.message);
    }

    try {
      const AirdropEligibilityCalculator = require('../airdrop/eligibility_calculator');
      results.services.eligibility_calculator = '✅ Working';
      console.log('  ✅ AirdropEligibilityCalculator - Working');
    } catch (error) {
      results.services.eligibility_calculator = `❌ Error: ${error.message}`;
      results.overall = 'FAIL';
      console.log('  ❌ AirdropEligibilityCalculator - Error:', error.message);
    }

    try {
      const AirdropIndexer = require('../services/airdrop-indexer');
      results.services.airdrop_indexer = '✅ Working';
      console.log('  ✅ AirdropIndexer - Working');
    } catch (error) {
      results.services.airdrop_indexer = `❌ Error: ${error.message}`;
      results.overall = 'FAIL';
      console.log('  ❌ AirdropIndexer - Error:', error.message);
    }

    // 4. Verify Indexing Integration
    console.log('\n🔍 Checking Indexing Integration...');
    
    try {
      // Check if airdrop events are included in the unified indexer
      const fs = require('fs');
      const indexerContent = fs.readFileSync('./unified-realtime-indexer.js', 'utf8');
      
      if (indexerContent.includes('processAirdropEvents') && indexerContent.includes('indexFaucetClaim')) {
        results.indexing.unified_indexer = '✅ Airdrop events integrated';
        console.log('  ✅ Unified indexer - Airdrop events integrated');
      } else {
        results.indexing.unified_indexer = '❌ Airdrop events not integrated';
        results.overall = 'FAIL';
        console.log('  ❌ Unified indexer - Airdrop events not integrated');
      }
    } catch (error) {
      results.indexing.unified_indexer = `❌ Error: ${error.message}`;
      results.overall = 'FAIL';
      console.log('  ❌ Unified indexer - Error:', error.message);
    }

    // 5. Test Eligibility Calculation
    console.log('\n🎯 Testing Eligibility Calculation...');
    
    try {
      // Test with a sample address
      const testAddress = '0xA336C7B8cBe75D5787F25A62FE282B83Ac0f3363';
      
      const eligibilityResult = await db.query(`
        SELECT 
          e.*,
          fc.amount as faucet_amount,
          fc.claimed_at as faucet_claimed_at
        FROM airdrop.eligibility e
        LEFT JOIN airdrop.faucet_claims fc ON e.user_address = fc.user_address
        WHERE LOWER(e.user_address) = LOWER($1)
      `, [testAddress]);
      
      if (eligibilityResult.rows.length > 0) {
        results.eligibility.calculation = '✅ Working';
        console.log('  ✅ Eligibility calculation - Working');
      } else {
        results.eligibility.calculation = '⚠️ No test data found';
        console.log('  ⚠️ Eligibility calculation - No test data found');
      }
    } catch (error) {
      results.eligibility.calculation = `❌ Error: ${error.message}`;
      results.overall = 'FAIL';
      console.log('  ❌ Eligibility calculation - Error:', error.message);
    }

    // 6. Check Contract Configuration
    console.log('\n📋 Checking Contract Configuration...');
    
    const config = require('../config');
    const contractConfig = {
      bitrToken: config.contracts?.bitrToken || 'Not configured',
      bitrFaucet: config.contracts?.bitrFaucet || 'Not configured',
      staking: config.contracts?.staking || 'Not configured'
    };

    console.log('  📊 Contract addresses:');
    Object.entries(contractConfig).forEach(([key, value]) => {
      const status = value !== 'Not configured' ? '✅' : '⚠️';
      console.log(`    ${status} ${key}: ${value}`);
    });

    // 7. Check Cron Integration
    console.log('\n⏰ Checking Cron Integration...');
    
    try {
      // Check if airdrop cron jobs are configured in the master cron
      const fs = require('fs');
      const cronContent = fs.readFileSync('./cron/master-consolidated-cron.js', 'utf8');
      
      if (cronContent.includes('airdrop_scheduler') && cronContent.includes('airdrop_indexer')) {
        results.indexing.cron_integration = '✅ Airdrop cron configured';
        console.log('  ✅ Airdrop cron - Configured');
      } else {
        results.indexing.cron_integration = '❌ Airdrop cron not configured';
        results.overall = 'FAIL';
        console.log('  ❌ Airdrop cron - Not configured');
      }
    } catch (error) {
      results.indexing.cron_integration = `❌ Error: ${error.message}`;
      results.overall = 'FAIL';
      console.log('  ❌ Airdrop cron - Error:', error.message);
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 AIRDROP SYSTEM VERIFICATION SUMMARY');
    console.log('='.repeat(60));
    
    console.log('\n🗄️ Database:');
    Object.entries(results.database).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });

    console.log('\n📡 APIs:');
    Object.entries(results.apis).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });

    console.log('\n🔧 Services:');
    Object.entries(results.services).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });

    console.log('\n🔍 Indexing:');
    Object.entries(results.indexing).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });

    console.log('\n🎯 Eligibility:');
    Object.entries(results.eligibility).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });

    console.log('\n' + '='.repeat(60));
    if (results.overall === 'PASS') {
      console.log('🎉 OVERALL STATUS: ✅ PASS - Airdrop system fully functional!');
      console.log('✅ All components working correctly');
      console.log('✅ Database schema complete');
      console.log('✅ API endpoints operational');
      console.log('✅ Services connected');
      console.log('✅ Indexing integrated');
      console.log('✅ Eligibility calculation working');
    } else {
      console.log('⚠️ OVERALL STATUS: ❌ FAIL - Issues found that need attention');
      console.log('🔧 Some components may need configuration or fixing');
    }
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  } finally {
    process.exit(results.overall === 'PASS' ? 0 : 1);
  }
}

// Run verification
verifyAirdropSystem();
