#!/usr/bin/env node

/**
 * 🔧 FIX MATCH SELECTION SCRIPT
 * 
 * This script will manually trigger match selection for today
 * to fix the cycle creation issue
 */

require('dotenv').config();
const PersistentDailyGameManager = require('../services/persistent-daily-game-manager');

async function fixMatchSelection() {
  console.log('🔧 Fixing match selection for today...');
  
  try {
    const manager = new PersistentDailyGameManager();
    
    // Get today's date
    const today = new Date().toISOString().split('T')[0];
    console.log(`📅 Today's date: ${today}`);
    
    // Check if matches already exist
    const existingMatches = await manager._checkExistingMatches(today);
    console.log(`📊 Existing matches for ${today}: ${existingMatches.count}`);
    
    if (existingMatches.count > 0) {
      console.log('✅ Matches already exist, no need to create new ones');
      return;
    }
    
    // Select and persist matches for today
    console.log('🎯 Selecting and persisting matches for today...');
    const result = await manager.selectAndPersistDailyMatches(today);
    
    console.log('✅ Match selection completed!');
    console.log('📊 Result:', JSON.stringify(result, null, 2));
    
    // Verify the matches were created
    const verifyResult = await manager._checkExistingMatches(today);
    console.log(`✅ Verification: ${verifyResult.count} matches found for ${today}`);
    
  } catch (error) {
    console.error('❌ Error fixing match selection:', error);
    process.exit(1);
  }
}

// Run the fix
if (require.main === module) {
  fixMatchSelection();
}

module.exports = fixMatchSelection;
