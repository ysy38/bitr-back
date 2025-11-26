#!/usr/bin/env node

/**
 * BITREDICT POOL ANALYTICS
 * 
 * Comprehensive analytics for BitredictPoolCore contract
 * - Pool creation monitoring
 * - Contract interaction analysis  
 * - Transaction history
 * - Usage statistics
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

class PoolAnalytics {
  constructor() {
    this.provider = null;
    this.contract = null;
    
    // Contract addresses
    this.contractAddress = process.env.POOL_CORE_ADDRESS || 
                          process.env.BITREDICT_POOL_ADDRESS || 
                          '0xBc54c64800d37d4A85C0ab15A13110a75742f423';
    
    // RPC URLs
    this.rpcUrl = process.env.RPC_URL || 
                  process.env.BLOCKCHAIN_RPC_URL ||
                  process.env.PROVIDER_URL ||
                  'https://dream-rpc.somnia.network/';
  }

  async initialize() {
    console.log('🔍 Initializing Pool Analytics...');
    
    // Initialize provider
    this.provider = new ethers.JsonRpcProvider(this.rpcUrl);
    
    // Test connection
    const network = await this.provider.getNetwork();
    console.log(`✅ Connected to network: Chain ID ${network.chainId}`);
    
    // Minimal ABI for analytics
    const abi = [
      "function poolCount() external view returns (uint256)",
      "function totalCollectedSTT() external view returns (uint256)",
      "function totalCollectedBITR() external view returns (uint256)",
      "function owner() external view returns (address)",
      "event PoolCreated(uint256 indexed poolId, address indexed creator, uint256 eventStartTime, uint256 eventEndTime, uint8 oracleType, bytes32 marketId, uint8 marketType, string league, string category)",
      "event BetPlaced(uint256 indexed poolId, address indexed bettor, uint256 amount, bool onCreatorSide)",
      "event PoolSettled(uint256 indexed poolId, bytes32 result, bool creatorSideWon, uint256 timestamp)",
      "event LiquidityAdded(uint256 indexed poolId, address indexed provider, uint256 amount)",
      "event LiquidityRemoved(uint256 indexed poolId, address indexed provider, uint256 amount)"
    ];
    
    this.contract = new ethers.Contract(this.contractAddress, abi, this.provider);
    console.log(`✅ Contract initialized: ${this.contractAddress}`);
  }

  async getContractInfo() {
    console.log('\n📊 CONTRACT INFORMATION');
    console.log('='.repeat(50));
    
    try {
      const poolCount = await this.contract.poolCount();
      console.log(`Total Pools: ${poolCount}`);
      
      try {
        const totalSTT = await this.contract.totalCollectedSTT();
        console.log(`Total STT Collected: ${ethers.formatEther(totalSTT)} STT`);
      } catch (e) {
        console.log('Total STT Collected: Unable to fetch');
      }
      
      try {
        const totalBITR = await this.contract.totalCollectedBITR();
        console.log(`Total BITR Collected: ${ethers.formatEther(totalBITR)} BITR`);
      } catch (e) {
        console.log('Total BITR Collected: Unable to fetch');
      }
      
      try {
        const owner = await this.contract.owner();
        console.log(`Contract Owner: ${owner}`);
      } catch (e) {
        console.log('Contract Owner: Unable to fetch');
      }
      
    } catch (error) {
      console.error('❌ Error fetching contract info:', error.message);
    }
  }

  async analyzeTransactions() {
    console.log('\n📈 TRANSACTION ANALYSIS');
    console.log('='.repeat(50));
    
    try {
      const currentBlock = await this.provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 50000); // Last 50k blocks
      
      console.log(`Analyzing blocks ${fromBlock} to ${currentBlock}...`);
      
      // Get all transactions to the contract
      const transactions = [];
      
      // This is a simplified approach - in production you'd use event logs
      console.log('📡 Fetching contract interactions...');
      
      // Check recent blocks for transactions to our contract
      let txCount = 0;
      const sampleSize = Math.min(1000, currentBlock - fromBlock);
      
      for (let i = 0; i < sampleSize; i += 100) {
        const blockNum = currentBlock - i;
        try {
          const block = await this.provider.getBlock(blockNum, true);
          if (block && block.transactions) {
            const contractTxs = block.transactions.filter(tx => 
              tx.to && tx.to.toLowerCase() === this.contractAddress.toLowerCase()
            );
            txCount += contractTxs.length;
            
            if (contractTxs.length > 0) {
              console.log(`Block ${blockNum}: ${contractTxs.length} transactions to contract`);
              contractTxs.forEach(tx => {
                transactions.push({
                  hash: tx.hash,
                  from: tx.from,
                  value: ethers.formatEther(tx.value || 0),
                  gasPrice: ethers.formatUnits(tx.gasPrice || 0, 'gwei'),
                  blockNumber: blockNum
                });
              });
            }
          }
        } catch (e) {
          // Skip blocks that can't be fetched
        }
        
        if (i % 500 === 0) {
          process.stdout.write(`\r📊 Scanned ${i}/${sampleSize} blocks...`);
        }
      }
      
      console.log(`\n✅ Found ${txCount} transactions to contract in last ${sampleSize} blocks`);
      
      if (transactions.length > 0) {
        console.log('\n📋 Recent Transactions:');
        transactions.slice(0, 10).forEach(tx => {
          console.log(`  ${tx.hash} - From: ${tx.from} - Value: ${tx.value} STT`);
        });
      }
      
    } catch (error) {
      console.error('❌ Error analyzing transactions:', error.message);
    }
  }

  async fetchAllEvents() {
    console.log('\n📡 EVENT ANALYSIS');
    console.log('='.repeat(50));
    
    try {
      const currentBlock = await this.provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 100000); // Last 100k blocks
      
      console.log(`Fetching events from block ${fromBlock} to ${currentBlock}...`);
      
      // Fetch all event types
      const eventTypes = [
        'PoolCreated',
        'BetPlaced', 
        'PoolSettled',
        'LiquidityAdded',
        'LiquidityRemoved'
      ];
      
      const allEvents = {};
      
      for (const eventType of eventTypes) {
        try {
          const filter = this.contract.filters[eventType]();
          const events = await this.contract.queryFilter(filter, fromBlock, currentBlock);
          allEvents[eventType] = events;
          console.log(`${eventType}: ${events.length} events`);
        } catch (e) {
          console.log(`${eventType}: Unable to fetch (${e.message})`);
          allEvents[eventType] = [];
        }
      }
      
      // Display event details
      Object.entries(allEvents).forEach(([eventType, events]) => {
        if (events.length > 0) {
          console.log(`\n📋 ${eventType} Events:`);
          events.slice(0, 5).forEach(event => {
            console.log(`  Block ${event.blockNumber}: ${event.transactionHash}`);
            if (event.args) {
              console.log(`    Args: ${JSON.stringify(event.args, null, 2)}`);
            }
          });
          
          if (events.length > 5) {
            console.log(`    ... and ${events.length - 5} more`);
          }
        }
      });
      
      return allEvents;
      
    } catch (error) {
      console.error('❌ Error fetching events:', error.message);
      return {};
    }
  }

  async checkContractDeployment() {
    console.log('\n🚀 CONTRACT DEPLOYMENT INFO');
    console.log('='.repeat(50));
    
    try {
      // Check if contract exists
      const code = await this.provider.getCode(this.contractAddress);
      
      if (code === '0x') {
        console.log('❌ No contract found at this address');
        return false;
      }
      
      console.log('✅ Contract exists at address');
      console.log(`Contract bytecode size: ${(code.length - 2) / 2} bytes`);
      
      // Try to get deployment block (this is approximate)
      const currentBlock = await this.provider.getBlockNumber();
      console.log(`Current block: ${currentBlock}`);
      
      // Check contract balance
      const balance = await this.provider.getBalance(this.contractAddress);
      console.log(`Contract STT balance: ${ethers.formatEther(balance)} STT`);
      
      return true;
      
    } catch (error) {
      console.error('❌ Error checking contract deployment:', error.message);
      return false;
    }
  }

  async generateReport() {
    console.log('\n📊 COMPREHENSIVE POOL ANALYTICS REPORT');
    console.log('='.repeat(60));
    console.log(`Contract: ${this.contractAddress}`);
    console.log(`Network: Chain ID ${(await this.provider.getNetwork()).chainId}`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    
    // Check if contract is deployed
    const isDeployed = await this.checkContractDeployment();
    if (!isDeployed) {
      console.log('\n❌ Contract not found or not deployed');
      return;
    }
    
    // Get basic contract info
    await this.getContractInfo();
    
    // Analyze events
    const events = await this.fetchAllEvents();
    
    // Analyze transactions
    await this.analyzeTransactions();
    
    // Summary
    console.log('\n📋 SUMMARY');
    console.log('='.repeat(50));
    
    const totalEvents = Object.values(events).reduce((sum, eventArray) => sum + eventArray.length, 0);
    console.log(`Total Events: ${totalEvents}`);
    
    if (totalEvents === 0) {
      console.log('🤷 No activity detected on this contract yet.');
      console.log('💡 This could mean:');
      console.log('   - Contract was recently deployed');
      console.log('   - No users have interacted with it yet');
      console.log('   - Contract is on a different network');
      console.log('   - Contract address is incorrect');
    } else {
      console.log('✅ Contract shows activity - pools and interactions detected');
    }
  }

  async run() {
    try {
      await this.initialize();
      await this.generateReport();
      console.log('\n✅ Pool analytics completed successfully!');
    } catch (error) {
      console.error('❌ Pool analytics failed:', error.message);
      process.exit(1);
    }
  }
}

// Run if called directly
if (require.main === module) {
  const analytics = new PoolAnalytics();
  analytics.run().catch(error => {
    console.error('💥 Unexpected error:', error);
    process.exit(1);
  });
}

module.exports = PoolAnalytics;
