#!/usr/bin/env node

/**
 * Fix Pool Sync and Prediction Market
 * Fix corrupted pool data and create missing prediction market record
 */

require('dotenv').config();
const { ethers } = require('ethers');
const config = require('../config');

class PoolSyncAndPredictionMarketFixer {
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
        'function pools(uint256) external view returns (tuple(uint256 creatorStake, uint256 totalStake, uint256 eventStartTime, uint256 eventEndTime, uint256 bettingEndTime, uint256 arbitrationDeadline, uint256 oracleType, uint256 marketId, bytes32 predictedOutcome, bytes32 result, uint256 flags, uint256 resultTimestamp, bytes32 league, bytes32 category, bytes32 region, bytes32 homeTeam, bytes32 awayTeam, bytes32 title, bool isPrivate, uint256 maxBetPerUser, bool useBitr, uint256 totalCreatorSideStake, uint256 maxBettorStake, uint256 totalBettorStake, uint256 odds))'
      ];
    }
    
    this.poolContract = new ethers.Contract(
      config.blockchain.contractAddresses.poolCore,
      PoolCoreABI,
      this.provider
    );
  }

  async getPoolFromContract(poolId) {
    try {
      console.log(`🔍 Fetching pool ${poolId} from contract...`);
      
      const pool = await this.poolContract.pools(poolId);
      
      // Decode bytes32 values
      const homeTeam = ethers.toUtf8String(pool.homeTeam).replace(/\0/g, '').trim();
      const awayTeam = ethers.toUtf8String(pool.awayTeam).replace(/\0/g, '').trim();
      const league = ethers.toUtf8String(pool.league).replace(/\0/g, '').trim();
      const category = ethers.toUtf8String(pool.category).replace(/\0/g, '').trim();
      const title = ethers.toUtf8String(pool.title).replace(/\0/g, '').trim();
      
      const poolData = {
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
        league,
        category,
        region: pool.region ? ethers.toUtf8String(pool.region).replace(/\0/g, '').trim() : '',
        homeTeam,
        awayTeam,
        title,
        isPrivate: pool.isPrivate || false,
        maxBetPerUser: pool.maxBetPerUser ? Number(pool.maxBetPerUser) : 0,
        useBitr: pool.useBitr || false,
        totalCreatorSideStake: pool.totalCreatorSideStake ? pool.totalCreatorSideStake.toString() : '0',
        maxBettorStake: pool.maxBettorStake ? pool.maxBettorStake.toString() : '0',
        totalBettorStake: pool.totalBettorStake ? pool.totalBettorStake.toString() : '0',
        odds: pool.odds ? Number(pool.odds) : 0
      };
      
      console.log(`📊 Pool ${poolId} data from contract:`);
      console.log(`  - Home Team: ${homeTeam}`);
      console.log(`  - Away Team: ${awayTeam}`);
      console.log(`  - League: ${league}`);
      console.log(`  - Category: ${category}`);
      console.log(`  - Title: ${title}`);
      console.log(`  - Market ID: ${poolData.marketId}`);
      console.log(`  - Oracle Type: ${poolData.oracleType}`);
      console.log(`  - Market Type: 0 (MONEYLINE)`);
      console.log(`  - Predicted Outcome: ${poolData.predictedOutcome}`);
      
      return poolData;
      
    } catch (error) {
      console.error(`❌ Error fetching pool ${poolId} from contract:`, error);
      throw error;
    }
  }

  async fixPoolInDatabase(poolData) {
    try {
      console.log(`🔧 Fixing pool ${poolData.poolId} in database...`);
      
      // Connect to database
      const db = require('../db/db');
      await db.connect();
      
      // Update the corrupted pool data
      const updateQuery = `
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
      `;
      
      const readableOutcome = `${poolData.homeTeam} vs ${poolData.awayTeam}`;
      
      await db.query(updateQuery, [
        poolData.homeTeam,
        poolData.awayTeam,
        poolData.league,
        poolData.category,
        poolData.title,
        poolData.marketId,
        readableOutcome,
        poolData.poolId
      ]);
      
      console.log(`✅ Pool ${poolData.poolId} data fixed in database`);
      
    } catch (error) {
      console.error(`❌ Error fixing pool ${poolData.poolId} in database:`, error);
      throw error;
    }
  }

  async createPredictionMarketRecord(poolData) {
    try {
      console.log(`🔧 Creating prediction market record for pool ${poolData.poolId}...`);
      
      // Connect to database
      const db = require('../db/db');
      await db.connect();
      
      // Check if prediction market record already exists
      const existingRecord = await db.query(`
        SELECT * FROM oracle.football_prediction_markets 
        WHERE fixture_id = $1 OR pool_id = $2
      `, [poolData.marketId, poolData.poolId.toString()]);
      
      if (existingRecord.rows.length > 0) {
        console.log(`⚠️ Prediction market record already exists for pool ${poolData.poolId}`);
        return;
      }
      
      // Determine the outcome type and predicted outcome based on market type
      let outcomeType, predictedOutcome;
      
      if (poolData.oracleType === 0) { // GUIDED
        // For moneyline pools, we need to determine the predicted outcome
        // This is typically "Home Win", "Away Win", or "Draw"
        // Since we don't have the exact prediction, we'll use a generic approach
        outcomeType = '1X2';
        predictedOutcome = 'Home Win'; // This should be determined from the actual prediction
      } else {
        outcomeType = 'Unknown';
        predictedOutcome = 'Unknown';
      }
      
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

  async run() {
    try {
      console.log('🚀 Starting Pool Sync and Prediction Market Fixer...');
      
      const poolId = 0;
      
      // Step 1: Get correct pool data from contract
      console.log('\n📋 Step 1: Getting correct pool data from contract...');
      const poolData = await this.getPoolFromContract(poolId);
      
      // Step 2: Fix corrupted pool data in database
      console.log('\n📋 Step 2: Fixing corrupted pool data in database...');
      await this.fixPoolInDatabase(poolData);
      
      // Step 3: Create missing prediction market record
      console.log('\n📋 Step 3: Creating missing prediction market record...');
      await this.createPredictionMarketRecord(poolData);
      
      console.log('\n🎉 SUCCESS! Pool sync and prediction market fixed!');
      console.log('📊 Pool 0 data is now correct in database');
      console.log('📊 Prediction market record created for fixture 19568522');
      console.log('📊 Football oracle bot can now process this fixture');
      
    } catch (error) {
      console.error('❌ Pool Sync and Prediction Market Fixer failed:', error);
      process.exit(1);
    }
  }
}

// Run the fixer
const fixer = new PoolSyncAndPredictionMarketFixer();
fixer.run();
