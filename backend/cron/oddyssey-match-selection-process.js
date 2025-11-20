#!/usr/bin/env node

/**
 * Oddyssey Match Selection Process
 * Selects matches for the daily cycle at 00:01 UTC
 */

require('dotenv').config();
const OddysseyMatchSelector = require('../services/oddyssey-match-selector');

async function runMatchSelection() {
  console.log('🎯 Starting Oddyssey Match Selection Process...');
  
  const matchSelector = new OddysseyMatchSelector();
  
  try {
    // Get current date
    const today = new Date().toISOString().split('T')[0];
    console.log(`📅 Selecting matches for: ${today}`);
    
    // Check if matches already selected for today
    const db = require('../db/db');
    const existingMatches = await db.query(`
      SELECT COUNT(*) as count 
      FROM oracle.daily_game_matches 
      WHERE game_date = $1
    `, [today]);
    
    if (parseInt(existingMatches.rows[0].count) >= 10) {
      console.log(`ℹ️ Matches already selected for ${today}: ${existingMatches.rows[0].count} matches found`);
      console.log('✅ Match Selection completed (matches already exist)');
      process.exit(0);
    }
    
    // Select matches for today
    console.log('🔍 Selecting new matches for today...');
    const result = await matchSelector.selectDailyMatches();
    
    console.log('✅ Match selection completed successfully:', {
      date: today,
      matchesSelected: result.matches?.length || 0,
      success: result.success
    });
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Failed to select matches:', error);
    console.error('Error details:', error.message);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception in Match Selection:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection in Match Selection:', reason);
  process.exit(1);
});

runMatchSelection();
