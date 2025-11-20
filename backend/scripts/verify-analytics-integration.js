#!/usr/bin/env node

/**
 * Analytics Integration Verification Script
 * 
 * Verifies that all analytics services are properly integrated and working
 */

require('dotenv').config();
const db = require('../db/db');

async function verifyAnalyticsIntegration() {
  console.log('🔍 Verifying Analytics Integration...\n');

  const results = {
    services: {},
    database: {},
    cron: {},
    apis: {},
    overall: 'PASS'
  };

  try {
    // 1. Verify Services
    console.log('📊 Checking Analytics Services...');
    
    try {
      const EnhancedAnalyticsService = require('../services/enhanced-analytics-service');
      const service = new EnhancedAnalyticsService();
      results.services.enhanced = '✅ Available';
      console.log('  ✅ Enhanced Analytics Service - Available');
    } catch (error) {
      results.services.enhanced = `❌ Error: ${error.message}`;
      results.overall = 'FAIL';
      console.log('  ❌ Enhanced Analytics Service - Error:', error.message);
    }

    try {
      const UnifiedSlipService = require('../services/unified-slip-service');
      const service = new UnifiedSlipService();
      results.services.unified_slip = '✅ Available';
      console.log('  ✅ Unified Slip Service - Available');
    } catch (error) {
      results.services.unified_slip = `❌ Error: ${error.message}`;
      results.overall = 'FAIL';
      console.log('  ❌ Unified Slip Service - Error:', error.message);
    }

    // 2. Verify Database Tables
    console.log('\n🗄️ Checking Database Tables...');
    
    const tables = [
      'oracle.oddyssey_slips',
      'oracle.oddyssey_user_analytics', 
      'oracle.analytics_odyssey_daily',
      'analytics.strategic_events',
      'oracle.pools'
    ];

    for (const table of tables) {
      try {
        const result = await db.query(`SELECT COUNT(*) as count FROM ${table}`);
        const count = parseInt(result.rows[0].count);
        results.database[table] = `✅ ${count} records`;
        console.log(`  ✅ ${table} - ${count} records`);
      } catch (error) {
        results.database[table] = `❌ Error: ${error.message}`;
        results.overall = 'FAIL';
        console.log(`  ❌ ${table} - Error:`, error.message);
      }
    }

    // 3. Verify Cron Integration
    console.log('\n⏰ Checking Cron Integration...');
    
    try {
      const fs = require('fs');
      const cronFile = require('../cron/master-consolidated-cron.js');
      
      // Check if analytics job is defined
      const cronContent = fs.readFileSync('./cron/master-consolidated-cron.js', 'utf8');
      if (cronContent.includes('analytics_update')) {
        results.cron.analytics_job = '✅ Defined';
        console.log('  ✅ Analytics cron job - Defined');
      } else {
        results.cron.analytics_job = '❌ Not found';
        results.overall = 'FAIL';
        console.log('  ❌ Analytics cron job - Not found');
      }

      if (cronContent.includes('EnhancedAnalyticsService')) {
        results.cron.service_import = '✅ Imported';
        console.log('  ✅ Analytics service import - Found');
      } else {
        results.cron.service_import = '❌ Not imported';
        results.overall = 'FAIL';
        console.log('  ❌ Analytics service import - Not found');
      }
    } catch (error) {
      results.cron.check = `❌ Error: ${error.message}`;
      results.overall = 'FAIL';
      console.log('  ❌ Cron check failed:', error.message);
    }

    // 4. Verify Package.json Scripts
    console.log('\n📦 Checking Package.json Scripts...');
    
    try {
      const packageJson = require('../package.json');
      
      const requiredScripts = [
        'analytics:update',
        'pool-sync',
        'indexer'
      ];

      for (const script of requiredScripts) {
        if (packageJson.scripts[script]) {
          results.apis[script] = '✅ Defined';
          console.log(`  ✅ Script: ${script} - Defined`);
        } else {
          results.apis[script] = '❌ Missing';
          results.overall = 'FAIL';
          console.log(`  ❌ Script: ${script} - Missing`);
        }
      }
    } catch (error) {
      results.apis.package_check = `❌ Error: ${error.message}`;
      results.overall = 'FAIL';
      console.log('  ❌ Package.json check failed:', error.message);
    }

    // 5. Verify Fly.toml Configuration
    console.log('\n🚀 Checking Fly.toml Configuration...');
    
    try {
      const fs = require('fs');
      const flyConfig = fs.readFileSync('./fly.toml', 'utf8');
      
      const requiredProcesses = ['app', 'indexer', 'workers', 'pool-sync'];
      
      for (const process of requiredProcesses) {
        if (flyConfig.includes(`${process} = `)) {
          results.apis[`fly_${process}`] = '✅ Configured';
          console.log(`  ✅ Fly process: ${process} - Configured`);
        } else {
          results.apis[`fly_${process}`] = '❌ Missing';
          results.overall = 'FAIL';
          console.log(`  ❌ Fly process: ${process} - Missing`);
        }
      }
    } catch (error) {
      results.apis.fly_check = `❌ Error: ${error.message}`;
      results.overall = 'FAIL';
      console.log('  ❌ Fly.toml check failed:', error.message);
    }

    // 6. Test Analytics Flow
    console.log('\n🔄 Testing Analytics Flow...');
    
    try {
      const EnhancedAnalyticsService = require('../services/enhanced-analytics-service');
      const service = new EnhancedAnalyticsService();
      
      // Test analytics update (dry run)
      console.log('  🧪 Testing analytics update...');
      await service.populateOddysseyAnalytics();
      
      results.apis.analytics_flow = '✅ Working';
      console.log('  ✅ Analytics flow - Working');
    } catch (error) {
      results.apis.analytics_flow = `❌ Error: ${error.message}`;
      results.overall = 'FAIL';
      console.log('  ❌ Analytics flow failed:', error.message);
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 ANALYTICS INTEGRATION VERIFICATION SUMMARY');
    console.log('='.repeat(60));
    
    console.log('\n🔧 Services:');
    Object.entries(results.services).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });

    console.log('\n🗄️ Database:');
    Object.entries(results.database).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });

    console.log('\n⏰ Cron:');
    Object.entries(results.cron).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });

    console.log('\n📦 Configuration:');
    Object.entries(results.apis).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });

    console.log('\n' + '='.repeat(60));
    if (results.overall === 'PASS') {
      console.log('🎉 OVERALL STATUS: ✅ PASS - Analytics integration is working!');
    } else {
      console.log('⚠️ OVERALL STATUS: ❌ FAIL - Issues found that need attention');
    }
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

// Run verification
verifyAnalyticsIntegration();


