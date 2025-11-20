#!/usr/bin/env node

/**
 * Event-Driven Slip Sync Startup Script
 * 
 * This script starts the event-driven slip sync service that listens to
 * Oddyssey contract events in real-time and immediately syncs new slips to the database.
 * 
 * Usage:
 *   node scripts/start-event-driven-slip-sync.js
 *   npm run slip-sync:event-driven
 */

const EventDrivenSlipSync = require('../services/event-driven-slip-sync');

class EventDrivenSlipSyncStarter {
  constructor() {
    this.syncService = new EventDrivenSlipSync();
    this.isShuttingDown = false;
  }

  /**
   * Start the event-driven slip sync service
   */
  async start() {
    try {
      console.log('🚀 Starting Event-Driven Slip Sync Service...');
      
      // Setup graceful shutdown
      this.setupGracefulShutdown();
      
      // Start the service
      await this.syncService.start();
      
      console.log('✅ Event-Driven Slip Sync Service started successfully');
      console.log('👂 Listening for SlipPlaced, SlipEvaluated, and PrizeClaimed events...');
      console.log('🔄 Fallback sync runs every 5 minutes if events fail');
      console.log('💡 Press Ctrl+C to stop the service');
      
      // Keep the process alive
      this.keepAlive();
      
    } catch (error) {
      console.error('❌ Failed to start Event-Driven Slip Sync Service:', error);
      process.exit(1);
    }
  }

  /**
   * Setup graceful shutdown handlers
   */
  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      if (this.isShuttingDown) {
        console.log('⚠️ Shutdown already in progress...');
        return;
      }
      
      this.isShuttingDown = true;
      console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
      
      try {
        await this.syncService.stop();
        console.log('✅ Event-Driven Slip Sync Service stopped successfully');
        process.exit(0);
      } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
      }
    };

    // Handle different shutdown signals
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGQUIT', () => shutdown('SIGQUIT'));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('❌ Uncaught Exception:', error);
      shutdown('uncaughtException');
    });
    
    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
      shutdown('unhandledRejection');
    });
  }

  /**
   * Keep the process alive
   */
  keepAlive() {
    // Keep the process running
    setInterval(() => {
      if (!this.isShuttingDown) {
        // Health check - just log that we're alive
        console.log('💓 Event-Driven Slip Sync Service is running...');
      }
    }, 300000); // Every 5 minutes
  }
}

// Start the service if this script is run directly
if (require.main === module) {
  const starter = new EventDrivenSlipSyncStarter();
  starter.start().catch((error) => {
    console.error('❌ Failed to start service:', error);
    process.exit(1);
  });
}

module.exports = EventDrivenSlipSyncStarter;
