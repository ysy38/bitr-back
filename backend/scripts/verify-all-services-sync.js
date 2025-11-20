#!/usr/bin/env node

/**
 * Comprehensive Service Sync Verification
 * Verifies all backend services are properly configured with new contracts
 */

require('dotenv').config();
const { ethers } = require('ethers');
const config = require('../config');
const db = require('../db/db');

class ServiceSyncVerifier {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    this.results = {
      contracts: {},
      services: {},
      frontend: {},
      recommendations: []
    };
  }

  async verifyAll() {
    console.log('🔍 COMPREHENSIVE SERVICE SYNC VERIFICATION');
    console.log('==========================================\n');

    try {
      await db.connect();
      console.log('✅ Database connected\n');

      // 1. Verify Contract Addresses
      await this.verifyContractAddresses();
      
      // 2. Verify Service Configurations
      await this.verifyServiceConfigurations();
      
      // 3. Verify Frontend Data Requirements
      await this.verifyFrontendRequirements();
      
      // 4. Generate Recommendations
      this.generateRecommendations();
      
      // 5. Display Results
      this.displayResults();

    } catch (error) {
      console.error('❌ Verification failed:', error);
    } finally {
      if (db.end) {
        await db.end();
      }
    }
  }

  async verifyContractAddresses() {
    console.log('📋 VERIFYING CONTRACT ADDRESSES');
    console.log('===============================');

    const contracts = config.blockchain.contractAddresses;
    
    for (const [name, address] of Object.entries(contracts)) {
      try {
        const code = await this.provider.getCode(address);
        const isDeployed = code !== '0x';
        
        this.results.contracts[name] = {
          address,
          deployed: isDeployed,
          status: isDeployed ? '✅ DEPLOYED' : '❌ NOT DEPLOYED'
        };
        
        console.log(`${name}: ${address} - ${isDeployed ? '✅ DEPLOYED' : '❌ NOT DEPLOYED'}`);
      } catch (error) {
        this.results.contracts[name] = {
          address,
          deployed: false,
          status: '❌ ERROR',
          error: error.message
        };
        console.log(`${name}: ${address} - ❌ ERROR: ${error.message}`);
      }
    }
    console.log('');
  }

  async verifyServiceConfigurations() {
    console.log('🔧 VERIFYING SERVICE CONFIGURATIONS');
    console.log('===================================');

    // Check Analytics Service
    try {
      const analyticsResult = await db.query(`
        SELECT COUNT(*) as pool_count FROM oracle.pools
      `);
      this.results.services.analytics = {
        status: '✅ CONFIGURED',
        poolCount: analyticsResult.rows[0].pool_count
      };
      console.log('Analytics Service: ✅ CONFIGURED');
    } catch (error) {
      this.results.services.analytics = {
        status: '❌ ERROR',
        error: error.message
      };
      console.log('Analytics Service: ❌ ERROR:', error.message);
    }

    // Check Leaderboard Service
    try {
      const leaderboardResult = await db.query(`
        SELECT COUNT(*) as cache_count FROM analytics.leaderboard_cache
      `);
      this.results.services.leaderboard = {
        status: '✅ CONFIGURED',
        cacheCount: leaderboardResult.rows[0].cache_count
      };
      console.log('Leaderboard Service: ✅ CONFIGURED');
    } catch (error) {
      this.results.services.leaderboard = {
        status: '❌ ERROR',
        error: error.message
      };
      console.log('Leaderboard Service: ❌ ERROR:', error.message);
    }

    // Check Reputation Service
    try {
      const reputationResult = await db.query(`
        SELECT COUNT(*) as action_count FROM core.reputation_actions
      `);
      this.results.services.reputation = {
        status: '✅ CONFIGURED',
        actionCount: reputationResult.rows[0].action_count
      };
      console.log('Reputation Service: ✅ CONFIGURED');
    } catch (error) {
      this.results.services.reputation = {
        status: '❌ ERROR',
        error: error.message
      };
      console.log('Reputation Service: ❌ ERROR:', error.message);
    }

    // Check Oddyssey Service
    try {
      const oddysseyResult = await db.query(`
        SELECT COUNT(*) as cycle_count FROM oracle.oddyssey_cycles
      `);
      this.results.services.oddyssey = {
        status: '✅ CONFIGURED',
        cycleCount: oddysseyResult.rows[0].cycle_count
      };
      console.log('Oddyssey Service: ✅ CONFIGURED');
    } catch (error) {
      this.results.services.oddyssey = {
        status: '❌ ERROR',
        error: error.message
      };
      console.log('Oddyssey Service: ❌ ERROR:', error.message);
    }

    console.log('');
  }

  async verifyFrontendRequirements() {
    console.log('🎨 VERIFYING FRONTEND DATA REQUIREMENTS');
    console.log('=======================================');

    // Check Dashboard Requirements
    try {
      const dashboardData = await db.query(`
        SELECT 
          COUNT(*) as total_pools,
          COUNT(CASE WHEN event_start_time > EXTRACT(EPOCH FROM NOW()) THEN 1 END) as active_pools,
          SUM(total_bettor_stake) as total_volume
        FROM oracle.pools
      `);
      
      this.results.frontend.dashboard = {
        status: '✅ DATA AVAILABLE',
        totalPools: dashboardData.rows[0].total_pools,
        activePools: dashboardData.rows[0].active_pools,
        totalVolume: dashboardData.rows[0].total_volume
      };
      console.log('Dashboard Data: ✅ AVAILABLE');
    } catch (error) {
      this.results.frontend.dashboard = {
        status: '❌ ERROR',
        error: error.message
      };
      console.log('Dashboard Data: ❌ ERROR:', error.message);
    }

    // Check Markets Page Requirements
    try {
      const marketsData = await db.query(`
        SELECT 
          COUNT(*) as pool_count,
          COUNT(DISTINCT category) as category_count,
          COUNT(DISTINCT creator_address) as creator_count
        FROM oracle.pools
      `);
      
      this.results.frontend.markets = {
        status: '✅ DATA AVAILABLE',
        poolCount: marketsData.rows[0].pool_count,
        categoryCount: marketsData.rows[0].category_count,
        creatorCount: marketsData.rows[0].creator_count
      };
      console.log('Markets Data: ✅ AVAILABLE');
    } catch (error) {
      this.results.frontend.markets = {
        status: '❌ ERROR',
        error: error.message
      };
      console.log('Markets Data: ❌ ERROR:', error.message);
    }

    // Check Profile Page Requirements
    try {
      const profileData = await db.query(`
        SELECT 
          COUNT(*) as user_count,
          COUNT(DISTINCT bettor_address) as bettor_count
        FROM oracle.bets
      `);
      
      this.results.frontend.profile = {
        status: '✅ DATA AVAILABLE',
        userCount: profileData.rows[0].user_count,
        bettorCount: profileData.rows[0].bettor_count
      };
      console.log('Profile Data: ✅ AVAILABLE');
    } catch (error) {
      this.results.frontend.profile = {
        status: '❌ ERROR',
        error: error.message
      };
      console.log('Profile Data: ❌ ERROR:', error.message);
    }

    // Check Oddyssey Page Requirements
    try {
      const oddysseyData = await db.query(`
        SELECT 
          COUNT(*) as slip_count,
          COUNT(DISTINCT player_address) as player_count
        FROM oracle.oddyssey_slips
      `);
      
      this.results.frontend.oddyssey = {
        status: '✅ DATA AVAILABLE',
        slipCount: oddysseyData.rows[0].slip_count,
        playerCount: oddysseyData.rows[0].player_count
      };
      console.log('Oddyssey Data: ✅ AVAILABLE');
    } catch (error) {
      this.results.frontend.oddyssey = {
        status: '❌ ERROR',
        error: error.message
      };
      console.log('Oddyssey Data: ❌ ERROR:', error.message);
    }

    console.log('');
  }

  generateRecommendations() {
    console.log('💡 RECOMMENDATIONS');
    console.log('==================');

    // Contract recommendations
    const undeployedContracts = Object.entries(this.results.contracts)
      .filter(([name, result]) => !result.deployed)
      .map(([name]) => name);

    if (undeployedContracts.length > 0) {
      this.results.recommendations.push({
        type: 'CRITICAL',
        message: `Deploy missing contracts: ${undeployedContracts.join(', ')}`,
        action: 'Run deployment script to deploy missing contracts'
      });
    }

    // Service recommendations
    const errorServices = Object.entries(this.results.services)
      .filter(([name, result]) => result.status.includes('ERROR'))
      .map(([name]) => name);

    if (errorServices.length > 0) {
      this.results.recommendations.push({
        type: 'HIGH',
        message: `Fix service errors: ${errorServices.join(', ')}`,
        action: 'Check service configurations and database connections'
      });
    }

    // Frontend recommendations
    const errorFrontend = Object.entries(this.results.frontend)
      .filter(([name, result]) => result.status.includes('ERROR'))
      .map(([name]) => name);

    if (errorFrontend.length > 0) {
      this.results.recommendations.push({
        type: 'MEDIUM',
        message: `Fix frontend data issues: ${errorFrontend.join(', ')}`,
        action: 'Check database schema and API endpoints'
      });
    }

    // Display recommendations
    this.results.recommendations.forEach((rec, index) => {
      const icon = rec.type === 'CRITICAL' ? '🚨' : rec.type === 'HIGH' ? '⚠️' : '💡';
      console.log(`${icon} ${rec.message}`);
      console.log(`   Action: ${rec.action}\n`);
    });
  }

  displayResults() {
    console.log('📊 VERIFICATION SUMMARY');
    console.log('========================');

    const totalContracts = Object.keys(this.results.contracts).length;
    const deployedContracts = Object.values(this.results.contracts).filter(r => r.deployed).length;
    
    const totalServices = Object.keys(this.results.services).length;
    const workingServices = Object.values(this.results.services).filter(r => r.status.includes('✅')).length;
    
    const totalFrontend = Object.keys(this.results.frontend).length;
    const workingFrontend = Object.values(this.results.frontend).filter(r => r.status.includes('✅')).length;

    console.log(`Contracts: ${deployedContracts}/${totalContracts} deployed`);
    console.log(`Services: ${workingServices}/${totalServices} working`);
    console.log(`Frontend: ${workingFrontend}/${totalFrontend} working`);
    console.log(`Recommendations: ${this.results.recommendations.length}`);

    if (this.results.recommendations.length === 0) {
      console.log('\n🎉 ALL SYSTEMS OPERATIONAL!');
    } else {
      console.log('\n⚠️ ATTENTION REQUIRED - See recommendations above');
    }
  }
}

// Run verification
if (require.main === module) {
  const verifier = new ServiceSyncVerifier();
  verifier.verifyAll().catch(console.error);
}

module.exports = ServiceSyncVerifier;
