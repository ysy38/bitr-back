#!/usr/bin/env node

/**
 * Oddyssey Oracle Bot Process
 * Wrapper to start the Oddyssey Oracle Bot as a background process
 */

require('dotenv').config();
const OddysseyOracleBot = require('../services/oddyssey-oracle-bot');

async function startOddysseyOracleBot() {
  console.log('🚀 Starting Oddyssey Oracle Bot Process...');
  
  const bot = new OddysseyOracleBot();
  
  try {
    await bot.start();
    console.log('✅ Oddyssey Oracle Bot started successfully');
    
    // Keep the process running
    process.on('SIGTERM', async () => {
      console.log('📡 Received SIGTERM, shutting down Oddyssey Oracle Bot...');
      await bot.stop();
      process.exit(0);
    });
    
    process.on('SIGINT', async () => {
      console.log('📡 Received SIGINT, shutting down Oddyssey Oracle Bot...');
      await bot.stop();
      process.exit(0);
    });
    
    // Run cycle resolution check every 5 minutes
    setInterval(async () => {
      try {
        console.log('🔍 Periodic cycle resolution check...');
        await bot.checkAndResolveCycles();
      } catch (error) {
        console.error('❌ Error in periodic cycle check:', error.message);
      }
    }, 5 * 60 * 1000); // 5 minutes
    
  } catch (error) {
    console.error('❌ Failed to start Oddyssey Oracle Bot:', error);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception in Oddyssey Oracle Bot:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection in Oddyssey Oracle Bot:', reason);
  process.exit(1);
});

startOddysseyOracleBot();
