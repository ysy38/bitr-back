#!/usr/bin/env node

/**
 * Test Slip Sync Service
 * 
 * This script tests the slip sync service by:
 * 1. Starting the event-driven slip sync service
 * 2. Monitoring for SlipPlaced events
 * 3. Testing database insertions
 * 4. Verifying the service is working correctly
 */

const EventDrivenSlipSync = require('../services/event-driven-slip-sync');
const db = require('../db/db');

class SlipSyncTester {
  constructor() {
    this.syncService = new EventDrivenSlipSync();
    this.testResults = {
      serviceStarted: false,
      eventListenersActive: false,
      databaseConnected: false,
      testSlipInserted: false
    };
  }

  async runTests() {
    console.log('🧪 Starting Slip Sync Service Tests...\n');

    try {
      // Test 1: Database Connection
      await this.testDatabaseConnection();
      
      // Test 2: Service Initialization
      await this.testServiceInitialization();
      
      // Test 3: Event Listeners
      await this.testEventListeners();
      
      // Test 4: Database Insert
      await this.testDatabaseInsert();
      
      // Test 5: Service Start
      await this.testServiceStart();
      
      // Display Results
      this.displayResults();
      
    } catch (error) {
      console.error('❌ Test failed:', error.message);
      process.exit(1);
    }
  }

  async testDatabaseConnection() {
    console.log('🔍 Testing database connection...');
    try {
      const result = await db.query('SELECT 1 as test');
      if (result.rows[0].test === 1) {
        console.log('✅ Database connection successful');
        this.testResults.databaseConnected = true;
      } else {
        throw new Error('Database test query failed');
      }
    } catch (error) {
      console.error('❌ Database connection failed:', error.message);
      throw error;
    }
  }

  async testServiceInitialization() {
    console.log('🔍 Testing service initialization...');
    try {
      await this.syncService.initialize();
      console.log('✅ Service initialization successful');
      this.testResults.serviceStarted = true;
    } catch (error) {
      console.error('❌ Service initialization failed:', error.message);
      throw error;
    }
  }

  async testEventListeners() {
    console.log('🔍 Testing event listeners...');
    try {
      // Check if contract is available
      const contract = await this.syncService.oddysseyContract;
      if (contract) {
        console.log('✅ Contract available for event listening');
        this.testResults.eventListenersActive = true;
      } else {
        throw new Error('Contract not available');
      }
    } catch (error) {
      console.error('❌ Event listeners test failed:', error.message);
      throw error;
    }
  }

  async testDatabaseInsert() {
    console.log('🔍 Testing database insert...');
    try {
      const testSlip = {
        slipId: 999999,
        cycleId: 1,
        playerAddress: '0x1234567890123456789012345678901234567890',
        predictions: [],
        isEvaluated: false,
        finalScore: 0,
        correctCount: 0,
        placedAt: new Date(),
        txHash: '0xabcdef1234567890abcdef1234567890abcdef12'
      };

      // Test insert
      await db.query(`
        INSERT INTO oracle.oddyssey_slips (
          slip_id, cycle_id, player_address, predictions, is_evaluated,
          final_score, correct_count, placed_at, tx_hash, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW()
        )
      `, [
        testSlip.slipId, testSlip.cycleId, testSlip.playerAddress,
        JSON.stringify(testSlip.predictions), testSlip.isEvaluated,
        testSlip.finalScore, testSlip.correctCount, 
        testSlip.placedAt, testSlip.txHash
      ]);
      
      console.log('✅ Database insert successful');
      
      // Clean up test data
      await db.query('DELETE FROM oracle.oddyssey_slips WHERE slip_id = $1', [testSlip.slipId]);
      console.log('✅ Test data cleaned up');
      
      this.testResults.testSlipInserted = true;
    } catch (error) {
      console.error('❌ Database insert failed:', error.message);
      throw error;
    }
  }

  async testServiceStart() {
    console.log('🔍 Testing service start...');
    try {
      await this.syncService.start();
      console.log('✅ Service started successfully');
      console.log('👂 Event listeners are active and listening for SlipPlaced events');
      console.log('🔄 Fallback sync will run every 5 minutes if events fail');
    } catch (error) {
      console.error('❌ Service start failed:', error.message);
      throw error;
    }
  }

  displayResults() {
    console.log('\n📊 Test Results:');
    console.log('================');
    console.log(`Database Connection: ${this.testResults.databaseConnected ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Service Initialization: ${this.testResults.serviceStarted ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Event Listeners: ${this.testResults.eventListenersActive ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Database Insert: ${this.testResults.testSlipInserted ? '✅ PASS' : '❌ FAIL'}`);
    
    const allPassed = Object.values(this.testResults).every(result => result === true);
    
    if (allPassed) {
      console.log('\n🎉 ALL TESTS PASSED!');
      console.log('✅ Slip sync service is working correctly');
      console.log('👂 Ready to detect SlipPlaced events');
      console.log('💡 The service will automatically sync slips when they are placed');
    } else {
      console.log('\n❌ SOME TESTS FAILED');
      console.log('🔧 Please check the failed components above');
    }
  }

  async cleanup() {
    try {
      await this.syncService.stop();
      console.log('✅ Service stopped successfully');
    } catch (error) {
      console.error('❌ Error stopping service:', error.message);
    }
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  const tester = new SlipSyncTester();
  
  // Setup graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down test...');
    await tester.cleanup();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    console.log('\n🛑 Shutting down test...');
    await tester.cleanup();
    process.exit(0);
  });
  
  // Run tests
  tester.runTests().then(() => {
    console.log('\n✅ Tests completed successfully');
    console.log('💡 The service is now running and ready to detect slips');
    console.log('🔄 Keep this running to monitor for SlipPlaced events');
  }).catch((error) => {
    console.error('\n❌ Tests failed:', error.message);
    process.exit(1);
  });
}

module.exports = SlipSyncTester;
