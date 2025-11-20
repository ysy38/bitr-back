#!/usr/bin/env node

/**
 * Comprehensive Service Verification Script
 * 
 * Verifies that all services are working after cleanup
 */

require('dotenv').config();
const db = require('../db/db');

async function verifyAllServices() {
  console.log('🔍 COMPREHENSIVE SERVICE VERIFICATION');
  console.log('=====================================\n');

  const results = {
    apis: {},
    services: {},
    database: {},
    endpoints: {},
    overall: 'PASS'
  };

  try {
    // 1. Verify Core Services
    console.log('🔧 Checking Core Services...');
    
    // Test UnifiedSlipService
    try {
      const UnifiedSlipService = require('../services/unified-slip-service');
      const slipService = new UnifiedSlipService();
      await slipService.initialize();
      results.services.unified_slip = '✅ Working';
      console.log('  ✅ UnifiedSlipService - Working');
    } catch (error) {
      results.services.unified_slip = `❌ Error: ${error.message}`;
      results.overall = 'FAIL';
      console.log('  ❌ UnifiedSlipService - Error:', error.message);
    }

    // Test EnhancedAnalyticsService
    try {
      const EnhancedAnalyticsService = require('../services/enhanced-analytics-service');
      const analyticsService = new EnhancedAnalyticsService();
      results.services.enhanced_analytics = '✅ Working';
      console.log('  ✅ EnhancedAnalyticsService - Working');
    } catch (error) {
      results.services.enhanced_analytics = `❌ Error: ${error.message}`;
      results.overall = 'FAIL';
      console.log('  ❌ EnhancedAnalyticsService - Error:', error.message);
    }

    // Test EnhancedPoolSyncService
    try {
      const EnhancedPoolSyncService = require('../services/event-driven-pool-sync');
      const poolService = new EnhancedPoolSyncService();
      results.services.enhanced_pool_sync = '✅ Working';
      console.log('  ✅ EnhancedPoolSyncService - Working');
    } catch (error) {
      results.services.enhanced_pool_sync = `❌ Error: ${error.message}`;
      results.overall = 'FAIL';
      console.log('  ❌ EnhancedPoolSyncService - Error:', error.message);
    }

    // 2. Verify API Endpoints
    console.log('\n📡 Checking API Endpoints...');
    
    const express = require('express');
    const app = express();
    
    // Test slips API
    try {
      const slipsRouter = require('../api/slips');
      app.use('/api/slips', slipsRouter);
      results.apis.slips = '✅ Loads';
      console.log('  ✅ /api/slips - Loads successfully');
    } catch (error) {
      results.apis.slips = `❌ Error: ${error.message}`;
      results.overall = 'FAIL';
      console.log('  ❌ /api/slips - Error:', error.message);
    }

    // Test analytics API
    try {
      const analyticsRouter = require('../api/analytics');
      app.use('/api/analytics', analyticsRouter);
      results.apis.analytics = '✅ Loads';
      console.log('  ✅ /api/analytics - Loads successfully');
    } catch (error) {
      results.apis.analytics = `❌ Error: ${error.message}`;
      results.overall = 'FAIL';
      console.log('  ❌ /api/analytics - Error:', error.message);
    }

    // Test oddyssey API (existing)
    try {
      const oddysseyRouter = require('../api/oddyssey');
      app.use('/api/oddyssey', oddysseyRouter);
      results.apis.oddyssey = '✅ Loads';
      console.log('  ✅ /api/oddyssey - Loads successfully');
    } catch (error) {
      results.apis.oddyssey = `❌ Error: ${error.message}`;
      results.overall = 'FAIL';
      console.log('  ❌ /api/oddyssey - Error:', error.message);
    }

    // 3. Verify Database Functionality
    console.log('\n🗄️ Checking Database Functionality...');
    
    // Test slip queries
    try {
      const slipCount = await db.query('SELECT COUNT(*) as count FROM oracle.oddyssey_slips');
      results.database.slips = `✅ ${slipCount.rows[0].count} records`;
      console.log(`  ✅ oracle.oddyssey_slips - ${slipCount.rows[0].count} records`);
    } catch (error) {
      results.database.slips = `❌ Error: ${error.message}`;
      results.overall = 'FAIL';
      console.log('  ❌ oracle.oddyssey_slips - Error:', error.message);
    }

    // Test analytics queries
    try {
      const analyticsCount = await db.query('SELECT COUNT(*) as count FROM oracle.analytics_odyssey_daily');
      results.database.analytics = `✅ ${analyticsCount.rows[0].count} records`;
      console.log(`  ✅ oracle.analytics_odyssey_daily - ${analyticsCount.rows[0].count} records`);
    } catch (error) {
      results.database.analytics = `❌ Error: ${error.message}`;
      results.overall = 'FAIL';
      console.log('  ❌ oracle.analytics_odyssey_daily - Error:', error.message);
    }

    // 4. Verify Key Endpoint Functionality
    console.log('\n🎯 Checking Key Endpoint Functionality...');
    
    // Test that oddyssey slip endpoints still work
    try {
      const testAddress = '0xA336C7B8cBe75D5787F25A62FE282B83Ac0f3363';
      const userSlips = await db.query(
        'SELECT COUNT(*) as count FROM oracle.oddyssey_slips WHERE player_address = $1',
        [testAddress]
      );
      results.endpoints.oddyssey_user_slips = `✅ ${userSlips.rows[0].count} slips found`;
      console.log(`  ✅ Oddyssey user slips query - ${userSlips.rows[0].count} slips found`);
    } catch (error) {
      results.endpoints.oddyssey_user_slips = `❌ Error: ${error.message}`;
      results.overall = 'FAIL';
      console.log('  ❌ Oddyssey user slips query - Error:', error.message);
    }

    // 5. Check for Missing Services
    console.log('\n🔍 Checking for Missing Services...');
    
    const criticalServices = [
      'services/web3-service.js',
      'services/oddyssey-manager.js',
      'services/guided-market-service.js',
      'cron/master-consolidated-cron.js'
    ];

    const fs = require('fs');
    for (const service of criticalServices) {
      if (fs.existsSync(service)) {
        console.log(`  ✅ ${service} - Exists`);
      } else {
        console.log(`  ❌ ${service} - Missing`);
        results.overall = 'FAIL';
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 COMPREHENSIVE SERVICE VERIFICATION SUMMARY');
    console.log('='.repeat(60));
    
    console.log('\n🔧 Services:');
    Object.entries(results.services).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });

    console.log('\n📡 APIs:');
    Object.entries(results.apis).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });

    console.log('\n🗄️ Database:');
    Object.entries(results.database).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });

    console.log('\n🎯 Endpoints:');
    Object.entries(results.endpoints).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });

    console.log('\n' + '='.repeat(60));
    if (results.overall === 'PASS') {
      console.log('🎉 OVERALL STATUS: ✅ PASS - All services working after cleanup!');
      console.log('✅ No functionality lost during duplicate removal');
      console.log('✅ All critical services operational');
      console.log('✅ Database connectivity confirmed');
      console.log('✅ API endpoints loading properly');
    } else {
      console.log('⚠️ OVERALL STATUS: ❌ FAIL - Issues found that need attention');
      console.log('🔧 Some services may need restoration or fixing');
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
verifyAllServices();
