#!/usr/bin/env node

/**
 * Reputation Decay Process
 * 
 * Wrapper process for the reputation decay service.
 * Runs daily to process reputation decay.
 */

require('dotenv').config();

const ReputationDecayService = require('../services/reputation-decay-service');

class ReputationDecayProcess {
  constructor() {
    this.service = null;
  }

  async start() {
    try {
      console.log('🚀 Starting Reputation Decay Process...');
      
      this.service = new ReputationDecayService();
      await this.service.initialize();
      
      console.log('✅ Reputation Decay Process completed successfully');
      process.exit(0);
      
    } catch (error) {
      console.error('❌ Reputation Decay Process failed:', error);
      process.exit(1);
    }
  }
}

// Start the process
const process = new ReputationDecayProcess();
process.start();
