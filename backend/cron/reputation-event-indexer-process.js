#!/usr/bin/env node

/**
 * Reputation Event Indexer Process
 * 
 * Wrapper process for the reputation event indexer service.
 * Runs continuously to listen for reputation events from contracts.
 */

require('dotenv').config();

const ReputationEventIndexer = require('../services/reputation-event-indexer');

class ReputationEventIndexerProcess {
  constructor() {
    this.service = null;
    this.isRunning = false;
    this.restartCount = 0;
    this.maxRestarts = 10;
    this.restartDelay = 5000; // 5 seconds
  }

  async start() {
    try {
      console.log('🚀 Starting Reputation Event Indexer Process...');
      
      this.service = new ReputationEventIndexer();
      await this.service.initialize();
      
      this.isRunning = true;
      this.restartCount = 0;
      
      console.log('✅ Reputation Event Indexer Process started successfully');
      
      // Handle graceful shutdown
      global.process.on('SIGTERM', () => this.shutdown());
      global.process.on('SIGINT', () => this.shutdown());
      
    } catch (error) {
      console.error('❌ Failed to start Reputation Event Indexer Process:', error);
      
      if (this.restartCount < this.maxRestarts) {
        this.restartCount++;
        console.log(`🔄 Restarting in ${this.restartDelay}ms... (Attempt ${this.restartCount}/${this.maxRestarts})`);
        setTimeout(() => this.start(), this.restartDelay);
      } else {
        console.error('❌ Max restart attempts reached. Exiting.');
        process.exit(1);
      }
    }
  }

  async shutdown() {
    try {
      console.log('🛑 Shutting down Reputation Event Indexer Process...');
      
      this.isRunning = false;
      
      if (this.service) {
        await this.service.stop();
      }
      
      console.log('✅ Reputation Event Indexer Process stopped gracefully');
      process.exit(0);
      
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  }
}

// Start the process
const process = new ReputationEventIndexerProcess();
process.start();
