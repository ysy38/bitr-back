#!/usr/bin/env node
require('dotenv').config();
const db = require('../db/db');

/**
 * FIX CYCLE 1 TIMEZONE DATA
 * 
 * Problem: Cycle 1 has startTime stored as ISO strings instead of epoch numbers
 * Solution: Convert all ISO string startTimes to epoch numbers
 */

async function fixCycle1TimezoneData() {
  console.log('🔧 FIXING CYCLE 1 TIMEZONE DATA');
  console.log('='.repeat(60));
  
  try {
    // Step 1: Get cycle 1 data
    console.log('📊 Step 1: Fetching cycle 1 data...');
    const result = await db.query(`
      SELECT cycle_id, matches_data, cycle_start_time, cycle_end_time
      FROM oracle.oddyssey_cycles 
      WHERE cycle_id = 1
    `);
    
    if (result.rows.length === 0) {
      console.log('❌ Cycle 1 not found!');
      process.exit(1);
    }
    
    const cycle = result.rows[0];
    const matches = cycle.matches_data;
    
    console.log(`✅ Found cycle 1 with ${matches.length} matches`);
    console.log('');
    
    // Step 2: Check current data format
    console.log('📋 Step 2: Checking current data format...');
    const firstMatch = matches[0];
    console.log('First match startTime:', firstMatch.startTime);
    console.log('Type:', typeof firstMatch.startTime);
    
    if (typeof firstMatch.startTime === 'number') {
      console.log('✅ Data is already in correct format (epoch numbers)');
      console.log('No fix needed!');
      process.exit(0);
    }
    
    console.log('❌ Data is in WRONG format (ISO strings)');
    console.log('');
    
    // Step 3: Convert all startTimes to epoch numbers
    console.log('🔄 Step 3: Converting startTimes to epoch numbers...');
    const fixedMatches = matches.map((match, index) => {
      const originalStartTime = match.startTime;
      let epochStartTime;
      
      if (typeof originalStartTime === 'string') {
        // Convert ISO string to epoch
        epochStartTime = Math.floor(new Date(originalStartTime).getTime() / 1000);
        console.log(`  Match ${index + 1}: "${originalStartTime}" → ${epochStartTime}`);
      } else {
        // Already a number
        epochStartTime = originalStartTime;
        console.log(`  Match ${index + 1}: Already number (${epochStartTime})`);
      }
      
      // Also convert odds from strings to numbers if needed
      return {
        ...match,
        startTime: epochStartTime,
        oddsHome: typeof match.oddsHome === 'string' ? parseFloat(match.oddsHome) : match.oddsHome,
        oddsDraw: typeof match.oddsDraw === 'string' ? parseFloat(match.oddsDraw) : match.oddsDraw,
        oddsAway: typeof match.oddsAway === 'string' ? parseFloat(match.oddsAway) : match.oddsAway,
        oddsOver: typeof match.oddsOver === 'string' ? parseFloat(match.oddsOver) : match.oddsOver,
        oddsUnder: typeof match.oddsUnder === 'string' ? parseFloat(match.oddsUnder) : match.oddsUnder
      };
    });
    
    console.log('✅ All startTimes converted to epoch numbers');
    console.log('');
    
    // Step 4: Verify the fix
    console.log('🔍 Step 4: Verifying converted data...');
    const firstFixed = fixedMatches[0];
    console.log('First match after fix:');
    console.log('  startTime:', firstFixed.startTime, '(type:', typeof firstFixed.startTime + ')');
    console.log('  Date:', new Date(firstFixed.startTime * 1000).toISOString());
    console.log('  oddsHome:', firstFixed.oddsHome, '(type:', typeof firstFixed.oddsHome + ')');
    console.log('');
    
    // Step 5: Update database
    console.log('💾 Step 5: Updating database...');
    await db.query(`
      UPDATE oracle.oddyssey_cycles 
      SET matches_data = $1, updated_at = NOW()
      WHERE cycle_id = 1
    `, [JSON.stringify(fixedMatches)]);
    
    console.log('✅ Database updated successfully');
    console.log('');
    
    // Step 6: Verify the fix in database
    console.log('✔️  Step 6: Verifying database update...');
    const verifyResult = await db.query(`
      SELECT matches_data
      FROM oracle.oddyssey_cycles 
      WHERE cycle_id = 1
    `);
    
    const verifiedMatches = verifyResult.rows[0].matches_data;
    const verifiedFirstMatch = verifiedMatches[0];
    
    console.log('Verified first match from database:');
    console.log('  startTime:', verifiedFirstMatch.startTime, '(type:', typeof verifiedFirstMatch.startTime + ')');
    console.log('  Date:', new Date(verifiedFirstMatch.startTime * 1000).toISOString());
    
    if (typeof verifiedFirstMatch.startTime === 'number') {
      console.log('✅ VERIFICATION PASSED: Data is now in correct format!');
    } else {
      console.log('❌ VERIFICATION FAILED: Data is still in wrong format!');
      process.exit(1);
    }
    
    console.log('');
    console.log('='.repeat(60));
    console.log('🎉 CYCLE 1 TIMEZONE DATA FIX COMPLETE!');
    console.log('='.repeat(60));
    console.log('');
    console.log('✅ All startTimes are now epoch numbers');
    console.log('✅ Database synchronized');
    console.log('✅ Cycle 1 ready for resolution');
    console.log('');
    
  } catch (error) {
    console.error('');
    console.error('❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

fixCycle1TimezoneData();

