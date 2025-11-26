#!/usr/bin/env node

/**
 * Check Oddyssey Contract State
 * 
 * This script checks the current state of the Oddyssey contract
 * to see if cycle 1 was created and what data exists
 */

const { ethers } = require('ethers');
require('dotenv').config();

// Contract addresses from new deployment
const ODDYSSEY_ADDRESS = '0x8A791620dd6260079BF849Dc5567aDC3F2FdC318';
const RPC_URL = process.env.RPC_URL || 'http://localhost:8545';

// ABI for key functions
const ODDYSSEY_ABI = [
  "function dailyCycleId() view returns (uint256)",
  "function getCurrentCycle() view returns (tuple(uint256 cycleId, uint256 startTime, uint256 endTime, uint8 state, uint256 totalSlips, uint256 totalVolume, uint256 entryFee))",
  "function getCycleStatus(uint256 cycleId) view returns (tuple(uint256 cycleId, uint256 startTime, uint256 endTime, uint8 state, uint256 totalSlips, uint256 totalVolume, uint256 entryFee))",
  "function slipCount() view returns (uint256)",
  "function entryFee() view returns (uint256)",
  "function getGlobalStats() view returns (tuple(uint256 totalSlips, uint256 totalVolume, uint256 totalWinnings, uint256 totalUsers))",
  "function getUserStats(address user) view returns (tuple(uint256 totalSlips, uint256 totalWinnings, uint256 winRate, uint256 totalVolume))"
];

async function checkOddysseyContract() {
  console.log('🔍 Checking Oddyssey Contract State...\n');
  
  try {
    // Connect to provider
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    console.log(`✅ Connected to RPC: ${RPC_URL}`);
    
    // Create contract instance
    const contract = new ethers.Contract(ODDYSSEY_ADDRESS, ODDYSSEY_ABI, provider);
    console.log(`✅ Connected to Oddyssey contract: ${ODDYSSEY_ADDRESS}\n`);
    
    // Check basic contract info
    console.log('📊 Basic Contract Info:');
    const entryFee = await contract.entryFee();
    const slipCount = await contract.slipCount();
    const dailyCycleId = await contract.dailyCycleId();
    
    console.log(`   Entry Fee: ${ethers.formatEther(entryFee)} ETH`);
    console.log(`   Total Slips: ${slipCount.toString()}`);
    console.log(`   Daily Cycle ID: ${dailyCycleId.toString()}\n`);
    
    // Check current cycle
    console.log('🔄 Current Cycle Info:');
    try {
      const currentCycle = await contract.getCurrentCycle();
      console.log(`   Cycle ID: ${currentCycle.cycleId.toString()}`);
      console.log(`   Start Time: ${new Date(Number(currentCycle.startTime) * 1000).toISOString()}`);
      console.log(`   End Time: ${new Date(Number(currentCycle.endTime) * 1000).toISOString()}`);
      console.log(`   State: ${currentCycle.state} (0=Active, 1=Resolved, 2=Expired)`);
      console.log(`   Total Slips: ${currentCycle.totalSlips.toString()}`);
      console.log(`   Total Volume: ${ethers.formatEther(currentCycle.totalVolume)} ETH`);
      console.log(`   Entry Fee: ${ethers.formatEther(currentCycle.entryFee)} ETH\n`);
    } catch (error) {
      console.log(`   ❌ Error getting current cycle: ${error.message}\n`);
    }
    
    // Check cycle 1 specifically
    console.log('🎯 Cycle 1 Status:');
    try {
      const cycle1 = await contract.getCycleStatus(1);
      console.log(`   Cycle ID: ${cycle1.cycleId.toString()}`);
      console.log(`   Start Time: ${new Date(Number(cycle1.startTime) * 1000).toISOString()}`);
      console.log(`   End Time: ${new Date(Number(cycle1.endTime) * 1000).toISOString()}`);
      console.log(`   State: ${cycle1.state} (0=Active, 1=Resolved, 2=Expired)`);
      console.log(`   Total Slips: ${cycle1.totalSlips.toString()}`);
      console.log(`   Total Volume: ${ethers.formatEther(cycle1.totalVolume)} ETH`);
      console.log(`   Entry Fee: ${ethers.formatEther(cycle1.entryFee)} ETH\n`);
    } catch (error) {
      console.log(`   ❌ Error getting cycle 1: ${error.message}\n`);
    }
    
    // Check global stats
    console.log('📈 Global Stats:');
    try {
      const globalStats = await contract.getGlobalStats();
      console.log(`   Total Slips: ${globalStats.totalSlips.toString()}`);
      console.log(`   Total Volume: ${ethers.formatEther(globalStats.totalVolume)} ETH`);
      console.log(`   Total Winnings: ${ethers.formatEther(globalStats.totalWinnings)} ETH`);
      console.log(`   Total Users: ${globalStats.totalUsers.toString()}\n`);
    } catch (error) {
      console.log(`   ❌ Error getting global stats: ${error.message}\n`);
    }
    
    // Check if we can get user stats (test with zero address)
    console.log('👤 User Stats Test:');
    try {
      const testUser = '0x0000000000000000000000000000000000000000';
      const userStats = await contract.getUserStats(testUser);
      console.log(`   Test User: ${testUser}`);
      console.log(`   Total Slips: ${userStats.totalSlips.toString()}`);
      console.log(`   Total Winnings: ${ethers.formatEther(userStats.totalWinnings)} ETH`);
      console.log(`   Win Rate: ${userStats.winRate.toString()}%`);
      console.log(`   Total Volume: ${ethers.formatEther(userStats.totalVolume)} ETH\n`);
    } catch (error) {
      console.log(`   ❌ Error getting user stats: ${error.message}\n`);
    }
    
    console.log('✅ Oddyssey contract check complete!');
    
  } catch (error) {
    console.error('❌ Error checking Oddyssey contract:', error);
    process.exit(1);
  }
}

// Run check
checkOddysseyContract().catch(console.error);
