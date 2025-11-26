#!/usr/bin/env node

/**
 * Fix Network Sync Script
 * Manually sync the pool from the correct network
 */

const { ethers } = require('ethers');
const config = require('../config');
const db = require('../db/db');

class NetworkSyncFix {
  constructor() {
    // Try different RPC endpoints to find the correct network
    this.rpcEndpoints = [
      'https://dream-rpc.somnia.network/',
      'https://rpc.ankr.com/somnia_testnet/c8e336679a7fe85909f310fbbdd5fbb18d3b7560b1d3eca7aa97874b0bb81e97',
      'https://somnia-testnet.rpc.thirdweb.com',
      'https://testnet-rpc.somnia.network',
      // Add more endpoints as needed
    ];
    
    this.poolCoreAddress = '0x59210719f4218c87ceA8661FEe29167639D124bA';
    this.poolCoreABI = require('../solidity/BitredictPoolCore.json').abi;
  }

  async findCorrectNetwork() {
    console.log('🔍 Searching for the correct network...');
    
    for (const rpcUrl of this.rpcEndpoints) {
      try {
        console.log(`🌐 Testing RPC: ${rpcUrl}`);
        
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const contract = new ethers.Contract(this.poolCoreAddress, this.poolCoreABI, provider);
        
        // Try to get pool count
        const poolCount = await contract.poolCount();
        const blockNumber = await provider.getBlockNumber();
        
        console.log(`✅ Network found! Block: ${blockNumber}, Pools: ${poolCount}`);
        
        if (Number(poolCount) > 0) {
          console.log(`🎯 Found network with ${poolCount} pools!`);
          return { provider, contract, rpcUrl, blockNumber, poolCount };
        }
        
      } catch (error) {
        console.log(`❌ Failed: ${error.message}`);
        continue;
      }
    }
    
    throw new Error('Could not find network with the contract and pools');
  }

  async syncPoolFromCorrectNetwork() {
    try {
      console.log('🚀 Starting network sync fix...');
      
      // Find the correct network
      const { provider, contract, rpcUrl, blockNumber, poolCount } = await this.findCorrectNetwork();
      
      console.log(`📡 Connected to: ${rpcUrl}`);
      console.log(`📊 Current block: ${blockNumber}`);
      console.log(`🏊 Total pools: ${poolCount}`);
      
      // Connect to database
      await db.connect();
      console.log('✅ Database connected');
      
      // Sync all pools
      let syncedCount = 0;
      
      for (let poolId = 0; poolId < Number(poolCount); poolId++) {
        try {
          console.log(`🔄 Syncing pool ${poolId}...`);
          
          // Get pool data from contract
          const poolData = await contract.getPool(poolId);
          
          // Convert to database format
          const dbPool = await this.convertPoolToDatabase(poolData, poolId);
          
          // Save to database
          await this.savePoolToDatabase(dbPool);
          
          console.log(`✅ Pool ${poolId} synced successfully`);
          syncedCount++;
          
          // Also sync bets for this pool
          await this.syncBetsForPool(contract, poolId);
          
        } catch (error) {
          console.error(`❌ Error syncing pool ${poolId}:`, error.message);
          continue;
        }
      }
      
      console.log(`\n📊 Sync Summary:`);
      console.log(`   Network: ${rpcUrl}`);
      console.log(`   Block: ${blockNumber}`);
      console.log(`   Total pools: ${poolCount}`);
      console.log(`   Synced pools: ${syncedCount}`);
      
    } catch (error) {
      console.error('❌ Network sync failed:', error);
      throw error;
    } finally {
      await db.disconnect();
    }
  }

  async convertPoolToDatabase(poolData, poolId) {
    // Convert contract pool data to database format
    const dbPool = {
      pool_id: poolId,
      creator_address: poolData.creator,
      odds: Number(poolData.odds), // Store as-is from contract
      is_settled: poolData.isSettled,
      creator_side_won: poolData.creatorSideWon,
      is_private: poolData.isPrivate,
      use_bitr: poolData.usesBitr,
      oracle_type: Number(poolData.oracleType), // 0 = GUIDED, 1 = OPEN
      market_id: poolData.marketId,
      predicted_outcome: poolData.predictedOutcome,
      result: poolData.actualResult,
      creator_stake: ethers.formatEther(poolData.creatorStake),
      total_creator_side_stake: ethers.formatEther(poolData.totalCreatorSideStake),
      total_bettor_stake: ethers.formatEther(poolData.totalBettorStake),
      max_bettor_stake: poolData.maxBettorStake ? ethers.formatEther(poolData.maxBettorStake) : null,
      event_start_time: Number(poolData.eventStartTime),
      event_end_time: Number(poolData.eventEndTime),
      betting_end_time: Number(poolData.bettingEndTime),
      created_at: new Date(),
      settled_at: poolData.settledAt ? new Date(Number(poolData.settledAt) * 1000) : null,
      category: null,
      league: null,
      region: null,
      participant_count: 0
    };

    return dbPool;
  }

  async savePoolToDatabase(poolData) {
    const query = `
      INSERT INTO oracle.pools (
        pool_id, creator_address, odds, is_settled, creator_side_won,
        is_private, use_bitr, oracle_type, market_id, predicted_outcome,
        result, creator_stake, total_creator_side_stake, total_bettor_stake,
        max_bettor_stake, event_start_time, event_end_time, betting_end_time,
        created_at, settled_at, category, league, region, participant_count
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24
      )
      ON CONFLICT (pool_id) DO UPDATE SET
        is_settled = EXCLUDED.is_settled,
        creator_side_won = EXCLUDED.creator_side_won,
        result = EXCLUDED.result,
        total_creator_side_stake = EXCLUDED.total_creator_side_stake,
        total_bettor_stake = EXCLUDED.total_bettor_stake,
        settled_at = EXCLUDED.settled_at
    `;

    const values = [
      poolData.pool_id,
      poolData.creator_address,
      poolData.odds,
      poolData.is_settled,
      poolData.creator_side_won,
      poolData.is_private,
      poolData.uses_bitr,
      poolData.oracle_type,
      poolData.market_id,
      poolData.predicted_outcome,
      poolData.actual_result,
      poolData.creator_stake,
      poolData.total_creator_side_stake,
      poolData.total_bettor_stake,
      poolData.max_bettor_stake,
      poolData.event_start_time,
      poolData.event_end_time,
      poolData.betting_end_time,
      poolData.created_at,
      poolData.settled_at,
      poolData.category,
      poolData.league,
      poolData.region,
      poolData.participant_count
    ];

    await db.query(query, values);
  }

  async syncBetsForPool(contract, poolId) {
    try {
      // Get bet count for this pool
      const betCount = await contract.getBetCount(poolId);
      const totalBets = Number(betCount);
      
      if (totalBets === 0) {
        return;
      }
      
      console.log(`🎯 Pool ${poolId} has ${totalBets} bets`);
      
      let syncedBets = 0;
      
      for (let betId = 0; betId < totalBets; betId++) {
        try {
          // Get bet data from contract
          const betData = await contract.getBet(poolId, betId);
          
          // Convert to database format
          const dbBet = await this.convertBetToDatabase(betData, poolId, betId);
          
          // Save to database
          await this.saveBetToDatabase(dbBet);
          
          syncedBets++;
          
        } catch (error) {
          console.error(`❌ Error syncing bet ${betId} for pool ${poolId}:`, error.message);
          continue;
        }
      }
      
      console.log(`✅ Synced ${syncedBets} bets for pool ${poolId}`);
      
    } catch (error) {
      console.error(`❌ Error syncing bets for pool ${poolId}:`, error);
    }
  }

  async convertBetToDatabase(betData, poolId, betId) {
    return {
      bet_id: betId,
      pool_id: poolId,
      bettor_address: betData.bettor,
      amount: ethers.formatEther(betData.amount),
      side: betData.side,
      odds: Number(betData.odds) / 100,
      created_at: new Date(Number(betData.timestamp) * 1000),
      is_claimed: betData.isClaimed,
      claimed_at: betData.claimedAt ? new Date(Number(betData.claimedAt) * 1000) : null
    };
  }

  async saveBetToDatabase(betData) {
    const query = `
      INSERT INTO oracle.bets (
        bet_id, pool_id, bettor_address, amount, side, odds,
        created_at, is_claimed, claimed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (bet_id, pool_id) DO UPDATE SET
        is_claimed = EXCLUDED.is_claimed,
        claimed_at = EXCLUDED.claimed_at
    `;

    const values = [
      betData.bet_id,
      betData.pool_id,
      betData.bettor_address,
      betData.amount,
      betData.side,
      betData.odds,
      betData.created_at,
      betData.is_claimed,
      betData.claimed_at
    ];

    await db.query(query, values);
  }
}

// Run the sync if called directly
if (require.main === module) {
  const sync = new NetworkSyncFix();
  
  sync.syncPoolFromCorrectNetwork()
    .then(() => {
      console.log('✅ Network sync fix completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Network sync fix failed:', error);
      process.exit(1);
    });
}

module.exports = NetworkSyncFix;
