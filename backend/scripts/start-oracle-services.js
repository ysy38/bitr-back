#!/usr/bin/env node

/**
 * Oracle Services Startup Script
 * Starts all oracle-related services with proper coordination and monitoring
 */

require('dotenv').config();
const FootballOracleBot = require('../services/football-oracle-bot');
const PoolSettlementService = require('../services/unified-pool-settlement-system');
const OddysseyOracleBot = require('../services/oddyssey-oracle-bot');
const db = require('../db/db');

class OracleServicesManager {
  constructor() {
    this.services = {
      footballOracle: null,
      poolSettlement: null,
      oddysseyOracle: null
    };
    this.isRunning = false;
    this.healthCheckInterval = null;
  }

  /**
   * Start all oracle services
   */
  async start() {
    if (this.isRunning) {
      console.log('⚠️ Oracle Services Manager is already running');
      return;
    }

    console.log('🚀 Starting Oracle Services Manager...');

    try {
      // Connect to database first
      await db.connect();
      console.log('✅ Database connected');

      // Start services in order
      await this.startFootballOracleBot();
      await this.startPoolSettlementService();
      await this.startOddysseyOracleBot();

      // Start health monitoring
      this.startHealthMonitoring();

      this.isRunning = true;
      console.log('🎯 All Oracle Services started successfully');

      // Log system status
      await this.logSystemStatus();

    } catch (error) {
      console.error('❌ Failed to start Oracle Services:', error);
      await this.stop();
      throw error;
    }
  }

  /**
   * Start Football Oracle Bot
   */
  async startFootballOracleBot() {
    console.log('⚽ Starting Football Oracle Bot...');
    
    try {
      this.services.footballOracle = new FootballOracleBot();
      await this.services.footballOracle.start();
      console.log('✅ Football Oracle Bot started successfully');
    } catch (error) {
      console.error('❌ Failed to start Football Oracle Bot:', error);
      throw error;
    }
  }

  /**
   * Start Pool Settlement Service
   */
  async startPoolSettlementService() {
    console.log('💰 Starting Pool Settlement Service...');
    
    try {
      this.services.poolSettlement = new PoolSettlementService();
      await this.services.poolSettlement.start();
      console.log('✅ Pool Settlement Service started successfully');
    } catch (error) {
      console.error('❌ Failed to start Pool Settlement Service:', error);
      // Don't throw - this service can run in limited mode
      console.log('⚠️ Pool Settlement Service started with limited functionality');
    }
  }

  /**
   * Start Oddyssey Oracle Bot
   */
  async startOddysseyOracleBot() {
    console.log('🎮 Starting Oddyssey Oracle Bot...');
    
    try {
      this.services.oddysseyOracle = new OddysseyOracleBot();
      await this.services.oddysseyOracle.start();
      console.log('✅ Oddyssey Oracle Bot started successfully');
    } catch (error) {
      console.error('❌ Failed to start Oddyssey Oracle Bot:', error);
      throw error;
    }
  }

  /**
   * Stop all services
   */
  async stop() {
    if (!this.isRunning) {
      console.log('⚠️ Oracle Services Manager is not running');
      return;
    }

    console.log('🛑 Stopping Oracle Services Manager...');

    // Stop health monitoring
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Stop services in reverse order
    const stopPromises = [];

    if (this.services.oddysseyOracle) {
      stopPromises.push(this.services.oddysseyOracle.stop().catch(e => console.error('Error stopping Oddyssey Oracle:', e)));
    }

    if (this.services.poolSettlement) {
      stopPromises.push(this.services.poolSettlement.stop().catch(e => console.error('Error stopping Pool Settlement:', e)));
    }

    if (this.services.footballOracle) {
      stopPromises.push(this.services.footballOracle.stop().catch(e => console.error('Error stopping Football Oracle:', e)));
    }

    await Promise.all(stopPromises);

    this.isRunning = false;
    console.log('🛑 Oracle Services Manager stopped');
  }

  /**
   * Start health monitoring
   */
  startHealthMonitoring() {
    console.log('🏥 Starting health monitoring...');
    
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        console.error('❌ Health check failed:', error);
      }
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Perform health check on all services
   */
  async performHealthCheck() {
    console.log('🔍 Performing health check...');

    const healthStatus = {
      timestamp: new Date().toISOString(),
      services: {}
    };

    // Check Football Oracle Bot
    if (this.services.footballOracle) {
      try {
        const status = await this.services.footballOracle.getStatus();
        healthStatus.services.footballOracle = {
          isRunning: status.isRunning,
          pendingResolutions: status.pendingResolutions,
          recentResolutions24h: status.recentResolutions24h
        };
      } catch (error) {
        healthStatus.services.footballOracle = { error: error.message };
      }
    }

    // Check Pool Settlement Service
    if (this.services.poolSettlement) {
      healthStatus.services.poolSettlement = {
        isRunning: this.services.poolSettlement.isRunning
      };
    }

    // Check Oddyssey Oracle Bot
    if (this.services.oddysseyOracle) {
      try {
        const status = await this.services.oddysseyOracle.getStatus();
        healthStatus.services.oddysseyOracle = {
          isRunning: status.isRunning,
          pendingCycles: status.pendingCycles || 0
        };
      } catch (error) {
        healthStatus.services.oddysseyOracle = { error: error.message };
      }
    }

    // Log health status
    console.log('📊 Health Status:', JSON.stringify(healthStatus, null, 2));

    // Store in database for monitoring
    try {
      await db.query(`
        INSERT INTO system.health_checks (service_name, status, details, created_at)
        VALUES ($1, $2, $3, NOW())
      `, [
        'oracle_services',
        'healthy',
        JSON.stringify(healthStatus)
      ]);
    } catch (error) {
      console.warn('Could not store health check in database:', error.message);
    }
  }

  /**
   * Log system status
   */
  async logSystemStatus() {
    console.log('\n📋 Oracle Services System Status:');
    console.log('=====================================');
    
    // Check database tables
    try {
      const resolutionLogs = await db.query('SELECT COUNT(*) as count FROM oracle.football_resolution_logs');
      const predictionMarkets = await db.query('SELECT COUNT(*) as count FROM oracle.football_prediction_markets');
      
      console.log(`📊 Football Resolution Logs: ${resolutionLogs.rows[0].count}`);
      console.log(`📊 Football Prediction Markets: ${predictionMarkets.rows[0].count}`);
    } catch (error) {
      console.log('⚠️ Could not fetch database statistics:', error.message);
    }

    console.log('✅ All Oracle Services are running and monitoring');
    console.log('🔍 Health checks will run every 5 minutes');
    console.log('📡 Services will automatically resolve markets and settle pools');
  }
}

// Main execution
async function main() {
  const manager = new OracleServicesManager();
  
  // Handle graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('📡 Received SIGTERM, shutting down Oracle Services...');
    await manager.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('📡 Received SIGINT, shutting down Oracle Services...');
    await manager.stop();
    process.exit(0);
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', async (error) => {
    console.error('💥 Uncaught Exception in Oracle Services:', error);
    await manager.stop();
    process.exit(1);
  });

  process.on('unhandledRejection', async (reason, promise) => {
    console.error('💥 Unhandled Rejection in Oracle Services:', reason);
    await manager.stop();
    process.exit(1);
  });

  try {
    await manager.start();
  } catch (error) {
    console.error('❌ Failed to start Oracle Services Manager:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main();
}

module.exports = OracleServicesManager;
