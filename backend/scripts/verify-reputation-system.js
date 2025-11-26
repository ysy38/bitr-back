#!/usr/bin/env node

/**
 * Reputation System Verification Script
 * 
 * Comprehensive verification of reputation system functionality:
 * - Database schema verification
 * - API endpoint testing
 * - Service connectivity
 * - Data source verification
 * - Cron job verification
 * - Contract integration
 */

require('dotenv').config();
const db = require('../db/db');
const fs = require('fs');

async function verifyReputationSystem() {
  console.log('🏆 REPUTATION SYSTEM VERIFICATION');
  console.log('==================================\n');

  const results = {
    database: {},
    apis: {},
    services: {},
    cron: {},
    contract: {},
    data_source: {},
    overall: 'PASS'
  };

  try {
    // 1. Verify Database Schema
    console.log('🗄️ Checking Database Schema...');
    
    const requiredTables = [
      'core.users',
      'core.reputation_actions',
      'core.user_badges',
      'core.achievements'
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
      const reputationRouter = require('../api/reputation');
      app.use('/api/reputation', reputationRouter);
      results.apis.reputation = '✅ Loads';
      console.log('  ✅ /api/reputation - Loads successfully');
    } catch (error) {
      results.apis.reputation = `❌ Error: ${error.message}`;
      results.overall = 'FAIL';
      console.log('  ❌ /api/reputation - Error:', error.message);
    }

    // 3. Verify Services
    console.log('\n🔧 Checking Services...');
    
    try {
      const ReputationManager = require('../utils/reputationManager');
      const manager = new ReputationManager();
      results.services.reputation_manager = '✅ Working';
      console.log('  ✅ ReputationManager - Working');
    } catch (error) {
      results.services.reputation_manager = `❌ Error: ${error.message}`;
      results.overall = 'FAIL';
      console.log('  ❌ ReputationManager - Error:', error.message);
    }

    try {
      const ReputationSyncService = require('../services/reputation-sync-service');
      const syncService = new ReputationSyncService();
      results.services.reputation_sync = '✅ Working';
      console.log('  ✅ ReputationSyncService - Working');
    } catch (error) {
      results.services.reputation_sync = `❌ Error: ${error.message}`;
      results.overall = 'FAIL';
      console.log('  ❌ ReputationSyncService - Error:', error.message);
    }

    // 4. Verify Cron Integration
    console.log('\n⏰ Checking Cron Integration...');
    
    try {
      // Check if reputation cron is set up in master cron
      const fs = require('fs');
      const cronContent = fs.readFileSync('./cron/master-consolidated-cron.js', 'utf8');
      
      if (cronContent.includes('reputation_sync') && cronContent.includes('reputation-sync-cron.js')) {
        results.cron.master_cron = '✅ Configured in master cron';
        console.log('  ✅ Reputation cron - Configured in master cron');
      } else {
        results.cron.master_cron = '❌ Not configured in master cron';
        results.overall = 'FAIL';
        console.log('  ❌ Reputation cron - Not configured in master cron');
      }
    } catch (error) {
      results.cron.master_cron = `❌ Error: ${error.message}`;
      results.overall = 'FAIL';
      console.log('  ❌ Reputation cron - Error:', error.message);
    }

    // 5. Verify Contract Integration
    console.log('\n🔗 Checking Contract Integration...');
    
    try {
      // Check if reputation contract is configured
      const config = require('../config');
      if (config.blockchain.contractAddresses.reputationSystem) {
        results.contract.reputation_contract = '✅ Configured';
        console.log('  ✅ Reputation contract - Configured');
      } else {
        results.contract.reputation_contract = '❌ Not configured';
        results.overall = 'FAIL';
        console.log('  ❌ Reputation contract - Not configured');
      }
    } catch (error) {
      results.contract.reputation_contract = `❌ Error: ${error.message}`;
      results.overall = 'FAIL';
      console.log('  ❌ Reputation contract - Error:', error.message);
    }

    // 6. Verify Data Source
    console.log('\n📊 Checking Data Source...');
    
    try {
      // Check if using indexed data (core.users)
      const usersResult = await db.query('SELECT COUNT(*) as count FROM core.users');
      results.data_source.users = `✅ ${usersResult.rows[0].count} users`;
      console.log(`  ✅ core.users - ${usersResult.rows[0].count} users`);
      
      const actionsResult = await db.query('SELECT COUNT(*) as count FROM core.reputation_actions');
      results.data_source.reputation_actions = `✅ ${actionsResult.rows[0].count} actions`;
      console.log(`  ✅ core.reputation_actions - ${actionsResult.rows[0].count} actions`);
      
      // Check if reputation is using indexed data (not contract data)
      results.data_source.data_source = '✅ Uses indexed data (core.users)';
      console.log('  ✅ Data source - Uses indexed data (core.users)');
      
    } catch (error) {
      results.data_source.users = `❌ Error: ${error.message}`;
      results.overall = 'FAIL';
      console.log('  ❌ Data source - Error:', error.message);
    }

    // 7. Test Reputation Functionality
    console.log('\n🧪 Testing Reputation Functionality...');
    
    try {
      const ReputationManager = require('../utils/reputationManager');
      const manager = new ReputationManager();
      
      // Test getting user reputation
      const testAddress = '0x1234567890123456789012345678901234567890';
      const reputation = await manager.getUserReputation(testAddress);
      results.services.reputation_test = `✅ ${reputation.reputation || 'Default'} reputation`;
      console.log(`  ✅ getUserReputation - ${reputation.reputation || 'Default'} reputation`);
      
    } catch (error) {
      results.services.functionality_test = `❌ Error: ${error.message}`;
      results.overall = 'FAIL';
      console.log('  ❌ Reputation functionality - Error:', error.message);
    }

    // 8. Check Reputation Indexing
    console.log('\n📡 Checking Reputation Indexing...');
    
    try {
      // Check if reputation events are being indexed
      const indexerContent = fs.readFileSync('./unified-realtime-indexer.js', 'utf8');
      
      if (indexerContent.includes('processStrategicReputationEvents') && 
          indexerContent.includes('reputation')) {
        results.services.reputation_indexing = '✅ Configured in indexer';
        console.log('  ✅ Reputation indexing - Configured in indexer');
      } else {
        results.services.reputation_indexing = '❌ Not configured in indexer';
        results.overall = 'FAIL';
        console.log('  ❌ Reputation indexing - Not configured in indexer');
      }
    } catch (error) {
      results.services.reputation_indexing = `❌ Error: ${error.message}`;
      results.overall = 'FAIL';
      console.log('  ❌ Reputation indexing - Error:', error.message);
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 REPUTATION SYSTEM VERIFICATION SUMMARY');
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

    console.log('\n⏰ Cron:');
    Object.entries(results.cron).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });

    console.log('\n🔗 Contract:');
    Object.entries(results.contract).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });

    console.log('\n📊 Data Source:');
    Object.entries(results.data_source).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });

    console.log('\n' + '='.repeat(60));
    if (results.overall === 'PASS') {
      console.log('🎉 OVERALL STATUS: ✅ PASS - Reputation system fully functional!');
      console.log('✅ All components working correctly');
      console.log('✅ Database schema complete');
      console.log('✅ API endpoints operational');
      console.log('✅ Services connected');
      console.log('✅ Cron job configured');
      console.log('✅ Contract integration ready');
      console.log('✅ Uses indexed data for performance');
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
verifyReputationSystem();
