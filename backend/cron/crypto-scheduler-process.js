#!/usr/bin/env node

/**
 * Crypto Scheduler Process
 * Standalone script for running crypto price updates and market resolution on Fly.io
 */

require('dotenv').config();
const CryptoScheduler = require('./crypto-scheduler');

console.log('🚀 Starting Crypto Scheduler Process...');
console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`Database URL: ${process.env.DATABASE_URL ? '✅ Connected' : '❌ Not configured'}`);
console.log(`Coinpaprika API: ${process.env.COINPAPRIKA_API_TOKEN ? '✅ Configured' : '⚠️ Using free tier'}`);

const cryptoScheduler = new CryptoScheduler();

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('📡 Received SIGTERM, shutting down gracefully...');
  cryptoScheduler.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('📡 Received SIGINT, shutting down gracefully...');
  cryptoScheduler.stop();
  process.exit(0);
});

// Uncaught exception handling
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  cryptoScheduler.stop();
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  cryptoScheduler.stop();
  process.exit(1);
});

// Health check endpoint for Fly.io monitoring
const express = require('express');
const app = express();
const port = process.env.CRYPTO_PORT || 3003;

app.get('/health', (req, res) => {
  const status = cryptoScheduler.getStatus();
  res.json({
    status: 'OK',
    service: 'crypto-scheduler',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    scheduler: status
  });
});

app.get('/status', (req, res) => {
  const status = cryptoScheduler.getStatus();
  res.json(status);
});

// Manual trigger endpoints (for testing/emergency)
app.post('/trigger/price-update', async (req, res) => {
  try {
    const result = await cryptoScheduler.updateCryptoPrices();
    res.json({ success: true, result });
  } catch (error) {
    console.error('❌ Manual price update failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/trigger/market-resolution', async (req, res) => {
  try {
    const result = await cryptoScheduler.checkMarketResolutions();
    res.json({ success: true, result });
  } catch (error) {
    console.error('❌ Manual market resolution failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start health check server
app.listen(port, () => {
  console.log(`🏥 Health check server running on port ${port}`);
});

// Start the scheduler
try {
  cryptoScheduler.start().then(() => {
    console.log('✅ Crypto Scheduler Process started successfully');
    
    // Keep the process alive
    setInterval(() => {
      const status = cryptoScheduler.getStatus();
      console.log(`⏰ Crypto scheduler status check: ${status.isRunning ? 'Running' : 'Stopped'}`);
    }, 30 * 60 * 1000); // Every 30 minutes
  }).catch((error) => {
    console.error('❌ Failed to start Crypto Scheduler:', error);
    process.exit(1);
  });
  
} catch (error) {
  console.error('❌ Failed to start Crypto Scheduler:', error);
  process.exit(1);
} 