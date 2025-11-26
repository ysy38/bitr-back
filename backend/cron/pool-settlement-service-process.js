#!/usr/bin/env node

/**
 * Pool Settlement Service Process
 * Wrapper to start the Pool Settlement Service as a background process
 */

require('dotenv').config();
const PoolSettlementService = require('../services/unified-pool-settlement-system');

async function startPoolSettlementService() {
  console.log('🚀 Starting Pool Settlement Service Process...');
  
  const service = new PoolSettlementService();
  
  try {
    await service.start();
    console.log('✅ Pool Settlement Service started successfully');
    
    // Keep the process running
    process.on('SIGTERM', async () => {
      console.log('📡 Received SIGTERM, shutting down Pool Settlement Service...');
      await service.stop();
      process.exit(0);
    });
    
    process.on('SIGINT', async () => {
      console.log('📡 Received SIGINT, shutting down Pool Settlement Service...');
      await service.stop();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ Failed to start Pool Settlement Service:', error);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception in Pool Settlement Service:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection in Pool Settlement Service:', reason);
  process.exit(1);
});

startPoolSettlementService();
