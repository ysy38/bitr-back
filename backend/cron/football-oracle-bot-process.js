#!/usr/bin/env node

/**
 * Football Oracle Bot Process
 * Wrapper to start the Football Oracle Bot as a background process
 */

require('dotenv').config();
const FootballOracleBot = require('../services/football-oracle-bot');

async function startFootballOracleBot() {
  console.log('🚀 Starting Football Oracle Bot Process...');
  
  const bot = new FootballOracleBot();
  
  try {
    await bot.start();
    console.log('✅ Football Oracle Bot started successfully');
    
    // Keep the process running
    process.on('SIGTERM', async () => {
      console.log('📡 Received SIGTERM, shutting down Football Oracle Bot...');
      await bot.stop();
      process.exit(0);
    });
    
    process.on('SIGINT', async () => {
      console.log('📡 Received SIGINT, shutting down Football Oracle Bot...');
      await bot.stop();
      process.exit(0);
    });
    
    // Run market resolution check every 2 minutes
    setInterval(async () => {
      try {
        console.log('🔍 Periodic football market resolution check...');
        await bot.checkAndResolveMarkets();
      } catch (error) {
        console.error('❌ Error in periodic football market check:', error.message);
      }
    }, 2 * 60 * 1000); // 2 minutes
    
  } catch (error) {
    console.error('❌ Failed to start Football Oracle Bot:', error);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception in Football Oracle Bot:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection in Football Oracle Bot:', reason);
  process.exit(1);
});

startFootballOracleBot();
