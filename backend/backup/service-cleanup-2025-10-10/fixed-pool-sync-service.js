const { ethers } = require('ethers');
const db = require('../db/db');
const config = require('../config');

/**
 * Fixed Pool Sync Service
 * Properly handles pool sync with correct bytes32 decoding and prediction market creation
 */
class FixedPoolSyncService {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    this.wallet = new ethers.Wallet(process.env.ORACLE_PRIVATE_KEY || process.env.ORACLE_SIGNER_PRIVATE_KEY, this.provider);
    
    // Load contract ABI
    let PoolCoreABI;
    try {
      PoolCoreABI = require('../solidity/BitredictPoolCore.json').abi;
      console.log('✅ PoolCore ABI loaded');
    } catch (error) {
      console.warn('⚠️ PoolCore ABI not found, using minimal ABI');
      PoolCoreABI = [
        'function pools(uint256) external view returns (tuple(uint256 creatorStake, uint256 totalStake, uint256 eventStartTime, uint256 eventEndTime, uint256 bettingEndTime, uint256 arbitrationDeadline, uint256 oracleType, uint256 marketId, bytes32 predictedOutcome, bytes32 result, uint256 flags, uint256 resultTimestamp, bytes32 league, bytes32 category, bytes32 region, bytes32 homeTeam, bytes32 awayTeam, bytes32 title, bool isPrivate, uint256 maxBetPerUser, bool useBitr, uint256 totalCreatorSideStake, uint256 maxBettorStake, uint256 totalBettorStake, uint256 odds))',
        'event PoolCreated(uint256 indexed poolId, address indexed creator, bytes32 predictedOutcome, uint256 odds, uint256 creatorStake, uint256 eventStartTime, uint256 eventEndTime, bytes32 league, bytes32 category, bytes32 region, bytes32 homeTeam, bytes32 awayTeam, bytes32 title, bool isPrivate, uint256 maxBetPerUser, bool useBitr, uint256 oracleType, uint256 marketType, string marketId)'
      ];
    }
    
    this.poolContract = new ethers.Contract(
      config.blockchain.contractAddresses.poolCore,
      PoolCoreABI,
      this.provider
    );
    
    this.isRunning = false;
    this.serviceName = 'FixedPoolSyncService';
  }

  /**
   * Properly decode bytes32 to string
   */
  decodeBytes32ToString(bytes32Value) {
    try {
      if (!bytes32Value || bytes32Value === '0x0000000000000000000000000000000000000000000000000000000000000000') {
        return '';
      }
      return ethers.toUtf8String(bytes32Value).replace(/\0/g, '').trim();
    } catch (error) {
      console.warn('⚠️ Failed to decode bytes32:', bytes32Value, error.message);
      return '';
    }
  }

  /**
   * Get pool data from contract with proper decoding
   */
  async getPoolFromContract(poolId) {
    try {
      console.log(`🔍 Fetching pool ${poolId} from contract...`);
      
      const pool = await this.poolContract.pools(poolId);
      
      // Decode all bytes32 values properly
      const decodedPool = {
        poolId: Number(poolId),
        creatorStake: pool.creatorStake ? pool.creatorStake.toString() : '0',
        totalStake: pool.totalStake ? pool.totalStake.toString() : '0',
        eventStartTime: pool.eventStartTime ? Number(pool.eventStartTime) : 0,
        eventEndTime: pool.eventEndTime ? Number(pool.eventEndTime) : 0,
        bettingEndTime: pool.bettingEndTime ? Number(pool.bettingEndTime) : 0,
        arbitrationDeadline: pool.arbitrationDeadline ? Number(pool.arbitrationDeadline) : 0,
        oracleType: pool.oracleType ? Number(pool.oracleType) : 0,
        marketId: pool.marketId ? pool.marketId.toString() : '0',
        predictedOutcome: pool.predictedOutcome || '0x0000000000000000000000000000000000000000000000000000000000000000',
        result: pool.result || '0x0000000000000000000000000000000000000000000000000000000000000000',
        flags: pool.flags ? Number(pool.flags) : 0,
        resultTimestamp: pool.resultTimestamp ? Number(pool.resultTimestamp) : 0,
        league: this.decodeBytes32ToString(pool.league),
        category: this.decodeBytes32ToString(pool.category),
        region: this.decodeBytes32ToString(pool.region),
        homeTeam: this.decodeBytes32ToString(pool.homeTeam),
        awayTeam: this.decodeBytes32ToString(pool.awayTeam),
        title: this.decodeBytes32ToString(pool.title),
        isPrivate: pool.isPrivate || false,
        maxBetPerUser: pool.maxBetPerUser ? Number(pool.maxBetPerUser) : 0,
        useBitr: pool.useBitr || false,
        totalCreatorSideStake: pool.totalCreatorSideStake ? pool.totalCreatorSideStake.toString() : '0',
        maxBettorStake: pool.maxBettorStake ? pool.maxBettorStake.toString() : '0',
        totalBettorStake: pool.totalBettorStake ? pool.totalBettorStake.toString() : '0',
        odds: pool.odds ? Number(pool.odds) : 0
      };
      
      console.log(`📊 Pool ${poolId} decoded data:`);
      console.log(`  - Home Team: ${decodedPool.homeTeam}`);
      console.log(`  - Away Team: ${decodedPool.awayTeam}`);
      console.log(`  - League: ${decodedPool.league}`);
      console.log(`  - Category: ${decodedPool.category}`);
      console.log(`  - Title: ${decodedPool.title}`);
      console.log(`  - Market ID: ${decodedPool.marketId}`);
      console.log(`  - Oracle Type: ${decodedPool.oracleType}`);
      
      return decodedPool;
      
    } catch (error) {
      console.error(`❌ Error fetching pool ${poolId} from contract:`, error);
      throw error;
    }
  }

  /**
   * Save pool to database with proper data
   */
  async savePoolToDatabase(poolData, txHash, blockNumber) {
    try {
      console.log(`💾 Saving pool ${poolData.poolId} to database...`);
      
      // Check if pool already exists
      const existingPool = await db.query(
        'SELECT pool_id FROM oracle.pools WHERE pool_id = $1',
        [poolData.poolId]
      );
      
      if (existingPool.rows.length > 0) {
        console.log(`📝 Updating existing pool ${poolData.poolId}...`);
        
        // Update existing pool
        await db.query(`
          UPDATE oracle.pools SET
            home_team = $1,
            away_team = $2,
            league = $3,
            category = $4,
            title = $5,
            market_id = $6,
            readable_outcome = $7,
            updated_at = NOW()
          WHERE pool_id = $8
        `, [
          poolData.homeTeam,
          poolData.awayTeam,
          poolData.league,
          poolData.category,
          poolData.title,
          poolData.marketId,
          `${poolData.homeTeam} vs ${poolData.awayTeam}`,
          poolData.poolId
        ]);
        
        console.log(`✅ Pool ${poolData.poolId} updated in database`);
      } else {
        console.log(`➕ Inserting new pool ${poolData.poolId}...`);
        
        // Insert new pool
        await db.query(`
          INSERT INTO oracle.pools (
            pool_id, creator_address, predicted_outcome, odds, creator_stake,
            total_creator_side_stake, max_bettor_stake, total_bettor_stake,
            event_start_time, event_end_time, betting_end_time, league, category,
            region, home_team, away_team, title, market_id, result, is_private,
            use_bitr, oracle_type, max_bet_per_user, result_timestamp,
            arbitration_deadline, tx_hash, block_number, status, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
            $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, 'active', NOW(), NOW()
          )
        `, [
          poolData.poolId,
          '0x0000000000000000000000000000000000000000', // creator_address (not available in contract)
          poolData.predictedOutcome,
          poolData.odds,
          poolData.creatorStake,
          poolData.totalCreatorSideStake,
          poolData.maxBettorStake,
          poolData.totalBettorStake,
          poolData.eventStartTime,
          poolData.eventEndTime,
          poolData.bettingEndTime,
          poolData.league,
          poolData.category,
          poolData.region,
          poolData.homeTeam,
          poolData.awayTeam,
          poolData.title,
          poolData.marketId,
          poolData.result,
          poolData.isPrivate,
          poolData.useBitr,
          poolData.oracleType,
          poolData.maxBetPerUser,
          poolData.resultTimestamp,
          poolData.arbitrationDeadline,
          txHash,
          blockNumber
        ]);
        
        console.log(`✅ Pool ${poolData.poolId} inserted into database`);
      }
      
    } catch (error) {
      console.error(`❌ Error saving pool ${poolData.poolId} to database:`, error);
      throw error;
    }
  }

  /**
   * Create prediction market record for guided pools
   */
  async createPredictionMarketRecord(poolData) {
    try {
      // Only create for guided pools (oracle type 0)
      if (poolData.oracleType !== 0) {
        console.log(`⏭️ Skipping prediction market creation for non-guided pool ${poolData.poolId}`);
        return;
      }
      
      console.log(`🔧 Creating prediction market record for pool ${poolData.poolId}...`);
      
      // Check if prediction market record already exists
      const existingRecord = await db.query(`
        SELECT * FROM oracle.football_prediction_markets 
        WHERE fixture_id = $1 OR pool_id = $2
      `, [poolData.marketId, poolData.poolId.toString()]);
      
      if (existingRecord.rows.length > 0) {
        console.log(`⚠️ Prediction market record already exists for pool ${poolData.poolId}`);
        return;
      }
      
      // Determine outcome type and predicted outcome based on market type
      let outcomeType, predictedOutcome;
      
      // For now, we'll use a generic approach since we don't have the exact prediction
      // In a real implementation, you'd need to decode the predictedOutcome bytes32
      outcomeType = '1X2'; // Default for moneyline
      predictedOutcome = 'Home Win'; // Default prediction
      
      // Create the prediction market record
      const marketId = `pool_${poolData.poolId}_${Date.now()}`;
      
      const insertQuery = `
        INSERT INTO oracle.football_prediction_markets (
          id, fixture_id, market_type, market_id, outcome_type, 
          predicted_outcome, end_time, resolved, result, resolved_at,
          pool_id, status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `;
      
      const values = [
        marketId,
        poolData.marketId, // fixture_id
        'guided',
        poolData.marketId, // market_id
        outcomeType,
        predictedOutcome,
        new Date(poolData.eventEndTime * 1000), // end_time
        false, // resolved
        null, // result
        null, // resolved_at
        poolData.poolId.toString(), // pool_id
        'active', // status
        new Date(), // created_at
        new Date() // updated_at
      ];
      
      await db.query(insertQuery, values);
      
      console.log(`✅ Created prediction market record: ${marketId}`);
      console.log(`📊 Fixture: ${poolData.marketId}`);
      console.log(`📊 Outcome Type: ${outcomeType}`);
      console.log(`📊 Predicted: ${predictedOutcome}`);
      console.log(`📊 Pool ID: ${poolData.poolId}`);
      
    } catch (error) {
      console.error(`❌ Error creating prediction market record:`, error);
      throw error;
    }
  }

  /**
   * Process a single pool (sync from contract to database)
   */
  async processPool(poolId, txHash = null, blockNumber = null) {
    try {
      console.log(`🔄 Processing pool ${poolId}...`);
      
      // Step 1: Get pool data from contract
      const poolData = await this.getPoolFromContract(poolId);
      
      // Step 2: Save pool to database
      await this.savePoolToDatabase(poolData, txHash, blockNumber);
      
      // Step 3: Create prediction market record if needed
      await this.createPredictionMarketRecord(poolData);
      
      console.log(`✅ Pool ${poolId} processed successfully`);
      
      return poolData;
      
    } catch (error) {
      console.error(`❌ Error processing pool ${poolId}:`, error);
      throw error;
    }
  }

  /**
   * Start the service
   */
  async start() {
    if (this.isRunning) {
      console.log('⚠️ Service is already running');
      return;
    }
    
    console.log('🚀 Starting Fixed Pool Sync Service...');
    this.isRunning = true;
    
    // Connect to database
    await db.connect();
    console.log('✅ Database connected');
    
    console.log('✅ Fixed Pool Sync Service started');
  }

  /**
   * Stop the service
   */
  async stop() {
    if (!this.isRunning) {
      console.log('⚠️ Service is not running');
      return;
    }
    
    console.log('🛑 Stopping Fixed Pool Sync Service...');
    this.isRunning = false;
    
    console.log('✅ Fixed Pool Sync Service stopped');
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      serviceName: this.serviceName,
      isRunning: this.isRunning,
      contractAddress: config.blockchain.contractAddresses.poolCore
    };
  }
}

module.exports = FixedPoolSyncService;
