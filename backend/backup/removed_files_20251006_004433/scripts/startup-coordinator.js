#!/usr/bin/env node

/**
 * STARTUP COORDINATOR
 * 
 * Ensures proper initialization order and prevents conflicts
 * between different services and cron jobs
 */

const path = require('path');
const { spawn } = require('child_process');

class StartupCoordinator {
  constructor() {
    this.services = new Map();
    this.initializationOrder = [
      'database',
      'oracle-services', 
      'master-cron',
      'health-monitor'
    ];
    this.isShuttingDown = false;
  }

  async start() {
    console.log('🚀 Starting Startup Coordinator...');
    
    // Setup graceful shutdown
    this.setupGracefulShutdown();
    
    try {
      // Initialize services in proper order
      for (const serviceName of this.initializationOrder) {
        if (this.isShuttingDown) break;
        
        console.log(`📋 Initializing ${serviceName}...`);
        await this.initializeService(serviceName);
        
        // Wait between services to prevent resource conflicts
        await this.delay(2000);
      }
      
      console.log('✅ All services initialized successfully');
      console.log('🏥 Running initial health check...');
      
      // Run initial health check
      await this.runHealthCheck();
      
      console.log('🎯 System is ready and operational');
      
      // Keep process alive
      this.keepAlive();
      
    } catch (error) {
      console.error('❌ Startup failed:', error.message);
      await this.shutdown();
      process.exit(1);
    }
  }

  async initializeService(serviceName) {
    switch (serviceName) {
      case 'database':
        return this.initializeDatabase();
      
      case 'oracle-services':
        return this.initializeOracleServices();
      
      case 'master-cron':
        return this.initializeMasterCron();
      
      case 'health-monitor':
        return this.initializeHealthMonitor();
      
      default:
        throw new Error(`Unknown service: ${serviceName}`);
    }
  }

  async initializeDatabase() {
    console.log('🗄️ Checking database connectivity...');
    
    try {
      const db = require('../db/db');
      await Promise.race([
        db.connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Database connection timeout')), 10000))
      ]);
      
      console.log('✅ Database connection established');
      return true;
      
    } catch (error) {
      console.error('❌ Database initialization failed:', error.message);
      throw error;
    }
  }

  async initializeOracleServices() {
    console.log('🔮 Starting Oracle services...');
    
    // Check if Oracle is configured
    if (!process.env.ORACLE_SIGNER_PRIVATE_KEY) {
      console.log('⚠️ Oracle private key not configured, skipping Oracle services');
      return true;
    }
    
    try {
      // Start Oracle cron service in background
      const oracleProcess = spawn('node', [
        path.join(__dirname, '../oracle/cronjob.js')
      ], {
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      this.services.set('oracle-cron', oracleProcess);
      
      // Monitor Oracle process
      oracleProcess.stdout.on('data', (data) => {
        console.log(`[Oracle] ${data.toString().trim()}`);
      });
      
      oracleProcess.stderr.on('data', (data) => {
        console.error(`[Oracle Error] ${data.toString().trim()}`);
      });
      
      oracleProcess.on('exit', (code) => {
        console.log(`Oracle service exited with code ${code}`);
        this.services.delete('oracle-cron');
      });
      
      // Wait for Oracle to initialize
      await this.delay(5000);
      
      console.log('✅ Oracle services started');
      return true;
      
    } catch (error) {
      console.error('❌ Oracle services initialization failed:', error.message);
      throw error;
    }
  }

  async initializeMasterCron() {
    console.log('⏰ Starting Master Consolidated Cron...');
    
    try {
      // Start master cron in background
      const cronProcess = spawn('node', [
        path.join(__dirname, '../cron/master-consolidated-cron.js')
      ], {
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      this.services.set('master-cron', cronProcess);
      
      // Monitor cron process
      cronProcess.stdout.on('data', (data) => {
        console.log(`[Cron] ${data.toString().trim()}`);
      });
      
      cronProcess.stderr.on('data', (data) => {
        console.error(`[Cron Error] ${data.toString().trim()}`);
      });
      
      cronProcess.on('exit', (code) => {
        console.log(`Master cron exited with code ${code}`);
        this.services.delete('master-cron');
      });
      
      // Wait for cron to initialize
      await this.delay(3000);
      
      console.log('✅ Master Consolidated Cron started');
      return true;
      
    } catch (error) {
      console.error('❌ Master cron initialization failed:', error.message);
      throw error;
    }
  }

  async initializeHealthMonitor() {
    console.log('🏥 Setting up health monitoring...');
    
    try {
      // Schedule periodic health checks every 30 minutes
      setInterval(async () => {
        if (!this.isShuttingDown) {
          await this.runHealthCheck();
        }
      }, 30 * 60 * 1000);
      
      console.log('✅ Health monitoring configured');
      return true;
      
    } catch (error) {
      console.error('❌ Health monitor initialization failed:', error.message);
      throw error;
    }
  }

  async runHealthCheck() {
    try {
      const SystemHealthMonitor = require('./system-health-monitor');
      const monitor = new SystemHealthMonitor();
      
      const report = await monitor.runComprehensiveHealthCheck();
      
      if (report.status === 'critical') {
        console.log('🚨 CRITICAL SYSTEM ISSUES DETECTED - Consider restarting services');
      } else if (report.status === 'degraded') {
        console.log('⚠️ System performance is degraded - monitoring closely');
      }
      
      return report;
      
    } catch (error) {
      console.error('❌ Health check failed:', error.message);
    }
  }

  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      if (this.isShuttingDown) return;
      
      console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
      await this.shutdown();
      process.exit(0);
    };
    
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', async (error) => {
      console.error('💥 Uncaught exception:', error);
      await this.shutdown();
      process.exit(1);
    });
    
    process.on('unhandledRejection', async (reason) => {
      console.error('💥 Unhandled rejection:', reason);
      await this.shutdown();
      process.exit(1);
    });
  }

  async shutdown() {
    if (this.isShuttingDown) return;
    
    this.isShuttingDown = true;
    console.log('🔄 Shutting down all services...');
    
    // Stop all services
    for (const [name, process] of this.services) {
      try {
        console.log(`⏹️ Stopping ${name}...`);
        process.kill('SIGTERM');
        
        // Wait for graceful shutdown
        await new Promise((resolve) => {
          const timeout = setTimeout(() => {
            console.log(`💀 Force killing ${name}`);
            process.kill('SIGKILL');
            resolve();
          }, 10000);
          
          process.on('exit', () => {
            clearTimeout(timeout);
            resolve();
          });
        });
        
      } catch (error) {
        console.error(`❌ Error stopping ${name}:`, error.message);
      }
    }
    
    // Disconnect from database
    try {
      const db = require('../db/db');
      await db.disconnect();
      console.log('✅ Database disconnected');
    } catch (error) {
      console.error('❌ Database disconnect error:', error.message);
    }
    
    console.log('✅ Graceful shutdown completed');
  }

  keepAlive() {
    // Keep the process alive and monitor services
    setInterval(() => {
      if (this.isShuttingDown) return;
      
      const activeServices = this.services.size;
      const expectedServices = this.initializationOrder.length - 2; // database and health-monitor don't spawn processes
      
      if (activeServices < expectedServices) {
        console.log(`⚠️ Only ${activeServices}/${expectedServices} services running`);
      }
      
    }, 60000); // Check every minute
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run if called directly
if (require.main === module) {
  const coordinator = new StartupCoordinator();
  coordinator.start().catch(error => {
    console.error('💥 Startup coordinator failed:', error);
    process.exit(1);
  });
}

module.exports = StartupCoordinator;
