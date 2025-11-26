const db = require('../db/db');
const Web3Service = require('./web3-service');
const { safeStringify } = require('../utils/bigint-serializer');
const notificationService = require('./notification-service');
const somniaDataStreams = require('./somnia-data-streams-service');

/**
 * Event-Driven Pool Sync Service
 * 
 * This service listens to contract events in real-time and immediately syncs
 * new pools to the database. This is much more efficient than polling every
 * 5 minutes and provides instant updates.
 * 
 * Features:
 * - Real-time event listening (no polling)
 * - Immediate pool sync on PoolCreated events
 * - Automatic retry and error handling
 * - Fallback to periodic sync if events fail
 * - Cost-effective (only runs when needed)
 */
class EventDrivenPoolSync {
  constructor() {
    this.web3Service = new Web3Service();
    this.isRunning = false;
    this.contract = null;
    this.eventListeners = [];
    this.serviceName = 'EventDrivenPoolSync';
    
    // Configuration
    this.config = {
      maxRetries: 3,
      retryDelayMs: 5000,
      fallbackSyncInterval: 300000, // 5 minutes fallback
      batchSize: 10
    };
    
    // Fallback sync timer
    this.fallbackTimer = null;
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
      
      this.contract = await this.web3Service.getPoolCoreContractForEvents();
      if (!this.contract) {
        throw new Error('PoolCore contract not available');
      }
      
      console.log(`✅ ${this.serviceName}: Initialized successfully`);
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Initialization failed:`, error);
      throw error;
    }
  }

  /**
   * Start the event-driven sync service
   */
  async start() {
    if (this.isRunning) {
      console.log(`⚠️ ${this.serviceName}: Already running`);
      return;
    }

    try {
      await this.initialize();
      
      this.isRunning = true;
      console.log(`🚀 ${this.serviceName}: Starting event-driven pool sync...`);
      
      // Sync historical pools on startup (catches any pools created before service started)
      await this.syncHistoricalPools();
      
      // Setup event listeners for new pools
      await this.setupEventListeners();
      
      // Start fallback sync timer
      this.startFallbackSync();
      
      console.log(`✅ ${this.serviceName}: Event-driven sync active`);
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to start:`, error);
      throw error;
    }
  }

  /**
   * Stop the service
   */
  async stop() {
    if (!this.isRunning) {
      console.log(`⚠️ ${this.serviceName}: Not running`);
      return;
    }

    try {
      console.log(`🛑 ${this.serviceName}: Stopping event-driven sync...`);
      
      // Remove event listeners
      this.removeEventListeners();
      
      // Clear fallback timer
      if (this.fallbackTimer) {
        clearInterval(this.fallbackTimer);
        this.fallbackTimer = null;
      }
      
      this.isRunning = false;
      console.log(`✅ ${this.serviceName}: Stopped successfully`);
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Error stopping service:`, error);
    }
  }

  /**
   * Sync historical pools on startup
   * Catches any pools created before the service started
   */
  async syncHistoricalPools() {
    try {
      console.log(`📚 ${this.serviceName}: Syncing historical pools...`);
      
      // Get total pools from contract
      const poolCount = await this.contract.poolCount();
      const totalPools = Number(poolCount);
      
      if (totalPools === 0) {
        console.log(`📭 ${this.serviceName}: No pools to sync`);
        return;
      }
      
      // Get last synced pool from database
      const lastSyncResult = await db.query(`
        SELECT COALESCE(MAX(pool_id), -1) as last_pool_id 
        FROM oracle.pools
      `);
      
      const lastPoolId = Number(lastSyncResult.rows[0]?.last_pool_id || -1);
      const startPoolId = lastPoolId + 1;
      
      if (startPoolId >= totalPools) {
        console.log(`✅ ${this.serviceName}: All pools already synced (${totalPools} total)`);
        return;
      }
      
      console.log(`📍 ${this.serviceName}: Syncing from pool ${startPoolId} to ${totalPools - 1}`);
      
      // Sync missing pools
      let syncedCount = 0;
      let failedCount = 0;
      
      for (let poolId = startPoolId; poolId < totalPools; poolId++) {
        try {
          const poolData = await this.contract.getPool(poolId);
          await this.savePoolToDatabase(poolData, poolId);
          syncedCount++;
          console.log(`✅ ${this.serviceName}: Synced historical pool ${poolId}`);
        } catch (error) {
          failedCount++;
          console.error(`❌ ${this.serviceName}: Failed to sync pool ${poolId}:`, error.message);
        }
      }
      
      console.log(`✅ ${this.serviceName}: Historical sync complete - Synced: ${syncedCount}, Failed: ${failedCount}`);
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Historical sync failed:`, error);
      // Don't throw - continue with event listeners
    }
  }

  /**
   * Setup contract event listeners
   */
  async setupEventListeners() {
    try {
      console.log(`👂 ${this.serviceName}: Setting up event listeners...`);
      
      // Listen to PoolCreated events
      const poolCreatedListener = this.contract.on('PoolCreated', async (
        poolId, 
        creator, 
        eventStartTime, 
        eventEndTime, 
        oracleType, 
        marketType, 
        marketId, 
        league, 
        category,
        event
      ) => {
        console.log(`🎯 ${this.serviceName}: PoolCreated event detected - Pool ID: ${poolId}`);
        await this.handlePoolCreated(poolId, event);
      });
      
      this.eventListeners.push(poolCreatedListener);
      
      // Listen to ReputationActionOccurred events (for reputation tracking)
      const reputationListener = this.contract.on('ReputationActionOccurred', async (
        user,
        action,
        value,
        poolId,
        timestamp,
        event
      ) => {
        console.log(`📊 ${this.serviceName}: ReputationActionOccurred event detected - User: ${user}, Action: ${action}, Pool: ${poolId}`);
        await this.handleReputationAction(user, action, value, poolId, timestamp, event);
      });
      
      this.eventListeners.push(reputationListener);
      
      // Listen to BetPlaced events (for analytics updates)
      const betPlacedListener = this.contract.on('BetPlaced', async (
        poolId,
        bettor,
        amount,
        isForOutcome,
        event
      ) => {
        console.log(`💰 ${this.serviceName}: BetPlaced event detected - Pool ID: ${poolId}`);
        await this.handleBetPlaced(poolId, event);
      });
      
      this.eventListeners.push(betPlacedListener);
      
      // Listen to PoolSettled events
      const poolSettledListener = this.contract.on('PoolSettled', async (
        poolId,
        result,
        creatorSideWon,
        timestamp,
        event
      ) => {
        console.log(`🏁 ${this.serviceName}: PoolSettled event detected - Pool ID: ${poolId}`);
        console.log(`   Result: ${result}, Creator Won: ${creatorSideWon}, Timestamp: ${timestamp}`);
        
        // ✅ Detect if this is a refund (result is zero for automatic refunds)
        const zeroResult = '0x0000000000000000000000000000000000000000000000000000000000000000';
        if (result === zeroResult || result === '0x') {
          console.log(`   💰 This PoolSettled event is actually a refund (no bets)`);
        }
        
        // ✅ CRITICAL FIX: Pass event data directly (source of truth) instead of calling getPool()
        await this.handlePoolSettled(poolId, result, creatorSideWon, timestamp, event);
      });
      
      this.eventListeners.push(poolSettledListener);
      
      // ✅ Listen to PoolRefunded events (for manual refunds)
      // Note: Event signature is PoolRefunded(uint256 indexed poolId, string reason)
      try {
        const poolRefundedListener = this.contract.on('PoolRefunded', async (
          poolId,
          reason,
          event
        ) => {
          console.log(`💰 ${this.serviceName}: PoolRefunded event detected - Pool ID: ${poolId}, Reason: ${reason}`);
          await this.handlePoolRefunded(poolId, reason || 'Manual refund', event);
        });
        
        this.eventListeners.push(poolRefundedListener);
        console.log(`✅ ${this.serviceName}: PoolRefunded event listener added`);
      } catch (error) {
        console.log(`⚠️ ${this.serviceName}: PoolRefunded event not available - ${error.message}`);
      }
      
      // Listen to LiquidityAdded events (if available)
      try {
        const liquidityAddedListener = this.contract.on('LiquidityAdded', async (
          poolId,
          provider,
          amount,
          event
        ) => {
          console.log(`💧 ${this.serviceName}: LiquidityAdded event detected - Pool ID: ${poolId}`);
          await this.handleLiquidityAdded(poolId, event);
        });
        
        this.eventListeners.push(liquidityAddedListener);
      } catch (error) {
        console.log(`⚠️ ${this.serviceName}: LiquidityAdded event not available in contract`);
      }
      
      // Listen to PoolBoosted events from BoostSystem contract
      try {
        const boostSystemContract = await this.web3Service.getBoostSystemContract();
        const poolBoostedListener = boostSystemContract.on('PoolBoosted', async (
          poolId,
          tier,
          expiry,
          fee,
          booster,
          event
        ) => {
          console.log(`🚀 ${this.serviceName}: PoolBoosted event detected - Pool ID: ${poolId}, Tier: ${tier}`);
          await this.handlePoolBoosted(poolId, event);
        });
        
        this.eventListeners.push(poolBoostedListener);
        console.log(`✅ ${this.serviceName}: PoolBoosted event listener added`);
      } catch (error) {
        console.log(`⚠️ ${this.serviceName}: PoolBoosted event not available - ${error.message}`);
      }
      
      console.log(`✅ ${this.serviceName}: Event listeners setup complete`);
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to setup event listeners:`, error);
      throw error;
    }
  }

  /**
   * Remove all event listeners
   */
  removeEventListeners() {
    try {
      console.log(`🔇 ${this.serviceName}: Removing event listeners...`);
      
      this.eventListeners.forEach((listener, index) => {
        if (listener && typeof listener.removeAllListeners === 'function') {
          listener.removeAllListeners();
        }
      });
      
      this.eventListeners = [];
      console.log(`✅ ${this.serviceName}: Event listeners removed`);
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Error removing event listeners:`, error);
    }
  }

  /**
   * Handle PoolCreated event
   */
  async handlePoolCreated(poolId, event) {
    try {
      console.log(`🔄 ${this.serviceName}: Processing PoolCreated event for pool ${poolId}...`);
      
      // Get full pool data from contract
      const poolData = await this.contract.getPool(poolId);
      
      // Save to database (pass event to extract block_number)
      await this.savePoolToDatabase(poolData, poolId, event);
      
      // ✅ Create notification for pool creator
      try {
        const creatorAddress = poolData.creator;
        // Get title from database (it's already saved by savePoolToDatabase)
        const poolInfo = await db.query('SELECT title FROM oracle.pools WHERE pool_id = $1', [poolId]);
        const title = poolInfo.rows[0]?.title || `Pool #${poolId}`;
        
        await notificationService.notifyPoolCreated(creatorAddress, {
          poolId: Number(poolId),
          title: title
        });
        
        console.log(`🔔 Notification sent to pool creator: ${creatorAddress}`);
      } catch (notifError) {
        console.error(`⚠️ Failed to send pool created notification:`, notifError);
        // Don't fail the pool creation if notification fails
      }
      
      console.log(`✅ ${this.serviceName}: Pool ${poolId} synced successfully`);
      
      // ✅ CRITICAL: Broadcast WebSocket update for Live Activity feed
      try {
        const wsService = require('./websocket-service');
        const poolInfo = await db.query(`
          SELECT 
            pool_id, title, category, creator_address, 
            is_settled, creator_side_won, total_bettor_stake, bet_count
          FROM oracle.pools 
          WHERE pool_id = $1
        `, [poolId]);
        
        if (poolInfo.rows.length > 0) {
          const pool = poolInfo.rows[0];
          const zeroResult = '0x0000000000000000000000000000000000000000000000000000000000000000';
          const hasBets = parseFloat(pool.total_bettor_stake || '0') > 0 || parseInt(pool.bet_count || 0) > 0;
          
          wsService.broadcastPoolCreated({
            poolId: pool.pool_id.toString(),
            title: pool.title || `Pool #${poolId}`,
            category: pool.category || 'Unknown',
            creator: pool.creator_address,
            isSettled: pool.is_settled || false,
            isRefunded: pool.is_settled && !hasBets,
            creatorSideWon: pool.creator_side_won,
            timestamp: Date.now()
          });
          console.log(`📡 ${this.serviceName}: WebSocket pool:created broadcast sent for pool ${poolId}`);
        }
      } catch (wsError) {
        console.warn(`⚠️ ${this.serviceName}: WebSocket broadcast failed (non-critical):`, wsError.message);
      }
      
      // Publish to Somnia Data Streams (non-blocking)
      somniaDataStreams.publishPool(poolId, event).catch(err => {
        console.error(`❌ ${this.serviceName}: SDS publish failed for pool ${poolId}:`, err);
        console.error(`   Error message: ${err.message}`);
        console.error(`   Error stack: ${err.stack}`);
        console.warn(`⚠️ ${this.serviceName}: SDS publish failed (non-critical, continuing...)`);
      });
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to handle PoolCreated event:`, error);
      
      // Retry mechanism
      await this.retryPoolSync(poolId);
    }
  }

  /**
   * Handle BetPlaced event (update analytics)
   */
  async handleBetPlaced(poolId, event) {
    try {
      console.log(`💰 ${this.serviceName}: Updating analytics for pool ${poolId}...`);
      
      // Get updated pool data
      const poolData = await this.contract.getPool(poolId);
      
      // Update database with new bet data
      await this.updatePoolAnalytics(poolData, poolId);
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to handle BetPlaced event:`, error);
    }
  }

  /**
   * Handle PoolSettled event
   * ✅ CRITICAL FIX: Use event data directly (source of truth) instead of getPool() which might be stale
   */
  async handlePoolSettled(poolId, result, creatorSideWon, timestamp, event) {
    try {
      console.log(`🏁 ${this.serviceName}: Updating settlement for pool ${poolId}...`);
      console.log(`   Using event data: creatorSideWon=${creatorSideWon}, result=${result}, timestamp=${timestamp}`);
      
      // ✅ CRITICAL: Use event data directly (source of truth) instead of getPool()
      // getPool() might return stale data if called too quickly after settlement transaction
      // The event contains the exact settlement state from the transaction
      await this.updatePoolSettlement(poolId, result, creatorSideWon, timestamp);
      
      // ✅ CRITICAL: Broadcast WebSocket update for Live Activity feed
      try {
        const wsService = require('./websocket-service');
        const poolInfo = await db.query(`
          SELECT 
            pool_id, title, category, creator_address, 
            is_settled, creator_side_won, total_bettor_stake, bet_count
          FROM oracle.pools 
          WHERE pool_id = $1
        `, [poolId]);
        
        if (poolInfo.rows.length > 0) {
          const pool = poolInfo.rows[0];
          const zeroResult = '0x0000000000000000000000000000000000000000000000000000000000000000';
          const hasBets = parseFloat(pool.total_bettor_stake || '0') > 0 || parseInt(pool.bet_count || 0) > 0;
          
          wsService.broadcastPoolSettled({
            poolId: pool.pool_id.toString(),
            title: pool.title || `Pool #${poolId}`,
            category: pool.category || 'Unknown',
            creator: pool.creator_address,
            isSettled: true,
            isRefunded: pool.is_settled && !hasBets,
            creatorSideWon: pool.creator_side_won,
            timestamp: Date.now()
          });
          console.log(`📡 ${this.serviceName}: WebSocket pool:settled broadcast sent for pool ${poolId}`);
        }
      } catch (wsError) {
        console.warn(`⚠️ ${this.serviceName}: WebSocket broadcast failed (non-critical):`, wsError.message);
      }
      
      // Publish updated pool to SDS (non-blocking)
      somniaDataStreams.publishPool(poolId, event).catch(err => {
        console.warn(`⚠️ ${this.serviceName}: SDS settlement publish failed (non-critical):`, err.message);
      });
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to handle PoolSettled event:`, error);
    }
  }

  /**
   * Handle PoolRefunded event
   */
  async handlePoolRefunded(poolId, reason, event) {
    try {
      console.log(`💰 ${this.serviceName}: Updating refund status for pool ${poolId}...`);
      
      // Update database to mark pool as refunded
      await db.query(`
        UPDATE oracle.pools SET
          is_settled = true,
          status = 'refunded',
          refund_reason = $2,
          refunded_at = NOW(),
          settled_at = NOW(),
          updated_at = NOW()
        WHERE pool_id = $1
      `, [poolId, reason]);
      
      console.log(`  ✅ Pool ${poolId} marked as refunded: ${reason}`);
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to handle PoolRefunded event:`, error);
    }
  }

  /**
   * Handle LiquidityAdded event
   */
  async handleLiquidityAdded(poolId, event) {
    try {
      console.log(`💧 ${this.serviceName}: Updating liquidity for pool ${poolId}...`);
      
      // Get updated pool data
      const poolData = await this.contract.getPool(poolId);
      
      // Update database with liquidity data
      await this.updatePoolLiquidity(poolData, poolId);
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to handle LiquidityAdded event:`, error);
    }
  }

  /**
   * Handle ReputationActionOccurred event
   */
  async handleReputationAction(user, action, value, poolId, timestamp, event) {
    try {
      console.log(`🔄 ${this.serviceName}: Processing ReputationActionOccurred event for user ${user}...`);
      
      // Store reputation action in database for analytics
      await this.saveReputationActionToDatabase({
        userAddress: user,
        action: action,
        value: value.toString(),
        poolId: poolId.toString(),
        timestamp: Number(timestamp),
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
        source: 'poolcore'
      });
      
      console.log(`✅ ${this.serviceName}: Reputation action saved for user ${user}`);
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to handle ReputationActionOccurred event:`, error);
    }
  }

  /**
   * Save reputation action to database
   */
  async saveReputationActionToDatabase(reputationData) {
    try {
      await db.query(`
        INSERT INTO core.reputation_actions (
          user_address, action_type, reputation_delta, associated_value, 
          pool_id, timestamp, block_number, transaction_hash, points
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (transaction_hash) DO NOTHING
      `, [
        reputationData.userAddress,
        reputationData.action,
        0, // reputation_delta - calculated by analytics service
        reputationData.value,
        reputationData.poolId,
        new Date(reputationData.timestamp * 1000),
        reputationData.blockNumber,
        reputationData.transactionHash,
        0 // points - calculated by analytics service
      ]);
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to save reputation action:`, error);
      throw error;
    }
  }

  /**
   * Handle PoolBoosted event
   */
  async handlePoolBoosted(poolId, event) {
    try {
      console.log(`🚀 ${this.serviceName}: Updating boost status for pool ${poolId}...`);
      
      // Get updated pool data
      const poolData = await this.contract.getPool(poolId);
      
      // Update database with boost data
      await this.updatePoolBoost(poolData, poolId, event);
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to handle PoolBoosted event:`, error);
    }
  }

  /**
   * Retry pool sync with exponential backoff
   */
  async retryPoolSync(poolId, attempt = 1) {
    if (attempt > this.config.maxRetries) {
      console.error(`❌ ${this.serviceName}: Max retries exceeded for pool ${poolId}`);
      return;
    }

    try {
      console.log(`🔄 ${this.serviceName}: Retrying pool sync for ${poolId} (attempt ${attempt})...`);
      
      const delay = this.config.retryDelayMs * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      const poolData = await this.contract.getPool(poolId);
      await this.savePoolToDatabase(poolData, poolId);
      
      console.log(`✅ ${this.serviceName}: Pool ${poolId} synced on retry ${attempt}`);
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Retry ${attempt} failed for pool ${poolId}:`, error);
      await this.retryPoolSync(poolId, attempt + 1);
    }
  }

  /**
   * Safely convert BigInt timestamp to Number
   * Validates that the value is within safe JavaScript integer range
   * and is a reasonable Unix timestamp (between 2020 and 2100)
   * @param {BigInt|Number} bigIntValue - The timestamp value to convert
   * @param {string} fieldName - Name of the field (for logging)
   * @returns {number} - Safe timestamp number, or 0 if invalid
   */
  safeConvertBigIntToTimestamp(bigIntValue, fieldName = 'timestamp') {
    // Handle null/undefined
    if (bigIntValue == null || bigIntValue === undefined) {
      return 0;
    }
    
    // If already a number and zero, return it
    if (typeof bigIntValue === 'number' && bigIntValue === 0) {
      return 0;
    }
    
    // Convert to number
    const num = Number(bigIntValue);
    
    // Validation checks
    const MIN_TIMESTAMP = 1577836800; // Jan 1, 2020
    const MAX_TIMESTAMP = 4102444800; // Jan 1, 2100
    
    if (isNaN(num)) {
      console.error(`❌ ${this.serviceName}: Invalid ${fieldName}: "${bigIntValue}" is not a valid number`);
      return 0;
    }
    
    if (num > Number.MAX_SAFE_INTEGER) {
      console.error(`❌ ${this.serviceName}: ${fieldName} ${num} exceeds JavaScript safe integer range (${Number.MAX_SAFE_INTEGER})`);
      console.error(`   Original value: ${bigIntValue}`);
      return 0;
    }
    
    // Allow 0 for optional fields (bettingEndTime, resultTimestamp, arbitrationDeadline)
    if (num === 0 && (fieldName === 'bettingEndTime' || fieldName === 'resultTimestamp' || fieldName === 'arbitrationDeadline')) {
      return 0;
    }
    
    if (num < MIN_TIMESTAMP || num > MAX_TIMESTAMP) {
      console.error(`❌ ${this.serviceName}: ${fieldName} ${num} is outside reasonable range (${new Date(MIN_TIMESTAMP * 1000).toISOString()} - ${new Date(MAX_TIMESTAMP * 1000).toISOString()})`);
      return 0;
    }
    
    return num;
  }

  /**
   * Save pool data to database
   * ✅ CRITICAL FIX: Now accepts event to extract block_number
   */
  async savePoolToDatabase(poolData, poolId, event = null) {
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
          const hex = bytes32Value.startsWith('0x') ? bytes32Value.slice(2) : bytes32Value;
          const str = Buffer.from(hex, 'hex').toString('utf8').replace(/\0/g, '');
          return str.trim();
        } catch (error) {
          console.warn('⚠️ Failed to convert bytes32:', bytes32Value, error.message);
          return bytes32Value;
        }
      };

      // ✅ CRITICAL FIX: Extract block_number from event
      const blockNumber = event?.log?.blockNumber || event?.blockNumber || null;
      
      // Parse pool data
      const parsedPool = {
        poolId: Number(poolId), // Keep as number to match oracle.pools.pool_id (bigint)
        creatorAddress: poolData.creator,
        predictedOutcome: convertBytes32ToString(poolData.predictedOutcome),
        odds: Number(poolData.odds),
        creatorStake: poolData.creatorStake.toString(),
        totalCreatorSideStake: poolData.totalCreatorSideStake?.toString() || '0',
        maxBettorStake: poolData.maxBettorStake?.toString() || '0',
        totalBettorStake: poolData.totalBettorStake?.toString() || '0',
        eventStartTime: this.safeConvertBigIntToTimestamp(poolData.eventStartTime, 'eventStartTime'),
        eventEndTime: this.safeConvertBigIntToTimestamp(poolData.eventEndTime, 'eventEndTime'),
        bettingEndTime: this.safeConvertBigIntToTimestamp(poolData.bettingEndTime || 0, 'bettingEndTime'),
        league: convertBytes32ToString(poolData.league),
        category: convertBytes32ToString(poolData.category),
        region: convertBytes32ToString(poolData.region),
        homeTeam: convertBytes32ToString(poolData.homeTeam),
        awayTeam: convertBytes32ToString(poolData.awayTeam),
        title: convertBytes32ToString(poolData.title),
        marketId: poolData.marketId, // Already a string in contract, no conversion needed
        result: convertBytes32ToString(poolData.result),
        isPrivate: Boolean(Number(poolData.flags) & 4), // bit 2: isPrivate
        useBitr: Boolean(Number(poolData.flags) & 8),   // bit 3: usesBitr
        oracleType: Number(poolData.oracleType),
        marketType: Number(poolData.marketType),
        maxBetPerUser: poolData.maxBetPerUser?.toString() || '0',
        resultTimestamp: this.safeConvertBigIntToTimestamp(poolData.resultTimestamp || 0, 'resultTimestamp'),
        arbitrationDeadline: this.safeConvertBigIntToTimestamp(poolData.arbitrationDeadline || 0, 'arbitrationDeadline'),
        blockNumber: blockNumber ? Number(blockNumber) : null // ✅ Store block_number from event
      };

      // Validate timestamps before saving
      if (parsedPool.eventStartTime === 0 || parsedPool.eventEndTime === 0) {
        console.error(`❌ ${this.serviceName}: Pool ${poolId} has invalid timestamps - REJECTING`);
        throw new Error(`Pool ${poolId} has corrupted timestamp data (start: ${parsedPool.eventStartTime}, end: ${parsedPool.eventEndTime})`);
      }

      if (existingPool.rows.length > 0) {
        // Update existing pool (also update block_number if missing)
        await this.updatePoolInDatabase(parsedPool);
      } else {
        // Insert new pool
        await this.insertPoolInDatabase(parsedPool);
      }

    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to save pool ${poolId}:`, error);
      throw error;
    }
  }

  /**
   * Insert new pool into database
   */
  async insertPoolInDatabase(parsedPool) {
    await db.query(`
      INSERT INTO oracle.pools (
        pool_id, creator_address, predicted_outcome, odds, creator_stake,
        total_creator_side_stake, max_bettor_stake, total_bettor_stake,
        event_start_time, event_end_time, betting_end_time, league, category,
        region, home_team, away_team, title, market_id, result, is_private,
        use_bitr, oracle_type, market_type, max_bet_per_user, result_timestamp,
        arbitration_deadline, fixture_id, block_number, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, NOW(), NOW()
      )
    `, [
      parsedPool.poolId, parsedPool.creatorAddress, parsedPool.predictedOutcome,
      parsedPool.odds, parsedPool.creatorStake, parsedPool.totalCreatorSideStake,
      parsedPool.maxBettorStake, parsedPool.totalBettorStake, parsedPool.eventStartTime,
      parsedPool.eventEndTime, parsedPool.bettingEndTime, parsedPool.league,
      parsedPool.category, parsedPool.region, parsedPool.homeTeam, parsedPool.awayTeam,
      parsedPool.title, parsedPool.marketId, parsedPool.result, parsedPool.isPrivate,
      parsedPool.useBitr, parsedPool.oracleType, parsedPool.marketType,
      parsedPool.maxBetPerUser, parsedPool.resultTimestamp, parsedPool.arbitrationDeadline,
      null, // fixture_id will be populated by fixture mapping maintainer
      parsedPool.blockNumber // ✅ Store block_number from event
    ]);

    // For GUIDED oracle pools, create category-specific prediction market entries
    if (parsedPool.oracleType === 0) { // GUIDED oracle
      const category = parsedPool.category?.toLowerCase();
      
      if (category?.includes('football') || category?.includes('soccer')) {
        await this.linkToFootballPredictionMarket(parsedPool);
      } else if (category?.includes('crypto')) {
        await this.linkToCryptoPredictionMarket(parsedPool);
      }
    }
  }

  /**
   * Update existing pool in database
   */
  async updatePoolInDatabase(parsedPool) {
    await db.query(`
      UPDATE oracle.pools SET
        creator_address = $2, predicted_outcome = $3, odds = $4, creator_stake = $5,
        total_creator_side_stake = $6, max_bettor_stake = $7, total_bettor_stake = $8,
        event_start_time = $9, event_end_time = $10, betting_end_time = $11,
        league = $12, category = $13, region = $14, home_team = $15, away_team = $16,
        title = $17, market_id = $18, result = $19, is_private = $20, use_bitr = $21,
        oracle_type = $22, market_type = $23, max_bet_per_user = $24,
        result_timestamp = $25, arbitration_deadline = $26,
        block_number = COALESCE($27, block_number), updated_at = NOW()
      WHERE pool_id = $1
    `, [
      parsedPool.poolId, parsedPool.creatorAddress, parsedPool.predictedOutcome,
      parsedPool.odds, parsedPool.creatorStake, parsedPool.totalCreatorSideStake,
      parsedPool.maxBettorStake, parsedPool.totalBettorStake, parsedPool.eventStartTime,
      parsedPool.eventEndTime, parsedPool.bettingEndTime, parsedPool.league,
      parsedPool.category, parsedPool.region, parsedPool.homeTeam, parsedPool.awayTeam,
      parsedPool.title, parsedPool.marketId, parsedPool.result, parsedPool.isPrivate,
      parsedPool.useBitr, parsedPool.oracleType, parsedPool.marketType,
      parsedPool.maxBetPerUser, parsedPool.resultTimestamp, parsedPool.arbitrationDeadline,
      parsedPool.blockNumber // ✅ Update block_number if provided (COALESCE keeps existing if null)
    ]);
  }

  /**
   * Update pool analytics
   */
  async updatePoolAnalytics(poolData, poolId) {
    try {
      await db.query(`
        UPDATE oracle.pools SET
          total_bettor_stake = $2,
          max_bettor_stake = $3,
          updated_at = NOW()
        WHERE pool_id = $1
      `, [
        poolId,
        poolData.totalBettorStake?.toString() || '0',
        poolData.maxBettorStake?.toString() || '0'
      ]);
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to update analytics for pool ${poolId}:`, error);
    }
  }

  /**
   * Update pool settlement
   * ✅ CRITICAL FIX: Use event data directly (source of truth) instead of getPool() which might be stale
   */
  async updatePoolSettlement(poolId, result, creatorSideWon, timestamp) {
    try {
      // ✅ CRITICAL: Use event data directly - this is the source of truth from the settlement transaction
      // No need to call getPool() which might return stale data
      const isSettled = true; // PoolSettled event means it's settled
      
      // Convert creatorSideWon from BigInt/Number to boolean
      const creatorSideWonBool = Boolean(Number(creatorSideWon));
      
      // ✅ CRITICAL: Detect refunds - automatic refunds emit PoolSettled with result = 0x00...
      // IMPORTANT: A 0-0 game result is NOT a refund - it's a valid "Draw" outcome
      // Only the exact zero hash (all zeros) indicates a refund (no bets scenario)
      const zeroResult = '0x0000000000000000000000000000000000000000000000000000000000000000';
      
      // Normalize result for comparison (handle both string and hex formats)
      let normalizedResult = result;
      if (typeof result === 'string' && result.startsWith('0x')) {
        normalizedResult = result.toLowerCase();
      } else if (typeof result === 'string') {
        // If result is not hex, it might be empty/null - check if it's actually the zero hash
        normalizedResult = result;
      }
      
      // Only mark as refund if result is EXACTLY the zero hash (all zeros)
      // Empty strings, null, or other zero-like values are NOT refunds
      const isRefund = normalizedResult === zeroResult || 
                       normalizedResult === zeroResult.toLowerCase();
      
      // Convert timestamp from BigInt/Number to number
      const resultTimestamp = timestamp ? Number(timestamp) : Math.floor(Date.now() / 1000);
      
      console.log(`  📊 Settlement data: creatorSideWon=${creatorSideWonBool}, isRefund=${isRefund}, result=${result}, normalizedResult=${normalizedResult}`);
      
      await db.query(`
        UPDATE oracle.pools SET
          is_settled = $2,
          creator_side_won = $3,
          result = $4,
          result_timestamp = $5,
          status = CASE WHEN $6 THEN 'refunded' ELSE 'settled' END,
          refunded_at = CASE WHEN $6 THEN NOW() ELSE NULL END,
          settled_at = NOW(),
          updated_at = NOW()
        WHERE pool_id = $1
      `, [
        poolId,
        isSettled,
        creatorSideWonBool,
        result,
        resultTimestamp,
        isRefund
      ]);
      
      if (isRefund) {
        console.log(`  💰 Pool ${poolId} was refunded (no bets)`);
      } else {
        console.log(`  ✅ Pool ${poolId} was settled (creator ${creatorSideWonBool ? 'won' : 'lost'})`);
        
        // ✅ Send notifications to creator and all bettors
        try {
          const poolInfo = await db.query(`
            SELECT creator_address, title, result 
            FROM oracle.pools 
            WHERE pool_id = $1
          `, [poolId]);
          
          if (poolInfo.rows.length > 0) {
            const pool = poolInfo.rows[0];
            const poolTitle = pool.title || `Pool #${poolId}`;
            const outcome = pool.result || 'Settled';
            
            // Notify pool creator
            await notificationService.notifyPoolSettled(pool.creator_address, {
              poolId: Number(poolId),
              title: poolTitle,
              outcome: outcome
            });
            
            // Get all bettors for this pool
            const bettors = await db.query(`
              SELECT DISTINCT bettor_address 
              FROM oracle.bets 
              WHERE pool_id = $1
            `, [poolId.toString()]);
            
            // Notify each bettor
            for (const bettor of bettors.rows) {
              const bettorAddress = bettor.bettor_address;
              
              // Determine if bettor won or lost
              // If creator won, bettors lost (contrarian logic)
              if (creatorSideWonBool) {
                await notificationService.notifyBetLost(bettorAddress, {
                  poolId: Number(poolId),
                  poolTitle: poolTitle
                });
              } else {
                // Bettor won - get their potential win amount
                const betInfo = await db.query(`
                  SELECT SUM(CAST(amount AS NUMERIC)) as total_bet
                  FROM oracle.bets
                  WHERE pool_id = $1 AND bettor_address = $2
                `, [poolId.toString(), bettorAddress]);
                
                const totalBet = parseFloat(betInfo.rows[0]?.total_bet || 0) / 1e18;
                
                await notificationService.notifyBetWon(bettorAddress, {
                  poolId: Number(poolId),
                  amount: totalBet.toFixed(2),
                  poolTitle: poolTitle
                });
              }
            }
            
            console.log(`🔔 Settlement notifications sent to ${1 + bettors.rows.length} users`);
          }
        } catch (notifError) {
          console.error(`⚠️ Failed to send settlement notifications:`, notifError);
          // Don't fail the settlement if notification fails
        }
      }
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to update settlement for pool ${poolId}:`, error);
      throw error; // Re-throw to trigger retry mechanism
    }
  }

  /**
   * Update pool liquidity
   */
  async updatePoolLiquidity(poolData, poolId) {
    try {
      await db.query(`
        UPDATE oracle.pools SET
          total_creator_side_stake = $2,
          updated_at = NOW()
        WHERE pool_id = $1
      `, [
        poolId,
        poolData.totalCreatorSideStake?.toString() || '0'
      ]);
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to update liquidity for pool ${poolId}:`, error);
    }
  }

  /**
   * Update pool boost
   */
  async updatePoolBoost(poolData, poolId, event = null) {
    try {
      // Extract boost data from event if available
      let boostTier = null;
      let boostExpiry = null;
      let boostFee = null;
      let booster = null;
      
      if (event && event.args) {
        boostTier = event.args.tier;
        boostExpiry = event.args.expiry;
        boostFee = event.args.fee;
        booster = event.args.booster;
      }
      
      // Update database with boost information
      await db.query(`
        UPDATE oracle.pools SET
          boost_tier = $2,
          boost_expiry = $3,
          boost_fee = $4,
          booster_address = $5,
          updated_at = NOW()
        WHERE pool_id = $1
      `, [
        poolId,
        boostTier,
        boostExpiry,
        boostFee,
        booster
      ]);
      
      console.log(`✅ ${this.serviceName}: Updated boost data for pool ${poolId}`);
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to update boost for pool ${poolId}:`, error);
    }
  }

  /**
   * Start fallback sync timer (in case events fail)
   */
  startFallbackSync() {
    this.fallbackTimer = setInterval(async () => {
      try {
        console.log(`🔄 ${this.serviceName}: Running fallback sync...`);
        await this.fallbackSync();
      } catch (error) {
        console.error(`❌ ${this.serviceName}: Fallback sync failed:`, error);
      }
    }, this.config.fallbackSyncInterval);
  }

  /**
   * Fallback sync (check for missed pools)
   */
  async fallbackSync() {
    try {
      const totalPools = await this.contract.poolCount();
      
      // Get last synced pool from database
      const lastSyncResult = await db.query(`
        SELECT COALESCE(MAX(pool_id), -1) as last_pool_id 
        FROM oracle.pools
      `);
      
      const lastPoolId = Number(lastSyncResult.rows[0]?.last_pool_id || -1);
      const startPoolId = lastPoolId + 1;
      
      if (startPoolId < Number(totalPools)) {
        console.log(`🔄 ${this.serviceName}: Fallback sync found ${Number(totalPools) - startPoolId} missed pools`);
        await this.syncPoolRange(startPoolId, Number(totalPools) - 1);
      }
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Fallback sync failed:`, error);
    }
  }

  /**
   * Sync a range of pools (fallback method)
   */
  async syncPoolRange(startId, endId) {
    for (let poolId = startId; poolId <= endId; poolId++) {
      try {
        const poolData = await this.contract.getPool(poolId);
        await this.savePoolToDatabase(poolData, poolId);
        console.log(`✅ ${this.serviceName}: Fallback synced pool ${poolId}`);
      } catch (error) {
        console.error(`❌ ${this.serviceName}: Failed to fallback sync pool ${poolId}:`, error);
      }
    }
  }

  /**
   * Link guided oracle football pools to football_prediction_markets table
   * This enables the football oracle bot to automatically resolve them
   */
  async linkToFootballPredictionMarket(parsedPool) {
    try {
      // Only for GUIDED oracle (0) and football category
      if (parsedPool.oracleType !== 0) {
        return; // Not a guided oracle pool
      }

      const category = parsedPool.category.toLowerCase();
      if (!category.includes('football') && !category.includes('soccer')) {
        return; // Not a football pool
      }

      if (!parsedPool.marketId) {
        console.warn(`⚠️ Pool ${parsedPool.poolId}: No market_id for football pool`);
        return;
      }

      // Normalize predicted_outcome to standardized format
      const normalizedOutcome = this.normalizePredictedOutcome(
        parsedPool.predictedOutcome,
        parsedPool.homeTeam,
        parsedPool.awayTeam
      );

      // Determine outcome_type from predicted_outcome
      const outcomeType = this.determineOutcomeType(normalizedOutcome);

      // Create football_prediction_markets entry
      await db.query(`
        INSERT INTO oracle.football_prediction_markets (
          id, pool_id, fixture_id, market_id, market_type, outcome_type, predicted_outcome,
          end_time, resolved, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, to_timestamp($8), false, NOW(), NOW()
        )
        ON CONFLICT (pool_id) DO UPDATE SET
          fixture_id = EXCLUDED.fixture_id,
          market_id = EXCLUDED.market_id,
          market_type = EXCLUDED.market_type,
          outcome_type = EXCLUDED.outcome_type,
          predicted_outcome = EXCLUDED.predicted_outcome,
          end_time = EXCLUDED.end_time,
          updated_at = NOW()
      `, [
        `pool_${parsedPool.poolId}_${Date.now()}`,
        parsedPool.poolId.toString(),
        parsedPool.marketId.substring(0, 50), // Truncate to fit 50 char limit
        parsedPool.marketId.substring(0, 100), // Truncate to fit 100 char limit
        'GUIDED', // market_type - default to GUIDED for guided oracle pools
        outcomeType,
        normalizedOutcome.substring(0, 50), // Truncate to fit 50 char limit
        parsedPool.eventEndTime
      ]);

      console.log(`✅ Linked pool ${parsedPool.poolId} to football_prediction_markets (${outcomeType}: ${normalizedOutcome})`);

    } catch (error) {
      console.error(`❌ Failed to link pool ${parsedPool.poolId} to football_prediction_markets:`, error);
      // Don't throw - linking is optional, pool save should still succeed
    }
  }

  /**
   * Link guided oracle crypto pools to crypto_prediction_markets table
   * This enables the crypto oracle bot to automatically resolve them
   */
  async linkToCryptoPredictionMarket(parsedPool) {
    try {
      // Only for GUIDED oracle (0) and crypto category
      if (parsedPool.oracleType !== 0) {
        return; // Not a guided oracle pool
      }

      const category = parsedPool.category?.toLowerCase();
      if (!category?.includes('crypto')) {
        return; // Not a crypto pool
      }

      if (!parsedPool.marketId) {
        console.warn(`⚠️ Pool ${parsedPool.poolId}: No market_id for crypto pool`);
        return;
      }

      // Parse predicted outcome to extract crypto prediction details
      // Example: "BTC > $130,000" -> extract coin, direction, target price
      const predictionDetails = this.parseCryptoPrediction(parsedPool.predictedOutcome);
      
      if (!predictionDetails) {
        console.warn(`⚠️ Pool ${parsedPool.poolId}: Could not parse crypto prediction: ${parsedPool.predictedOutcome}`);
        return;
      }

      // Create crypto_prediction_markets entry
      await db.query(`
        INSERT INTO oracle.crypto_prediction_markets (
          id, pool_id, market_id, coinpaprika_id, target_price, direction,
          start_price, end_time, resolved, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, false, NOW(), NOW()
        )
        ON CONFLICT (pool_id) DO UPDATE SET
          market_id = EXCLUDED.market_id,
          coinpaprika_id = EXCLUDED.coinpaprika_id,
          target_price = EXCLUDED.target_price,
          direction = EXCLUDED.direction,
          start_price = EXCLUDED.start_price,
          end_time = EXCLUDED.end_time,
          updated_at = NOW()
      `, [
        parsedPool.poolId, // Use pool_id as id
        parsedPool.poolId,
        parsedPool.marketId,
        predictionDetails.coinpaprikaId,
        predictionDetails.targetPrice,
        predictionDetails.direction,
        predictionDetails.startPrice || 0,
        parsedPool.eventEndTime
      ]);

      console.log(`✅ Linked pool ${parsedPool.poolId} to crypto_prediction_markets (${predictionDetails.coin} ${predictionDetails.direction} $${predictionDetails.targetPrice})`);

    } catch (error) {
      console.error(`❌ Failed to link pool ${parsedPool.poolId} to crypto_prediction_markets:`, error);
      // Don't throw - linking is optional, pool save should still succeed
    }
  }

  /**
   * Parse crypto prediction string to extract details
   * Examples: "BTC > $130,000", "ETH < $3,500", "SOL >= $200"
   */
  parseCryptoPrediction(predictedOutcome) {
    try {
      const outcome = predictedOutcome.trim();
      
      // Match patterns like "BTC > $130,000", "ETH < $3,500", "BNB above $1450", "SOL below $200"
      const match = outcome.match(/^([A-Z]+)\s*(?:([><=]+)|(above|below))\s*\$?([0-9,]+(?:\.\d+)?)$/i);
      
      if (!match) {
        return null;
      }

      const [, coin, operator, keyword, priceStr] = match;
      const targetPrice = parseFloat(priceStr.replace(/,/g, ''));
      
      // Map operators and keywords to directions
      let direction;
      if (operator && (operator.includes('>') || operator.includes('>='))) {
        direction = 'above';
      } else if (operator && (operator.includes('<') || operator.includes('<='))) {
        direction = 'below';
      } else if (keyword && keyword.toLowerCase() === 'above') {
        direction = 'above';
      } else if (keyword && keyword.toLowerCase() === 'below') {
        direction = 'below';
      } else {
        return null;
      }

      // Map coin symbols to coinpaprika IDs (simplified mapping)
      const coinMapping = {
        'BTC': 'btc-bitcoin',
        'ETH': 'eth-ethereum',
        'BNB': 'bnb-binance-coin',
        'ADA': 'ada-cardano',
        'SOL': 'sol-solana',
        'DOT': 'dot-polkadot',
        'LINK': 'link-chainlink',
        'LTC': 'ltc-litecoin',
        'MATIC': 'matic-polygon',
        'AVAX': 'avax-avalanche',
        'UNI': 'uni-uniswap'
      };

      const coinpaprikaId = coinMapping[coin.toUpperCase()];
      if (!coinpaprikaId) {
        console.warn(`Unknown crypto coin: ${coin}`);
        return null;
      }

      return {
        coin: coin.toUpperCase(),
        coinpaprikaId,
        targetPrice,
        direction,
        startPrice: null // Will be filled by price update service
      };

    } catch (error) {
      console.error('Error parsing crypto prediction:', error);
      return null;
    }
  }

  /**
   * Normalize team-specific outcomes to standardized format
   */
  normalizePredictedOutcome(predictedOutcome, homeTeam, awayTeam) {
    const outcome = predictedOutcome.toLowerCase().trim();

    // 1X2 markets - normalize to Home/Draw/Away
    if (homeTeam && outcome.includes(homeTeam.toLowerCase())) {
      return 'Home wins';
    }
    if (awayTeam && outcome.includes(awayTeam.toLowerCase())) {
      return 'Away wins';
    }
    if (outcome.includes('draw') || outcome === 'x') {
      return 'Draw';
    }

    // Over/Under markets
    if (outcome.includes('over')) {
      if (outcome.includes('0.5')) return 'Over 0.5 goals';
      if (outcome.includes('1.5')) return 'Over 1.5 goals';
      if (outcome.includes('2.5')) return 'Over 2.5 goals';
      if (outcome.includes('3.5')) return 'Over 3.5 goals';
    }
    if (outcome.includes('under')) {
      if (outcome.includes('0.5')) return 'Under 0.5 goals';
      if (outcome.includes('1.5')) return 'Under 1.5 goals';
      if (outcome.includes('2.5')) return 'Under 2.5 goals';
      if (outcome.includes('3.5')) return 'Under 3.5 goals';
    }

    // BTTS markets
    if (outcome.includes('both') && outcome.includes('score')) {
      return 'Both teams to score';
    }
    if (outcome.includes('not both') || (outcome.includes('btts') && outcome.includes('no'))) {
      return 'Not both teams to score';
    }

    // Return as-is if already normalized
    return predictedOutcome;
  }

  /**
   * Determine outcome_type from predicted_outcome
   */
  determineOutcomeType(predictedOutcome) {
    const outcome = predictedOutcome.toLowerCase();

    if (outcome.includes('home wins') || outcome.includes('away wins') || outcome === 'draw') {
      return '1X2';
    }
    if (outcome.includes('0.5')) return 'OU05';
    if (outcome.includes('1.5')) return 'OU15';
    if (outcome.includes('2.5')) return 'OU25';
    if (outcome.includes('3.5')) return 'OU35';
    if (outcome.includes('both') && outcome.includes('score')) return 'BTTS';

    return '1X2'; // Default
  }
}

module.exports = EventDrivenPoolSync;

// Auto-start when run directly (forked as a process)
if (require.main === module) {
  const service = new EventDrivenPoolSync();
  
  service.start()
    .then(() => {
      console.log('🎉 Event-Driven Pool Sync running...');
      
      // Keep process alive
      process.on('SIGTERM', async () => {
        console.log('📴 SIGTERM received, shutting down gracefully...');
        await service.stop();
        process.exit(0);
      });
      
      process.on('SIGINT', async () => {
        console.log('📴 SIGINT received, shutting down gracefully...');
        await service.stop();
        process.exit(0);
      });
    })
    .catch((error) => {
      console.error('💥 Event-Driven Pool Sync failed to start:', error);
      process.exit(1);
    });
}
