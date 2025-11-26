#!/usr/bin/env node

/**
 * BITREDICT POOL FETCHER
 * 
 * Fetches all pools created from the BitredictPoolCore contract
 * and displays comprehensive information about each pool
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

class PoolFetcher {
  constructor() {
    this.provider = null;
    this.contract = null;
    
    // Contract addresses from fly secrets
    this.contractAddress = process.env.POOL_CORE_ADDRESS || 
                          process.env.BITREDICT_POOL_ADDRESS || 
                          '0xBc54c64800d37d4A85C0ab15A13110a75742f423'; // Updated to new gas-optimized contract
    
    // RPC URLs from fly secrets  
    this.rpcUrl = process.env.RPC_URL || 
                  process.env.BLOCKCHAIN_RPC_URL ||
                  process.env.PROVIDER_URL ||
                  'https://dream-rpc.somnia.network/'; // Default Somnia RPC
  }

  async initialize() {
    console.log('🚀 Initializing Pool Fetcher...');
    
    if (!this.contractAddress) {
      throw new Error('❌ Pool contract address not found in environment variables');
    }
    
    if (!this.rpcUrl) {
      throw new Error('❌ RPC URL not found in environment variables');
    }

    // Initialize provider
    this.provider = new ethers.JsonRpcProvider(this.rpcUrl);
    
    // Test connection
    try {
      const network = await this.provider.getNetwork();
      console.log(`✅ Connected to network: ${network.name} (Chain ID: ${network.chainId})`);
    } catch (error) {
      throw new Error(`❌ Failed to connect to RPC: ${error.message}`);
    }

    // Load contract ABI
    const abiPath = path.join(__dirname, '../../solidity/BitredictPoolCore.json');
    let abi;
    
    try {
      const abiFile = fs.readFileSync(abiPath, 'utf8');
      const abiData = JSON.parse(abiFile);
      abi = abiData.abi || abiData;
      console.log(`✅ Loaded ABI from: ${abiPath}`);
    } catch (error) {
      console.log(`⚠️ Could not load ABI from ${abiPath}, using minimal ABI`);
      // Minimal ABI for pool fetching
      abi = [
        "event PoolCreated(uint256 indexed poolId, address indexed creator, uint256 eventStartTime, uint256 eventEndTime, uint8 oracleType, bytes32 marketId, uint8 marketType, string league, string category)",
        "function poolCount() external view returns (uint256)",
        "function pools(uint256) external view returns (address creator, uint16 odds, uint8 flags, uint8 oracleType, uint256 creatorStake, uint256 totalCreatorSideStake, uint256 maxBettorStake, uint256 totalBettorStake, bytes32 predictedOutcome, bytes32 result, bytes32 marketId, uint256 eventStartTime, uint256 eventEndTime, uint256 bettingEndTime, uint256 resultTimestamp, uint256 arbitrationDeadline, string memory league, string memory category, string memory region, string memory homeTeam, string memory awayTeam, string memory title, uint256 maxBetPerUser)",
        "function poolBettors(uint256, uint256) external view returns (address)",
        "function bettorStakes(uint256, address) external view returns (uint256)",
        "function poolLPs(uint256, uint256) external view returns (address)",
        "function lpStakes(uint256, address) external view returns (uint256)"
      ];
    }

    // Initialize contract
    this.contract = new ethers.Contract(this.contractAddress, abi, this.provider);
    console.log(`✅ Contract initialized: ${this.contractAddress}`);
  }

  async fetchPoolCount() {
    try {
      const count = await this.contract.poolCount();
      return Number(count);
    } catch (error) {
      console.error('❌ Error fetching pool count:', error.message);
      return 0;
    }
  }

  async fetchPoolData(poolId) {
    try {
      const poolData = await this.contract.pools(poolId);
      
      // Parse the returned tuple
      const [
        creator,
        odds,
        flags,
        oracleType,
        creatorStake,
        totalCreatorSideStake,
        maxBettorStake,
        totalBettorStake,
        predictedOutcome,
        result,
        marketId,
        eventStartTime,
        eventEndTime,
        bettingEndTime,
        resultTimestamp,
        arbitrationDeadline,
        league,
        category,
        region,
        homeTeam,
        awayTeam,
        title,
        maxBetPerUser
      ] = poolData;

      return {
        poolId,
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
      };
    } catch (error) {
      console.error(`❌ Error fetching pool ${poolId}:`, error.message);
      return null;
    }
  }

  async fetchPoolCreatedEvents() {
    try {
      console.log('📡 Fetching PoolCreated events...');
      
      // Get current block
      const currentBlock = await this.provider.getBlockNumber();
      console.log(`📊 Current block: ${currentBlock}`);
      
      // Fetch events from a reasonable range (last 100k blocks or from deployment)
      const fromBlock = Math.max(0, currentBlock - 100000);
      
      const filter = this.contract.filters.PoolCreated();
      const events = await this.contract.queryFilter(filter, fromBlock, currentBlock);
      
      console.log(`✅ Found ${events.length} PoolCreated events`);
      
      return events.map(event => ({
        poolId: Number(event.args.poolId),
        creator: event.args.creator,
        eventStartTime: Number(event.args.eventStartTime),
        eventEndTime: Number(event.args.eventEndTime),
        oracleType: Number(event.args.oracleType),
        marketId: event.args.marketId,
        marketType: Number(event.args.marketType),
        league: event.args.league,
        category: event.args.category,
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash
      }));
    } catch (error) {
      console.error('❌ Error fetching events:', error.message);
      return [];
    }
  }

  formatTimestamp(timestamp) {
    if (timestamp === 0) return 'Not set';
    return new Date(timestamp * 1000).toISOString().replace('T', ' ').replace('.000Z', ' UTC');
  }

  getOracleTypeName(oracleType) {
    return oracleType === 0 ? 'GUIDED' : 'OPEN';
  }

  getMarketTypeName(marketType) {
    const types = [
      'MONEYLINE',
      'OVER_UNDER', 
      'BOTH_TEAMS_SCORE',
      'HALF_TIME',
      'DOUBLE_CHANCE',
      'CORRECT_SCORE',
      'FIRST_GOAL',
      'CUSTOM'
    ];
    return types[marketType] || `UNKNOWN(${marketType})`;
  }

  getPoolStatus(pool) {
    const now = Math.floor(Date.now() / 1000);
    
    if (pool.result !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
      return 'SETTLED';
    }
    
    if (pool.resultTimestamp > 0) {
      return 'AWAITING_SETTLEMENT';
    }
    
    if (now > pool.eventEndTime) {
      return 'EVENT_ENDED';
    }
    
    if (now > pool.bettingEndTime) {
      return 'BETTING_CLOSED';
    }
    
    if (now < pool.eventStartTime) {
      return 'UPCOMING';
    }
    
    return 'ACTIVE';
  }

  displayPoolSummary(pools) {
    console.log('\n📊 POOL SUMMARY');
    console.log('='.repeat(50));
    
    const totalPools = pools.length;
    const guidedPools = pools.filter(p => p.oracleType === 0).length;
    const openPools = pools.filter(p => p.oracleType === 1).length;
    
    const totalVolume = pools.reduce((sum, pool) => {
      return sum + parseFloat(pool.totalCreatorSideStake) + parseFloat(pool.totalBettorStake);
    }, 0);
    
    const statusCounts = {};
    pools.forEach(pool => {
      const status = this.getPoolStatus(pool);
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });
    
    console.log(`Total Pools: ${totalPools}`);
    console.log(`Guided Pools: ${guidedPools}`);
    console.log(`Open Pools: ${openPools}`);
    console.log(`Total Volume: ${totalVolume.toFixed(4)} STT`);
    console.log('\nPool Status Distribution:');
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`);
    });
  }

  displayPoolDetails(pool) {
    console.log(`\n🎯 POOL #${pool.poolId}`);
    console.log('─'.repeat(40));
    console.log(`Creator: ${pool.creator}`);
    console.log(`Title: ${pool.title || 'No title'}`);
    console.log(`League: ${pool.league}`);
    console.log(`Category: ${pool.category}`);
    console.log(`Teams: ${pool.homeTeam} vs ${pool.awayTeam}`);
    console.log(`Region: ${pool.region || 'Not specified'}`);
    console.log(`Oracle Type: ${this.getOracleTypeName(pool.oracleType)}`);
    console.log(`Status: ${this.getPoolStatus(pool)}`);
    console.log(`Odds: ${pool.odds / 100}x`);
    
    console.log('\n💰 FINANCIAL INFO:');
    console.log(`Creator Stake: ${pool.creatorStake} STT`);
    console.log(`Total Creator Side: ${pool.totalCreatorSideStake} STT`);
    console.log(`Total Bettor Side: ${pool.totalBettorStake} STT`);
    console.log(`Max Bettor Stake: ${pool.maxBettorStake} STT`);
    console.log(`Max Bet Per User: ${pool.maxBetPerUser} STT`);
    
    console.log('\n⏰ TIMING:');
    console.log(`Event Start: ${this.formatTimestamp(pool.eventStartTime)}`);
    console.log(`Event End: ${this.formatTimestamp(pool.eventEndTime)}`);
    console.log(`Betting End: ${this.formatTimestamp(pool.bettingEndTime)}`);
    
    if (pool.resultTimestamp > 0) {
      console.log(`Result Time: ${this.formatTimestamp(pool.resultTimestamp)}`);
    }
    
    console.log('\n🔍 TECHNICAL:');
    console.log(`Market ID: ${pool.marketId}`);
    console.log(`Predicted Outcome: ${pool.predictedOutcome}`);
    
    if (pool.result !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
      console.log(`Result: ${pool.result}`);
    }
  }

  async run() {
    try {
      await this.initialize();
      
      console.log('\n📊 Fetching pool information...');
      
      // Get pool count
      const poolCount = await this.fetchPoolCount();
      console.log(`📈 Total pools in contract: ${poolCount}`);
      
      if (poolCount === 0) {
        console.log('🤷 No pools found in the contract yet.');
        return;
      }
      
      // Fetch all pool data
      console.log('\n📥 Fetching detailed pool data...');
      const pools = [];
      
      for (let i = 1; i <= poolCount; i++) {
        process.stdout.write(`\r📊 Fetching pool ${i}/${poolCount}...`);
        const poolData = await this.fetchPoolData(i);
        if (poolData) {
          pools.push(poolData);
        }
      }
      
      console.log(`\n✅ Successfully fetched ${pools.length} pools`);
      
      // Display summary
      this.displayPoolSummary(pools);
      
      // Display detailed information for each pool
      console.log('\n📋 DETAILED POOL INFORMATION');
      console.log('='.repeat(50));
      
      pools.forEach(pool => {
        this.displayPoolDetails(pool);
      });
      
      // Also fetch and display creation events for additional context
      console.log('\n📡 POOL CREATION EVENTS');
      console.log('='.repeat(50));
      
      const events = await this.fetchPoolCreatedEvents();
      if (events.length > 0) {
        events.forEach(event => {
          console.log(`\n🎯 Pool #${event.poolId} Created`);
          console.log(`Creator: ${event.creator}`);
          console.log(`League: ${event.league}`);
          console.log(`Category: ${event.category}`);
          console.log(`Oracle: ${this.getOracleTypeName(event.oracleType)}`);
          console.log(`Market: ${this.getMarketTypeName(event.marketType)}`);
          console.log(`Block: ${event.blockNumber}`);
          console.log(`TX: ${event.transactionHash}`);
        });
      }
      
      console.log('\n✅ Pool fetching completed successfully!');
      
    } catch (error) {
      console.error('❌ Pool fetcher failed:', error.message);
      process.exit(1);
    }
  }
}

// Run if called directly
if (require.main === module) {
  const fetcher = new PoolFetcher();
  fetcher.run().catch(error => {
    console.error('💥 Unexpected error:', error);
    process.exit(1);
  });
}

module.exports = PoolFetcher;
