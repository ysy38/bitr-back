const db = require('../db/db');
const Web3Service = require('./web3-service');
const { safeStringify } = require('../utils/bigint-serializer');
const somniaDataStreams = require('./somnia-data-streams-service');
const notificationService = require('./notification-service');
const wsService = require('./websocket-service');

/**
 * Event-Driven Bet Sync Service
 * 
 * This service listens to BetPlaced events and stores individual bet records
 * in the database for frontend display. The contract only stores total stakes
 * per user, not individual bet history.
 * 
 * Features:
 * - Real-time bet event listening
 * - Individual bet record storage
 * - Transaction hash tracking
 * - Bet status tracking
 * - Frontend API support
 */
class EventDrivenBetSync {
  constructor() {
    this.web3Service = new Web3Service();
    this.isRunning = false;
    this.contract = null;
    this.eventListeners = [];
    this.serviceName = 'EventDrivenBetSync';
    
    // Configuration
    this.config = {
      maxRetries: 3,
      retryDelayMs: 5000,
      batchSize: 50,
      fallbackSyncInterval: 30 * 60 * 1000 // 30 minutes
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
   * Start the event-driven bet sync service
   */
  async start() {
    if (this.isRunning) {
      console.log(`⚠️ ${this.serviceName}: Already running`);
      return;
    }

    try {
      await this.initialize();
      
      this.isRunning = true;
      console.log(`🚀 ${this.serviceName}: Starting event-driven bet sync...`);
      
      // Check for pools with bets but no bet records
      await this.checkMissingBets();
      
      // Check for pools with LP stakes but no LP records
      await this.checkMissingLPProviders();
      
      // Setup event listeners
      await this.setupEventListeners();
      
      // Start fallback sync timer
      this.startFallbackSync();
      
      console.log(`✅ ${this.serviceName}: Event-driven bet sync active`);
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to start:`, error);
      throw error;
    }
  }

  /**
   * Check for pools with LP stakes but no LP provider records in database
   * Compares total_creator_side_stake with sum of LP stakes to detect missing events
   */
  async checkMissingLPProviders() {
    try {
      console.log(`📊 ${this.serviceName}: Checking for pools with missing LP provider records...`);
      
      const poolsResult = await db.query(`
        SELECT 
          p.pool_id,
          p.total_creator_side_stake,
          p.creator_stake,
          COALESCE(SUM(lp.stake::numeric), 0) as total_lp_stake
        FROM oracle.pools p
        LEFT JOIN oracle.pool_liquidity_providers lp ON lp.pool_id::bigint = p.pool_id
        WHERE p.total_creator_side_stake IS NOT NULL
          AND CAST(p.total_creator_side_stake AS NUMERIC) > CAST(p.creator_stake AS NUMERIC)
        GROUP BY p.pool_id, p.total_creator_side_stake, p.creator_stake
        HAVING CAST(p.total_creator_side_stake AS NUMERIC) - CAST(p.creator_stake AS NUMERIC) > COALESCE(SUM(lp.stake::numeric), 0)
      `);
      
      let missingCount = 0;
      
      for (const pool of poolsResult.rows) {
        const poolId = pool.pool_id;
        const expectedLPStake = BigInt(pool.total_creator_side_stake) - BigInt(pool.creator_stake || 0);
        const actualLPStake = BigInt(pool.total_lp_stake || 0);
        
        if (expectedLPStake > actualLPStake) {
          const missingAmount = expectedLPStake - actualLPStake;
          const missingBITR = (missingAmount / BigInt(10**18)).toString();
          console.log(`⚠️ Pool ${poolId}: Missing ${missingBITR} BITR in LP records (expected: ${(expectedLPStake / BigInt(10**18)).toString()}, actual: ${(actualLPStake / BigInt(10**18)).toString()})`);
          missingCount++;
        }
      }
      
      if (missingCount > 0) {
        console.log(`⚠️ ${missingCount} pools have LP stakes but missing LP provider records`);
        console.log(`   Use sync-missed-liquidity-event.js script to manually sync missed events`);
      } else {
        console.log(`✅ All pools with LP stakes have LP provider records`);
      }
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Error checking missing LP providers:`, error);
      // Don't throw - this is just a check
    }
  }

  /**
   * Check for pools with bets but no bet records in database
   * Contract only stores total stakes, cannot reconstruct individual bets
   */
  async checkMissingBets() {
    try {
      console.log(`📊 ${this.serviceName}: Checking for pools with missing bet records...`);
      
      const poolsResult = await db.query(`
        SELECT pool_id, total_bettor_stake 
        FROM oracle.pools 
        WHERE CAST(total_bettor_stake AS NUMERIC) > 0
      `);
      
      let missingCount = 0;
      
      for (const pool of poolsResult.rows) {
        const poolId = pool.pool_id;
        const totalStakeWei = pool.total_bettor_stake || '0';
        
        // Convert Wei to BITR (assuming 18 decimals)
        const totalStakeBITR = (BigInt(totalStakeWei) / BigInt(10**18)).toString();
        
        // Check if we have bet records
        const betsResult = await db.query(
          'SELECT COUNT(*) as count FROM oracle.bets WHERE pool_id = $1',
          [poolId]
        );
        
        const betCount = parseInt(betsResult.rows[0].count);
        
        if (betCount === 0) {
          console.log(`⚠️ Pool ${poolId}: ${totalStakeBITR} BITR staked but 0 bet records (contract stores totals only)`);
          missingCount++;
        }
      }
      
      if (missingCount > 0) {
        console.log(`⚠️ ${missingCount} pools have bets but no bet records (historical bets before service started)`);
      } else {
        console.log(`✅ All pools with bets have bet records`);
      }
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Error checking missing bets:`, error);
      // Don't throw - this is just a check
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
      console.log(`🛑 ${this.serviceName}: Stopping event-driven bet sync...`);
      
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
   * Setup contract event listeners
   * ✅ CRITICAL FIX: Added better error handling and connection monitoring
   */
  async setupEventListeners() {
    try {
      console.log(`👂 ${this.serviceName}: Setting up event listeners...`);
      
      if (!this.contract) {
        throw new Error('Contract not initialized');
      }
      
      // ✅ CRITICAL FIX: Verify contract has event listener capability
      if (typeof this.contract.on !== 'function') {
        throw new Error('Contract does not support event listening (contract.on is not a function)');
      }
      
      console.log(`✅ ${this.serviceName}: Contract supports event listening`);
      
      // Listen to BetPlaced events
      const betPlacedListener = this.contract.on('BetPlaced', async (
        poolId,
        bettor,
        amount,
        isForOutcome,
        event
      ) => {
        try {
          const txHash = event?.log?.transactionHash || event?.transactionHash || 'unknown';
          const blockNum = event?.log?.blockNumber || event?.blockNumber || 'unknown';
          
          console.log(`💰 ${this.serviceName}: BetPlaced event detected`);
          console.log(`   Pool ID: ${poolId}`);
          console.log(`   Bettor: ${bettor}`);
          console.log(`   Amount: ${amount.toString()}`);
          console.log(`   Transaction: ${txHash}`);
          console.log(`   Block: ${blockNum}`);
          
          await this.handleBetPlaced(poolId, bettor, amount, isForOutcome, event);
        } catch (error) {
          // ✅ CRITICAL FIX: Catch errors in event handler to prevent listener from stopping
          // If an error occurs, log it but don't let it crash the listener
          console.error(`❌ ${this.serviceName}: Error in BetPlaced event handler:`, error);
          console.error(`   Stack:`, error.stack);
          console.error(`   Pool ID: ${poolId}`);
          console.error(`   Transaction: ${event?.log?.transactionHash || event?.transactionHash || 'unknown'}`);
          console.error(`   This bet will be retried via retry mechanism`);
          
          // Trigger retry mechanism
          try {
            await this.retryBetSync(poolId, bettor, amount, isForOutcome, event);
          } catch (retryError) {
            console.error(`❌ ${this.serviceName}: Retry also failed for bet:`, retryError);
          }
        }
      });
      
      this.eventListeners.push(betPlacedListener);
      console.log(`✅ ${this.serviceName}: BetPlaced listener registered`);
      
      // Listen for LiquidityAdded events (NO bets - liquidity additions)
      const liquidityAddedListener = this.contract.on('LiquidityAdded', async (
        poolId,
        provider,
        amount,
        event
      ) => {
        try {
        // ✅ FIX: Extract amount from event.args if available (more reliable)
        // Sometimes the direct parameter might be wrong, but event.args is always correct
        const actualAmount = event?.args?.amount || amount;
        const actualPoolId = event?.args?.poolId || poolId;
        const actualProvider = event?.args?.provider || provider;
        
        console.log(`💰 ${this.serviceName}: LiquidityAdded event detected`);
        console.log(`   Pool ID: ${actualPoolId} (param: ${poolId}, args: ${event?.args?.poolId})`);
        console.log(`   Provider: ${actualProvider} (param: ${provider}, args: ${event?.args?.provider})`);
        console.log(`   Amount (param): ${amount?.toString() || 'undefined'}`);
        console.log(`   Amount (args): ${event?.args?.amount?.toString() || 'undefined'}`);
        console.log(`   Amount (using): ${actualAmount?.toString() || 'undefined'}`);
        console.log(`   Amount in BITR: ${actualAmount ? (Number(actualAmount) / 1e18).toFixed(2) : 'N/A'}`);
        console.log(`🔍 ${this.serviceName}: Event object structure:`, {
          hasEvent: !!event,
          eventKeys: event ? Object.keys(event) : 'null',
          hasArgs: !!event?.args,
          argsKeys: event?.args ? Object.keys(event.args) : 'null',
          blockNumber: event?.blockNumber,
          transactionHash: event?.transactionHash,
          blockHash: event?.blockHash,
          logIndex: event?.logIndex,
          log: event?.log,
          logBlockNumber: event?.log?.blockNumber,
          logTransactionHash: event?.log?.transactionHash,
          logBlockHash: event?.log?.blockHash,
          logLogIndex: event?.log?.logIndex
        });
        // Handle liquidity addition as LP event (not a bet) - use actualAmount from event.args
        await this.handleLiquidityAdded(actualPoolId, actualProvider, actualAmount, event);
        } catch (error) {
          // ✅ CRITICAL FIX: Catch errors in event handler to prevent listener from stopping
          // If an error occurs, log it but don't let it crash the listener
          console.error(`❌ ${this.serviceName}: Error in LiquidityAdded event handler:`, error);
          console.error(`   Pool ID: ${poolId}`);
          console.error(`   Provider: ${provider}`);
          console.error(`   Transaction: ${event?.log?.transactionHash || event?.transactionHash || 'unknown'}`);
          console.error(`   This LP event will be retried via retry mechanism`);
          
          // Trigger retry mechanism
          try {
            await this.retryLPSync(poolId, provider, amount, event, 0);
          } catch (retryError) {
            console.error(`❌ ${this.serviceName}: Retry also failed for LP event:`, retryError);
          }
        }
      });
      
      this.eventListeners.push(liquidityAddedListener);
      
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
   * Handle BetPlaced event
   * ✅ FIX: Added better error handling and duplicate detection to prevent missing bets
   */
  async handleBetPlaced(poolId, bettor, amount, isForOutcome, event) {
    const transactionHash = event?.log?.transactionHash || event?.transactionHash;
    const blockNumber = event?.log?.blockNumber || event?.blockNumber;
    
    try {
      console.log(`🔄 ${this.serviceName}: Processing BetPlaced event for pool ${poolId}...`);
      console.log(`   Transaction: ${transactionHash || 'unknown'}`);
      console.log(`   Block: ${blockNumber || 'unknown'}`);
      console.log(`   Bettor: ${bettor}`);
      console.log(`   Amount: ${amount.toString()}`);
      
      // ✅ CRITICAL FIX: Check for duplicate bet FIRST before processing
      // This prevents race conditions when multiple bets are placed quickly
      let isDuplicate = false;
      if (transactionHash && !transactionHash.startsWith('temp_')) {
        const existingBet = await db.query(
          'SELECT id FROM oracle.bets WHERE transaction_hash = $1',
          [transactionHash]
        );
        
        if (existingBet.rows.length > 0) {
          console.log(`⚠️ ${this.serviceName}: Bet already exists for transaction ${transactionHash} - skipping duplicate DB insert`);
          isDuplicate = true;
          // Don't return early - we still want to publish to SDS and update WebSocket
        }
      }
      
      // Get pool data for additional context - with fallback handling
      let processedPoolData = {};
      try {
        const poolData = await this.contract.getPool(poolId);
        processedPoolData = this.processPoolData(poolData);
      } catch (getPoolError) {
        console.warn(`⚠️ ${this.serviceName}: Failed to fetch pool data for ${poolId}, using fallback:`, getPoolError.message);
        // Use fallback empty values - the bet will still be saved
        processedPoolData = {
          eventStartTime: 0,
          eventEndTime: 0,
          bettingEndTime: 0,
          league: null,
          category: null,
          homeTeam: null,
          awayTeam: null,
          title: null
        };
      }
      
      // Only save to database if not a duplicate
      if (!isDuplicate) {
        // Save bet record to database with proper data type handling
        await this.saveBetToDatabase({
          poolId: poolId.toString(), // Convert to string to match oracle.bets.pool_id (character varying)
          bettorAddress: bettor,
          amount: amount.toString(), // Convert BigInt to string
          isForOutcome: isForOutcome,
          transactionHash: transactionHash,
          blockNumber: blockNumber ? blockNumber.toString() : '0',
          eventStartTime: processedPoolData.eventStartTime,
          eventEndTime: processedPoolData.eventEndTime,
          bettingEndTime: processedPoolData.bettingEndTime,
          league: processedPoolData.league,
          category: processedPoolData.category,
          homeTeam: processedPoolData.homeTeam,
          awayTeam: processedPoolData.awayTeam,
          title: processedPoolData.title
        });
        
        console.log(`✅ ${this.serviceName}: Bet record saved successfully for pool ${poolId}, transaction ${transactionHash || 'unknown'}`);
      } else {
        console.log(`ℹ️ ${this.serviceName}: Skipping DB insert for duplicate bet, but continuing with SDS and WebSocket updates`);
      }
      
      // ✅ CRITICAL: Broadcast WebSocket updates for real-time UI
      try {
        // ✅ DYNAMIC CALCULATION: Fetch pool data and calculate metrics dynamically
        const poolProgressResult = await db.query(`
          SELECT 
            p.pool_id,
            p.creator_stake,
            p.total_bettor_stake,
            p.max_bettor_stake,
            p.total_creator_side_stake,
            p.odds,
            COUNT(DISTINCT CASE WHEN b.is_for_outcome = true THEN b.bettor_address END) as participant_count,
            COUNT(*) as bet_count
          FROM oracle.pools p
          LEFT JOIN oracle.bets b ON b.pool_id::text = p.pool_id::text
          WHERE p.pool_id = $1
          GROUP BY p.pool_id, p.creator_stake, p.total_bettor_stake, p.max_bettor_stake, 
                   p.total_creator_side_stake, p.odds
        `, [poolId]);
        
        if (poolProgressResult.rows.length > 0) {
          const progress = poolProgressResult.rows[0];
          
          // ✅ DYNAMIC CALCULATION: Match Turkish formula exactly
          // Formula: S_bettorMax = S_liquidity × (1 / (O - 1))
          const effectiveCreatorSideStake = (parseFloat(progress.total_bettor_stake || 0) === 0 || 
                                             parseFloat(progress.total_bettor_stake || 0) > parseFloat(progress.creator_stake || 0))
            ? progress.total_creator_side_stake
            : progress.creator_stake;
          
          const denominator = progress.odds - 100;
          const calculatedMaxBettorStake = denominator > 0
            ? (parseFloat(effectiveCreatorSideStake || 0) * 100) / denominator
            : 0;
          
          // ✅ DYNAMIC: Calculate max pool size = liquidity + maxBettorStake
          const calculatedMaxPoolSize = parseFloat(effectiveCreatorSideStake || 0) + calculatedMaxBettorStake;
          
          // ✅ DYNAMIC: Calculate fill percentage = (currentTotal / maxPoolSize) × 100
          const currentTotal = parseFloat(effectiveCreatorSideStake || 0) + parseFloat(progress.total_bettor_stake || 0);
          const calculatedFillPercentage = calculatedMaxPoolSize > 0
            ? Math.min(100, (currentTotal / calculatedMaxPoolSize) * 100)
            : 0;
          
          // ✅ CRITICAL: Also calculate bet count for progress updates
          const betCountResult = await db.query(`
            SELECT COUNT(*) as bet_count
            FROM oracle.bets
            WHERE pool_id = $1
          `, [poolId]);
          const betCount = parseInt(betCountResult.rows[0]?.bet_count || 0);
          
          const participantCount = parseInt(progress.participant_count || 0);
          const totalBettorStakeStr = progress.total_bettor_stake?.toString() || '0';
          const totalBettorStakeFloat = parseFloat(totalBettorStakeStr);
          const avgBet =
            betCount > 0 && !Number.isNaN(totalBettorStakeFloat)
              ? (totalBettorStakeFloat / betCount).toString()
              : '0';

          wsService.updatePoolProgress(poolId, {
            poolId: progress.pool_id.toString(),
            fillPercentage: calculatedFillPercentage, // ✅ Dynamically calculated
            totalBettorStake: totalBettorStakeStr,
            maxPoolSize: calculatedMaxPoolSize.toString(), // ✅ Dynamically calculated
            currentMaxBettorStake: calculatedMaxBettorStake.toString(), // ✅ Dynamically calculated
            effectiveCreatorSideStake: effectiveCreatorSideStake?.toString() || '0',
            participants: participantCount,
            participantCount,
            betCount, // ✅ Include bet count
            totalBets: betCount,
            avgBet,
            lastUpdated: Math.floor(Date.now() / 1000)
          });
        }
        
        // Fetch recent bet data
        const recentBetResult = await db.query(`
          SELECT 
            b.pool_id,
            b.bettor_address,
            b.amount,
            b.is_for_outcome,
            b.created_at,
            p.title,
            p.category,
            p.odds
          FROM oracle.bets b
          JOIN oracle.pools p ON b.pool_id::text = p.pool_id::text
          WHERE b.pool_id = $1 AND b.bettor_address = $2
          ORDER BY b.created_at DESC
          LIMIT 1
        `, [poolId, bettor.toLowerCase()]);
        
        if (recentBetResult.rows.length > 0) {
          const bet = recentBetResult.rows[0];
          const betData = {
            type: 'bet:placed',
            poolId: bet.pool_id.toString(),
            bettor: bet.bettor_address,
            amount: bet.amount,
            isForOutcome: bet.is_for_outcome,
            timestamp: Math.floor(new Date(bet.created_at).getTime() / 1000),
            poolTitle: bet.title,
            category: bet.category,
            odds: bet.odds
          };
          
          // ✅ CRITICAL: Broadcast to recent_bets channel (for Recent Bets Lane)
          wsService.updateRecentBets(betData);
          
          // ✅ CRITICAL: Also broadcast to bet:placed channel (for Live Activity feed)
          wsService.broadcastToChannel('bet:placed', betData);
          
          console.log(`📡 ${this.serviceName}: WebSocket bet:placed broadcast sent for pool ${poolId}`);
        }
        
        console.log(`📡 ${this.serviceName}: WebSocket updates broadcasted for pool ${poolId}`);
      } catch (wsError) {
        console.warn(`⚠️ ${this.serviceName}: WebSocket broadcast failed (non-critical):`, wsError.message);
      }
      
      // Publish bet to Somnia Data Streams (non-blocking)
      console.log(`📡 ${this.serviceName}: Attempting to publish bet to SDS for pool ${poolId}...`);
      somniaDataStreams.publishBet(poolId, bettor, amount, isForOutcome, event)
        .then(tx => {
          if (tx) {
            console.log(`✅ ${this.serviceName}: SDS bet publish succeeded (tx: ${tx})`);
          } else {
            console.warn(`⚠️ ${this.serviceName}: SDS bet publish returned null (SDS may not be initialized)`);
          }
        })
        .catch(err => {
          console.error(`❌ ${this.serviceName}: SDS bet publish failed:`, err);
          console.error(`   Error message: ${err.message}`);
          console.error(`   Error stack: ${err.stack}`);
          console.warn(`⚠️ ${this.serviceName}: SDS bet publish failed (non-critical, continuing...)`);
        });
      
      // Also publish pool progress update
      console.log(`📡 ${this.serviceName}: Attempting to publish pool progress to SDS for pool ${poolId}...`);
      somniaDataStreams.publishPoolProgress(poolId)
        .then(tx => {
          if (tx) {
            console.log(`✅ ${this.serviceName}: SDS pool progress publish succeeded (tx: ${tx})`);
          } else {
            console.warn(`⚠️ ${this.serviceName}: SDS pool progress publish returned null (SDS may not be initialized)`);
          }
        })
        .catch(err => {
          console.error(`❌ ${this.serviceName}: SDS progress update failed:`, err);
          console.error(`   Error message: ${err.message}`);
          console.error(`   Error stack: ${err.stack}`);
          console.warn(`⚠️ ${this.serviceName}: SDS progress update failed (non-critical, continuing...)`);
        });
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to handle BetPlaced event:`, error);
      console.error(`   Pool ID: ${poolId}`);
      console.error(`   Transaction: ${transactionHash || 'unknown'}`);
      console.error(`   Block: ${blockNumber || 'unknown'}`);
      console.error(`   Error details:`, error.message);
      
      // ✅ FIX: Retry mechanism with exponential backoff
      await this.retryBetSync(poolId, bettor, amount, isForOutcome, event);
    }
  }

  /**
   * Handle LiquidityAdded event - Add LP provider and update pool stake
   */
  async handleLiquidityAdded(poolId, provider, amount, event, retryAttempt = 0) {
    try {
      console.log(`💰 ${this.serviceName}: Processing LiquidityAdded event for pool ${poolId}...`);
      
      // ✅ FIX: Validate amount before processing
      if (!amount || amount === '0' || amount === 0n || (typeof amount === 'bigint' && amount === 0n)) {
        console.error(`❌ ${this.serviceName}: Invalid amount for LiquidityAdded event: ${amount}`);
        console.error(`   Pool ID: ${poolId}, Provider: ${provider}`);
        console.error(`   Event:`, event);
        throw new Error(`Invalid amount for LiquidityAdded event: ${amount}`);
      }
      
      // Convert amount to BigInt if it's not already (handle both string and BigInt)
      const amountBigInt = typeof amount === 'bigint' ? amount : BigInt(amount.toString());
      
      // ✅ FIX: Validate amount is reasonable (not zero, positive)
      if (amountBigInt <= 0n) {
        console.error(`❌ ${this.serviceName}: Amount is zero or negative: ${amountBigInt.toString()}`);
        throw new Error(`Amount is zero or negative: ${amountBigInt.toString()}`);
      }
      
      console.log(`   ✅ Amount validated: ${amountBigInt.toString()} wei (${(Number(amountBigInt) / 1e18).toFixed(2)} BITR)`);
      
      // Save LP provider to database (pass BigInt for proper conversion)
      await this.saveLPProviderToDatabase({
        poolId: poolId.toString(),
        providerAddress: provider,
        amount: amountBigInt, // Pass as BigInt for proper conversion
        transactionHash: event?.log?.transactionHash || event?.transactionHash || null,
        blockNumber: event?.log?.blockNumber ? event.log.blockNumber.toString() : (event?.blockNumber ? event.blockNumber.toString() : '0')
      });
      
      // ✅ FIX: LP events should NOT be stored in oracle.bets table
      // LP events are stored in oracle.pool_liquidity_providers table only
      // The recent-bets API endpoint already queries LP events from pool_liquidity_providers
      // Creating bet records for LP events causes duplicates in recent bets display
      
      // Update pool's total creator side stake
      await this.updatePoolLPStake(poolId, amountBigInt);
      
      // ✅ CRITICAL: Broadcast WebSocket update for Live Activity feed
      try {
        const wsService = require('./websocket-service');
        const db = require('../db/db');
        
        // ✅ FIX: Convert LP amount from wei to BITR for display
        // BITR tokens use 18 decimals (1e18), same as bets
        const amountInBITR = (Number(amountBigInt) / 1e18).toString();
        
        // Fetch pool info for display
        const poolInfoResult = await db.query(`
          SELECT title, category, odds, use_bitr
          FROM oracle.pools 
          WHERE pool_id = $1
        `, [poolId]);
        
        const poolInfo = poolInfoResult.rows[0] || {};
        
        wsService.broadcastLiquidityAdded({
          poolId: poolId.toString(),
          provider: provider,
          amount: amountInBITR, // ✅ FIX: Amount in BITR (not wei)
          amountWei: amountBigInt.toString(), // Keep wei for calculations
          timestamp: Date.now(),
          poolTitle: poolInfo.title || `Pool #${poolId}`,
          category: poolInfo.category || 'Unknown',
          currency: poolInfo.use_bitr ? 'BITR' : 'STT'
        });
        
        // ✅ CRITICAL: Broadcast pool progress update (like we do for bets)
        // ✅ DYNAMIC CALCULATION: Calculate pool metrics dynamically matching Turkish formula
        const poolProgressResult = await db.query(`
          SELECT 
            p.pool_id,
            p.creator_stake,
            p.total_bettor_stake,
            p.max_bettor_stake,
            p.total_creator_side_stake,
            p.odds,
            COUNT(DISTINCT CASE WHEN b.is_for_outcome = true THEN b.bettor_address END) as participant_count,
            COUNT(*) as bet_count
          FROM oracle.pools p
          LEFT JOIN oracle.bets b ON b.pool_id::text = p.pool_id::text
          WHERE p.pool_id = $1
          GROUP BY p.pool_id, p.creator_stake, p.total_bettor_stake, p.max_bettor_stake, 
                   p.total_creator_side_stake, p.odds
        `, [poolId]);
        
        if (poolProgressResult.rows.length > 0) {
          const progress = poolProgressResult.rows[0];
          
          // ✅ DYNAMIC CALCULATION: Match Turkish formula exactly
          // Formula: S_bettorMax = S_liquidity × (1 / (O - 1))
          // Where S_liquidity = totalCreatorSideStake (creator + all LPs)
          const effectiveCreatorSideStake = (parseFloat(progress.total_bettor_stake || 0) === 0 || 
                                             parseFloat(progress.total_bettor_stake || 0) > parseFloat(progress.creator_stake || 0))
            ? progress.total_creator_side_stake
            : progress.creator_stake;
          
          const denominator = progress.odds - 100;
          // ✅ Formula: maxBettorStake = totalLiquidity × (100 / (odds - 100))
          // This equals: totalLiquidity × (1 / (decimalOdds - 1))
          const calculatedMaxBettorStake = denominator > 0
            ? (parseFloat(effectiveCreatorSideStake || 0) * 100) / denominator
            : 0;
          
          // ✅ DYNAMIC: Calculate max pool size = liquidity + maxBettorStake
          const calculatedMaxPoolSize = parseFloat(effectiveCreatorSideStake || 0) + calculatedMaxBettorStake;
          
          // ✅ DYNAMIC: Calculate fill percentage = (currentTotal / maxPoolSize) × 100
          // currentTotal = liquidity + bettorStake = totalCreatorSideStake + totalBettorStake
          const currentTotal = parseFloat(effectiveCreatorSideStake || 0) + parseFloat(progress.total_bettor_stake || 0);
          const calculatedFillPercentage = calculatedMaxPoolSize > 0
            ? Math.min(100, (currentTotal / calculatedMaxPoolSize) * 100)
            : 0;
          
          // ✅ CRITICAL: Convert wei amounts to token amounts for WebSocket broadcasts
          const totalBettorStakeToken = (parseFloat(progress.total_bettor_stake || 0) / 1e18).toString();
          const maxPoolSizeToken = (calculatedMaxPoolSize / 1e18).toString();
          const maxBettorStakeToken = (calculatedMaxBettorStake / 1e18).toString();
          const effectiveCreatorSideStakeToken = (parseFloat(effectiveCreatorSideStake || 0) / 1e18).toString();
          
          wsService.updatePoolProgress(poolId, {
            poolId: progress.pool_id.toString(),
            fillPercentage: calculatedFillPercentage, // ✅ Dynamically calculated
            totalBettorStake: totalBettorStakeToken,
            maxPoolSize: maxPoolSizeToken, // ✅ Dynamically calculated
            currentMaxBettorStake: maxBettorStakeToken, // ✅ Dynamically calculated
            effectiveCreatorSideStake: effectiveCreatorSideStakeToken,
            participants: parseInt(progress.participant_count || 0),
            betCount: parseInt(progress.bet_count || 0),
            lastUpdated: Math.floor(Date.now() / 1000)
          });
          console.log(`📡 ${this.serviceName}: WebSocket pool progress update sent for pool ${poolId} (fill: ${calculatedFillPercentage.toFixed(2)}%)`);
        }
        
        // ✅ CRITICAL: Also broadcast to recent_bets channel (for Recent Bets Lane)
        wsService.updateRecentBets({
          type: 'liquidity_added',
          poolId: poolId.toString(),
          bettor: provider,
          amount: amountInBITR, // ✅ FIX: Amount in BITR
          isForOutcome: false, // LP is NOT for outcome
          timestamp: Math.floor(Date.now() / 1000),
          poolTitle: poolInfo.title || `Pool #${poolId}`,
          category: poolInfo.category || 'Unknown',
          eventType: 'liquidity_added',
          action: 'Added liquidity',
          icon: '💧',
          currency: poolInfo.use_bitr ? 'BITR' : 'STT'
        });
        
        console.log(`📡 ${this.serviceName}: WebSocket liquidity:added broadcast sent for pool ${poolId}`);
      } catch (wsError) {
        console.warn(`⚠️ ${this.serviceName}: WebSocket broadcast failed (non-critical):`, wsError.message);
      }
      
      // Publish to Somnia Data Streams
      try {
        const somniaDataStreams = require('./somnia-data-streams-service');
        await somniaDataStreams.publishLiquidityEvent(poolId, provider, amount, event);
        
        // ✅ CRITICAL: Also publish pool progress update after liquidity is added
        await somniaDataStreams.publishPoolProgress(poolId);
      } catch (sdsError) {
        console.warn(`⚠️ ${this.serviceName}: Failed to publish liquidity event to SDS (non-critical):`, sdsError.message);
      }
      
      console.log(`✅ ${this.serviceName}: LP provider saved and pool stake updated for pool ${poolId}`);
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to handle LiquidityAdded event:`, error);
      
      // Retry mechanism with limit
      if (retryAttempt < this.config.maxRetries) {
        await this.retryLPSync(poolId, provider, amount, event, retryAttempt + 1);
      } else {
        console.error(`❌ ${this.serviceName}: Max retries (${this.config.maxRetries}) exceeded for LP sync on pool ${poolId}. Giving up.`);
      }
    }
  }

  /**
   * Process pool data according to contract struct with proper BigInt handling
   */
  processPoolData(poolData) {
    try {
      return {
        eventStartTime: Number(poolData.eventStartTime || 0),
        eventEndTime: Number(poolData.eventEndTime || 0),
        bettingEndTime: Number(poolData.bettingEndTime || 0),
        league: this.convertBytes32ToString(poolData.league),
        category: this.convertBytes32ToString(poolData.category),
        homeTeam: this.convertBytes32ToString(poolData.homeTeam),
        awayTeam: this.convertBytes32ToString(poolData.awayTeam),
        title: this.convertBytes32ToString(poolData.title)
      };
    } catch (error) {
      console.error('❌ Failed to process pool data:', error);
      // Return default values to prevent crashes
      return {
        eventStartTime: 0,
        eventEndTime: 0,
        bettingEndTime: 0,
        league: '',
        category: '',
        homeTeam: '',
        awayTeam: '',
        title: ''
      };
    }
  }

  /**
   * Convert bytes32 to string (handles contract data types properly)
   */
  convertBytes32ToString(bytes32Value) {
    // Handle null/undefined values
    if (!bytes32Value) {
      return '';
    }
    
    // Handle empty bytes32 (all zeros)
    if (bytes32Value === '0x0000000000000000000000000000000000000000000000000000000000000000') {
      return '';
    }
    
    try {
      // Ensure we have a proper hex string
      let hex = bytes32Value;
      if (hex.startsWith('0x')) {
        hex = hex.slice(2);
      }
      
      // Convert hex to string
      const str = Buffer.from(hex, 'hex').toString('utf8');
      
      // Remove null bytes and trim
      const cleanStr = str.replace(/\0/g, '').trim();
      
      // Return empty string if result is empty or just whitespace
      return cleanStr || '';
      
    } catch (error) {
      console.warn('⚠️ Failed to convert bytes32:', bytes32Value, error.message);
      // Return the original value as fallback
      return bytes32Value;
    }
  }

  /**
   * Save bet record to database with proper validation and BigInt handling
   */
  async saveBetToDatabase(betData) {
    try {
      // Validate required fields
      if (!betData.poolId || !betData.bettorAddress || !betData.amount) {
        throw new Error('Missing required bet data fields (poolId, bettorAddress, amount)');
      }

      // Validate and convert data types to prevent BigInt serialization issues
      const validatedData = {
        poolId: betData.poolId.toString(), // Ensure string for oracle.bets.pool_id
        bettorAddress: betData.bettorAddress.toString(),
        amount: betData.amount.toString(), // Convert any BigInt to string
        isForOutcome: Boolean(betData.isForOutcome),
        transactionHash: betData.transactionHash || `temp_${Date.now()}_${Math.random()}`, // Generate temp hash if missing
        blockNumber: betData.blockNumber ? betData.blockNumber.toString() : '0', // Default to 0 if missing
        eventStartTime: betData.eventStartTime || null,
        eventEndTime: betData.eventEndTime || null,
        bettingEndTime: betData.bettingEndTime || null,
        league: betData.league || null,
        category: betData.category || null,
        homeTeam: betData.homeTeam || null,
        awayTeam: betData.awayTeam || null,
        title: betData.title || null
      };

      // Validate address format
      if (!/^0x[a-fA-F0-9]{40}$/.test(validatedData.bettorAddress)) {
        throw new Error(`Invalid bettor address format: ${validatedData.bettorAddress}`);
      }

      // Check if bet already exists (by transaction hash, skip for temp hashes)
      if (!validatedData.transactionHash.startsWith('temp_')) {
        const existingBet = await db.query(
          'SELECT id FROM oracle.bets WHERE transaction_hash = $1',
          [validatedData.transactionHash]
        );

        if (existingBet.rows.length > 0) {
          console.log(`⚠️ ${this.serviceName}: Bet already exists for transaction ${validatedData.transactionHash} - skipping duplicate`);
          return; // Exit early - bet already synced
        }
      }
      
      // ✅ ADDITIONAL CHECK: Check for duplicate by poolId + bettor + amount + blockNumber
      // This catches cases where transaction hash might be missing or different
      if (validatedData.blockNumber && validatedData.blockNumber !== '0') {
        const duplicateCheck = await db.query(
          `SELECT id FROM oracle.bets 
           WHERE pool_id = $1 
           AND bettor_address = $2 
           AND amount = $3 
           AND block_number = $4
           LIMIT 1`,
          [validatedData.poolId, validatedData.bettorAddress.toLowerCase(), validatedData.amount, validatedData.blockNumber]
        );
        
        if (duplicateCheck.rows.length > 0) {
          console.log(`⚠️ ${this.serviceName}: Potential duplicate bet detected (same pool, bettor, amount, block) - skipping`);
          return; // Exit early - likely duplicate
        }
      }

      // Insert new bet record into oracle.bets table
      await db.query(`
        INSERT INTO oracle.bets (
          pool_id, bettor_address, amount, is_for_outcome, transaction_hash, block_number
        ) VALUES (
          $1, $2, $3, $4, $5, $6
        )
      `, [
        validatedData.poolId,
        validatedData.bettorAddress,
        validatedData.amount,
        validatedData.isForOutcome, // is_for_outcome = true if YES bet (challenging), false if NO bet (supporting creator)
        validatedData.transactionHash,
        validatedData.blockNumber
      ]);

      console.log(`✅ ${this.serviceName}: Bet record saved to database (Pool: ${validatedData.poolId}, Amount: ${validatedData.amount})`);

    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to save bet record:`, error);
      throw error;
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
      
      // ✅ CRITICAL: Broadcast WebSocket update for Live Activity feed
      try {
        const wsService = require('./websocket-service');
        // Get reputation values from database
        const repResult = await db.query(`
          SELECT reputation_score FROM core.reputation 
          WHERE user_address = $1
        `, [user.toLowerCase()]);
        
        wsService.broadcastReputationChanged({
          user: user,
          action: Number(action),
          value: value.toString(),
          poolId: poolId.toString(),
          timestamp: Number(timestamp),
          newReputation: repResult.rows[0]?.reputation_score || 0
        });
        console.log(`📡 ${this.serviceName}: WebSocket reputation:changed broadcast sent for user ${user}`);
      } catch (wsError) {
        console.warn(`⚠️ ${this.serviceName}: WebSocket broadcast failed (non-critical):`, wsError.message);
      }
      
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
   * Retry bet sync with exponential backoff
   */
  async retryBetSync(poolId, bettor, amount, isForOutcome, event, attempt = 1) {
    if (attempt > this.config.maxRetries) {
      console.error(`❌ ${this.serviceName}: Max retries exceeded for bet ${event.transactionHash}`);
      return;
    }

    try {
      console.log(`🔄 ${this.serviceName}: Retrying bet sync for transaction ${event.transactionHash} (attempt ${attempt})...`);
      
      const delay = this.config.retryDelayMs * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      await this.handleBetPlaced(poolId, bettor, amount, isForOutcome, event);
      
      console.log(`✅ ${this.serviceName}: Bet synced on retry ${attempt}`);
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Retry ${attempt} failed for bet ${event.transactionHash}:`, error);
      await this.retryBetSync(poolId, bettor, amount, isForOutcome, event, attempt + 1);
    }
  }

  /**
   * Get bet statistics
   */
  async getBetStats() {
    try {
      const stats = await db.query(`
        SELECT 
          COUNT(*) as total_bets,
          SUM(CAST(amount AS NUMERIC)) as total_volume,
          COUNT(DISTINCT bettor_address) as unique_bettors,
          COUNT(DISTINCT pool_id) as pools_with_bets
        FROM oracle.bets
      `);
      
      return stats.rows[0];
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to get bet stats:`, error);
      throw error;
    }
  }

  /**
   * Start fallback sync timer (in case events fail)
   * ✅ CRITICAL FIX: Reduced interval and added missed event detection
   */
  startFallbackSync() {
    // ✅ Check every 5 minutes instead of 30 to catch missed events faster
    const syncInterval = 5 * 60 * 1000; // 5 minutes
    this.fallbackTimer = setInterval(async () => {
      try {
        console.log(`🔄 ${this.serviceName}: Running periodic fallback sync...`);
        await this.fallbackSync();
        await this.syncMissedBetEvents(); // ✅ NEW: Check for missed BetPlaced events
      } catch (error) {
        console.error(`❌ ${this.serviceName}: Fallback sync failed:`, error);
      }
    }, syncInterval);
    console.log(`✅ ${this.serviceName}: Fallback sync timer started (every ${syncInterval / 1000}s)`);
  }

  /**
   * ✅ NEW: Sync missed BetPlaced events by querying blockchain
   * This catches events that the listener might have missed
   */
  async syncMissedBetEvents() {
    try {
      console.log(`🔍 ${this.serviceName}: Checking for missed BetPlaced events...`);
      
      if (!this.contract || !this.web3Service.provider) {
        console.warn(`⚠️ ${this.serviceName}: Cannot sync missed events - contract or provider not available`);
        return;
      }
      
      // Get current block number
      const currentBlock = await this.web3Service.provider.getBlockNumber();
      const lookbackBlocks = 1000; // Check last 1000 blocks (about 3-4 hours)
      const fromBlock = Math.max(0, currentBlock - lookbackBlocks);
      
      console.log(`   Checking blocks ${fromBlock} to ${currentBlock} for BetPlaced events...`);
      
      // Query BetPlaced events from blockchain
      const filter = this.contract.filters.BetPlaced();
      const events = await this.contract.queryFilter(filter, fromBlock, currentBlock);
      
      console.log(`   Found ${events.length} BetPlaced events in blockchain`);
      
      let missedCount = 0;
      for (const event of events) {
        const txHash = event.transactionHash;
        
        // Check if this bet is already in database
        const existingBet = await db.query(
          'SELECT id FROM oracle.bets WHERE transaction_hash = $1',
          [txHash]
        );
        
        if (existingBet.rows.length === 0) {
          // This bet is missing from database!
          console.log(`⚠️ ${this.serviceName}: Found MISSED bet event!`);
          console.log(`   Transaction: ${txHash}`);
          console.log(`   Pool ID: ${event.args.poolId}`);
          console.log(`   Bettor: ${event.args.bettor}`);
          console.log(`   Amount: ${event.args.amount}`);
          console.log(`   Block: ${event.blockNumber}`);
          
          // Process the missed event
          try {
            await this.handleBetPlaced(
              event.args.poolId,
              event.args.bettor,
              event.args.amount,
              event.args.isForOutcome,
              event
            );
            missedCount++;
            console.log(`✅ ${this.serviceName}: Successfully synced missed bet from transaction ${txHash}`);
          } catch (syncError) {
            console.error(`❌ ${this.serviceName}: Failed to sync missed bet ${txHash}:`, syncError);
          }
        }
      }
      
      if (missedCount > 0) {
        console.log(`✅ ${this.serviceName}: Synced ${missedCount} missed bet event(s)`);
      } else {
        console.log(`✅ ${this.serviceName}: No missed bet events found`);
      }
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Error syncing missed bet events:`, error);
      // Don't throw - this is a background check
    }
  }

  /**
   * Fallback sync (check for missed bets and LP events)
   */
  async fallbackSync() {
    try {
      // Get all pools from database
      const pools = await db.query(`
        SELECT pool_id, created_at 
        FROM oracle.pools 
        WHERE status = 'active' 
        ORDER BY created_at DESC 
        LIMIT 10
      `);
      
      if (pools.rows.length === 0) {
        console.log(`📊 ${this.serviceName}: No active pools found for fallback sync`);
        return;
      }
      
      console.log(`🔍 ${this.serviceName}: Checking ${pools.rows.length} pools for missed bets and LP events...`);
      
      for (const pool of pools.rows) {
        await this.checkPoolForMissedBets(pool.pool_id);
        await this.checkPoolForMissedLPEvents(pool.pool_id);
      }
      
      // Also run the missing LP check periodically
      await this.checkMissingLPProviders();
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Fallback sync failed:`, error);
    }
  }

  /**
   * Check a specific pool for missed LP events by comparing contract state with database
   */
  async checkPoolForMissedLPEvents(poolId) {
    try {
      // Get pool data from contract
      const poolData = await this.contract.getPool(poolId);
      if (!poolData) {
        return;
      }
      
      // Get LP data from database
      const dbLPResult = await db.query(`
        SELECT 
          SUM(stake::numeric) as total_lp_stake
        FROM oracle.pool_liquidity_providers
        WHERE pool_id::bigint = $1
      `, [poolId]);
      
      const dbLPStake = BigInt(dbLPResult.rows[0]?.total_lp_stake || 0);
      const contractTotalCreatorStake = BigInt(poolData.totalCreatorSideStake.toString());
      const contractCreatorStake = BigInt(poolData.creatorStake.toString());
      const expectedLPStake = contractTotalCreatorStake - contractCreatorStake;
      
      // If contract has more LP stake than database, we might have missed events
      if (expectedLPStake > dbLPStake) {
        const missingAmount = expectedLPStake - dbLPStake;
        const missingBITR = (missingAmount / BigInt(10**18)).toString();
        console.log(`⚠️ ${this.serviceName}: Pool ${poolId} may have missed LP events (missing: ${missingBITR} BITR)`);
        console.log(`   Contract LP stake: ${(expectedLPStake / BigInt(10**18)).toString()} BITR`);
        console.log(`   Database LP stake: ${(dbLPStake / BigInt(10**18)).toString()} BITR`);
        console.log(`   Note: Use sync-missed-liquidity-event.js to manually sync if needed`);
      }
      
    } catch (error) {
      // Don't log errors for this check - it's just a warning
      // Errors here are non-critical (e.g., pool not found, contract issues)
    }
  }

  /**
   * Check a specific pool for missed bets
   * ✅ CRITICAL FIX: Also checks if pool has bettor stake but no events (indicates missing events)
   */
  async checkPoolForMissedBets(poolId) {
    try {
      // Get pool data from contract
      const poolData = await this.contract.getPool(poolId);
      if (!poolData) {
        console.log(`⚠️ ${this.serviceName}: Pool ${poolId} not found in contract`);
        return;
      }
      
      const contractBettorStake = BigInt(poolData.totalBettorStake.toString());
      
      // Get bets from database for this pool
      const dbBets = await db.query(`
        SELECT transaction_hash, amount, is_for_outcome
        FROM oracle.bets 
        WHERE pool_id = $1
        ORDER BY created_at DESC
      `, [poolId]);
      
      // Calculate total bet amount from database
      const dbTotalBettorStake = dbBets.rows.reduce((sum, bet) => {
        return sum + BigInt(bet.amount || '0');
      }, 0n);
      
      // ✅ CRITICAL: Check if contract has bettor stake but database doesn't match
      if (contractBettorStake > 0n && contractBettorStake !== dbTotalBettorStake) {
        const missingAmount = contractBettorStake - dbTotalBettorStake;
        const missingBITR = (Number(missingAmount) / 1e18).toFixed(2);
        console.log(`⚠️ ${this.serviceName}: Pool ${poolId} has bettor stake mismatch!`);
        console.log(`   Contract bettor stake: ${(Number(contractBettorStake) / 1e18).toFixed(2)} BITR`);
        console.log(`   Database bettor stake: ${(Number(dbTotalBettorStake) / 1e18).toFixed(2)} BITR`);
        console.log(`   Missing: ${missingBITR} BITR`);
        console.log(`   This indicates missing bet records or events not emitted!`);
      }
      
      // Get recent BetPlaced events from contract (last 1000 blocks)
      const currentBlock = await this.web3Service.provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 1000);
      
      const filter = this.contract.filters.BetPlaced(poolId);
      const events = await this.queryEventsInChunks(filter, fromBlock, currentBlock);
      
      console.log(`📊 ${this.serviceName}: Pool ${poolId} - Found ${events.length} contract events, ${dbBets.rows.length} database bets`);
      
      // ✅ CRITICAL: If contract has stake but no events found, query from pool creation
      if (contractBettorStake > 0n && events.length === 0) {
        console.log(`⚠️ ${this.serviceName}: Pool ${poolId} has bettor stake but no events in last 1000 blocks!`);
        console.log(`   Querying from pool creation block...`);
        
        // Get pool creation block from database
        const poolInfo = await db.query(`
          SELECT block_number FROM oracle.pools WHERE pool_id = $1
        `, [poolId]);
        
        if (poolInfo.rows.length > 0 && poolInfo.rows[0].block_number) {
          const poolCreationBlock = Number(poolInfo.rows[0].block_number);
          const filter2 = this.contract.filters.BetPlaced(poolId);
          const eventsFromCreation = await this.queryEventsInChunks(filter2, poolCreationBlock, currentBlock);
          console.log(`   Found ${eventsFromCreation.length} BetPlaced events from pool creation block ${poolCreationBlock}`);
          
          // Process events from creation
          const dbTxHashes = new Set(dbBets.rows.map(bet => bet.transaction_hash));
          const missedEvents = eventsFromCreation.filter(event => !dbTxHashes.has(event.transactionHash));
          
          if (missedEvents.length > 0) {
            console.log(`   Processing ${missedEvents.length} missed events...`);
            for (const event of missedEvents) {
              try {
                await this.handleBetPlaced(
                  event.args.poolId,
                  event.args.bettor,
                  event.args.amount,
                  event.args.isForOutcome,
                  event
                );
              } catch (error) {
                console.error(`   Failed to process missed event: ${error.message}`);
              }
            }
          }
        } else {
          console.log(`   ⚠️  Pool block_number not stored, cannot query from creation`);
        }
      }
      
      // Check for missed events in recent blocks
      const dbTxHashes = new Set(dbBets.rows.map(bet => bet.transaction_hash));
      const missedEvents = events.filter(event => !dbTxHashes.has(event.transactionHash));
      
      if (missedEvents.length > 0) {
        console.log(`🚨 ${this.serviceName}: Found ${missedEvents.length} missed bets for pool ${poolId}`);
        
        // Process missed events
        for (const event of missedEvents) {
          try {
            console.log(`🔄 ${this.serviceName}: Processing missed bet: ${event.transactionHash}`);
            await this.handleBetPlaced(
              event.args.poolId.toString(),
              event.args.bettor,
              event.args.amount,
              event.args.isForOutcome,
              event
            );
          } catch (error) {
            console.error(`❌ ${this.serviceName}: Failed to process missed bet ${event.transactionHash}:`, error);
          }
        }
      }
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to check pool ${poolId} for missed bets:`, error);
    }
  }

  /**
   * Helper to fetch logs in RPC-safe chunks (providers limit ranges to ~1000 blocks)
   */
  async queryEventsInChunks(filter, startBlock, endBlock, chunkSize = 900) {
    const events = [];
    if (startBlock === undefined || startBlock === null) {
      throw new Error('startBlock is required for chunked query');
    }
    let currentStart = startBlock;
    const safeChunk = Math.max(100, Math.min(chunkSize, 950));
    
    while (currentStart <= endBlock) {
      const currentEnd = Math.min(currentStart + safeChunk, endBlock);
      const chunkEvents = await this.contract.queryFilter(filter, currentStart, currentEnd);
      events.push(...chunkEvents);
      currentStart = currentEnd + 1;
    }
    
    return events;
  }

  /**
   * Save LP provider to database
   */
  async saveLPProviderToDatabase(lpData) {
    try {
      const db = require('../db/db');
      
      // Convert amount to BigInt if needed
      const amountBigInt = typeof lpData.amount === 'bigint' ? lpData.amount : BigInt(lpData.amount.toString());
      
      // Store full amount as string - column is NUMERIC(78, 0) which can handle wei amounts
      // NUMERIC(78, 0) can store up to 10^78 which is more than enough for wei amounts
      const stakeAmount = amountBigInt.toString();
      
      // Use ON CONFLICT to handle duplicate LP entries (same provider adding liquidity multiple times)
      // If provider already exists, update their stake by adding the new amount
      await db.query(`
        INSERT INTO oracle.pool_liquidity_providers (
          pool_id, lp_address, stake, created_at
        ) VALUES ($1, $2, $3, NOW())
        ON CONFLICT (pool_id, lp_address) 
        DO UPDATE SET 
          stake = oracle.pool_liquidity_providers.stake + $3,
          created_at = CASE 
            WHEN oracle.pool_liquidity_providers.created_at IS NULL THEN NOW()
            ELSE oracle.pool_liquidity_providers.created_at
          END
      `, [
        lpData.poolId,
        lpData.providerAddress.toLowerCase(), // Normalize address to lowercase
        stakeAmount
      ]);
      
      console.log(`✅ ${this.serviceName}: LP provider saved/updated in database with stake: ${stakeAmount}`);
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to save LP provider:`, error);
      console.error(`   Pool ID: ${lpData.poolId}, Provider: ${lpData.providerAddress}, Amount: ${lpData.amount}`);
      throw error;
    }
  }

  /**
   * Update pool's total creator side stake
   */
  async updatePoolLPStake(poolId, amount) {
    try {
      const db = require('../db/db');
      
      // Convert amount to BigInt if needed
      const amountBigInt = typeof amount === 'bigint' ? amount : BigInt(amount.toString());
      const amountStr = amountBigInt.toString();
      
      // ✅ CRITICAL: Fetch current pool state to calculate new max_bettor_stake
      const poolResult = await db.query(`
        SELECT 
          creator_stake,
          total_bettor_stake,
          total_creator_side_stake,
          odds
        FROM oracle.pools 
        WHERE pool_id = $1
      `, [poolId.toString()]);
      
      if (poolResult.rows.length === 0) {
        throw new Error(`Pool ${poolId} not found in database`);
      }
      
      const pool = poolResult.rows[0];
      const newTotalCreatorSideStake = (parseFloat(pool.total_creator_side_stake || 0) + parseFloat(amountStr));
      
      // ✅ CRITICAL: Calculate effectiveCreatorSideStake (matches contract logic)
      // From contract line 319-320:
      // effectiveCreatorSideStake = totalBettorStake == 0 || totalBettorStake > creatorStake ? 
      //   totalCreatorSideStake : creatorStake
      const totalBettorStake = parseFloat(pool.total_bettor_stake || 0);
      const creatorStake = parseFloat(pool.creator_stake || 0);
      const effectiveCreatorSideStake = (totalBettorStake === 0 || totalBettorStake > creatorStake)
        ? newTotalCreatorSideStake
        : creatorStake;
      
      // ✅ CRITICAL: Calculate new maxBettorStake (matches contract line 322)
      // Formula: maxBettorStake = (effectiveCreatorSideStake * 100) / (odds - 100)
      const denominator = parseFloat(pool.odds || 0) - 100;
      const newMaxBettorStake = denominator > 0
        ? (effectiveCreatorSideStake * 100) / denominator
        : 0;
      
      // Update the pool's total_creator_side_stake AND max_bettor_stake
      const result = await db.query(`
        UPDATE oracle.pools 
        SET total_creator_side_stake = COALESCE(total_creator_side_stake, 0) + $1,
            max_bettor_stake = $2,
            updated_at = NOW()
        WHERE pool_id = $3
      `, [amountStr, newMaxBettorStake.toString(), poolId.toString()]);
      
      if (result.rowCount === 0) {
        throw new Error(`Pool ${poolId} not found in database`);
      }
      
      console.log(`✅ ${this.serviceName}: Pool ${poolId} LP stake updated by ${amountStr}, max_bettor_stake recalculated to ${newMaxBettorStake.toString()}`);
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to update pool LP stake:`, error);
      console.error(`   Pool ID: ${poolId}, Amount: ${amount}`);
      throw error;
    }
  }

  /**
   * Retry LP sync with exponential backoff
   */
  async retryLPSync(poolId, provider, amount, event, attempt = 1) {
    if (attempt > this.config.maxRetries) {
      console.error(`❌ ${this.serviceName}: Max retries exceeded for LP sync on pool ${poolId}`);
      return;
    }

    try {
      console.log(`🔄 ${this.serviceName}: Retrying LP sync for pool ${poolId} (attempt ${attempt}/${this.config.maxRetries})...`);
      
      // Exponential backoff delay
      const delay = this.config.retryDelayMs * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Retry the handler
      await this.handleLiquidityAdded(poolId, provider, amount, event, attempt);
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: LP sync retry ${attempt} failed for pool ${poolId}:`, error.message);
      // Don't recursively call retryLPSync - handleLiquidityAdded will handle the next retry
    }
  }
}

module.exports = EventDrivenBetSync;

// Auto-start when run directly (forked as a process)
if (require.main === module) {
  const service = new EventDrivenBetSync();
  
  service.start()
    .then(() => {
      console.log('🎉 Event-Driven Bet Sync running...');
      
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
      console.error('💥 Event-Driven Bet Sync failed to start:', error);
      process.exit(1);
    });
}
