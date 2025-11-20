#!/usr/bin/env node

/**
 * Check Pool 4 Bets
 * 
 * This script checks the contract directly for Pool 4 bets to see if there are
 * any missed bets that the bet sync service didn't catch.
 */

const Web3Service = require('../services/web3-service');

async function checkPool4Bets() {
  console.log('🔍 Checking Pool 4 bets directly from contract...\n');
  
  try {
    // Initialize Web3 service
    const web3Service = new Web3Service();
    await web3Service.initialize();
    
    const contract = await web3Service.getPoolCoreContractForEvents();
    if (!contract) {
      throw new Error('Contract not available');
    }
    
    console.log('✅ Web3 service initialized');
    
    // Get pool data for Pool 4
    console.log('\n📊 Pool 4 data:');
    const poolData = await contract.getPool(4);
    console.log('Pool 4:', {
      creator: poolData.creator,
      predictedOutcome: poolData.predictedOutcome,
      totalStakeFor: poolData.totalStakeFor.toString(),
      totalStakeAgainst: poolData.totalStakeAgainst.toString(),
      status: poolData.status,
      eventStartTime: new Date(Number(poolData.eventStartTime) * 1000).toISOString(),
      eventEndTime: new Date(Number(poolData.eventEndTime) * 1000).toISOString(),
      bettingEndTime: new Date(Number(poolData.bettingEndTime) * 1000).toISOString()
    });
    
    // Check if there are any BetPlaced events for Pool 4
    console.log('\n🎯 Checking BetPlaced events for Pool 4...');
    
    // Get current block number
    const currentBlock = await web3Service.provider.getBlockNumber();
    console.log(`Current block: ${currentBlock}`);
    
    // Check events from the last 1000 blocks
    const fromBlock = Math.max(0, currentBlock - 1000);
    console.log(`Checking events from block ${fromBlock} to ${currentBlock}`);
    
    try {
      const filter = contract.filters.BetPlaced(4);
      const events = await contract.queryFilter(filter, fromBlock, currentBlock);
      
      console.log(`\n📈 Found ${events.length} BetPlaced events for Pool 4:`);
      
      events.forEach((event, index) => {
        console.log(`\nEvent ${index + 1}:`);
        console.log(`  Block: ${event.blockNumber}`);
        console.log(`  Transaction: ${event.transactionHash}`);
        console.log(`  Bettor: ${event.args.bettor}`);
        console.log(`  Amount: ${event.args.amount.toString()} wei (${(Number(event.args.amount) / 1e18).toFixed(2)} tokens)`);
        console.log(`  Is For Outcome: ${event.args.isForOutcome}`);
        console.log(`  Timestamp: ${new Date().toISOString()}`);
      });
      
      if (events.length === 0) {
        console.log('❌ No BetPlaced events found for Pool 4 in recent blocks');
      }
      
    } catch (error) {
      console.error('❌ Error querying events:', error.message);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkPool4Bets();
