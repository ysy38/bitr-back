#!/usr/bin/env node

/**
 * IMPROVED BITREDICT POOL FETCHER
 * 
 * Fetches pools from the correct BitredictPoolCore contract
 * with better RPC handling and smaller block ranges
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

class ImprovedPoolFetcher {
  constructor() {
    this.provider = null;
    this.contract = null;
    
    // CORRECT CONTRACT ADDRESS - updated to new gas-optimized contract
    this.contractAddress = '0xBc54c64800d37d4A85C0ab15A13110a75742f423';
    
    // Multiple RPC endpoints for reliability
    this.rpcUrls = [
      'https://dream-rpc.somnia.network/',
      'https://rpc.ankr.com/somnia_testnet/c8e336679a7fe85909f310fbbdd5fbb18d3b7560b1d3eca7aa97874b0bb81e97',
      'https://somnia-testnet.rpc.thirdweb.com',
      'https://testnet-rpc.somnia.network'
    ];
  }

  async initialize() {
    console.log('🚀 Initializing Improved Pool Fetcher...');
    console.log(`📍 Contract Address: ${this.contractAddress}`);
    
    // Try multiple RPC endpoints
    for (const rpcUrl of this.rpcUrls) {
      try {
        console.log(`🔗 Trying RPC: ${rpcUrl}`);
        this.provider = new ethers.JsonRpcProvider(rpcUrl);
        
        // Test connection
        const network = await this.provider.getNetwork();
        console.log(`✅ Connected to Somnia Testnet (Chain ID: ${network.chainId})`);
        break;
      } catch (error) {
        console.log(`❌ Failed to connect to ${rpcUrl}: ${error.message}`);
        continue;
      }
    }
    
    if (!this.provider) {
      throw new Error('❌ Could not connect to any RPC endpoint');
    }

    // Enhanced ABI with all pool-related functions
    const abi = [
      // View functions
      "function poolCount() external view returns (uint256)",
      "function pools(uint256) external view returns (address creator, uint16 odds, uint8 flags, uint8 oracleType, uint256 creatorStake, uint256 totalCreatorSideStake, uint256 maxBettorStake, uint256 totalBettorStake, bytes32 predictedOutcome, bytes32 result, bytes32 marketId, uint256 eventStartTime, uint256 eventEndTime, uint256 bettingEndTime, uint256 resultTimestamp, uint256 arbitrationDeadline, string memory league, string memory category, string memory region, string memory homeTeam, string memory awayTeam, string memory title, uint256 maxBetPerUser)",
      "function totalCollectedSTT() external view returns (uint256)",
      "function totalCollectedBITR() external view returns (uint256)",
      "function owner() external view returns (address)",
      
      // Events with correct signatures
      "event PoolCreated(uint256 indexed poolId, address indexed creator, uint256 eventStartTime, uint256 eventEndTime, uint8 oracleType, bytes32 marketId, uint8 marketType, string league, string category)",
      "event BetPlaced(uint256 indexed poolId, address indexed bettor, uint256 amount, bool onCreatorSide)",
      "event PoolSettled(uint256 indexed poolId, bytes32 result, bool creatorSideWon, uint256 timestamp)",
      "event LiquidityAdded(uint256 indexed poolId, address indexed provider, uint256 amount)",
      "event LiquidityRemoved(uint256 indexed poolId, address indexed provider, uint256 amount)"
    ];
    
    this.contract = new ethers.Contract(this.contractAddress, abi, this.provider);
    console.log('✅ Contract initialized successfully');
  }

  async getBasicInfo() {
    console.log('\n📊 BASIC CONTRACT INFORMATION');
    console.log('='.repeat(50));
    
    try {
      // Check if contract exists
      const code = await this.provider.getCode(this.contractAddress);
      if (code === '0x') {
        console.log('❌ No contract found at this address!');
        return false;
      }
      console.log('✅ Contract exists and is deployed');
      
      // Get basic info
      const [poolCount, balance, currentBlock] = await Promise.all([
        this.contract.poolCount(),
        this.provider.getBalance(this.contractAddress),
        this.provider.getBlockNumber()
      ]);
      
      console.log(`Pool Count: ${poolCount}`);
      console.log(`Contract Balance: ${ethers.formatEther(balance)} STT`);
      console.log(`Current Block: ${currentBlock}`);
      
      // Try to get additional info
      try {
        const owner = await this.contract.owner();
        console.log(`Contract Owner: ${owner}`);
      } catch (e) {
        console.log('Contract Owner: Unable to fetch');
      }
      
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
      
      return { poolCount: Number(poolCount), currentBlock: Number(currentBlock) };
      
    } catch (error) {
      console.error('❌ Error getting basic info:', error.message);
      return false;
    }
  }

  async fetchPoolsData(poolCount) {
    if (poolCount === 0) {
      console.log('\n🤷 No pools found in the contract yet.');
      return [];
    }
    
    console.log(`\n📥 Fetching data for ${poolCount} pools...`);
    const pools = [];
    
    for (let i = 1; i <= poolCount; i++) {
      try {
        process.stdout.write(`\r📊 Fetching pool ${i}/${poolCount}...`);
        
        const poolData = await this.contract.pools(i);
        
        // Parse the returned tuple
        const [
          creator, odds, flags, oracleType, creatorStake, totalCreatorSideStake,
          maxBettorStake, totalBettorStake, predictedOutcome, result, marketId,
          eventStartTime, eventEndTime, bettingEndTime, resultTimestamp,
          arbitrationDeadline, league, category, region, homeTeam, awayTeam,
          title, maxBetPerUser
        ] = poolData;

        pools.push({
          poolId: i,
          creator,
          odds: Number(odds),
          flags: Number(flags),
          oracleType: Number(oracleType),
          creatorStake: ethers.formatEther(creatorStake),
          totalCreatorSideStake: ethers.formatEther(totalCreatorSideStake),
          maxBettorStake: ethers.formatEther(maxBettorStake),
          totalBettorStake: ethers.formatEther(totalBettorStake),
          predictedOutcome,
          result,
          marketId,
          eventStartTime: Number(eventStartTime),
          eventEndTime: Number(eventEndTime),
          bettingEndTime: Number(bettingEndTime),
          resultTimestamp: Number(resultTimestamp),
          arbitrationDeadline: Number(arbitrationDeadline),
          league,
          category,
          region,
          homeTeam,
          awayTeam,
          title,
          maxBetPerUser: ethers.formatEther(maxBetPerUser)
        });
        
      } catch (error) {
        console.error(`\n❌ Error fetching pool ${i}:`, error.message);
      }
    }
    
    console.log(`\n✅ Successfully fetched ${pools.length} pools`);
    return pools;
  }

  async fetchEventsInChunks(currentBlock) {
    console.log('\n📡 FETCHING EVENTS (Small Chunks)');
    console.log('='.repeat(50));
    
    const events = {
      PoolCreated: [],
      BetPlaced: [],
      PoolSettled: [],
      LiquidityAdded: [],
      LiquidityRemoved: []
    };
    
    // Use smaller chunks to avoid RPC limits
    const chunkSize = 500; // Small chunks
    const totalBlocks = 5000; // Look back 5000 blocks
    const fromBlock = Math.max(0, currentBlock - totalBlocks);
    
    console.log(`Scanning blocks ${fromBlock} to ${currentBlock} in chunks of ${chunkSize}...`);
    
    for (let start = fromBlock; start < currentBlock; start += chunkSize) {
      const end = Math.min(start + chunkSize - 1, currentBlock);
      
      process.stdout.write(`\r📊 Scanning blocks ${start} to ${end}...`);
      
      for (const eventName of Object.keys(events)) {
        try {
          const filter = this.contract.filters[eventName]();
          const eventLogs = await this.contract.queryFilter(filter, start, end);
          events[eventName].push(...eventLogs);
        } catch (error) {
          // Skip errors for individual chunks
        }
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log('\n');
    
    // Display results
    Object.entries(events).forEach(([eventName, eventList]) => {
      console.log(`${eventName}: ${eventList.length} events`);
      
      if (eventList.length > 0) {
        console.log(`  Latest: Block ${eventList[eventList.length - 1].blockNumber}`);
        
        // Show details for PoolCreated events
        if (eventName === 'PoolCreated') {
          eventList.forEach(event => {
            console.log(`    Pool #${event.args.poolId}: ${event.args.league} - ${event.args.category}`);
            console.log(`      Creator: ${event.args.creator}`);
            console.log(`      Oracle: ${event.args.oracleType === 0 ? 'GUIDED' : 'OPEN'}`);
            console.log(`      TX: ${event.transactionHash}`);
          });
        }
      }
    });
    
    return events;
  }

  formatTimestamp(timestamp) {
    if (timestamp === 0) return 'Not set';
    return new Date(timestamp * 1000).toISOString().replace('T', ' ').replace('.000Z', ' UTC');
  }

  displayPoolDetails(pool) {
    console.log(`\n🎯 POOL #${pool.poolId}`);
    console.log('─'.repeat(40));
    console.log(`Creator: ${pool.creator}`);
    console.log(`Title: ${pool.title || 'No title'}`);
    console.log(`League: ${pool.league}`);
    console.log(`Category: ${pool.category}`);
    console.log(`Teams: ${pool.homeTeam} vs ${pool.awayTeam}`);
    console.log(`Oracle Type: ${pool.oracleType === 0 ? 'GUIDED' : 'OPEN'}`);
    console.log(`Odds: ${pool.odds / 100}x`);
    
    console.log('\n💰 Financial:');
    console.log(`Creator Stake: ${pool.creatorStake} STT`);
    console.log(`Total Creator Side: ${pool.totalCreatorSideStake} STT`);
    console.log(`Total Bettor Side: ${pool.totalBettorStake} STT`);
    
    console.log('\n⏰ Timing:');
    console.log(`Event Start: ${this.formatTimestamp(pool.eventStartTime)}`);
    console.log(`Event End: ${this.formatTimestamp(pool.eventEndTime)}`);
    console.log(`Betting End: ${this.formatTimestamp(pool.bettingEndTime)}`);
  }

  async run() {
    try {
      await this.initialize();
      
      // Get basic contract information
      const info = await this.getBasicInfo();
      if (!info) {
        console.log('❌ Cannot proceed - contract issues detected');
        return;
      }
      
      const { poolCount, currentBlock } = info;
      
      // Fetch pool data
      const pools = await this.fetchPoolsData(poolCount);
      
      // Fetch events
      const events = await this.fetchEventsInChunks(currentBlock);
      
      // Display results
      if (pools.length > 0) {
        console.log('\n📋 POOL DETAILS');
        console.log('='.repeat(50));
        pools.forEach(pool => this.displayPoolDetails(pool));
      }
      
      // Summary
      console.log('\n📊 SUMMARY');
      console.log('='.repeat(50));
      console.log(`Contract Address: ${this.contractAddress}`);
      console.log(`Total Pools: ${poolCount}`);
      
      const totalEvents = Object.values(events).reduce((sum, arr) => sum + arr.length, 0);
      console.log(`Total Events Found: ${totalEvents}`);
      
      if (poolCount === 0 && totalEvents === 0) {
        console.log('\n💡 STATUS: No pools created yet');
        console.log('   - Contract is deployed and functional');
        console.log('   - Ready to accept pool creation');
        console.log('   - No user activity detected so far');
      } else {
        console.log('\n✅ STATUS: Active contract with pools/events');
      }
      
      console.log('\n✅ Pool analysis completed successfully!');
      
    } catch (error) {
      console.error('❌ Pool fetcher failed:', error.message);
      process.exit(1);
    }
  }
}

// Run if called directly
if (require.main === module) {
  const fetcher = new ImprovedPoolFetcher();
  fetcher.run().catch(error => {
    console.error('💥 Unexpected error:', error);
    process.exit(1);
  });
}

module.exports = ImprovedPoolFetcher;
