#!/usr/bin/env node

/**
 * Check Cycle Status
 * Quick status check for Oddyssey cycles and match selection
 */

require('dotenv').config();
const db = require('../db/db');

async function checkCycleStatus() {
  console.log('🔍 ===== CHECKING CYCLE STATUS =====\n');
  
  try {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    // Check today's matches
    console.log('📅 Today\'s Match Selection Status:');
    const todayMatches = await db.query(`
      SELECT COUNT(*) as count, MIN(created_at) as first_created, MAX(created_at) as last_created
      FROM oracle.daily_game_matches 
      WHERE game_date = $1
    `, [today]);
    
    console.log(`   Matches selected: ${todayMatches.rows[0].count}`);
    if (todayMatches.rows[0].first_created) {
      console.log(`   First created: ${todayMatches.rows[0].first_created}`);
      console.log(`   Last created: ${todayMatches.rows[0].last_created}`);
    }
    
    // Check today's cycle
    console.log('\n🎯 Today\'s Cycle Status:');
    const todayCycle = await db.query(`
      SELECT 
        cycle_id, 
        created_at, 
        matches_count, 
        is_resolved,
        cycle_start_time,
        cycle_end_time,
        tx_hash
      FROM oracle.oddyssey_cycles 
      WHERE DATE(created_at) = $1
      ORDER BY cycle_id DESC
      LIMIT 1
    `, [today]);
    
    if (todayCycle.rows.length > 0) {
      const cycle = todayCycle.rows[0];
      console.log(`   ✅ Cycle exists: ID ${cycle.cycle_id}`);
      console.log(`   Created: ${cycle.created_at}`);
      console.log(`   Matches: ${cycle.matches_count}`);
      console.log(`   Resolved: ${cycle.is_resolved}`);
      console.log(`   TX Hash: ${cycle.tx_hash || 'N/A'}`);
      console.log(`   Start Time: ${cycle.cycle_start_time}`);
      console.log(`   End Time: ${cycle.cycle_end_time}`);
    } else {
      console.log('   ❌ No cycle found for today');
    }
    
    // Check recent cycles
    console.log('\n📊 Recent Cycles (Last 5):');
    const recentCycles = await db.query(`
      SELECT 
        cycle_id, 
        DATE(created_at) as date,
        created_at,
        matches_count, 
        is_resolved,
        tx_hash IS NOT NULL as has_tx
      FROM oracle.oddyssey_cycles 
      ORDER BY cycle_id DESC
      LIMIT 5
    `);
    
    recentCycles.rows.forEach(cycle => {
      const status = cycle.is_resolved ? '✅ Resolved' : '⏳ Pending';
      const tx = cycle.has_tx ? '✅' : '❌';
      console.log(`   Cycle ${cycle.cycle_id} (${cycle.date}): ${cycle.matches_count} matches, ${status}, TX: ${tx}`);
    });
    
    // Check for any failed cycles (no tx_hash)
    console.log('\n⚠️  Failed Cycles (No TX Hash):');
    const failedCycles = await db.query(`
      SELECT cycle_id, created_at, matches_count
      FROM oracle.oddyssey_cycles 
      WHERE tx_hash IS NULL
      ORDER BY cycle_id DESC
      LIMIT 5
    `);
    
    if (failedCycles.rows.length > 0) {
      failedCycles.rows.forEach(cycle => {
        console.log(`   ❌ Cycle ${cycle.cycle_id} (${cycle.created_at}): ${cycle.matches_count} matches - NO TX HASH`);
      });
    } else {
      console.log('   ✅ No failed cycles found');
    }
    
    // Check cron job timing
    console.log('\n⏰ Cron Job Timing Analysis:');
    const now = new Date();
    const utcHour = now.getUTCHours();
    const utcMinute = now.getUTCMinutes();
    
    console.log(`   Current UTC time: ${utcHour.toString().padStart(2, '0')}:${utcMinute.toString().padStart(2, '0')}`);
    console.log(`   Match selection (10:47 UTC): ${utcHour === 10 && utcMinute >= 45 && utcMinute <= 50 ? '🟢 ACTIVE WINDOW' : '⚪ Outside window'}`);
    console.log(`   Cycle creation (10:50 UTC): ${utcHour === 10 && utcMinute >= 50 && utcMinute <= 55 ? '🟢 ACTIVE WINDOW' : '⚪ Outside window'}`);
    
    // Summary
    console.log('\n📋 Summary:');
    const hasMatches = parseInt(todayMatches.rows[0].count) >= 10;
    const hasCycle = todayCycle.rows.length > 0;
    const cycleHasTx = hasCycle && todayCycle.rows[0].tx_hash;
    
    console.log(`   Today's matches: ${hasMatches ? '✅' : '❌'} (${todayMatches.rows[0].count}/10)`);
    console.log(`   Today's cycle: ${hasCycle ? '✅' : '❌'}`);
    console.log(`   Cycle on blockchain: ${cycleHasTx ? '✅' : '❌'}`);
    
    const allGood = hasMatches && hasCycle && cycleHasTx;
    console.log(`\n${allGood ? '🎉 ALL SYSTEMS OPERATIONAL' : '⚠️  ISSUES DETECTED'}`);
    
    return allGood;
    
  } catch (error) {
    console.error('❌ Status check failed:', error);
    return false;
  }
}

// Run the check
if (require.main === module) {
  checkCycleStatus()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Check failed:', error);
      process.exit(1);
    });
}

module.exports = checkCycleStatus;
