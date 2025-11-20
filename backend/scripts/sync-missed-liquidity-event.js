/**
 * Script to manually sync missed LiquidityAdded events
 * Usage: node scripts/sync-missed-liquidity-event.js <poolId> <txHash>
 * Example: node scripts/sync-missed-liquidity-event.js 13 0xd9b758e4fbfa4b7e4854775cf777acbccab3c90f6dad1da18e621357ba27902e
 */

const { ethers } = require('ethers');
const config = require('../config');
const db = require('../db/db');

async function syncMissedLiquidityEvent(poolId, txHash) {
  try {
    console.log(`🔍 Fetching transaction ${txHash} for pool ${poolId}...`);
    
    // Initialize provider
    const provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    
    // Get transaction receipt
    const receipt = await provider.getTransactionReceipt(txHash);
    
    if (!receipt) {
      throw new Error(`Transaction ${txHash} not found`);
    }
    
    console.log(`✅ Transaction found at block ${receipt.blockNumber}`);
    
    // Get contract ABI for LiquidityAdded event
    const contractAddress = config.blockchain.contractAddresses.poolCore;
    const contractABI = [
      "event LiquidityAdded(uint256 indexed poolId, address indexed provider, uint256 amount)"
    ];
    
    const contract = new ethers.Contract(contractAddress, contractABI, provider);
    
    // Parse logs to find LiquidityAdded event
    let liquidityEvent = null;
    for (const log of receipt.logs) {
      try {
        const parsedLog = contract.interface.parseLog({
          topics: log.topics,
          data: log.data
        });
        
        if (parsedLog && parsedLog.name === 'LiquidityAdded') {
          liquidityEvent = parsedLog;
          console.log(`✅ Found LiquidityAdded event:`);
          console.log(`   Pool ID: ${parsedLog.args.poolId.toString()}`);
          console.log(`   Provider: ${parsedLog.args.provider}`);
          console.log(`   Amount: ${parsedLog.args.amount.toString()}`);
          break;
        }
      } catch (e) {
        // Not a LiquidityAdded event, continue
      }
    }
    
    if (!liquidityEvent) {
      throw new Error(`No LiquidityAdded event found in transaction ${txHash}`);
    }
    
    // Verify pool ID matches
    if (liquidityEvent.args.poolId.toString() !== poolId.toString()) {
      throw new Error(`Pool ID mismatch: expected ${poolId}, got ${liquidityEvent.args.poolId.toString()}`);
    }
    
    // Process the event using EventDrivenBetSync handler
    const EventDrivenBetSync = require('../services/event-driven-bet-sync');
    const betSync = new EventDrivenBetSync();
    
    // Create a mock event object
    const mockEvent = {
      log: {
        transactionHash: txHash,
        blockNumber: receipt.blockNumber,
        blockHash: receipt.blockHash,
        logIndex: liquidityEvent.logIndex || 0
      },
      transactionHash: txHash,
      blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash
    };
    
    console.log(`📝 Processing LiquidityAdded event...`);
    await betSync.handleLiquidityAdded(
      liquidityEvent.args.poolId,
      liquidityEvent.args.provider,
      liquidityEvent.args.amount,
      mockEvent
    );
    
    console.log(`✅ Successfully synced LiquidityAdded event for pool ${poolId}`);
    
  } catch (error) {
    console.error(`❌ Error syncing LiquidityAdded event:`, error);
    throw error;
  }
}

// Run script
const poolId = process.argv[2];
const txHash = process.argv[3];

if (!poolId || !txHash) {
  console.error('Usage: node scripts/sync-missed-liquidity-event.js <poolId> <txHash>');
  process.exit(1);
}

syncMissedLiquidityEvent(poolId, txHash)
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

