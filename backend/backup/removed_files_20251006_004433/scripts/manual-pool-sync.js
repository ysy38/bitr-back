#!/usr/bin/env node

/**
 * Manual Pool Sync Script
 * Syncs all pools from blockchain contract to database
 */

const { ethers } = require('ethers');
const config = require('../config');
const db = require('../db/db');

class ManualPoolSync {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    this.poolCoreAddress = config.blockchain.contractAddresses.poolCore;
    this.poolCoreABI = require('../solidity/BitredictPoolCore.json').abi;
    this.contract = new ethers.Contract(this.poolCoreAddress, this.poolCoreABI, this.provider);
  }

  async syncAllPools() {
    try {
      console.log('🚀 Starting manual pool sync...');
      
      // Connect to database
      await db.connect();
      console.log('✅ Database connected');
      
      // Get total pool count from contract
      const poolCount = await this.contract.poolCount();
      const totalPools = Number(poolCount);
      
      console.log(`📊 Total pools in contract: ${totalPools}`);
      
      if (totalPools === 0) {
        console.log('📭 No pools found in contract');
        return;
      }
      
      // Get existing pools from database
      const existingPools = await db.query('SELECT pool_id FROM oracle.pools ORDER BY pool_id DESC');
      const existingPoolIds = existingPools.rows.map(row => Number(row.pool_id));
      console.log(`📋 Found ${existingPoolIds.length} existing pools in database`);
      
      // Sync all pools from contract
      let syncedCount = 0;
      let skippedCount = 0;
      
      for (let poolId = 0; poolId < totalPools; poolId++) {
        try {
          console.log(`🔄 Processing pool ${poolId}...`);
          
          // Check if pool already exists
          if (existingPoolIds.includes(poolId)) {
            console.log(`⏭️ Pool ${poolId} already exists, skipping`);
            skippedCount++;
            continue;
          }
          
          // Get pool data from contract
          const poolData = await this.contract.getPool(poolId);
          
          // Convert to database format
          const dbPool = await this.convertPoolToDatabase(poolData, poolId);
          
          // Save to database
          await this.savePoolToDatabase(dbPool);
          
          console.log(`✅ Pool ${poolId} synced successfully`);
          syncedCount++;
          
        } catch (error) {
          console.error(`❌ Error syncing pool ${poolId}:`, error.message);
          continue;
        }
      }
      
      console.log(`\n📊 Sync Summary:`);
      console.log(`   Total pools in contract: ${totalPools}`);
      console.log(`   Pools synced: ${syncedCount}`);
      console.log(`   Pools skipped (already exist): ${skippedCount}`);
      console.log(`   Pools failed: ${totalPools - syncedCount - skippedCount}`);
      
    } catch (error) {
      console.error('❌ Manual pool sync failed:', error);
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
      odds: Number(poolData.odds) / 100, // Convert from basis points
      is_settled: poolData.isSettled,
      creator_side_won: poolData.creatorSideWon,
      is_private: poolData.isPrivate,
      uses_bitr: poolData.usesBitr,
      oracle_type: poolData.oracleType === 0 ? 'guided' : 'open',
      market_id: poolData.marketId,
      predicted_outcome: poolData.predictedOutcome,
      actual_result: poolData.actualResult,
      creator_stake: ethers.formatEther(poolData.creatorStake),
      total_creator_side_stake: ethers.formatEther(poolData.totalCreatorSideStake),
      total_bettor_stake: ethers.formatEther(poolData.totalBettorStake),
      max_bettor_stake: poolData.maxBettorStake ? ethers.formatEther(poolData.maxBettorStake) : null,
      event_start_time: new Date(Number(poolData.eventStartTime) * 1000),
      event_end_time: new Date(Number(poolData.eventEndTime) * 1000),
      betting_end_time: new Date(Number(poolData.bettingEndTime) * 1000),
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
        is_private, uses_bitr, oracle_type, market_id, predicted_outcome,
        actual_result, creator_stake, total_creator_side_stake, total_bettor_stake,
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
        actual_result = EXCLUDED.actual_result,
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

  async syncBetsForPool(poolId) {
    try {
      console.log(`🎯 Syncing bets for pool ${poolId}...`);
      
      // Get bet count for this pool
      const betCount = await this.contract.getBetCount(poolId);
      const totalBets = Number(betCount);
      
      console.log(`📊 Pool ${poolId} has ${totalBets} bets`);
      
      if (totalBets === 0) {
        console.log(`📭 No bets found for pool ${poolId}`);
        return;
      }
      
      // Get existing bets from database
      const existingBets = await db.query(
        'SELECT bet_id FROM oracle.bets WHERE pool_id = $1',
        [poolId]
      );
      const existingBetIds = existingBets.rows.map(row => Number(row.bet_id));
      
      let syncedBets = 0;
      
      for (let betId = 0; betId < totalBets; betId++) {
        try {
          // Check if bet already exists
          if (existingBetIds.includes(betId)) {
            continue;
          }
          
          // Get bet data from contract
          const betData = await this.contract.getBet(poolId, betId);
          
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
      
      console.log(`✅ Synced ${syncedBets} new bets for pool ${poolId}`);
      
    } catch (error) {
      console.error(`❌ Error syncing bets for pool ${poolId}:`, error);
      throw error;
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
  const sync = new ManualPoolSync();
  
  sync.syncAllPools()
    .then(() => {
      console.log('✅ Manual pool sync completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Manual pool sync failed:', error);
      process.exit(1);
    });
}

module.exports = ManualPoolSync;
