#!/usr/bin/env node

/**
 * Oddyssey Creator Process
 * Creates new daily cycles at 00:05 UTC
 */

require('dotenv').config();
const OddysseyManager = require('../services/oddyssey-manager');

async function startOddysseyCreator() {
  console.log('🚀 Starting Oddyssey Creator Process...');
  
  const oddysseyManager = new OddysseyManager();
  
  try {
    await oddysseyManager.initialize();
    console.log('✅ OddysseyManager initialized successfully');
    
    // Check if we need to start a new cycle today
    console.log('🔍 Checking if new cycle needs to be created...');
    
    // Get current date
    const today = new Date().toISOString().split('T')[0];
    console.log(`📅 Checking for cycle creation on: ${today}`);
    
    // Check if cycle already exists for today
    const db = require('../db/db');
    const existingCycle = await db.query(`
      SELECT cycle_id, created_at 
      FROM oracle.oddyssey_cycles 
      WHERE DATE(created_at) = $1 
      ORDER BY cycle_id DESC 
      LIMIT 1
    `, [today]);
    
    if (existingCycle.rows.length > 0) {
      console.log(`ℹ️ Cycle already exists for ${today}: cycle_id ${existingCycle.rows[0].cycle_id}`);
      console.log('✅ Oddyssey Creator completed (cycle already exists)');
      process.exit(0);
    }
    
    // Check if we have pre-selected matches for today
    const matchesCheck = await db.query(`
      SELECT COUNT(*) as count 
      FROM oracle.daily_game_matches 
      WHERE game_date = $1
    `, [today]);
    
    if (parseInt(matchesCheck.rows[0].count) < 10) {
      throw new Error(`Insufficient pre-selected matches for ${today}: found ${matchesCheck.rows[0].count}, need 10. Match selection must run first at 00:01 UTC.`);
    }
    
    console.log(`✅ Found ${matchesCheck.rows[0].count} pre-selected matches for ${today}`);
    
    // Use retry logic for cycle creation
    const result = await oddysseyManager.startDailyCycleWithRetry(3);
    console.log('✅ Daily cycle created successfully:', result);
    
    console.log('✅ Oddyssey Creator completed');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Failed to start Oddyssey Creator:', error);
    console.error('Error details:', error.message);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception in Oddyssey Creator:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection in Oddyssey Creator:', reason);
  process.exit(1);
});

startOddysseyCreator();
