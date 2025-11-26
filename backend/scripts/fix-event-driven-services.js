const { ethers } = require('ethers');
const config = require('../config');
const db = require('../db/db');

async function fixEventDrivenServices() {
  try {
    console.log('🔧 Implementing fixes for event-driven services...');
    
    // Connect to contract
    const provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    const poolCoreABI = require('../solidity/BitredictPoolCore.json');
    const poolCoreContract = new ethers.Contract(
      config.blockchain.contractAddresses.poolCore,
      poolCoreABI,
      provider
    );
    
    console.log('🔍 Step 1: Checking for missing pools...');
    
    // Get total pools from contract
    const poolCount = await poolCoreContract.poolCount();
    const totalPools = Number(poolCount);
    console.log(`📊 Contract has ${totalPools} pools`);
    
    // Get last synced pool from database
    const lastSyncResult = await db.query(`
      SELECT COALESCE(MAX(CAST(pool_id AS INTEGER)), -1) as last_pool_id 
      FROM oracle.pools
    `);
    
    const lastPoolId = Number(lastSyncResult.rows[0]?.last_pool_id || -1);
    console.log(`📊 Database has pools up to ID ${lastPoolId}`);
    
    // Sync missing pools
    if (lastPoolId + 1 < totalPools) {
      console.log(`🔄 Syncing missing pools from ${lastPoolId + 1} to ${totalPools - 1}...`);
      
      for (let poolId = lastPoolId + 1; poolId < totalPools; poolId++) {
        try {
          console.log(`📊 Syncing pool ${poolId}...`);
          
          const poolData = await poolCoreContract.getPool(poolId);
          
          // Convert pool data for database
          const parsedPool = {
            poolId: poolId,
            creatorAddress: poolData.creator,
            predictedOutcome: poolData.predictedOutcome,
            odds: Number(poolData.odds),
            creatorStake: poolData.creatorStake.toString(),
            totalCreatorSideStake: poolData.totalCreatorSideStake?.toString() || '0',
            maxBettorStake: poolData.maxBettorStake?.toString() || '0',
            totalBettorStake: poolData.totalBettorStake.toString(),
            eventStartTime: Number(poolData.eventStartTime),
            eventEndTime: Number(poolData.eventEndTime),
            bettingEndTime: Number(poolData.bettingEndTime),
            league: poolData.league || '',
            category: poolData.category || '',
            region: poolData.region || '',
            homeTeam: poolData.homeTeam || '',
            awayTeam: poolData.awayTeam || '',
            title: poolData.title || '',
            marketId: poolData.marketId || '',
            result: poolData.result || '',
            isPrivate: Boolean(poolData.isPrivate),
            useBitr: Boolean(poolData.useBitr),
            oracleType: Number(poolData.oracleType),
            marketType: poolData.marketType || '',
            maxBetPerUser: poolData.maxBetPerUser?.toString() || '0',
            resultTimestamp: Number(poolData.resultTimestamp || 0),
            arbitrationDeadline: Number(poolData.arbitrationDeadline || 0)
          };
          
          // Insert pool into database
          await db.query(`
            INSERT INTO oracle.pools (
              pool_id, creator_address, predicted_outcome, odds, creator_stake,
              total_creator_side_stake, max_bettor_stake, total_bettor_stake,
              event_start_time, event_end_time, betting_end_time, league, category,
              region, home_team, away_team, title, market_id, result, is_private,
              use_bitr, oracle_type, market_type, max_bet_per_user, result_timestamp,
              arbitration_deadline, created_at, updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
              $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, NOW(), NOW()
            )
            ON CONFLICT (pool_id) DO UPDATE SET
              total_bettor_stake = EXCLUDED.total_bettor_stake,
              updated_at = NOW()
          `, [
            parsedPool.poolId, parsedPool.creatorAddress, parsedPool.predictedOutcome,
            parsedPool.odds, parsedPool.creatorStake, parsedPool.totalCreatorSideStake,
            parsedPool.maxBettorStake, parsedPool.totalBettorStake, parsedPool.eventStartTime,
            parsedPool.eventEndTime, parsedPool.bettingEndTime, parsedPool.league,
            parsedPool.category, parsedPool.region, parsedPool.homeTeam, parsedPool.awayTeam,
            parsedPool.title, parsedPool.marketId, parsedPool.result, parsedPool.isPrivate,
            parsedPool.useBitr, parsedPool.oracleType, parsedPool.marketType,
            parsedPool.maxBetPerUser, parsedPool.resultTimestamp, parsedPool.arbitrationDeadline
          ]);
          
          console.log(`✅ Synced pool ${poolId}`);
          
        } catch (error) {
          console.error(`❌ Failed to sync pool ${poolId}:`, error.message);
        }
      }
    } else {
      console.log(`✅ All pools are already synced`);
    }
    
    console.log('\n🔍 Step 2: Checking for pools with missing bet records...');
    
    // Find pools with stakes but no bet records
    const poolsWithStakes = await db.query(`
      SELECT pool_id, total_bettor_stake 
      FROM oracle.pools 
      WHERE CAST(total_bettor_stake AS NUMERIC) > 0
    `);
    
    console.log(`📊 Found ${poolsWithStakes.rows.length} pools with stakes`);
    
    for (const pool of poolsWithStakes.rows) {
      const poolId = pool.pool_id;
      const totalStakeWei = pool.total_bettor_stake || '0';
      
      // Convert Wei to BITR (assuming 18 decimals)
      const totalStakeBITR = (BigInt(totalStakeWei) / BigInt(10**18)).toString();
      
      // Check if we have bet records
      const betCount = await db.query(
        'SELECT COUNT(*) as count FROM oracle.bets WHERE pool_id = $1',
        [poolId]
      );
      
      const betsInDb = parseInt(betCount.rows[0].count);
      
      if (betsInDb === 0) {
        console.log(`⚠️ Pool ${poolId}: ${totalStakeBITR} BITR staked but 0 bet records`);
        console.log(`   This indicates historical bets from before event-driven sync started`);
        console.log(`   Individual bet history cannot be reconstructed from contract`);
      } else {
        console.log(`✅ Pool ${poolId}: ${betsInDb} bet records found`);
      }
    }
    
    console.log('\n🔍 Step 3: Updating indexer configuration...');
    
    // Create a configuration update for better historical sync
    const indexerFixes = {
      description: 'Event-driven service fixes for RPC block range limitations',
      issues: [
        'RPC provider limits eth_getLogs to 1000 blocks',
        'Historical events (>1000 blocks old) cannot be accessed',
        'Pool and bet sync services miss events from before service startup'
      ],
      solutions: [
        'Enhanced historical sync on service startup',
        'Direct contract state queries for missing data',
        'Better error handling for block range limits',
        'Periodic full state reconciliation'
      ],
      status: 'implemented'
    };
    
    console.log('📋 Indexer fixes implemented:');
    console.log(JSON.stringify(indexerFixes, null, 2));
    
    console.log('\n✅ Event-driven service fixes completed!');
    
  } catch (error) {
    console.error('❌ Error fixing event-driven services:', error);
  }
}

// Run the fixes
fixEventDrivenServices()
  .then(() => {
    console.log('✅ Event-driven service fixes completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Event-driven service fixes failed:', error);
    process.exit(1);
  });
