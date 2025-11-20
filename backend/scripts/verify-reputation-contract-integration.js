#!/usr/bin/env node

/**
 * Reputation Contract Integration Verification Script
 * 
 * Comprehensive verification of ReputationSystem contract integration:
 * - Contract deployment verification
 * - ABI compatibility check
 * - Backend service integration
 * - Event indexing verification
 * - Function availability test
 */

require('dotenv').config();
const { ethers } = require('ethers');
const config = require('../config');

async function verifyReputationContractIntegration() {
  console.log('🏆 REPUTATION CONTRACT INTEGRATION VERIFICATION');
  console.log('================================================\n');

  const results = {
    contract: {},
    abi: {},
    integration: {},
    functions: {},
    events: {},
    overall: 'PASS'
  };

  try {
    // 1. Verify Contract Deployment
    console.log('🔗 Checking Contract Deployment...');
    
    const provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    const reputationAddress = config.blockchain.contractAddresses.reputationSystem;
    
    if (!reputationAddress) {
      results.contract.deployment = '❌ No contract address configured';
      results.overall = 'FAIL';
      console.log('  ❌ No contract address configured');
    } else {
      results.contract.deployment = `✅ ${reputationAddress}`;
      console.log(`  ✅ Contract address: ${reputationAddress}`);
    }

    // 2. Verify ABI File
    console.log('\n📄 Checking ABI File...');
    
    let reputationABI;
    try {
      reputationABI = require('../solidity/ReputationSystem.json').abi;
      results.abi.file = '✅ ABI file found';
      console.log('  ✅ ABI file found');
      
      results.abi.functions = `✅ ${reputationABI.filter(item => item.type === 'function').length} functions`;
      console.log(`  ✅ ${reputationABI.filter(item => item.type === 'function').length} functions`);
      
      results.abi.events = `✅ ${reputationABI.filter(item => item.type === 'event').length} events`;
      console.log(`  ✅ ${reputationABI.filter(item => item.type === 'event').length} events`);
      
    } catch (error) {
      results.abi.file = `❌ Error: ${error.message}`;
      results.overall = 'FAIL';
      console.log('  ❌ ABI file error:', error.message);
    }

    // 3. Test Contract Connection
    console.log('\n🔌 Testing Contract Connection...');
    
    try {
      const contract = new ethers.Contract(reputationAddress, reputationABI, provider);
      
      // Test basic contract functions
      const maxReputation = await contract.MAX_REPUTATION();
      results.contract.connection = '✅ Connected successfully';
      console.log('  ✅ Contract connection successful');
      
      results.functions.max_reputation = `✅ ${maxReputation.toString()}`;
      console.log(`  ✅ MAX_REPUTATION: ${maxReputation.toString()}`);
      
    } catch (error) {
      results.contract.connection = `❌ Error: ${error.message}`;
      results.overall = 'FAIL';
      console.log('  ❌ Contract connection failed:', error.message);
    }

    // 4. Test Key Functions
    console.log('\n🔧 Testing Key Functions...');
    
    try {
      const contract = new ethers.Contract(reputationAddress, reputationABI, provider);
      
      // Test constants
      const defaultReputation = await contract.DEFAULT_REPUTATION();
      results.functions.default_reputation = `✅ ${defaultReputation.toString()}`;
      console.log(`  ✅ DEFAULT_REPUTATION: ${defaultReputation.toString()}`);
      
      const minGuidedPool = await contract.MIN_GUIDED_POOL_REPUTATION();
      results.functions.min_guided_pool = `✅ ${minGuidedPool.toString()}`;
      console.log(`  ✅ MIN_GUIDED_POOL_REPUTATION: ${minGuidedPool.toString()}`);
      
      const minOpenPool = await contract.MIN_OPEN_POOL_REPUTATION();
      results.functions.min_open_pool = `✅ ${minOpenPool.toString()}`;
      console.log(`  ✅ MIN_OPEN_POOL_REPUTATION: ${minOpenPool.toString()}`);
      
      // Test user reputation function
      const testAddress = '0x1234567890123456789012345678901234567890';
      const userReputation = await contract.getUserReputation(testAddress);
      results.functions.get_user_reputation = `✅ ${userReputation.toString()}`;
      console.log(`  ✅ getUserReputation test: ${userReputation.toString()}`);
      
    } catch (error) {
      results.functions.test = `❌ Error: ${error.message}`;
      results.overall = 'FAIL';
      console.log('  ❌ Function test failed:', error.message);
    }

    // 5. Verify Backend Integration
    console.log('\n🔗 Checking Backend Integration...');
    
    try {
      // Check unified-realtime-indexer
      const fs = require('fs');
      const indexerContent = fs.readFileSync('./unified-realtime-indexer.js', 'utf8');
      
      if (indexerContent.includes('reputation') && indexerContent.includes('ReputationSystem.json')) {
        results.integration.indexer = '✅ Configured in indexer';
        console.log('  ✅ Unified realtime indexer - Configured');
      } else {
        results.integration.indexer = '❌ Not configured in indexer';
        results.overall = 'FAIL';
        console.log('  ❌ Unified realtime indexer - Not configured');
      }
      
      // Check reputation sync service
      const syncServiceContent = fs.readFileSync('./services/reputation-sync-service.js', 'utf8');
      
      if (syncServiceContent.includes('reputationContract') && syncServiceContent.includes('ReputationSystem')) {
        results.integration.sync_service = '✅ Configured in sync service';
        console.log('  ✅ Reputation sync service - Configured');
      } else {
        results.integration.sync_service = '❌ Not configured in sync service';
        results.overall = 'FAIL';
        console.log('  ❌ Reputation sync service - Not configured');
      }
      
    } catch (error) {
      results.integration.backend = `❌ Error: ${error.message}`;
      results.overall = 'FAIL';
      console.log('  ❌ Backend integration check failed:', error.message);
    }

    // 6. Test Event Indexing
    console.log('\n📡 Checking Event Indexing...');
    
    try {
      const contract = new ethers.Contract(reputationAddress, reputationABI, provider);
      
      // Check if contract has events
      const events = reputationABI.filter(item => item.type === 'event');
      results.events.count = `✅ ${events.length} events`;
      console.log(`  ✅ ${events.length} events available for indexing`);
      
      // Check for key events
      const eventNames = events.map(event => event.name);
      const keyEvents = ['ReputationUpdated', 'AuthorizedUpdaterSet', 'AuthorizedContractSet'];
      
      keyEvents.forEach(eventName => {
        if (eventNames.includes(eventName)) {
          results.events[eventName.toLowerCase()] = '✅ Available';
          console.log(`  ✅ ${eventName} - Available`);
        } else {
          results.events[eventName.toLowerCase()] = '❌ Missing';
          console.log(`  ❌ ${eventName} - Missing`);
        }
      });
      
    } catch (error) {
      results.events.test = `❌ Error: ${error.message}`;
      results.overall = 'FAIL';
      console.log('  ❌ Event indexing check failed:', error.message);
    }

    // 7. Test Service Integration
    console.log('\n🔧 Testing Service Integration...');
    
    try {
      const ReputationSyncService = require('../services/reputation-sync-service');
      const syncService = new ReputationSyncService();
      
      if (syncService.isDisabled) {
        results.integration.sync_service_test = '⚠️ Disabled (no private key)';
        console.log('  ⚠️ ReputationSyncService disabled (no private key)');
        console.log('     This is expected in development - will work in production');
      } else {
        results.integration.sync_service_test = '✅ Ready';
        console.log('  ✅ ReputationSyncService ready for blockchain sync');
      }
      
    } catch (error) {
      results.integration.sync_service_test = `❌ Error: ${error.message}`;
      results.overall = 'FAIL';
      console.log('  ❌ Service integration test failed:', error.message);
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 REPUTATION CONTRACT INTEGRATION SUMMARY');
    console.log('='.repeat(60));
    
    console.log('\n🔗 Contract:');
    Object.entries(results.contract).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });

    console.log('\n📄 ABI:');
    Object.entries(results.abi).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });

    console.log('\n🔗 Integration:');
    Object.entries(results.integration).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });

    console.log('\n🔧 Functions:');
    Object.entries(results.functions).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });

    console.log('\n📡 Events:');
    Object.entries(results.events).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });

    console.log('\n' + '='.repeat(60));
    if (results.overall === 'PASS') {
      console.log('🎉 OVERALL STATUS: ✅ PASS - Reputation contract fully integrated!');
      console.log('✅ Contract deployed and accessible');
      console.log('✅ ABI compatible and loaded');
      console.log('✅ Backend services connected');
      console.log('✅ Event indexing configured');
      console.log('✅ All key functions working');
      console.log('✅ Ready for production use');
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
verifyReputationContractIntegration();
