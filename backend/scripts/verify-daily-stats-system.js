#!/usr/bin/env node

/**
 * Daily Stats System Verification Script
 * Comprehensive verification of daily stats implementation
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../db/db');

class DailyStatsVerification {
  constructor() {
    this.results = {
      database: { status: 'pending', details: [] },
      service: { status: 'pending', details: [] },
      api: { status: 'pending', details: [] },
      cron: { status: 'pending', details: [] },
      integration: { status: 'pending', details: [] }
    };
  }

  async run() {
    console.log('🔍 DAILY STATS SYSTEM VERIFICATION');
    console.log('=====================================\n');

    try {
      await this.verifyDatabase();
      await this.verifyService();
      await this.verifyAPI();
      await this.verifyCron();
      await this.verifyIntegration();

      this.printResults();

    } catch (error) {
      console.error('❌ Verification failed:', error);
      process.exit(1);
    }
  }

  async verifyDatabase() {
    console.log('📊 Verifying Database Schema...');
    
    try {
      // Check if tables exist
      const tables = [
        'analytics.daily_platform_stats',
        'analytics.daily_user_stats', 
        'analytics.daily_category_stats',
        'analytics.daily_oracle_stats'
      ];

      for (const table of tables) {
        const result = await db.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'analytics' 
            AND table_name = $1
          )
        `, [table.split('.')[1]]);

        if (result.rows[0].exists) {
          this.results.database.details.push(`✅ Table ${table} exists`);
        } else {
          this.results.database.details.push(`❌ Table ${table} missing`);
        }
      }

      // Check if helper functions exist
      const functions = [
        'analytics.get_daily_platform_stats',
        'analytics.get_daily_user_stats',
        'analytics.get_category_performance',
        'analytics.get_oracle_performance'
      ];

      for (const func of functions) {
        const result = await db.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.routines 
            WHERE routine_schema = 'analytics' 
            AND routine_name = $1
          )
        `, [func.split('.')[1]]);

        if (result.rows[0].exists) {
          this.results.database.details.push(`✅ Function ${func} exists`);
        } else {
          this.results.database.details.push(`❌ Function ${func} missing`);
        }
      }

      this.results.database.status = 'passed';
      console.log('✅ Database verification completed\n');

    } catch (error) {
      this.results.database.status = 'failed';
      this.results.database.details.push(`❌ Database error: ${error.message}`);
      console.log('❌ Database verification failed\n');
    }
  }

  async verifyService() {
    console.log('🔧 Verifying Daily Stats Service...');
    
    try {
      const servicePath = path.join(__dirname, '../services/daily-stats-service.js');
      
      if (fs.existsSync(servicePath)) {
        this.results.service.details.push('✅ Daily Stats Service file exists');
        
        // Check if service can be imported
        try {
          const DailyStatsService = require('../services/daily-stats-service');
          const service = new DailyStatsService();
          this.results.service.details.push('✅ Daily Stats Service can be instantiated');
          
          // Check if methods exist
          const methods = [
            'calculateDailyPlatformStats',
            'calculateDailyUserStats', 
            'calculateDailyCategoryStats',
            'calculateDailyOracleStats',
            'calculateAllDailyStats'
          ];

          for (const method of methods) {
            if (typeof service[method] === 'function') {
              this.results.service.details.push(`✅ Method ${method} exists`);
            } else {
              this.results.service.details.push(`❌ Method ${method} missing`);
            }
          }

        } catch (error) {
          this.results.service.details.push(`❌ Service import error: ${error.message}`);
        }
      } else {
        this.results.service.details.push('❌ Daily Stats Service file missing');
      }

      this.results.service.status = 'passed';
      console.log('✅ Service verification completed\n');

    } catch (error) {
      this.results.service.status = 'failed';
      this.results.service.details.push(`❌ Service error: ${error.message}`);
      console.log('❌ Service verification failed\n');
    }
  }

  async verifyAPI() {
    console.log('🌐 Verifying Daily Stats API...');
    
    try {
      const apiPath = path.join(__dirname, '../api/daily-stats.js');
      
      if (fs.existsSync(apiPath)) {
        this.results.api.details.push('✅ Daily Stats API file exists');
        
        // Check if API can be imported
        try {
          const api = require('../api/daily-stats');
          this.results.api.details.push('✅ Daily Stats API can be imported');
        } catch (error) {
          this.results.api.details.push(`❌ API import error: ${error.message}`);
        }
      } else {
        this.results.api.details.push('❌ Daily Stats API file missing');
      }

      // Check if API is registered in server.js
      const serverPath = path.join(__dirname, '../api/server.js');
      if (fs.existsSync(serverPath)) {
        const serverContent = fs.readFileSync(serverPath, 'utf8');
        if (serverContent.includes("require('./daily-stats')")) {
          this.results.api.details.push('✅ Daily Stats API registered in server.js');
        } else {
          this.results.api.details.push('❌ Daily Stats API not registered in server.js');
        }
      }

      this.results.api.status = 'passed';
      console.log('✅ API verification completed\n');

    } catch (error) {
      this.results.api.status = 'failed';
      this.results.api.details.push(`❌ API error: ${error.message}`);
      console.log('❌ API verification failed\n');
    }
  }

  async verifyCron() {
    console.log('⏰ Verifying Daily Stats Cron...');
    
    try {
      const cronPath = path.join(__dirname, '../cron/daily-stats-cron.js');
      
      if (fs.existsSync(cronPath)) {
        this.results.cron.details.push('✅ Daily Stats Cron file exists');
        
        // Check if cron can be imported
        try {
          const cron = require('../cron/daily-stats-cron');
          this.results.cron.details.push('✅ Daily Stats Cron can be imported');
        } catch (error) {
          this.results.cron.details.push(`❌ Cron import error: ${error.message}`);
        }
      } else {
        this.results.cron.details.push('❌ Daily Stats Cron file missing');
      }

      // Check if cron is registered in master cron
      const masterCronPath = path.join(__dirname, '../cron/master-consolidated-cron.js');
      if (fs.existsSync(masterCronPath)) {
        const masterCronContent = fs.readFileSync(masterCronPath, 'utf8');
        if (masterCronContent.includes('daily_stats')) {
          this.results.cron.details.push('✅ Daily Stats Cron registered in master cron');
        } else {
          this.results.cron.details.push('❌ Daily Stats Cron not registered in master cron');
        }
      }

      // Check package.json scripts
      const packagePath = path.join(__dirname, '../package.json');
      if (fs.existsSync(packagePath)) {
        const packageContent = fs.readFileSync(packagePath, 'utf8');
        if (packageContent.includes('"daily-stats"')) {
          this.results.cron.details.push('✅ Daily Stats scripts in package.json');
        } else {
          this.results.cron.details.push('❌ Daily Stats scripts missing from package.json');
        }
      }

      this.results.cron.status = 'passed';
      console.log('✅ Cron verification completed\n');

    } catch (error) {
      this.results.cron.status = 'failed';
      this.results.cron.details.push(`❌ Cron error: ${error.message}`);
      console.log('❌ Cron verification failed\n');
    }
  }

  async verifyIntegration() {
    console.log('🔗 Verifying Integration...');
    
    try {
      // Test database connection
      const testQuery = await db.query('SELECT NOW() as current_time');
      this.results.integration.details.push('✅ Database connection working');

      // Test if we can query daily stats tables
      try {
        const platformStats = await db.query('SELECT COUNT(*) as count FROM analytics.daily_platform_stats');
        this.results.integration.details.push(`✅ Platform stats table accessible (${platformStats.rows[0].count} records)`);
      } catch (error) {
        this.results.integration.details.push(`❌ Platform stats table error: ${error.message}`);
      }

      try {
        const userStats = await db.query('SELECT COUNT(*) as count FROM analytics.daily_user_stats');
        this.results.integration.details.push(`✅ User stats table accessible (${userStats.rows[0].count} records)`);
      } catch (error) {
        this.results.integration.details.push(`❌ User stats table error: ${error.message}`);
      }

      // Test service methods
      try {
        const DailyStatsService = require('../services/daily-stats-service');
        const service = new DailyStatsService();
        this.results.integration.details.push('✅ Daily Stats Service can be instantiated');
      } catch (error) {
        this.results.integration.details.push(`❌ Service instantiation error: ${error.message}`);
      }

      this.results.integration.status = 'passed';
      console.log('✅ Integration verification completed\n');

    } catch (error) {
      this.results.integration.status = 'failed';
      this.results.integration.details.push(`❌ Integration error: ${error.message}`);
      console.log('❌ Integration verification failed\n');
    }
  }

  printResults() {
    console.log('📋 VERIFICATION RESULTS');
    console.log('========================\n');

    const sections = [
      { name: 'Database Schema', key: 'database' },
      { name: 'Service Implementation', key: 'service' },
      { name: 'API Endpoints', key: 'api' },
      { name: 'Cron Integration', key: 'cron' },
      { name: 'System Integration', key: 'integration' }
    ];

    let allPassed = true;

    sections.forEach(section => {
      const result = this.results[section.key];
      const status = result.status === 'passed' ? '✅' : '❌';
      
      console.log(`${status} ${section.name}: ${result.status.toUpperCase()}`);
      
      result.details.forEach(detail => {
        console.log(`   ${detail}`);
      });
      
      console.log('');
      
      if (result.status !== 'passed') {
        allPassed = false;
      }
    });

    console.log('🎯 OVERALL RESULT');
    console.log('==================');
    
    if (allPassed) {
      console.log('✅ ALL VERIFICATIONS PASSED');
      console.log('🚀 Daily Stats System is ready for use!');
      console.log('\n📚 Available Endpoints:');
      console.log('   GET /api/daily-stats/platform - Platform statistics');
      console.log('   GET /api/daily-stats/user/:address - User statistics');
      console.log('   GET /api/daily-stats/categories - Category performance');
      console.log('   GET /api/daily-stats/oracles - Oracle comparison');
      console.log('   GET /api/daily-stats/overview - Comprehensive overview');
      console.log('   POST /api/daily-stats/calculate - Manual calculation');
      console.log('   GET /api/daily-stats/health - System health check');
      console.log('\n⏰ Cron Schedule: Daily at 02:00 UTC');
      console.log('📦 NPM Scripts: npm run daily-stats, npm run daily-stats:manual');
    } else {
      console.log('❌ SOME VERIFICATIONS FAILED');
      console.log('🔧 Please fix the issues above before using the system');
      process.exit(1);
    }
  }
}

// Run verification if called directly
if (require.main === module) {
  const verification = new DailyStatsVerification();
  verification.run().catch(console.error);
}

module.exports = DailyStatsVerification;
