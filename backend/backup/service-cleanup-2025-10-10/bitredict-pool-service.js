/**
 * BitredictPool Service
 * 
 * Manages prediction pools, settlements, and pool-related operations
 */

const Web3Service = require('./web3-service.js');
const db = require('../db/db.js');

class BitredictPoolService {
  constructor() {
    this.web3Service = null;
    this.poolCoreContract = null;
  }

  /**
   * Initialize the service
   */
  async initialize() {
    try {
      this.web3Service = new Web3Service();
      await this.web3Service.initialize();
      this.poolCoreContract = await this.web3Service.getPoolCoreContract();
      console.log('✅ BitredictPool Service initialized');
    } catch (error) {
      console.error('❌ Failed to initialize BitredictPool Service:', error);
      throw error;
    }
  }

  /**
   * Create a new prediction pool
   */
  async createPool(poolData) {
    try {
      if (!this.poolCoreContract) {
        await this.initialize();
      }

      const {
        predictedOutcome,
        odds,
        creatorStake,
        eventStartTime,
        eventEndTime,
        league,
        category,
        region,
        homeTeam = '',
        awayTeam = '',
        title = '',
        isPrivate = false,
        maxBetPerUser = 0,
        useBitr = false,
        oracleType = 0,
        marketId
      } = poolData;

      // Validate required parameters
      if (!predictedOutcome || !odds || !creatorStake || !eventStartTime || !eventEndTime) {
        throw new Error('Missing required pool creation parameters');
      }

      // Create pool on contract
      const tx = await this.poolCoreContract.createPool(
        predictedOutcome,
        odds,
        creatorStake,
        eventStartTime,
        eventEndTime,
        league,
        category,
        region,
        homeTeam,
        awayTeam,
        title,
        isPrivate,
        maxBetPerUser,
        useBitr,
        oracleType,
        marketId
      );

      const receipt = await tx.wait();
      console.log(`✅ Pool created successfully: ${tx.hash}`);

      // Save pool data to database
      await this.savePoolToDatabase(poolData, tx.hash, receipt.blockNumber);

      return {
        success: true,
        poolId: receipt.logs[0]?.args?.poolId || 'unknown',
        txHash: tx.hash,
        blockNumber: receipt.blockNumber
      };

    } catch (error) {
      console.error('❌ Error creating pool:', error);
      throw error;
    }
  }

  /**
   * Place a bet on a pool
   */
  async placeBet(poolId, amount, userAddress) {
    try {
      if (!this.poolCoreContract) {
        await this.initialize();
      }

      const tx = await this.poolCoreContract.placeBet(poolId, { value: amount });
      const receipt = await tx.wait();

      console.log(`✅ Bet placed successfully: ${tx.hash}`);

      // Save bet to database
      await this.saveBetToDatabase(poolId, amount, userAddress, tx.hash);

      return {
        success: true,
        txHash: tx.hash,
        blockNumber: receipt.blockNumber
      };

    } catch (error) {
      console.error('❌ Error placing bet:', error);
      throw error;
    }
  }

  /**
   * Settle a pool
   */
  async settlePool(poolId, outcome) {
    try {
      if (!this.poolCoreContract) {
        await this.initialize();
      }

      const tx = await this.poolCoreContract.settlePool(poolId, outcome);
      const receipt = await tx.wait();

      console.log(`✅ Pool settled successfully: ${tx.hash}`);

      // Update pool status in database
      await this.updatePoolStatus(poolId, 'settled', outcome, tx.hash);

      return {
        success: true,
        txHash: tx.hash,
        blockNumber: receipt.blockNumber
      };

    } catch (error) {
      console.error('❌ Error settling pool:', error);
      throw error;
    }
  }

  /**
   * Get pool details
   */
  async getPoolDetails(poolId) {
    try {
      if (!this.poolCoreContract) {
        await this.initialize();
      }

      const pool = await this.poolCoreContract.pools(poolId);
      
      return {
        poolId: poolId,
        creator: pool.creator,
        predictedOutcome: pool.predictedOutcome,
        odds: pool.odds,
        creatorStake: pool.creatorStake,
        totalStake: pool.totalStake,
        eventStartTime: pool.eventStartTime,
        eventEndTime: pool.eventEndTime,
        league: pool.league,
        category: pool.category,
        region: pool.region,
        isPrivate: pool.isPrivate,
        maxBetPerUser: pool.maxBetPerUser,
        useBitr: pool.useBitr,
        oracleType: pool.oracleType,
        marketId: pool.marketId,
        status: pool.status,
        outcome: pool.outcome
      };

    } catch (error) {
      console.error('❌ Error getting pool details:', error);
      throw error;
    }
  }

  /**
   * Get user's bets for a pool
   */
  async getUserBets(poolId, userAddress) {
    try {
      const result = await db.query(`
        SELECT * FROM oracle.bets 
        WHERE pool_id = $1 AND bettor_address = $2
        ORDER BY created_at DESC
      `, [poolId, userAddress]);

      return result.rows;

    } catch (error) {
      console.error('❌ Error getting user bets:', error);
      throw error;
    }
  }

  /**
   * Get pool statistics
   */
  async getPoolStats(poolId) {
    try {
      const result = await db.query(`
        SELECT 
          COUNT(*) as total_bets,
          SUM(amount) as total_amount,
          COUNT(DISTINCT bettor_address) as unique_bettors,
          AVG(amount) as average_bet
        FROM oracle.bets 
        WHERE pool_id = $1
      `, [poolId]);

      return result.rows[0];

    } catch (error) {
      console.error('❌ Error getting pool stats:', error);
      throw error;
    }
  }

  /**
   * Save pool to database
   */
  async savePoolToDatabase(poolData, txHash, blockNumber) {
    try {
      await db.query(`
        INSERT INTO oracle.pools (
          pool_id, creator_address, predicted_outcome, odds, creator_stake,
          event_start_time, event_end_time, league, category, region,
          is_private, max_bet_per_user, use_bitr, oracle_type, market_id,
          tx_hash, block_number, status, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW()
        )
      `, [
        poolData.poolId || 'pending',
        poolData.creatorAddress,
        poolData.predictedOutcome,
        poolData.odds,
        poolData.creatorStake,
        poolData.eventStartTime,
        poolData.eventEndTime,
        poolData.league,
        poolData.category,
        poolData.region,
        poolData.isPrivate,
        poolData.maxBetPerUser,
        poolData.useBitr,
        poolData.oracleType,
        poolData.marketId,
        txHash,
        blockNumber,
        'active'
      ]);

      console.log('✅ Pool saved to database');

    } catch (error) {
      console.error('❌ Error saving pool to database:', error);
      throw error;
    }
  }

  /**
   * Save bet to database
   */
  async saveBetToDatabase(poolId, amount, userAddress, txHash) {
    try {
      await db.query(`
        INSERT INTO oracle.bets (
          pool_id, bettor_address, amount, transaction_hash, created_at
        ) VALUES ($1, $2, $3, $4, NOW())
      `, [poolId, userAddress, amount, txHash]);

      console.log('✅ Bet saved to database');

    } catch (error) {
      console.error('❌ Error saving bet to database:', error);
      throw error;
    }
  }

  /**
   * Update pool status
   */
  async updatePoolStatus(poolId, status, outcome, txHash) {
    try {
      await db.query(`
        UPDATE oracle.pools 
        SET status = $1, outcome = $2, settled_at = NOW(), settlement_tx_hash = $3
        WHERE pool_id = $4
      `, [status, outcome, txHash, poolId]);

      console.log('✅ Pool status updated in database');

    } catch (error) {
      console.error('❌ Error updating pool status:', error);
      throw error;
    }
  }

  /**
   * Get all active pools
   */
  async getActivePools() {
    try {
      const result = await db.query(`
        SELECT * FROM oracle.pools 
        WHERE status = 'active' 
        ORDER BY created_at DESC
      `);

      return result.rows;

    } catch (error) {
      console.error('❌ Error getting active pools:', error);
      throw error;
    }
  }

  /**
   * Get user's pools
   */
  async getUserPools(userAddress) {
    try {
      const result = await db.query(`
        SELECT * FROM oracle.pools 
        WHERE creator_address = $1 
        ORDER BY created_at DESC
      `, [userAddress]);

      return result.rows;

    } catch (error) {
      console.error('❌ Error getting user pools:', error);
      throw error;
    }
  }
}

module.exports = BitredictPoolService;
