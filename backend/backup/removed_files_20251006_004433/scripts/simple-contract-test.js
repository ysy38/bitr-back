#!/usr/bin/env node

/**
 * Simple Contract Test
 * Test basic contract connection and get slip count
 */

require('dotenv').config();
const { ethers } = require('ethers');
const config = require('../config');

async function testContractConnection() {
  console.log('🚀 Testing contract connection...');
  
  try {
    // Try primary RPC first
    let provider;
    try {
      provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
      await provider.getBlockNumber();
      console.log('✅ Primary RPC connected');
    } catch (error) {
      console.log('⚠️ Primary RPC failed, trying fallback...');
      provider = new ethers.JsonRpcProvider(config.blockchain.fallbackRpcUrl);
      await provider.getBlockNumber();
      console.log('✅ Fallback RPC connected');
    }
    
    // Load contract ABI
    const abiPath = require('path').join(__dirname, '../oddyssey-contract-abi.json');
    const abi = require(abiPath).abi;
    
    // Get contract instance - USE THE CORRECT ADDRESS
    const contractAddress = '0xD9E1f0c0D1105B03CE3ad6db1Ad36a4909EE733C'; // CORRECT ADDRESS
    console.log(`📍 Contract address: ${contractAddress}`);
    console.log(`📍 Config address: ${config.blockchain.contractAddresses.oddyssey}`);
    console.log(`⚠️  WARNING: Backend is using wrong address!`);
    
    const contract = new ethers.Contract(contractAddress, abi, provider);
    
    // Test basic calls
    console.log('🔍 Testing contract calls...');
    
    const currentCycle = await contract.getCurrentCycle();
    console.log(`📊 Current cycle: ${currentCycle}`);
    
    const totalSlipCount = await contract.slipCount();
    console.log(`📋 Total slips in contract: ${totalSlipCount}`);
    
    // Check if we can get cycle info
    try {
      const cycleInfo = await contract.getCurrentCycleInfo();
      console.log(`📋 Current cycle info:`, cycleInfo);
    } catch (error) {
      console.log(`⚠️ Could not get cycle info: ${error.message}`);
    }
    
    // Check if cycle 1 exists
    const isCycle1Initialized = await contract.isCycleInitialized(1);
    console.log(`📋 Cycle 1 initialized: ${isCycle1Initialized}`);
    
    if (Number(totalSlipCount) > 0) {
      console.log('🎯 Found slips! Let me get the details...');
      
      // Try to find slips by scanning
      const maxSlipId = Math.min(Number(totalSlipCount), 100);
      for (let slipId = 0; slipId < maxSlipId; slipId++) {
        try {
          const slip = await contract.getSlip(slipId);
          if (slip && slip.cycleId) {
            const placedAt = new Date(Number(slip.placedAt) * 1000);
            const isToday = placedAt.toDateString() === new Date().toDateString();
            
            console.log(`✅ Found slip ${slipId}:`, {
              player: slip.player,
              cycleId: slip.cycleId.toString(),
              isEvaluated: slip.isEvaluated,
              correctCount: slip.correctCount.toString(),
              placedAt: placedAt.toISOString(),
              isToday: isToday
            });
          }
        } catch (error) {
          // Slip doesn't exist
          continue;
        }
      }
      
      // Check for slips in recent cycles (1-12)
      console.log('\n🔍 Checking recent cycles for slips...');
      for (let cycleId = 1; cycleId <= Number(currentCycle); cycleId++) {
        try {
          const isInitialized = await contract.isCycleInitialized(cycleId);
          if (isInitialized) {
            console.log(`📋 Cycle ${cycleId} is initialized`);
            
            // Try to get cycle stats if available
            try {
              const cycleStats = await contract.getDailyStats(cycleId);
              console.log(`📊 Cycle ${cycleId} stats:`, {
                slipCount: cycleStats.slipCount.toString(),
                userCount: cycleStats.userCount.toString(),
                volume: cycleStats.volume.toString()
              });
            } catch (error) {
              // Method not available
            }
          }
        } catch (error) {
          // Cycle doesn't exist
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Contract test failed:', error.message);
  }
}

testContractConnection();
