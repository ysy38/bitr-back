#!/usr/bin/env node
require('dotenv').config();
const { ethers } = require('ethers');
const db = require('../db/db');
const SimpleBulletproofService = require('../services/simple-bulletproof-service');

/**
 * SIMPLE MANUAL CYCLE CREATION
 * 
 * Creates an Oddyssey cycle with real matches, avoiding the double-insertion bug
 */

async function createCycleSimple() {
  console.log('🚀 SIMPLE ODDYSSEY CYCLE CREATION');
  console.log('='.repeat(80));
  console.log('');
  
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  
  console.log(`📅 Date: ${todayStr}`);
  console.log(`🕐 Current Time (UTC): ${today.toISOString()}`);
  console.log('');
  
  try {
    // Step 1: Initialize bulletproof service
    console.log('🛡️  Step 1: Initializing bulletproof service...');
    const bulletproofService = new SimpleBulletproofService();
    await bulletproofService.initialize();
    console.log('✅ Bulletproof service initialized');
    console.log('');

    // Step 2: Create cycle in database (this creates 10 matches in daily_game_matches)
    console.log('📊 Step 2: Creating cycle in database with real matches...');
    const cycleResult = await bulletproofService.createBulletproofCycle(todayStr, null);
    
    if (!cycleResult.success) {
      throw new Error(`Cycle creation failed: ${cycleResult.errors ? cycleResult.errors.join(', ') : 'Unknown error'}`);
    }
    
    console.log(`✅ Cycle ${cycleResult.cycleId} created in database`);
    console.log(`   Matches: ${cycleResult.matchCount}`);
    console.log('');

    // Step 3: Get matches for contract
    console.log('📤 Step 3: Preparing matches for blockchain...');
    const matchesQuery = await db.query(`
      SELECT 
        fixture_id, home_team, away_team, league_name, match_date,
        home_odds, draw_odds, away_odds, over_25_odds, under_25_odds,
        display_order
      FROM oracle.daily_game_matches
      WHERE cycle_id = $1
      ORDER BY display_order ASC
    `, [cycleResult.cycleId]);

    console.log(`✅ Found ${matchesQuery.rows.length} matches for contract`);
    
    if (matchesQuery.rows.length !== 10) {
      throw new Error(`Expected 10 matches, got ${matchesQuery.rows.length}`);
    }

    // Step 4: Format matches for contract
    const matchesForContract = matchesQuery.rows.map(row => ({
      id: BigInt(row.fixture_id),
      startTime: Math.floor(new Date(row.match_date).getTime() / 1000),
      oddsHome: Math.floor(parseFloat(row.home_odds) * 1000),
      oddsDraw: Math.floor(parseFloat(row.draw_odds) * 1000),
      oddsAway: Math.floor(parseFloat(row.away_odds) * 1000),
      oddsOver: Math.floor(parseFloat(row.over_25_odds) * 1000),
      oddsUnder: Math.floor(parseFloat(row.under_25_odds) * 1000),
      homeTeam: row.home_team,
      awayTeam: row.away_team,
      leagueName: row.league_name,
      result: {
        moneyline: 0, // NotSet
        overUnder: 0  // NotSet
      }
    }));

    console.log('✅ Matches formatted for contract');
    console.log('');

    // Step 5: Submit to blockchain
    console.log('🔗 Step 4: Submitting cycle to Oddyssey contract...');
    console.log('⏳ This may take 30-60 seconds...');
    
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://dream-rpc.somnia.network/');
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    
    const OddysseyABI = require('../solidity/Oddyssey.json').abi || require('../solidity/Oddyssey.json');
    const ODDYSSEY_ADDRESS = process.env.ODDYSSEY_CONTRACT || '0x91eAf09ea6024F88eDB26F460429CdfD52349259';
    
    const oddysseyContract = new ethers.Contract(
      ODDYSSEY_ADDRESS,
      OddysseyABI,
      wallet
    );

    console.log(`📍 Oddyssey contract: ${ODDYSSEY_ADDRESS}`);

    // Estimate gas
    const gasEstimate = await oddysseyContract.startDailyCycle.estimateGas(matchesForContract);
    console.log(`⛽ Gas estimate: ${gasEstimate.toString()}`);

    // Send transaction
    const tx = await oddysseyContract.startDailyCycle(matchesForContract, {
      gasLimit: gasEstimate + 500000n,
      gasPrice: '7000000000' // 7 gwei
    });

    console.log(`📝 Transaction sent: ${tx.hash}`);
    console.log(`🔗 Explorer: https://shannon-explorer.somnia.network/tx/${tx.hash}`);
    
    const receipt = await tx.wait();
    
    if (receipt.status !== 1) {
      throw new Error('Transaction failed on-chain');
    }

    console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);
    console.log(`⛽ Gas used: ${receipt.gasUsed.toString()}`);
    console.log('');

    // Step 6: Update database with transaction hash
    console.log('💾 Step 5: Updating database with transaction details...');
    await db.query(`
      UPDATE oracle.oddyssey_cycles 
      SET tx_hash = $1, updated_at = NOW()
      WHERE cycle_id = $2
    `, [tx.hash, cycleResult.cycleId]);
    console.log('✅ Database updated');
    console.log('');

    // Step 7: Display results
    console.log('='.repeat(80));
    console.log('🎉 CYCLE CREATION COMPLETE!');
    console.log('='.repeat(80));
    console.log('');
    console.log(`✅ Cycle ID: ${cycleResult.cycleId}`);
    console.log(`✅ Matches: ${matchesQuery.rows.length}`);
    console.log(`✅ Transaction: ${tx.hash}`);
    console.log(`✅ Block: ${receipt.blockNumber}`);
    console.log('');
    console.log('📋 Matches in cycle:');
    matchesQuery.rows.forEach((match, idx) => {
      console.log(`   ${idx + 1}. ${match.home_team} vs ${match.away_team}`);
      console.log(`      League: ${match.league_name}`);
      console.log(`      Time: ${new Date(match.match_date).toISOString()}`);
    });
    console.log('');
    console.log('🎮 Users can now place slips for today\'s Oddyssey cycle!');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('='.repeat(80));
    console.error('❌ ERROR DURING CYCLE CREATION');
    console.error('='.repeat(80));
    console.error('');
    console.error('Error:', error.message);
    if (error.stack) {
      console.error('');
      console.error('Stack trace:');
      console.error(error.stack);
    }
    console.error('');
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

createCycleSimple();

