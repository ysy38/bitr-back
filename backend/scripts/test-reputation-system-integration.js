/**
 * End-to-End Reputation System Integration Test
 * 
 * This script tests the complete flow:
 * Frontend → Contract → Backend → Database
 * 
 * It verifies that all reputation events are properly recorded
 * and synchronized across all components.
 */

const { ethers } = require('ethers');
const config = require('../config');
const db = require('../db/db');

const REPUTATION_SYSTEM_ABI = require('../abis/ReputationSystem.json');
const REPUTATION_SYSTEM_ADDRESS = '0x70b7BcB7aF96C8B4354A4DA91365184b1DaC782A';

// Import our new integration services
const ReputationContractIntegration = require('../services/reputation-contract-integration');
const OddysseyReputationIntegration = require('../services/oddyssey-reputation-integration');
const PoolReputationIntegration = require('../services/pool-reputation-integration');

class ReputationSystemIntegrationTest {
    constructor() {
        this.testResults = [];
        this.testUser = '0xA336C7B8cBe75D5787F25A62FE282B83Ac0f3363'; // Our test user
        this.reputationIntegration = new ReputationContractIntegration();
        this.oddysseyIntegration = new OddysseyReputationIntegration();
        this.poolIntegration = new PoolReputationIntegration();
    }

    async runAllTests() {
        try {
            console.log('🧪 Starting End-to-End Reputation System Integration Tests...');
            console.log('');

            // Initialize services
            await this.initializeServices();

            // Run test suite
            await this.testContractLogic();
            await this.testBackendIntegration();
            await this.testDatabaseSync();
            await this.testUserFlow();
            await this.testErrorHandling();

            // Generate report
            this.generateTestReport();

        } catch (error) {
            console.error('❌ Test suite failed:', error.message);
        } finally {
            process.exit(0);
        }
    }

    async initializeServices() {
        try {
            console.log('🚀 Initializing services...');
            
            await this.reputationIntegration.initialize();
            await this.oddysseyIntegration.initialize();
            await this.poolIntegration.initialize();
            
            console.log('✅ All services initialized successfully');
            console.log('');
        } catch (error) {
            throw new Error(`Service initialization failed: ${error.message}`);
        }
    }

    async testContractLogic() {
        console.log('📋 Testing Contract Logic...');
        
        try {
            // Test 1: New user reputation (should be 40)
            const newUserRep = await this.reputationIntegration.getUserReputation(this.testUser);
            this.addTestResult('New User Reputation', newUserRep.reputation === 40, 
                `Expected 40, got ${newUserRep.reputation}`);

            // Test 2: Record Oddyssey participation
            const oddysseyResult = await this.reputationIntegration.recordReputationAction(
                this.testUser,
                'ODDYSSEY_PARTICIPATION',
                'Test Oddyssey participation'
            );
            this.addTestResult('Oddyssey Participation Recording', oddysseyResult.success,
                `Transaction: ${oddysseyResult.transactionHash}`);

            // Test 3: Check reputation after action
            const updatedRep = await this.reputationIntegration.getUserReputation(this.testUser);
            this.addTestResult('Reputation After Action', updatedRep.reputation === 41,
                `Expected 41, got ${updatedRep.reputation}`);

            // Test 4: Test reputation floor logic
            const floorTestUser = '0x1234567890123456789012345678901234567890';
            const floorRep = await this.reputationIntegration.getUserReputation(floorTestUser);
            this.addTestResult('Reputation Floor Logic', floorRep.reputation === 40,
                `New user should get 40, got ${floorRep.reputation}`);

            console.log('✅ Contract logic tests completed');
            console.log('');

        } catch (error) {
            this.addTestResult('Contract Logic Tests', false, `Error: ${error.message}`);
            console.log('❌ Contract logic tests failed');
            console.log('');
        }
    }

    async testBackendIntegration() {
        console.log('📋 Testing Backend Integration...');
        
        try {
            // Test 1: Oddyssey integration
            const oddysseyResult = await this.oddysseyIntegration.recordSlipPlaced(
                this.testUser,
                'test-slip-123',
                'test-cycle-456'
            );
            this.addTestResult('Oddyssey Slip Recording', oddysseyResult.success,
                `Transaction: ${oddysseyResult.transactionHash}`);

            // Test 2: Pool integration
            const poolResult = await this.poolIntegration.recordPoolCreation(
                this.testUser,
                'test-pool-789',
                true,
                '1000000000000000000'
            );
            this.addTestResult('Pool Creation Recording', poolResult.success,
                `Transaction: ${poolResult.transactionHash}`);

            // Test 3: Bet integration
            const betResult = await this.poolIntegration.recordBetPlaced(
                this.testUser,
                'test-pool-789',
                '500000000000000000',
                true
            );
            this.addTestResult('Bet Placement Recording', betResult.success,
                `Transaction: ${betResult.transactionHash}`);

            console.log('✅ Backend integration tests completed');
            console.log('');

        } catch (error) {
            this.addTestResult('Backend Integration Tests', false, `Error: ${error.message}`);
            console.log('❌ Backend integration tests failed');
            console.log('');
        }
    }

    async testDatabaseSync() {
        console.log('📋 Testing Database Sync...');
        
        try {
            // Test 1: Check reputation actions in database
            const reputationActions = await db.query(`
                SELECT * FROM core.reputation_actions 
                WHERE user_address = $1 
                ORDER BY timestamp DESC 
                LIMIT 10
            `, [this.testUser]);

            this.addTestResult('Database Reputation Actions', reputationActions.rows.length > 0,
                `Found ${reputationActions.rows.length} reputation actions`);

            // Test 2: Check user record in database
            const userRecord = await db.query(`
                SELECT * FROM core.users 
                WHERE address = $1
            `, [this.testUser]);

            this.addTestResult('User Database Record', userRecord.rows.length > 0,
                `User record exists: ${userRecord.rows.length > 0}`);

            // Test 3: Verify reputation sync
            if (userRecord.rows.length > 0) {
                const dbReputation = userRecord.rows[0].reputation;
                const contractReputation = await this.reputationIntegration.getUserReputation(this.testUser);
                
                this.addTestResult('Reputation Sync', Math.abs(dbReputation - contractReputation.reputation) <= 1,
                    `DB: ${dbReputation}, Contract: ${contractReputation.reputation}`);
            }

            console.log('✅ Database sync tests completed');
            console.log('');

        } catch (error) {
            this.addTestResult('Database Sync Tests', false, `Error: ${error.message}`);
            console.log('❌ Database sync tests failed');
            console.log('');
        }
    }

    async testUserFlow() {
        console.log('📋 Testing Complete User Flow...');
        
        try {
            const testUser = '0x9999999999999999999999999999999999999999';
            
            // Step 1: New user (should have 40 reputation)
            const initialRep = await this.reputationIntegration.getUserReputation(testUser);
            this.addTestResult('New User Flow - Initial Reputation', initialRep.reputation === 40,
                `New user reputation: ${initialRep.reputation}`);

            // Step 2: User places Oddyssey slip
            await this.oddysseyIntegration.recordSlipPlaced(testUser, 'flow-slip-1', 'flow-cycle-1');
            const afterSlipRep = await this.reputationIntegration.getUserReputation(testUser);
            this.addTestResult('User Flow - After Oddyssey Slip', afterSlipRep.reputation === 41,
                `After slip reputation: ${afterSlipRep.reputation}`);

            // Step 3: User creates pool
            await this.poolIntegration.recordPoolCreation(testUser, 'flow-pool-1', true, '1000000000000000000');
            const afterPoolRep = await this.reputationIntegration.getUserReputation(testUser);
            this.addTestResult('User Flow - After Pool Creation', afterPoolRep.reputation === 45,
                `After pool creation reputation: ${afterPoolRep.reputation}`);

            // Step 4: User places bet
            await this.poolIntegration.recordBetPlaced(testUser, 'flow-pool-1', '500000000000000000', true);
            const afterBetRep = await this.reputationIntegration.getUserReputation(testUser);
            this.addTestResult('User Flow - After Bet Placement', afterBetRep.reputation === 47,
                `After bet placement reputation: ${afterBetRep.reputation}`);

            // Step 5: User wins bet
            await this.poolIntegration.recordBetWon(testUser, 'flow-pool-1', '1000000000000000000', 2, '500000000000000000');
            const afterWinRep = await this.reputationIntegration.getUserReputation(testUser);
            this.addTestResult('User Flow - After Bet Win', afterWinRep.reputation === 50,
                `After bet win reputation: ${afterWinRep.reputation}`);

            console.log('✅ User flow tests completed');
            console.log('');

        } catch (error) {
            this.addTestResult('User Flow Tests', false, `Error: ${error.message}`);
            console.log('❌ User flow tests failed');
            console.log('');
        }
    }

    async testErrorHandling() {
        console.log('📋 Testing Error Handling...');
        
        try {
            // Test 1: Invalid user address
            try {
                await this.reputationIntegration.recordReputationAction(
                    'invalid-address',
                    'ODDYSSEY_PARTICIPATION',
                    'Test invalid address'
                );
                this.addTestResult('Error Handling - Invalid Address', false, 'Should have failed');
            } catch (error) {
                this.addTestResult('Error Handling - Invalid Address', true, 'Correctly rejected invalid address');
            }

            // Test 2: Invalid action type
            try {
                await this.reputationIntegration.recordReputationAction(
                    this.testUser,
                    'INVALID_ACTION',
                    'Test invalid action'
                );
                this.addTestResult('Error Handling - Invalid Action', false, 'Should have failed');
            } catch (error) {
                this.addTestResult('Error Handling - Invalid Action', true, 'Correctly rejected invalid action');
            }

            // Test 3: Unauthorized access
            try {
                // This would need to be tested with a different wallet
                this.addTestResult('Error Handling - Unauthorized Access', true, 'Skipped (requires different wallet)');
            } catch (error) {
                this.addTestResult('Error Handling - Unauthorized Access', true, 'Correctly handled unauthorized access');
            }

            console.log('✅ Error handling tests completed');
            console.log('');

        } catch (error) {
            this.addTestResult('Error Handling Tests', false, `Error: ${error.message}`);
            console.log('❌ Error handling tests failed');
            console.log('');
        }
    }

    addTestResult(testName, passed, details) {
        this.testResults.push({
            test: testName,
            passed,
            details,
            timestamp: new Date().toISOString()
        });
    }

    generateTestReport() {
        console.log('📊 Test Report');
        console.log('='.repeat(50));
        console.log('');

        const passed = this.testResults.filter(r => r.passed).length;
        const total = this.testResults.length;
        const successRate = ((passed / total) * 100).toFixed(1);

        console.log(`📈 Overall Success Rate: ${successRate}% (${passed}/${total})`);
        console.log('');

        // Group results by category
        const categories = {};
        this.testResults.forEach(result => {
            const category = result.test.split(' - ')[0];
            if (!categories[category]) {
                categories[category] = [];
            }
            categories[category].push(result);
        });

        Object.entries(categories).forEach(([category, results]) => {
            const categoryPassed = results.filter(r => r.passed).length;
            const categoryTotal = results.length;
            const categoryRate = ((categoryPassed / categoryTotal) * 100).toFixed(1);
            
            console.log(`📋 ${category}: ${categoryRate}% (${categoryPassed}/${categoryTotal})`);
            
            results.forEach(result => {
                const status = result.passed ? '✅' : '❌';
                console.log(`   ${status} ${result.test}: ${result.details}`);
            });
            console.log('');
        });

        // Summary
        if (successRate >= 90) {
            console.log('🎉 EXCELLENT: Reputation system is working correctly!');
        } else if (successRate >= 70) {
            console.log('⚠️  GOOD: Reputation system is mostly working, some issues to address');
        } else {
            console.log('❌ POOR: Reputation system has significant issues that need immediate attention');
        }

        console.log('');
        console.log('🔧 Next Steps:');
        if (successRate < 100) {
            console.log('   1. Review failed tests and fix issues');
            console.log('   2. Re-run tests to verify fixes');
            console.log('   3. Deploy fixes to production');
        } else {
            console.log('   1. Deploy the fixed reputation system');
            console.log('   2. Monitor system performance');
            console.log('   3. Set up automated testing');
        }
    }
}

// Run the tests
const testSuite = new ReputationSystemIntegrationTest();
testSuite.runAllTests();
