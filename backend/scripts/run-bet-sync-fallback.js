#!/usr/bin/env node

/**
 * Run Bet Sync Fallback
 * 
 * This script runs the fallback sync mechanism to catch missed bets
 * that the event-driven bet sync service might have missed.
 */

const EventDrivenBetSync = require('../services/event-driven-bet-sync');

async function runBetSyncFallback() {
  console.log('🔄 Running Bet Sync Fallback...\n');
  
  try {
    // Initialize the service
    const betSyncService = new EventDrivenBetSync();
    
    // Initialize Web3 service separately to avoid wallet requirement
    const Web3Service = require('../services/web3-service');
    const web3Service = new Web3Service();
    await web3Service.initialize();
    
    // Set the contract manually
    betSyncService.contract = await web3Service.getPoolCoreContractForEvents();
    betSyncService.web3Service = web3Service;
    
    console.log('✅ Bet sync service initialized');
    
    // Run fallback sync
    await betSyncService.fallbackSync();
    
    console.log('✅ Bet sync fallback completed');
    
  } catch (error) {
    console.error('❌ Bet sync fallback failed:', error);
    process.exit(1);
  }
}

runBetSyncFallback();
