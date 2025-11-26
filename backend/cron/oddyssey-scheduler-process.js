#!/usr/bin/env node

/**
 * Oddyssey Scheduler Process
 * Standalone script for running daily Oddyssey automation on Fly.io
 */

require('dotenv').config();
const oddysseyScheduler = require('./oddyssey-scheduler');

console.log('🚀 Starting Oddyssey Scheduler Process...');
console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`Database URL: ${process.env.DATABASE_URL ? '✅ Connected' : '❌ Not configured'}`);
console.log(`SportMonks API: ${process.env.SPORTMONKS_API_TOKEN ? '✅ Configured' : '❌ Not configured'}`);

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('📡 Received SIGTERM, shutting down gracefully...');
  oddysseyScheduler.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('📡 Received SIGINT, shutting down gracefully...');
  oddysseyScheduler.stop();
  process.exit(0);
});

// Uncaught exception handling
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  oddysseyScheduler.stop();
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  oddysseyScheduler.stop();
  process.exit(1);
});

// Health check endpoint for Fly.io monitoring
const express = require('express');
const app = express();
const port = process.env.ODDYSSEY_PORT || 3002;

app.get('/health', (req, res) => {
  const status = oddysseyScheduler.getStatus();
  res.json({
    status: 'OK',
    service: 'oddyssey-scheduler',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    scheduler: status
  });
});

app.get('/status', (req, res) => {
  const status = oddysseyScheduler.getStatus();
  res.json(status);
});

// Manual trigger endpoints (for testing/emergency)
app.post('/trigger/new-cycle', async (req, res) => {
  try {
    const result = await oddysseyScheduler.triggerNewCycle();
    res.json({ success: true, result });
  } catch (error) {
    console.error('❌ Manual cycle trigger failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/trigger/resolve-cycle', async (req, res) => {
  try {
    const result = await oddysseyScheduler.triggerResolution();
    res.json({ success: true, result });
  } catch (error) {
    console.error('❌ Manual resolution trigger failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/trigger/match-selection', async (req, res) => {
  try {
    const result = await oddysseyScheduler.triggerMatchSelection();
    res.json({ success: true, result });
  } catch (error) {
    console.error('❌ Manual match selection trigger failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start health check server
app.listen(port, () => {
  console.log(`🏥 Health check server running on port ${port}`);
});

// Start the scheduler
try {
  oddysseyScheduler.start();
  console.log('✅ Oddyssey Scheduler Process started successfully');
  
  // Keep the process alive
  setInterval(() => {
    const status = oddysseyScheduler.getStatus();
    console.log(`⏰ Scheduler status check: ${status.isRunning ? 'Running' : 'Stopped'}`);
  }, 30 * 60 * 1000); // Every 30 minutes
  
} catch (error) {
  console.error('❌ Failed to start Oddyssey Scheduler:', error);
  process.exit(1);
} 