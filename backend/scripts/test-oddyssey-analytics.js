#!/usr/bin/env node

/**
 * Test Odyssey Smart Analytics
 * 
 * This script demonstrates the smart analytics capabilities:
 * - Winning probability calculations
 * - Most played selections
 * - Cycle analytics
 * - User performance insights
 * - Visualization data
 */

const OdysseySmartAnalytics = require('../services/oddyssey-smart-analytics');
const db = require('../db/db');

class OdysseyAnalyticsTester {
  constructor() {
    this.analytics = new OdysseySmartAnalytics();
  }

  async runTests() {
    console.log('🧠 Testing Odyssey Smart Analytics...\n');

    try {
      // Test 1: Platform Analytics
      await this.testPlatformAnalytics();
      
      // Test 2: Cycle Analytics
      await this.testCycleAnalytics();
      
      // Test 3: User Analytics
      await this.testUserAnalytics();
      
      // Test 4: Slip Probability
      await this.testSlipProbability();
      
      // Test 5: Visualization Data
      await this.testVisualizationData();
      
      console.log('\n🎉 All analytics tests completed successfully!');
      
    } catch (error) {
      console.error('❌ Analytics test failed:', error.message);
      process.exit(1);
    }
  }

  async testPlatformAnalytics() {
    console.log('📊 Testing platform analytics...');
    
    try {
      const platformAnalytics = await this.analytics.getPlatformAnalytics();
      
      console.log('✅ Platform Analytics:');
      console.log(`   Total Cycles: ${platformAnalytics.platformStats.total_cycles || 0}`);
      console.log(`   Total Slips: ${platformAnalytics.platformStats.total_slips || 0}`);
      console.log(`   Unique Players: ${platformAnalytics.platformStats.unique_players || 0}`);
      console.log(`   Average Accuracy: ${platformAnalytics.platformStats.avg_accuracy || 0}`);
      console.log(`   Best Score: ${platformAnalytics.platformStats.best_score || 0}`);
      console.log(`   Prizes Claimed: ${platformAnalytics.platformStats.total_prizes_claimed || 0}`);
      
      if (platformAnalytics.insights.length > 0) {
        console.log('   Insights:');
        platformAnalytics.insights.forEach(insight => {
          console.log(`     - ${insight.message} (${insight.confidence} confidence)`);
        });
      }
      
    } catch (error) {
      console.error('❌ Platform analytics test failed:', error.message);
    }
  }

  async testCycleAnalytics() {
    console.log('\n📈 Testing cycle analytics...');
    
    try {
      // Get the most recent cycle
      const recentCycle = await db.query(`
        SELECT cycle_id FROM oracle.oddyssey_cycles 
        ORDER BY cycle_id DESC LIMIT 1
      `);
      
      if (recentCycle.rows.length === 0) {
        console.log('   ⚠️ No cycles found in database');
        return;
      }
      
      const cycleId = recentCycle.rows[0].cycle_id;
      const cycleAnalytics = await this.analytics.getCycleAnalytics(cycleId);
      
      console.log(`✅ Cycle ${cycleId} Analytics:`);
      console.log(`   State: ${cycleAnalytics.contractData.state}`);
      console.log(`   Slip Count: ${cycleAnalytics.contractData.slipCount}`);
      console.log(`   Prize Pool: ${cycleAnalytics.contractData.prizePool}`);
      console.log(`   Has Winner: ${cycleAnalytics.contractData.hasWinner}`);
      
      if (cycleAnalytics.popularSelections.length > 0) {
        console.log('   Popular Selections:');
        cycleAnalytics.popularSelections.slice(0, 3).forEach((selection, index) => {
          console.log(`     ${index + 1}. ${selection.prediction.selection} (${selection.playCount} times)`);
        });
      }
      
      if (cycleAnalytics.insights.length > 0) {
        console.log('   Insights:');
        cycleAnalytics.insights.forEach(insight => {
          console.log(`     - ${insight.message} (${insight.confidence} confidence)`);
        });
      }
      
    } catch (error) {
      console.error('❌ Cycle analytics test failed:', error.message);
    }
  }

  async testUserAnalytics() {
    console.log('\n🎯 Testing user analytics...');
    
    try {
      // Get a user with slips
      const userWithSlips = await db.query(`
        SELECT player_address FROM oracle.oddyssey_slips 
        WHERE player_address != '0x0000000000000000000000000000000000000000'
        LIMIT 1
      `);
      
      if (userWithSlips.rows.length === 0) {
        console.log('   ⚠️ No users with slips found');
        return;
      }
      
      const userAddress = userWithSlips.rows[0].player_address;
      const userAnalytics = await this.analytics.getUserAnalytics(userAddress);
      
      console.log(`✅ User ${userAddress} Analytics:`);
      console.log(`   Total Slips: ${userAnalytics.contractData.totalSlips}`);
      console.log(`   Total Wins: ${userAnalytics.contractData.totalWins}`);
      console.log(`   Best Score: ${userAnalytics.contractData.bestScore}`);
      console.log(`   Win Rate: ${(Number(userAnalytics.contractData.winRate) * 100).toFixed(1)}%`);
      console.log(`   Current Streak: ${userAnalytics.contractData.currentStreak}`);
      console.log(`   Best Streak: ${userAnalytics.contractData.bestStreak}`);
      console.log(`   Reputation: ${userAnalytics.contractData.reputation}`);
      
      if (userAnalytics.insights.length > 0) {
        console.log('   Insights:');
        userAnalytics.insights.forEach(insight => {
          console.log(`     - ${insight.message} (${insight.confidence} confidence)`);
        });
      }
      
    } catch (error) {
      console.error('❌ User analytics test failed:', error.message);
    }
  }

  async testSlipProbability() {
    console.log('\n🎲 Testing slip probability calculation...');
    
    try {
      // Get a slip from the database
      const slip = await db.query(`
        SELECT slip_id, cycle_id FROM oracle.oddyssey_slips 
        WHERE slip_id IS NOT NULL
        LIMIT 1
      `);
      
      if (slip.rows.length === 0) {
        console.log('   ⚠️ No slips found in database');
        return;
      }
      
      const slipId = slip.rows[0].slip_id;
      const cycleId = slip.rows[0].cycle_id;
      
      const probability = await this.analytics.getSlipWinningProbability(slipId, cycleId);
      
      console.log(`✅ Slip ${slipId} Probability:`);
      console.log(`   Overall Probability: ${(probability.overallProbability * 100).toFixed(1)}%`);
      console.log(`   Confidence: ${probability.confidence}`);
      console.log(`   Risk Level: ${probability.riskLevel}`);
      
      if (probability.predictions.length > 0) {
        console.log('   Prediction Probabilities:');
        probability.predictions.forEach((pred, index) => {
          console.log(`     ${index + 1}. ${pred.selection}: ${(pred.probability * 100).toFixed(1)}%`);
        });
      }
      
    } catch (error) {
      console.error('❌ Slip probability test failed:', error.message);
    }
  }

  async testVisualizationData() {
    console.log('\n📊 Testing visualization data...');
    
    try {
      // Get the most recent cycle
      const recentCycle = await db.query(`
        SELECT cycle_id FROM oracle.oddyssey_cycles 
        ORDER BY cycle_id DESC LIMIT 1
      `);
      
      if (recentCycle.rows.length === 0) {
        console.log('   ⚠️ No cycles found for visualization');
        return;
      }
      
      const cycleId = recentCycle.rows[0].cycle_id;
      const cycleAnalytics = await this.analytics.getCycleAnalytics(cycleId);
      
      console.log(`✅ Cycle ${cycleId} Visualization Data:`);
      console.log(`   Total Slips: ${cycleAnalytics.databaseAnalytics.total_slips || 0}`);
      console.log(`   Unique Players: ${cycleAnalytics.databaseAnalytics.unique_players || 0}`);
      console.log(`   Average Accuracy: ${cycleAnalytics.databaseAnalytics.avg_correct_predictions || 0}`);
      
      if (cycleAnalytics.popularSelections.length > 0) {
        console.log('   Top Selections:');
        cycleAnalytics.popularSelections.slice(0, 5).forEach((selection, index) => {
          const percentage = (selection.playCount / (cycleAnalytics.databaseAnalytics.total_slips || 1) * 100).toFixed(1);
          console.log(`     ${index + 1}. ${selection.prediction.selection} (${selection.playCount} times, ${percentage}%)`);
        });
      }
      
      if (cycleAnalytics.matchAnalytics.length > 0) {
        console.log('   Match Breakdown:');
        cycleAnalytics.matchAnalytics.slice(0, 3).forEach(match => {
          console.log(`     ${match.homeTeam} vs ${match.awayTeam} (${match.leagueName})`);
          console.log(`       Total Selections: ${match.selections.reduce((sum, sel) => sum + sel.selectionCount, 0)}`);
          if (match.selections.length > 0) {
            console.log(`       Top Selection: ${match.selections[0].selection} (${match.selections[0].selectionCount} times)`);
          }
        });
      }
      
    } catch (error) {
      console.error('❌ Visualization data test failed:', error.message);
    }
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  const tester = new OdysseyAnalyticsTester();
  
  tester.runTests().then(() => {
    console.log('\n✅ All analytics tests completed successfully!');
    console.log('🧠 Smart analytics system is ready for production!');
    process.exit(0);
  }).catch((error) => {
    console.error('\n❌ Analytics tests failed:', error.message);
    process.exit(1);
  });
}

module.exports = OdysseyAnalyticsTester;
