#!/usr/bin/env node

/**
 * Start Event-Driven Bet Sync Service
 * 
 * This script starts the event-driven bet sync service that listens to
 * BetPlaced events and stores individual bet records in the database.
 */

const EventDrivenBetSync = require('../services/event-driven-bet-sync');

async function startBetSync() {
  try {
    console.log('🚀 Starting Event-Driven Bet Sync Service...');
    
    const betSyncService = new EventDrivenBetSync();
    await betSyncService.start();
    
    console.log('✅ Event-Driven Bet Sync Service started successfully');
    
    // Keep the process running
    process.on('SIGINT', async () => {
      console.log('\n🛑 Shutting down Event-Driven Bet Sync Service...');
      await betSyncService.stop();
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      console.log('\n🛑 Shutting down Event-Driven Bet Sync Service...');
      await betSyncService.stop();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ Failed to start Event-Driven Bet Sync Service:', error);
    process.exit(1);
  }
}

startBetSync();
