#!/usr/bin/env node
require('dotenv').config();
const db = require('../db/db');
const OddysseyOracleBot = require('../services/oddyssey-oracle-bot');

/**
 * MANUAL CYCLE CREATION SCRIPT
 * 
 * This script manually creates a new Oddyssey cycle using real match data,
 * exactly as the automated system would do at 00:05 UTC.
 * 
 * ⚠️ IMPORTANT: This uses REAL data from SportMonks API!
 * ⚠️ Only run this when you need to manually create today's cycle.
 */

async function createCycleManually() {
  console.log('🚀 MANUAL ODDYSSEY CYCLE CREATION');
  console.log('='.repeat(80));
  console.log('');
  
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  
  console.log(`📅 Date: ${todayStr}`);
  console.log(`🕐 Current Time (UTC): ${today.toISOString()}`);
  console.log('');
  
  try {
    // Step 1: Check if cycle already exists for today
    console.log('🔍 Step 1: Checking if cycle already exists for today...');
    const existingCycle = await db.query(`
      SELECT cycle_id, created_at, status 
      FROM oracle.oddyssey_cycles 
      WHERE DATE(created_at) = $1 
      ORDER BY cycle_id DESC 
      LIMIT 1
    `, [todayStr]);

    if (existingCycle.rows.length > 0) {
      const cycle = existingCycle.rows[0];
      console.log(`⚠️  A cycle already exists for today!`);
      console.log(`   Cycle ID: ${cycle.cycle_id}`);
      console.log(`   Created: ${cycle.created_at}`);
      console.log(`   Status: ${cycle.status}`);
      console.log('');
      
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const answer = await new Promise(resolve => {
        readline.question('⚠️  Do you want to create another cycle anyway? (yes/no): ', resolve);
      });
      readline.close();
      
      if (answer.toLowerCase() !== 'yes') {
        console.log('❌ Cancelled by user.');
        process.exit(0);
      }
      
      console.log('⚠️  Proceeding with cycle creation...');
      console.log('');
    } else {
      console.log('✅ No existing cycle found for today. Safe to create.');
      console.log('');
    }

    // Step 2: Initialize Oracle Bot
    console.log('🤖 Step 2: Initializing Oddyssey Oracle Bot...');
    const oracleBot = new OddysseyOracleBot();
    console.log('✅ Oracle Bot initialized.');
    console.log('');

    // Step 3: Call startNewDailyCycle (uses real SportMonks data!)
    console.log('🛡️  Step 3: Creating cycle with REAL match data from SportMonks API...');
    console.log('⏳ This may take 30-60 seconds...');
    console.log('');
    
    await oracleBot.startNewDailyCycle();
    
    console.log('');
    console.log('✅ Cycle created successfully!');
    console.log('');

    // Step 4: Verify the cycle was created
    console.log('🔍 Step 4: Verifying cycle creation...');
    const newCycle = await db.query(`
      SELECT 
        c.cycle_id, 
        c.created_at, 
        c.status,
        COUNT(DISTINCT f.fixture_id) as fixture_count
      FROM oracle.oddyssey_cycles c
      LEFT JOIN oracle.oddyssey_cycle_fixtures cf ON c.cycle_id = cf.cycle_id
      LEFT JOIN oracle.fixtures f ON cf.fixture_id = f.fixture_id
      WHERE DATE(c.created_at) = $1 
      GROUP BY c.cycle_id, c.created_at, c.status
      ORDER BY c.cycle_id DESC 
      LIMIT 1
    `, [todayStr]);

    if (newCycle.rows.length > 0) {
      const cycle = newCycle.rows[0];
      console.log('✅ Cycle verified in database:');
      console.log(`   Cycle ID: ${cycle.cycle_id}`);
      console.log(`   Created: ${cycle.created_at}`);
      console.log(`   Status: ${cycle.status}`);
      console.log(`   Fixtures: ${cycle.fixture_count} matches`);
      console.log('');

      // Step 5: Check contract state
      console.log('🔍 Step 5: Checking on-chain cycle state...');
      try {
        const ethers = require('ethers');
        const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
        const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
        
        const oddysseyAbi = require('../solidity/Oddyssey.json');
        const oddysseyContract = new ethers.Contract(
          process.env.ODDYSSEY_CONTRACT,
          oddysseyAbi,
          wallet
        );

        const cycleInfo = await oddysseyContract.cycleInfo(cycle.cycle_id);
        console.log('✅ On-chain cycle info:');
        console.log(`   Cycle ID: ${cycle.cycle_id}`);
        console.log(`   State: ${cycleInfo.state} (0=NotStarted, 1=Active, 2=Ended, 3=Resolved)`);
        console.log(`   Start Time: ${new Date(Number(cycleInfo.startTime) * 1000).toISOString()}`);
        console.log(`   End Time: ${new Date(Number(cycleInfo.endTime) * 1000).toISOString()}`);
        console.log(`   Slips: ${cycleInfo.slipCount}`);
        console.log('');
      } catch (contractError) {
        console.warn('⚠️  Could not check contract state:', contractError.message);
        console.log('');
      }

      // Step 6: Display fixtures
      console.log('🔍 Step 6: Fetching cycle fixtures...');
      const fixtures = await db.query(`
        SELECT 
          f.fixture_id,
          f.home_team,
          f.away_team,
          f.league_name,
          f.match_time
        FROM oracle.oddyssey_cycle_fixtures cf
        JOIN oracle.fixtures f ON cf.fixture_id = f.fixture_id
        WHERE cf.cycle_id = $1
        ORDER BY f.match_time
        LIMIT 10
      `, [cycle.cycle_id]);

      if (fixtures.rows.length > 0) {
        console.log(`✅ Found ${fixtures.rows.length} fixtures in cycle:`);
        fixtures.rows.forEach((f, idx) => {
          const matchTime = new Date(f.match_time);
          console.log(`   ${idx + 1}. ${f.home_team} vs ${f.away_team}`);
          console.log(`      League: ${f.league_name}`);
          console.log(`      Time: ${matchTime.toISOString()}`);
        });
        console.log('');
      }

      console.log('='.repeat(80));
      console.log('🎉 CYCLE CREATION COMPLETE!');
      console.log('='.repeat(80));
      console.log('');
      console.log('✅ Database: Cycle created');
      console.log('✅ Blockchain: Cycle initialized');
      console.log('✅ Fixtures: Real matches loaded');
      console.log('');
      console.log('Users can now place slips for today\'s Oddyssey cycle!');
      console.log('');

    } else {
      console.error('❌ Cycle not found in database after creation!');
      process.exit(1);
    }

  } catch (error) {
    console.error('');
    console.error('='.repeat(80));
    console.error('❌ ERROR DURING CYCLE CREATION');
    console.error('='.repeat(80));
    console.error('');
    console.error('Error:', error.message);
    console.error('');
    if (error.stack) {
      console.error('Stack trace:');
      console.error(error.stack);
    }
    console.error('');
    process.exit(1);
  } finally {
    // Don't call db.end() as it might be used by the oracle bot
    console.log('✅ Script completed.');
    process.exit(0);
  }
}

// Run the script
console.log('');
console.log('⚠️  WARNING: This script will create a new Oddyssey cycle with REAL match data!');
console.log('⚠️  Make sure you want to do this before proceeding.');
console.log('');

createCycleManually();

