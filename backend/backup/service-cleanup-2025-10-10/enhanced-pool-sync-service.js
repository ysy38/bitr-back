const db = require('../db/db');
const Web3Service = require('./web3-service');

/**
 * Enhanced Pool Sync Service
 * 
 * This service directly fetches pools from the contract and saves them to the database
 * for analytics and search functionality. Uses direct contract queries instead of 
 * event indexing for better reliability.
 * 
 * Features:
 * - Direct contract fetching (more reliable than events)
 * - Periodic sync with configurable intervals
 * - Handles both new pools and updates to existing pools
 * - Complete pool data with analytics fields
 * - Automatic retry and error handling
 */
class EnhancedPoolSyncService {
  constructor() {
    this.web3Service = new Web3Service();
    this.isRunning = false;
    this.syncInterval = null;
    this.serviceName = 'EnhancedPoolSyncService';
    
    // Configuration
    this.config = {
      syncIntervalMs: 60000, // 1 minute
      batchSize: 20,
      maxRetries: 3,
      retryDelayMs: 5000
    };
  }

  /**
   * Initialize the service
   */
  async initialize() {
    try {
      console.log(`🚀 ${this.serviceName}: Initializing...`);
      
      if (!this.web3Service.isInitialized) {
        await this.web3Service.initialize();
      }
      
      console.log(`✅ ${this.serviceName}: Initialized successfully`);
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Initialization failed:`, error);
      throw error;
    }
  }

  /**
   * Start the pool sync service
   */
  async start() {
    if (this.isRunning) {
      console.log(`⚠️ ${this.serviceName}: Already running`);
      return;
    }

    try {
      await this.initialize();
      
      this.isRunning = true;
      console.log(`🚀 ${this.serviceName}: Starting pool sync service...`);
      
      // Initial sync
      await this.syncAllPools();
      
      // Start periodic sync
      this.startPeriodicSync();
      
      console.log(`✅ ${this.serviceName}: Service started successfully`);
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to start:`, error);
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Stop the service
   */
  async stop() {
    console.log(`🛑 ${this.serviceName}: Stopping...`);
    
    this.isRunning = false;
    
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    
    console.log(`✅ ${this.serviceName}: Stopped successfully`);
  }

  /**
   * Start periodic synchronization
   */
  startPeriodicSync() {
    this.syncInterval = setInterval(async () => {
      if (!this.isRunning) return;
      
      try {
        await this.syncNewPools();
      } catch (error) {
        console.error(`❌ ${this.serviceName}: Periodic sync error:`, error);
      }
    }, this.config.syncIntervalMs);
    
    console.log(`⏰ ${this.serviceName}: Periodic sync started (${this.config.syncIntervalMs}ms)`);
  }

  /**
   * Sync all pools from contract (initial sync)
   */
  async syncAllPools() {
    try {
      console.log(`📚 ${this.serviceName}: Starting full pool sync...`);
      
      const contract = await this.web3Service.getPoolCoreContract();
      const totalPools = await contract.poolCount();
      
      console.log(`📊 ${this.serviceName}: Total pools in contract: ${totalPools}`);
      
      if (Number(totalPools) === 0) {
        console.log(`📭 ${this.serviceName}: No pools found in contract`);
        return;
      }
      
      // Get last synced pool from database
      const lastSyncResult = await db.query(`
        SELECT COALESCE(MAX(pool_id), -1) as last_pool_id 
        FROM oracle.pools
      `);
      
      const lastPoolId = Number(lastSyncResult.rows[0]?.last_pool_id || -1);
      const startPoolId = lastPoolId + 1;
      
      console.log(`📍 ${this.serviceName}: Starting sync from pool ID: ${startPoolId}`);
      
      if (startPoolId < Number(totalPools)) {
        await this.syncPoolRange(startPoolId, Number(totalPools) - 1);
      }
      
      console.log(`✅ ${this.serviceName}: Full sync completed`);
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Full sync failed:`, error);
      throw error;
    }
  }

  /**
   * Sync only new pools (periodic sync)
   */
  async syncNewPools() {
    try {
      const contract = await this.web3Service.getPoolCoreContract();
      const totalPools = await contract.poolCount();
      
      if (Number(totalPools) === 0) return;
      
      // Get last synced pool from database
      const lastSyncResult = await db.query(`
        SELECT COALESCE(MAX(pool_id), -1) as last_pool_id 
        FROM oracle.pools
      `);
      
      const lastPoolId = Number(lastSyncResult.rows[0]?.last_pool_id || -1);
      const startPoolId = lastPoolId + 1;
      
      if (startPoolId < Number(totalPools)) {
        console.log(`🔄 ${this.serviceName}: Syncing new pools ${startPoolId} to ${Number(totalPools) - 1}`);
        await this.syncPoolRange(startPoolId, Number(totalPools) - 1);
      }
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: New pools sync failed:`, error);
    }
  }

  /**
   * Sync a range of pools
   */
  async syncPoolRange(startId, endId) {
    console.log(`🔄 ${this.serviceName}: Syncing pools ${startId} to ${endId}`);
    
    for (let poolId = startId; poolId <= endId; poolId += this.config.batchSize) {
      const batchEnd = Math.min(poolId + this.config.batchSize - 1, endId);
      
      try {
        await this.syncPoolBatch(poolId, batchEnd);
      } catch (error) {
        console.error(`❌ ${this.serviceName}: Batch sync failed for pools ${poolId}-${batchEnd}:`, error);
        
        // Fallback to individual sync
        for (let id = poolId; id <= batchEnd; id++) {
          try {
            await this.syncSinglePool(id);
          } catch (individualError) {
            console.error(`❌ ${this.serviceName}: Individual sync failed for pool ${id}:`, individualError);
          }
        }
      }
    }
  }

  /**
   * Sync a batch of pools
   */
  async syncPoolBatch(startId, endId) {
    const contract = await this.web3Service.getPoolCoreContract();
    
    for (let poolId = startId; poolId <= endId; poolId++) {
      try {
        const poolData = await contract.getPool(poolId);
        await this.savePoolToDatabase(poolData, poolId);
        console.log(`✅ ${this.serviceName}: Synced pool ${poolId}`);
      } catch (error) {
        console.error(`❌ ${this.serviceName}: Failed to sync pool ${poolId}:`, error.message);
      }
    }
  }

  /**
   * Sync a single pool
   */
  async syncSinglePool(poolId) {
    try {
      const contract = await this.web3Service.getPoolCoreContract();
      const poolData = await contract.getPool(poolId);
      await this.savePoolToDatabase(poolData, poolId);
      console.log(`✅ ${this.serviceName}: Synced pool ${poolId}`);
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to sync pool ${poolId}:`, error);
      throw error;
    }
  }

  /**
   * Save pool data to database with proper type conversion
   */
  async savePoolToDatabase(poolData, poolId) {
    try {
      // Check if pool already exists
      const existingPool = await db.query(
        'SELECT pool_id FROM oracle.pools WHERE pool_id = $1',
        [poolId]
      );

      // Convert bytes32 fields to strings
      const convertBytes32ToString = (bytes32Value) => {
        if (!bytes32Value || bytes32Value === '0x0000000000000000000000000000000000000000000000000000000000000000') {
          return '';
        }
        try {
          // Handle hex string format (0x...)
          const hex = bytes32Value.startsWith('0x') ? bytes32Value.slice(2) : bytes32Value;
          const str = Buffer.from(hex, 'hex').toString('utf8').replace(/\0/g, '');
          return str.trim();
        } catch (error) {
          console.warn('⚠️ Failed to convert bytes32:', bytes32Value, error.message);
          return bytes32Value; // Return as-is if conversion fails
        }
      };

      // Parse pool data with proper type conversion
      const parsedPool = {
        poolId: Number(poolId),
        creatorAddress: poolData.creator,
        predictedOutcome: convertBytes32ToString(poolData.predictedOutcome),
        odds: Number(poolData.odds),
        creatorStake: poolData.creatorStake.toString(),
        totalCreatorSideStake: poolData.totalCreatorSideStake?.toString() || '0',
        maxBettorStake: poolData.maxBettorStake?.toString() || '0',
        totalBettorStake: poolData.totalBettorStake?.toString() || '0',
        eventStartTime: Number(poolData.eventStartTime),
        eventEndTime: Number(poolData.eventEndTime),
        bettingEndTime: Number(poolData.bettingEndTime || 0),
        league: convertBytes32ToString(poolData.league),
        category: convertBytes32ToString(poolData.category),
        region: convertBytes32ToString(poolData.region),
        homeTeam: convertBytes32ToString(poolData.homeTeam),
        awayTeam: convertBytes32ToString(poolData.awayTeam),
        title: convertBytes32ToString(poolData.title),
        marketId: convertBytes32ToString(poolData.marketId),
        result: convertBytes32ToString(poolData.result),
        isPrivate: Boolean(Number(poolData.flags) & 1), // Extract private flag from flags
        useBitr: Boolean(Number(poolData.flags) & 2),   // Extract BITR flag from flags
        oracleType: Number(poolData.oracleType),
        maxBetPerUser: poolData.maxBetPerUser?.toString() || '0',
        resultTimestamp: Number(poolData.resultTimestamp || 0),
        arbitrationDeadline: Number(poolData.arbitrationDeadline || 0)
      };

      if (existingPool.rows.length > 0) {
        // Update existing pool
        await db.query(`
          UPDATE oracle.pools SET
            creator_address = $2,
            predicted_outcome = $3,
            odds = $4,
            creator_stake = $5,
            total_creator_side_stake = $6,
            max_bettor_stake = $7,
            total_bettor_stake = $8,
            event_start_time = $9,
            event_end_time = $10,
            betting_end_time = $11,
            league = $12,
            category = $13,
            region = $14,
            home_team = $15,
            away_team = $16,
            title = $17,
            market_id = $18,
            result = $19,
            is_private = $20,
            use_bitr = $21,
            oracle_type = $22,
            max_bet_per_user = $23,
            result_timestamp = $24,
            arbitration_deadline = $25,
            updated_at = NOW()
          WHERE pool_id = $1
        `, [
          parsedPool.poolId,
          parsedPool.creatorAddress,
          parsedPool.predictedOutcome,
          parsedPool.odds,
          parsedPool.creatorStake,
          parsedPool.totalCreatorSideStake,
          parsedPool.maxBettorStake,
          parsedPool.totalBettorStake,
          parsedPool.eventStartTime,
          parsedPool.eventEndTime,
          parsedPool.bettingEndTime,
          parsedPool.league,
          parsedPool.category,
          parsedPool.region,
          parsedPool.homeTeam,
          parsedPool.awayTeam,
          parsedPool.title,
          parsedPool.marketId,
          parsedPool.result,
          parsedPool.isPrivate,
          parsedPool.useBitr,
          parsedPool.oracleType,
          parsedPool.maxBetPerUser,
          parsedPool.resultTimestamp,
          parsedPool.arbitrationDeadline
        ]);
        
        console.log(`🔄 ${this.serviceName}: Updated existing pool ${poolId}`);
      } else {
        // Insert new pool
        await db.query(`
          INSERT INTO oracle.pools (
            pool_id, creator_address, predicted_outcome, odds, creator_stake,
            total_creator_side_stake, max_bettor_stake, total_bettor_stake,
            event_start_time, event_end_time, betting_end_time, league, category,
            region, home_team, away_team, title, market_id, result, is_private,
            use_bitr, oracle_type, max_bet_per_user, result_timestamp,
            arbitration_deadline, status, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
            $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, 'active', NOW(), NOW()
          )
        `, [
          parsedPool.poolId,
          parsedPool.creatorAddress,
          parsedPool.predictedOutcome,
          parsedPool.odds,
          parsedPool.creatorStake,
          parsedPool.totalCreatorSideStake,
          parsedPool.maxBettorStake,
          parsedPool.totalBettorStake,
          parsedPool.eventStartTime,
          parsedPool.eventEndTime,
          parsedPool.bettingEndTime,
          parsedPool.league,
          parsedPool.category,
          parsedPool.region,
          parsedPool.homeTeam,
          parsedPool.awayTeam,
          parsedPool.title,
          parsedPool.marketId,
          parsedPool.result,
          parsedPool.isPrivate,
          parsedPool.useBitr,
          parsedPool.oracleType,
          parsedPool.maxBetPerUser,
          parsedPool.resultTimestamp,
          parsedPool.arbitrationDeadline
        ]);
        
        console.log(`➕ ${this.serviceName}: Inserted new pool ${poolId}`);
      }
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to save pool ${poolId}:`, error);
      throw error;
    }
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      serviceName: this.serviceName,
      isRunning: this.isRunning,
      hasSyncInterval: !!this.syncInterval,
      config: this.config
    };
  }

  /**
   * Manual sync trigger for specific pool
   */
  async syncPool(poolId) {
    try {
      console.log(`🔄 ${this.serviceName}: Manual sync for pool ${poolId}`);
      await this.syncSinglePool(poolId);
      return { success: true, poolId };
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Manual pool sync failed:`, error);
      throw error;
    }
  }

  /**
   * Get sync statistics
   */
  async getSyncStats() {
    try {
      const contract = await this.web3Service.getPoolCoreContract();
      const contractPoolCount = await contract.poolCount();
      
      const dbResult = await db.query('SELECT COUNT(*) as db_pool_count FROM oracle.pools');
      const dbPoolCount = Number(dbResult.rows[0].db_pool_count);
      
      return {
        contractPools: Number(contractPoolCount),
        databasePools: dbPoolCount,
        syncedPercentage: contractPoolCount > 0 ? (dbPoolCount / Number(contractPoolCount)) * 100 : 0,
        needsSync: Number(contractPoolCount) > dbPoolCount
      };
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to get sync stats:`, error);
      return { error: error.message };
    }
  }
}

module.exports = EnhancedPoolSyncService;
