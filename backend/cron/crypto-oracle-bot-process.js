#!/usr/bin/env node

/**
 * Crypto Oracle Bot Process
 * Wrapper to start the Crypto Oracle Bot as a background process
 */

require('dotenv').config();
const CryptoOracleBot = require('../services/crypto-oracle-bot');

async function startCryptoOracleBot() {
  console.log('🚀 Starting Crypto Oracle Bot Process...');
  
  const bot = new CryptoOracleBot();
  
  try {
    await bot.start();
    console.log('✅ Crypto Oracle Bot started successfully');
    
    // Keep the process running
    console.log('🔄 Crypto Oracle Bot is running continuously...');
    
    // Handle graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('📡 Received SIGTERM, shutting down Crypto Oracle Bot...');
      await bot.stop();
      process.exit(0);
    });
    
    process.on('SIGINT', async () => {
      console.log('📡 Received SIGINT, shutting down Crypto Oracle Bot...');
      await bot.stop();
      process.exit(0);
    });
    
    // Keep the process alive
    setInterval(() => {
      // Just keep the process running
    }, 60000); // Check every minute
    
  } catch (error) {
    console.error('❌ Failed to start Crypto Oracle Bot:', error);
    process.exit(1);
  }
}

// Start the bot
startCryptoOracleBot();
