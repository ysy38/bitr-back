/**
 * Somnia Data Streams (SDS) Service
 * 
 * Integrates Somnia Data Streams SDK to publish enriched pool, bet, and slip data
 * as structured, verifiable data streams on Somnia Network.
 * 
 * Benefits:
 * - Structured, schema-based data storage
 * - Real-time WebSocket subscriptions via SDS protocol
 * - Event enrichment (combine on-chain + off-chain data)
 * - Cross-dApp composability (other apps can subscribe)
 * - Verifiable on-chain data storage
 * 
 * Architecture:
 * - Existing event listeners continue to work (ethers.js)
 * - This service enriches events with DB data and publishes to SDS
 * - Frontend can use SDS subscriptions for richer real-time data
 * - PostgreSQL remains primary database for complex queries
 */

const { SDK } = require('@somnia-chain/streams');
const { createPublicClient, createWalletClient, http, webSocket } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { somniaTestnet } = require('viem/chains');
const { zeroBytes32 } = require('viem');
const { encodeAbiParameters, decodeAbiParameters } = require('viem');
const db = require('../db/db');
const config = require('../config');

class SomniaDataStreamsService {
  constructor() {
    this.serviceName = 'SomniaDataStreamsService';
    this.sdk = null;
    this.isInitialized = false;
    this.schemasRegistered = false;
    
    // Schema IDs (computed from schema strings)
    this.schemaIds = {
      pool: null,
      bet: null,
      slip: null,
      poolProgress: null,
      reputation: null,
      liquidity: null,
      cycleResolved: null,
      slipEvaluated: null,
      prizeClaimed: null
    };
    
    // Event schema IDs (string IDs for event emission)
    this.eventSchemaIds = {
      poolCreated: 'PoolCreated',
      betPlaced: 'BetPlaced',
      poolSettled: 'PoolSettled',
      slipPlaced: 'SlipPlaced',
      cycleResolved: 'CycleResolved',
      slipEvaluated: 'SlipEvaluated',
      prizeClaimed: 'PrizeClaimed',
      reputationActionOccurred: 'ReputationActionOccurred',
      liquidityAdded: 'LiquidityAdded'
    };
  }

  /**
   * Initialize SDS SDK
   */
  async initialize() {
    if (this.isInitialized) {
      console.log(`✅ ${this.serviceName}: Already initialized`);
      return;
    }

    try {
      console.log(`🚀 ${this.serviceName}: Initializing...`);
      
      const rpcUrl = process.env.SOMNIA_RPC_URL || process.env.RPC_URL || 'https://dream-rpc.somnia.network';
      let privateKey = process.env.SOMNIA_PRIVATE_KEY || process.env.PRIVATE_KEY;
      
      if (!privateKey) {
        console.warn(`⚠️ ${this.serviceName}: No private key found - SDS publishing disabled`);
        console.warn(`   Set SOMNIA_PRIVATE_KEY or PRIVATE_KEY to enable SDS publishing`);
        return;
      }

      // Ensure private key has 0x prefix (required by viem)
      if (!privateKey.startsWith('0x')) {
        privateKey = '0x' + privateKey;
      }

      const account = privateKeyToAccount(privateKey);
      
      // Public client for reading and subscriptions (can use WebSocket for subscriptions)
      const publicClient = createPublicClient({ 
        chain: somniaTestnet, 
        transport: http(rpcUrl) 
      });
      
      // Wallet client for writing (publishing data)
      const walletClient = createWalletClient({ 
        chain: somniaTestnet, 
        account, 
        transport: http(rpcUrl) 
      });

      this.sdk = new SDK({
        public: publicClient,
        wallet: walletClient
      });

      // Register schemas (data schemas and event schemas)
      await this.registerSchemas();
      
      // Create wallet identity (required for setAndEmitEvents to emit events)
      // This grants the wallet permission to emit events on-chain
      await this.createWalletIdentity();
      
      this.isInitialized = true;
      console.log(`✅ ${this.serviceName}: Initialized successfully`);
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Initialization failed:`, error);
      // Don't throw - allow app to continue without SDS
      console.warn(`⚠️ ${this.serviceName}: Continuing without SDS (non-critical)`);
    }
  }

  /**
   * Register data schemas for pools, bets, and slips
   */
  async registerSchemas() {
    if (this.schemasRegistered) {
      return;
    }

    try {
      console.log(`📋 ${this.serviceName}: Checking and registering data schemas...`);

      // Pool schema - enriched pool data
      const poolSchema = 'uint256 poolId, address creator, uint16 odds, uint8 flags, uint256 creatorStake, uint256 totalBettorStake, uint256 totalCreatorSideStake, uint256 maxBettorStake, bytes32 category, bytes32 league, bytes32 homeTeam, bytes32 awayTeam, string marketId, uint256 eventStartTime, uint256 eventEndTime, uint256 bettingEndTime, bool isSettled, bool creatorSideWon, string title, uint256 fillPercentage, uint256 participantCount, string currency';
      
      // Bet schema - enriched bet data
      const betSchema = 'uint256 poolId, address bettor, uint256 amount, bool isForOutcome, uint256 timestamp, string poolTitle, string category, uint16 odds';
      
      // Slip schema - enriched slip data
      const slipSchema = 'uint256 slipId, uint256 cycleId, address player, uint256 timestamp, uint256 totalPredictions, uint256 correctPredictions, bool isWinner, uint256 prizeAmount';
      
      // Pool progress schema - real-time pool metrics
      const poolProgressSchema = 'uint256 poolId, uint256 fillPercentage, uint256 totalBettorStake, uint256 totalCreatorSideStake, uint256 maxPoolSize, uint256 participantCount, uint256 betCount, uint256 currentMaxBettorStake, uint256 effectiveCreatorSideStake, uint256 timestamp';
      
      // Reputation action schema - user reputation changes
      const reputationSchema = 'address user, uint8 action, uint256 value, bytes32 poolId, uint256 timestamp, uint256 oldReputation, uint256 newReputation, string actionName';
      
      // Liquidity event schema - LP provider activity
      const liquiditySchema = 'uint256 poolId, address provider, uint256 amount, uint256 totalLiquidity, uint256 poolFillPercentage, uint256 timestamp';
      
      // Cycle resolved schema - Oddyssey cycle completion
      const cycleResolvedSchema = 'uint256 cycleId, uint256 prizePool, uint256 totalSlips, uint256 timestamp, string status';
      
      // Slip evaluated schema - Oddyssey slip evaluation results
      const slipEvaluatedSchema = 'uint256 slipId, uint256 cycleId, address player, bool isWinner, uint256 correctPredictions, uint256 totalPredictions, uint256 rank, uint256 prizeAmount, uint256 timestamp';
      
      // Prize claimed schema - Oddyssey prize claims
      const prizeClaimedSchema = 'address player, uint256 slipId, uint256 cycleId, uint256 prizeAmount, uint256 rank, uint256 timestamp';

      const schemaIds = ['pool', 'bet', 'slip', 'poolProgress', 'reputation', 'liquidity', 'cycleResolved', 'slipEvaluated', 'prizeClaimed'];
      
      // Check which schemas are already registered
      const schemasToRegister = [];
      for (const schemaId of schemaIds) {
        try {
          const existingSchemaId = await this.sdk.streams.idToSchemaId(schemaId);
          if (existingSchemaId && existingSchemaId !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
            console.log(`✅ ${this.serviceName}: Schema '${schemaId}' already registered`);
            // Cache the schema ID
            this.schemaIds[schemaId] = existingSchemaId;
          } else {
            // Schema doesn't exist, add to registration list
            schemasToRegister.push(schemaId);
          }
        } catch (error) {
          // If idToSchemaId fails, schema doesn't exist
          schemasToRegister.push(schemaId);
        }
      }

      // Only register schemas that don't exist
      if (schemasToRegister.length > 0) {
        const registrations = [];
        
        if (schemasToRegister.includes('pool')) {
          registrations.push({
            id: 'pool',
            schema: poolSchema,
            parentSchemaId: zeroBytes32
          });
        }
        if (schemasToRegister.includes('bet')) {
          registrations.push({
            id: 'bet',
            schema: betSchema,
            parentSchemaId: zeroBytes32
          });
        }
        if (schemasToRegister.includes('slip')) {
          registrations.push({
            id: 'slip',
            schema: slipSchema,
            parentSchemaId: zeroBytes32
          });
        }
        if (schemasToRegister.includes('poolProgress')) {
          registrations.push({
            id: 'poolProgress',
            schema: poolProgressSchema,
            parentSchemaId: zeroBytes32
          });
        }
        if (schemasToRegister.includes('reputation')) {
          registrations.push({
            id: 'reputation',
            schema: reputationSchema,
            parentSchemaId: zeroBytes32
          });
        }
        if (schemasToRegister.includes('liquidity')) {
          registrations.push({
            id: 'liquidity',
            schema: liquiditySchema,
            parentSchemaId: zeroBytes32
          });
        }
        if (schemasToRegister.includes('cycleResolved')) {
          registrations.push({
            id: 'cycleResolved',
            schema: cycleResolvedSchema,
            parentSchemaId: zeroBytes32
          });
        }
        if (schemasToRegister.includes('slipEvaluated')) {
          registrations.push({
            id: 'slipEvaluated',
            schema: slipEvaluatedSchema,
            parentSchemaId: zeroBytes32
          });
        }
        if (schemasToRegister.includes('prizeClaimed')) {
          registrations.push({
            id: 'prizeClaimed',
            schema: prizeClaimedSchema,
            parentSchemaId: zeroBytes32
          });
        }

        if (registrations.length > 0) {
          console.log(`📝 ${this.serviceName}: Registering ${registrations.length} new schemas...`);
          const tx = await this.sdk.streams.registerDataSchemas(registrations, true);
          
          if (tx) {
            console.log(`✅ ${this.serviceName}: New schemas registered (tx: ${tx})`);
          }
        }
      }

      // Cache all schema IDs (both existing and newly registered)
      for (const schemaId of schemaIds) {
        if (!this.schemaIds[schemaId]) {
          try {
            this.schemaIds[schemaId] = await this.sdk.streams.idToSchemaId(schemaId);
          } catch (error) {
            console.warn(`⚠️ ${this.serviceName}: Failed to get schema ID for '${schemaId}':`, error.message);
          }
        }
      }
      
      console.log(`📊 ${this.serviceName}: Schema IDs cached`);

      // Register event schemas
      await this.registerEventSchemas();
      
      this.schemasRegistered = true;
      
    } catch (error) {
      // Check if error is IDAlreadyUsed - this is OK, schemas already exist
      if (error?.shortMessage?.includes('IDAlreadyUsed') || 
          error?.cause?.shortMessage?.includes('IDAlreadyUsed') ||
          error?.message?.includes('IDAlreadyUsed')) {
        console.log(`ℹ️ ${this.serviceName}: Schemas already registered, continuing...`);
        
        // Try to cache schema IDs anyway
        try {
          this.schemaIds.pool = await this.sdk.streams.idToSchemaId('pool');
          this.schemaIds.bet = await this.sdk.streams.idToSchemaId('bet');
          this.schemaIds.slip = await this.sdk.streams.idToSchemaId('slip');
          this.schemaIds.poolProgress = await this.sdk.streams.idToSchemaId('poolProgress');
          this.schemaIds.reputation = await this.sdk.streams.idToSchemaId('reputation');
          this.schemaIds.liquidity = await this.sdk.streams.idToSchemaId('liquidity');
          this.schemaIds.cycleResolved = await this.sdk.streams.idToSchemaId('cycleResolved');
          this.schemaIds.slipEvaluated = await this.sdk.streams.idToSchemaId('slipEvaluated');
          this.schemaIds.prizeClaimed = await this.sdk.streams.idToSchemaId('prizeClaimed');
          console.log(`📊 ${this.serviceName}: Schema IDs cached from existing schemas`);
        } catch (cacheError) {
          console.warn(`⚠️ ${this.serviceName}: Failed to cache schema IDs:`, cacheError.message);
        }
        
        // Register event schemas
        await this.registerEventSchemas();
        this.schemasRegistered = true;
      } else {
        console.error(`❌ ${this.serviceName}: Schema registration failed:`, error);
        // Don't throw - allow app to continue
      }
    }
  }

  /**
   * Create wallet identity (required for setAndEmitEvents to emit events)
   * This grants the wallet permission to emit events on-chain
   */
  async createWalletIdentity() {
    if (!this.sdk || !this.sdk.wallet) {
      console.warn(`⚠️ ${this.serviceName}: Cannot create wallet identity - SDK not initialized`);
      return;
    }

    try {
      console.log(`📝 ${this.serviceName}: Creating wallet identity (required for event emission)...`);
      const tx = await this.sdk.streams.createWalletIdentity();
      
      if (tx) {
        console.log(`✅ ${this.serviceName}: Wallet identity created (tx: ${tx})`);
        // Wait for transaction confirmation to ensure identity is active
        const publicClient = this.sdk.public;
        if (publicClient) {
          await publicClient.waitForTransactionReceipt({ hash: tx });
          console.log(`✅ ${this.serviceName}: Wallet identity confirmed - can now emit events`);
        }
      }
      
    } catch (error) {
      // Check if error is IdentityAlreadyExists - this is OK
      if (error?.shortMessage?.includes('IdentityAlreadyExists') || 
          error?.cause?.shortMessage?.includes('IdentityAlreadyExists') ||
          error?.message?.includes('IdentityAlreadyExists')) {
        console.log(`ℹ️ ${this.serviceName}: Wallet identity already exists - can emit events`);
      } else {
        console.warn(`⚠️ ${this.serviceName}: Failed to create wallet identity:`, error.message);
        console.warn(`   setAndEmitEvents() may fail - will fallback to set() if needed`);
        // Don't throw - publishing might still work if identity exists
      }
    }
  }

  /**
   * Register event schemas for real-time subscriptions
   */
  async registerEventSchemas() {
    try {
      // ✅ CRITICAL FIX: Event schemas are already registered on-chain
      // We don't need to register them again - just use the string IDs
      // Event schemas are simpler than data schemas - they're just identifiers
      const eventIds = [
        'PoolCreated', 
        'BetPlaced', 
        'PoolSettled', 
        'SlipPlaced',
        'CycleResolved',
        'SlipEvaluated',
        'PrizeClaimed',
        'ReputationActionOccurred',
        'LiquidityAdded'
      ];
      
      console.log(`📝 ${this.serviceName}: Event schemas (using existing on-chain registrations):`);
      for (const eventId of eventIds) {
        console.log(`   ✓ ${eventId}`);
      }

      // Always cache event schema IDs
      // NOTE: Event schemas use STRING IDs, not bytes32 like data schemas
      console.log(`📊 ${this.serviceName}: Setting up event schema IDs...`);
      this.eventSchemaIds = {
        poolCreated: 'PoolCreated',
        betPlaced: 'BetPlaced',
        poolSettled: 'PoolSettled',
        slipPlaced: 'SlipPlaced',
        cycleResolved: 'CycleResolved',
        slipEvaluated: 'SlipEvaluated',
        prizeClaimed: 'PrizeClaimed',
        reputationActionOccurred: 'ReputationActionOccurred',
        liquidityAdded: 'LiquidityAdded'
      };
      console.log(`✅ Event schema IDs ready (using string IDs as per SDK spec)`);
      
    } catch (error) {
      // Check if error is EventSchemaAlreadyRegistered - this is OK
      if (error?.shortMessage?.includes('EventSchemaAlreadyRegistered') || 
          error?.cause?.shortMessage?.includes('EventSchemaAlreadyRegistered') ||
          error?.message?.includes('EventSchemaAlreadyRegistered')) {
        console.log(`ℹ️ ${this.serviceName}: Event schemas already registered, continuing...`);
      } else {
        console.error(`❌ ${this.serviceName}: Event schema registration failed:`, error);
        // Don't throw - allow service to continue
      }
    }
  }

  /**
   * Publish enriched pool data to SDS
   */
  async publishPool(poolId, eventData) {
    if (!this.isInitialized || !this.sdk) {
      return null; // Silently fail if not initialized
    }

    // Validate schema IDs are available
    if (!this.schemaIds.pool) {
      console.warn(`⚠️ ${this.serviceName}: Pool schema ID not available - skipping publish`);
      return null;
    }

    try {
      // Fetch enriched pool data from database
      const poolResult = await db.query(`
        SELECT 
          p.pool_id,
          p.creator_address,
          p.odds,
          p.creator_stake,
          p.total_bettor_stake,
          p.total_creator_side_stake,
          p.max_bettor_stake,
          p.category,
          p.league,
          p.home_team,
          p.away_team,
          p.market_id,
          p.event_start_time,
          p.event_end_time,
          p.betting_end_time,
          p.is_settled,
          p.creator_side_won,
          p.title,
          p.use_bitr,
          -- Calculate fill percentage
          CASE 
            WHEN p.total_bettor_stake = 0 OR p.total_bettor_stake > p.creator_stake THEN 
              LEAST(100, ((p.total_creator_side_stake::numeric + p.total_bettor_stake::numeric) / 
                NULLIF((p.total_creator_side_stake::numeric + ((p.total_creator_side_stake::numeric * 100) / NULLIF((p.odds - 100), 0))), 0) * 100))
            ELSE 
              LEAST(100, ((p.creator_stake::numeric + p.total_bettor_stake::numeric) / 
                NULLIF((p.creator_stake::numeric + ((p.creator_stake::numeric * 100) / NULLIF((p.odds - 100), 0))), 0) * 100))
          END as fill_percentage,
          -- Count participants
          (SELECT COUNT(DISTINCT bettor_address) FROM oracle.bets WHERE pool_id::text = p.pool_id::text AND is_for_outcome = true) as participant_count
        FROM oracle.pools p
        WHERE p.pool_id::text = $1::text
      `, [poolId.toString()]);

      if (poolResult.rows.length === 0) {
        console.warn(`⚠️ ${this.serviceName}: Pool ${poolId} not found in database`);
        return null;
      }

      const pool = poolResult.rows[0];
      
      // Debug: Log pool data to identify undefined values
      console.log(`🔍 ${this.serviceName}: Pool data for encoding:`, {
        fill_percentage: pool.fill_percentage,
        participant_count: pool.participant_count,
        fill_percentage_type: typeof pool.fill_percentage,
        participant_count_type: typeof pool.participant_count
      });
      
      // Encode pool data according to schema
      const encodedData = encodeAbiParameters(
        [
          { name: 'poolId', type: 'uint256' },
          { name: 'creator', type: 'address' },
          { name: 'odds', type: 'uint16' },
          { name: 'flags', type: 'uint8' },
          { name: 'creatorStake', type: 'uint256' },
          { name: 'totalBettorStake', type: 'uint256' },
          { name: 'totalCreatorSideStake', type: 'uint256' },
          { name: 'maxBettorStake', type: 'uint256' },
          { name: 'category', type: 'bytes32' },
          { name: 'league', type: 'bytes32' },
          { name: 'homeTeam', type: 'bytes32' },
          { name: 'awayTeam', type: 'bytes32' },
          { name: 'marketId', type: 'string' },
          { name: 'eventStartTime', type: 'uint256' },
          { name: 'eventEndTime', type: 'uint256' },
          { name: 'bettingEndTime', type: 'uint256' },
          { name: 'isSettled', type: 'bool' },
          { name: 'creatorSideWon', type: 'bool' },
          { name: 'title', type: 'string' },
          { name: 'fillPercentage', type: 'uint256' },
          { name: 'participantCount', type: 'uint256' },
          { name: 'currency', type: 'string' }
        ],
        [
          BigInt(pool.pool_id),
          pool.creator_address,
          parseInt(pool.odds),
          (pool.is_settled ? 1 : 0) | (pool.creator_side_won ? 2 : 0), // flags
          BigInt(pool.creator_stake || 0),
          BigInt(pool.total_bettor_stake || 0),
          BigInt(pool.total_creator_side_stake || 0),
          BigInt(pool.max_bettor_stake || 0),
          this.stringToBytes32(pool.category || ''),
          this.stringToBytes32(pool.league || ''),
          this.stringToBytes32(pool.home_team || ''),
          this.stringToBytes32(pool.away_team || ''),
          pool.market_id || '',
          BigInt(pool.event_start_time || 0),
          BigInt(pool.event_end_time || 0),
          BigInt(pool.betting_end_time || 0),
          pool.is_settled || false,
          pool.creator_side_won || false,
          pool.title || '',
          BigInt(Math.round(parseFloat(pool.fill_percentage || 0))),
          BigInt(parseInt(pool.participant_count || 0)),
          pool.use_bitr ? 'BITR' : 'STT'
        ]
      );

      const dataId = this.generateDataId('pool', poolId);
      
      // ✅ Try to use setAndEmitEvents for real-time subscriptions (requires permissions)
      // Falls back to set() if permissions not available
      let tx;
      try {
        // Determine event type based on pool state
        const eventSchemaId = pool.is_settled 
          ? this.eventSchemaIds.poolSettled 
          : this.eventSchemaIds.poolCreated;
        
        // Encode event data according to event schema (indexed parameters only for PoolCreated/PoolSettled)
        // Both PoolCreated and PoolSettled have: poolId (uint256 indexed)
        const eventDataEncoded = encodeAbiParameters(
          [{ name: 'poolId', type: 'uint256' }],
          [BigInt(poolId)]
        );
        
        // Validate eventSchemaId is defined
        if (!eventSchemaId) {
          throw new Error(`Event schema ID is undefined for pool ${poolId} (is_settled: ${pool.is_settled})`);
        }
        
        // Debug: Log the values being passed
        console.log(`🔍 ${this.serviceName}: Publishing pool ${poolId} with eventSchemaId: ${eventSchemaId}, schemaId: ${this.schemaIds.pool}`);
        
        // setAndEmitEvents takes TWO arrays: [dataItems], [events]
        tx = await this.sdk.streams.setAndEmitEvents(
          // First array: data items (like set())
          [{
            id: dataId,
            schemaId: this.schemaIds.pool,
            data: encodedData
          }],
          // Second array: events to emit
          [{
            id: eventSchemaId,  // Event schema string ID
            argumentTopics: [this.uint256ToBytes32(poolId)],  // Indexed parameters as bytes32
            data: '0x'  // Non-indexed parameters (none for PoolCreated/PoolSettled)
          }]
        );
        console.log(`✅ ${this.serviceName}: Pool ${poolId} published with events (tx: ${tx})`);
      } catch (emitError) {
        // Fallback to set() if event emitter permissions not available or other errors
        console.warn(`⚠️ ${this.serviceName}: setAndEmitEvents failed:`, emitError.message);
        console.warn(`   Falling back to set() method...`);
        try {
          tx = await this.sdk.streams.set([{
            id: dataId,
            schemaId: this.schemaIds.pool,
            data: encodedData
          }]);
          console.log(`✅ ${this.serviceName}: Pool ${poolId} published using set() fallback (tx: ${tx})`);
        } catch (setError) {
          console.error(`❌ ${this.serviceName}: Both setAndEmitEvents and set() failed:`, setError.message);
          throw setError;
        }
      }

      if (tx) {
        console.log(`✅ ${this.serviceName}: Pool ${poolId} published to SDS (tx: ${tx})`);
      }

      return tx;
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to publish pool ${poolId}:`, error);
      return null;
    }
  }

  /**
   * Publish enriched bet data to SDS
   */
  async publishBet(poolId, bettor, amount, isForOutcome, eventData) {
    if (!this.isInitialized || !this.sdk) {
      return null;
    }

    // Validate schema IDs are available
    if (!this.schemaIds.bet) {
      console.warn(`⚠️ ${this.serviceName}: Bet schema ID not available - skipping publish`);
      return null;
    }

    try {
      // Fetch enriched bet data
      const betResult = await db.query(`
        SELECT 
          b.pool_id,
          b.bettor_address,
          b.amount,
          b.is_for_outcome,
          b.created_at,
          p.title as pool_title,
          p.category,
          p.odds
        FROM oracle.bets b
        JOIN oracle.pools p ON b.pool_id::text = p.pool_id::text
        WHERE b.pool_id::text = $1::text AND b.bettor_address = $2
        ORDER BY b.created_at DESC
        LIMIT 1
      `, [poolId, bettor.toLowerCase()]);

      if (betResult.rows.length === 0) {
        return null;
      }

      const bet = betResult.rows[0];
      
      const encodedData = encodeAbiParameters(
        [
          { name: 'poolId', type: 'uint256' },
          { name: 'bettor', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'isForOutcome', type: 'bool' },
          { name: 'timestamp', type: 'uint256' },
          { name: 'poolTitle', type: 'string' },
          { name: 'category', type: 'string' },
          { name: 'odds', type: 'uint16' }
        ],
        [
          BigInt(bet.pool_id),
          bet.bettor_address,
          BigInt(bet.amount || 0),
          bet.is_for_outcome || false,
          BigInt(Math.floor(new Date(bet.created_at).getTime() / 1000)),
          bet.pool_title || '',
          bet.category || '',
          parseInt(bet.odds || 200)
        ]
      );

      const dataId = this.generateDataId('bet', poolId, bettor);
      
      // ✅ Try to use setAndEmitEvents for real-time subscriptions (requires permissions)
      // Falls back to set() if permissions not available
      let tx;
      try {
        // Encode event data according to BetPlaced event schema: poolId (uint256 indexed), bettor (address indexed)
        const eventDataEncoded = encodeAbiParameters(
          [
            { name: 'poolId', type: 'uint256' },
            { name: 'bettor', type: 'address' }
          ],
          [BigInt(poolId), bettor]
        );
        
        // setAndEmitEvents takes TWO arrays: [dataItems], [events]
        tx = await this.sdk.streams.setAndEmitEvents(
          // First array: data items
          [{
            id: dataId,
            schemaId: this.schemaIds.bet,
            data: encodedData
          }],
          // Second array: events to emit
          [{
            id: this.eventSchemaIds.betPlaced,
            argumentTopics: [
              this.uint256ToBytes32(poolId),  // poolId (indexed)
              this.addressToBytes32(bettor)    // bettor (indexed)
            ],
            data: '0x'  // No non-indexed parameters
          }]
        );
        console.log(`✅ ${this.serviceName}: Bet ${poolId} published with events (tx: ${tx})`);
      } catch (emitError) {
        // Fallback to set() if event emitter permissions not available or other errors
        console.warn(`⚠️ ${this.serviceName}: setAndEmitEvents failed:`, emitError.message);
        console.warn(`   Falling back to set() method...`);
        try {
          tx = await this.sdk.streams.set([{
            id: dataId,
            schemaId: this.schemaIds.bet,
            data: encodedData
          }]);
          console.log(`✅ ${this.serviceName}: Bet published using set() fallback (tx: ${tx})`);
        } catch (setError) {
          console.error(`❌ ${this.serviceName}: Both setAndEmitEvents and set() failed:`, setError.message);
          throw setError;
        }
      }

      if (tx) {
        console.log(`✅ ${this.serviceName}: Bet published to SDS (tx: ${tx})`);
      }

      return tx;
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to publish bet:`, error);
      return null;
    }
  }

  /**
   * Publish pool progress updates (for real-time fill percentage updates)
   */
  async publishPoolProgress(poolId) {
    if (!this.isInitialized || !this.sdk) {
      return null;
    }

    try {
      const progressResult = await db.query(`
        SELECT 
          p.pool_id,
          -- Calculate fill percentage
          CASE 
            WHEN p.total_bettor_stake = 0 OR p.total_bettor_stake > p.creator_stake THEN 
              LEAST(100, ((p.total_creator_side_stake::numeric + p.total_bettor_stake::numeric) / 
                NULLIF((p.total_creator_side_stake::numeric + ((p.total_creator_side_stake::numeric * 100) / NULLIF((p.odds - 100), 0))), 0) * 100))
            ELSE 
              LEAST(100, ((p.creator_stake::numeric + p.total_bettor_stake::numeric) / 
                NULLIF((p.creator_stake::numeric + ((p.creator_stake::numeric * 100) / NULLIF((p.odds - 100), 0))), 0) * 100))
          END as fill_percentage,
          p.total_bettor_stake,
          p.total_creator_side_stake,
          -- Calculate max pool size
          CASE 
            WHEN p.total_bettor_stake = 0 OR p.total_bettor_stake > p.creator_stake THEN 
              p.total_creator_side_stake::numeric + ((p.total_creator_side_stake::numeric * 100) / NULLIF((p.odds - 100), 0))
            ELSE 
              p.creator_stake::numeric + ((p.creator_stake::numeric * 100) / NULLIF((p.odds - 100), 0))
          END as max_pool_size,
          (SELECT COUNT(DISTINCT bettor_address) FROM oracle.bets WHERE pool_id::text = p.pool_id::text AND is_for_outcome = true) as participant_count,
          (SELECT COUNT(*) FROM oracle.bets WHERE pool_id::text = p.pool_id::text) as bet_count,
          -- Calculate current max bettor stake
          CASE 
            WHEN p.total_bettor_stake = 0 OR p.total_bettor_stake > p.creator_stake THEN 
              (p.total_creator_side_stake::numeric * 100) / NULLIF((p.odds - 100), 0)
            ELSE 
              (p.creator_stake::numeric * 100) / NULLIF((p.odds - 100), 0)
          END as current_max_bettor_stake,
          -- Calculate effective creator side stake
          CASE 
            WHEN p.total_bettor_stake = 0 OR p.total_bettor_stake > p.creator_stake THEN 
              p.total_creator_side_stake
            ELSE 
              p.creator_stake
          END as effective_creator_side_stake
        FROM oracle.pools p
        WHERE p.pool_id::text = $1::text
      `, [poolId.toString()]);

      if (progressResult.rows.length === 0) {
        return null;
      }

      const progress = progressResult.rows[0];
      
      const encodedData = encodeAbiParameters(
        [
          { name: 'poolId', type: 'uint256' },
          { name: 'fillPercentage', type: 'uint256' },
          { name: 'totalBettorStake', type: 'uint256' },
          { name: 'totalCreatorSideStake', type: 'uint256' },
          { name: 'maxPoolSize', type: 'uint256' },
          { name: 'participantCount', type: 'uint256' },
          { name: 'betCount', type: 'uint256' },
          { name: 'currentMaxBettorStake', type: 'uint256' },
          { name: 'effectiveCreatorSideStake', type: 'uint256' },
          { name: 'timestamp', type: 'uint256' }
        ],
        [
          BigInt(poolId),
          BigInt(Math.round(parseFloat(progress.fill_percentage || 0))),
          BigInt(progress.total_bettor_stake || 0),
          BigInt(progress.total_creator_side_stake || 0),
          BigInt(Math.round(parseFloat(progress.max_pool_size || 0))),
          BigInt(parseInt(progress.participant_count || 0)),
          BigInt(parseInt(progress.bet_count || 0)),
          BigInt(Math.round(parseFloat(progress.current_max_bettor_stake || 0))),
          BigInt(Math.round(parseFloat(progress.effective_creator_side_stake || 0))),
          BigInt(Math.floor(Date.now() / 1000))
        ]
      );

      const dataId = this.generateDataId('poolProgress', poolId);
      
      // ✅ Try to use setAndEmitEvents for real-time subscriptions
      // Falls back to set() if permissions not available
      let tx;
      try {
        // Use BetPlaced event for pool progress updates (since progress changes when bets are placed)
        // setAndEmitEvents takes TWO arrays: [dataItems], [events]
        const zeroAddress = '0x0000000000000000000000000000000000000000'; // Progress update, not a specific bettor
        tx = await this.sdk.streams.setAndEmitEvents(
          // First array: data items
          [{
            id: dataId,
            schemaId: this.schemaIds.poolProgress,
            data: encodedData
          }],
          // Second array: events to emit (BetPlaced event for progress)
          [{
            id: this.eventSchemaIds.betPlaced,
            argumentTopics: [
              this.uint256ToBytes32(poolId),      // poolId (indexed)
              this.addressToBytes32(zeroAddress)   // bettor (indexed) - zero address for progress update
            ],
            data: '0x'  // No non-indexed parameters
          }]
        );
        console.log(`✅ ${this.serviceName}: Pool progress ${poolId} published with events (tx: ${tx})`);
      } catch (emitError) {
        // Fallback to set() if event emitter permissions not available or other errors
        console.warn(`⚠️ ${this.serviceName}: setAndEmitEvents failed:`, emitError.message);
        console.warn(`   Falling back to set() method...`);
        try {
          tx = await this.sdk.streams.set([{
            id: dataId,
            schemaId: this.schemaIds.poolProgress,
            data: encodedData
          }]);
          console.log(`✅ ${this.serviceName}: Pool progress published using set() fallback (tx: ${tx})`);
        } catch (setError) {
          console.error(`❌ ${this.serviceName}: Both setAndEmitEvents and set() failed:`, setError.message);
          throw setError;
        }
      }

      return tx;
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to publish pool progress:`, error);
      return null;
    }
  }

  /**
   * Helper: Generate deterministic data ID
   */
  generateDataId(type, ...args) {
    const idString = `${type}:${args.join(':')}`;
    // Convert to bytes32 hash (simplified - use proper hashing in production)
    return `0x${Buffer.from(idString).toString('hex').padStart(64, '0').slice(0, 64)}`;
  }

  /**
   * Helper: Convert string to bytes32
   */
  stringToBytes32(str) {
    if (!str) return '0x' + '0'.repeat(64);
    const hex = Buffer.from(str.slice(0, 32), 'utf8').toString('hex');
    return '0x' + hex.padEnd(64, '0');
  }

  /**
   * Helper: Convert uint256 to bytes32
   */
  uint256ToBytes32(value) {
    return '0x' + BigInt(value).toString(16).padStart(64, '0');
  }

  /**
   * Helper: Convert address to bytes32 (for topic)
   */
  addressToBytes32(address) {
    return '0x' + address.slice(2).padStart(64, '0');
  }

  /**
   * Publish reputation action to SDS
   */
  async publishReputationAction(user, action, value, poolId, timestamp, oldReputation, newReputation, actionName) {
    if (!this.isInitialized || !this.sdk) {
      return null;
    }

    // Validate schema IDs are available
    if (!this.schemaIds.reputation) {
      console.warn(`⚠️ ${this.serviceName}: Reputation schema ID not available - skipping publish`);
      return null;
    }

    try {
      const encodedData = encodeAbiParameters(
        [
          { name: 'user', type: 'address' },
          { name: 'action', type: 'uint8' },
          { name: 'value', type: 'uint256' },
          { name: 'poolId', type: 'bytes32' },
          { name: 'timestamp', type: 'uint256' },
          { name: 'oldReputation', type: 'uint256' },
          { name: 'newReputation', type: 'uint256' },
          { name: 'actionName', type: 'string' }
        ],
        [
          user,
          parseInt(action),
          BigInt(value || 0),
          this.uint256ToBytes32(poolId || 0),
          BigInt(timestamp || Math.floor(Date.now() / 1000)),
          BigInt(oldReputation || 0),
          BigInt(newReputation || 0),
          actionName || ''
        ]
      );

      const dataId = this.generateDataId('reputation', user, timestamp || Date.now());
      
      // ✅ Try to use setAndEmitEvents for real-time subscriptions (requires permissions)
      // Falls back to set() if permissions not available
      let tx;
      try {
        // Encode event data according to ReputationActionOccurred event schema: user (address indexed), poolId (bytes32 indexed)
        const eventDataEncoded = encodeAbiParameters(
          [
            { name: 'user', type: 'address' },
            { name: 'poolId', type: 'bytes32' }
          ],
          [user, this.uint256ToBytes32(poolId || 0)]
        );
        
        // setAndEmitEvents takes TWO arrays: [dataItems], [events]
        tx = await this.sdk.streams.setAndEmitEvents(
          // First array: data items
          [{
            id: dataId,
            schemaId: this.schemaIds.reputation,
            data: encodedData
          }],
          // Second array: events to emit
          [{
            id: this.eventSchemaIds.reputationActionOccurred,
            argumentTopics: [
              this.addressToBytes32(user),              // user (indexed)
              this.uint256ToBytes32(poolId || 0)        // poolId (indexed)
            ],
            data: '0x'  // No non-indexed parameters for event
          }]
        );
        console.log(`✅ ${this.serviceName}: Reputation action published with events (tx: ${tx})`);
      } catch (emitError) {
        // Fallback to set() if event emitter permissions not available or other errors
        console.warn(`⚠️ ${this.serviceName}: setAndEmitEvents failed:`, emitError.message);
        console.warn(`   Falling back to set() method...`);
        try {
          tx = await this.sdk.streams.set([{
            id: dataId,
            schemaId: this.schemaIds.reputation,
            data: encodedData
          }]);
          console.log(`✅ ${this.serviceName}: Reputation action published using set() fallback (tx: ${tx})`);
        } catch (setError) {
          console.error(`❌ ${this.serviceName}: Both setAndEmitEvents and set() failed:`, setError.message);
          throw setError;
        }
      }

      if (tx) {
        console.log(`✅ ${this.serviceName}: Reputation action published to SDS (tx: ${tx})`);
      }

      return tx;
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to publish reputation action:`, error);
      return null;
    }
  }

  /**
   * Publish liquidity event to SDS
   */
  async publishLiquidityEvent(poolId, provider, amount, eventData) {
    if (!this.isInitialized || !this.sdk) {
      return null;
    }

    // Validate schema IDs are available
    if (!this.schemaIds.liquidity) {
      console.warn(`⚠️ ${this.serviceName}: Liquidity schema ID not available - skipping publish`);
      return null;
    }

    try {
      // Fetch enriched pool data for fill percentage
      const poolResult = await db.query(`
        SELECT 
          p.pool_id,
          p.total_creator_side_stake,
          p.total_bettor_stake,
          p.creator_stake,
          p.odds,
          -- Calculate fill percentage
          CASE 
            WHEN p.total_bettor_stake = 0 OR p.total_bettor_stake > p.creator_stake THEN 
              LEAST(100, ((p.total_creator_side_stake::numeric + p.total_bettor_stake::numeric) / 
                NULLIF((p.total_creator_side_stake::numeric + ((p.total_creator_side_stake::numeric * 100) / NULLIF((p.odds - 100), 0))), 0) * 100))
            ELSE 
              LEAST(100, ((p.creator_stake::numeric + p.total_bettor_stake::numeric) / 
                NULLIF((p.creator_stake::numeric + ((p.creator_stake::numeric * 100) / NULLIF((p.odds - 100), 0))), 0) * 100))
          END as fill_percentage
        FROM oracle.pools p
        WHERE p.pool_id::text = $1::text
      `, [poolId.toString()]);

      if (poolResult.rows.length === 0) {
        return null;
      }

      const pool = poolResult.rows[0];
      const totalLiquidity = BigInt(pool.total_creator_side_stake || 0);
      
      const encodedData = encodeAbiParameters(
        [
          { name: 'poolId', type: 'uint256' },
          { name: 'provider', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'totalLiquidity', type: 'uint256' },
          { name: 'poolFillPercentage', type: 'uint256' },
          { name: 'timestamp', type: 'uint256' }
        ],
        [
          BigInt(poolId),
          provider,
          BigInt(amount || 0),
          totalLiquidity,
          BigInt(Math.round(parseFloat(pool.fill_percentage || 0))),
          BigInt(Math.floor(Date.now() / 1000))
        ]
      );

      const dataId = this.generateDataId('liquidity', poolId, provider);
      
      // ✅ Try to use setAndEmitEvents for real-time subscriptions (requires permissions)
      // Falls back to set() if permissions not available
      let tx;
      try {
        // Encode event data according to LiquidityAdded event schema: poolId (uint256 indexed), provider (address indexed)
        const eventDataEncoded = encodeAbiParameters(
          [
            { name: 'poolId', type: 'uint256' },
            { name: 'provider', type: 'address' }
          ],
          [BigInt(poolId), provider]
        );
        
        // setAndEmitEvents takes TWO arrays: [dataItems], [events]
        tx = await this.sdk.streams.setAndEmitEvents(
          // First array: data items
          [{
            id: dataId,
            schemaId: this.schemaIds.liquidity,
            data: encodedData
          }],
          // Second array: events to emit
          [{
            id: this.eventSchemaIds.liquidityAdded,
            argumentTopics: [
              this.uint256ToBytes32(poolId),      // poolId (indexed)
              this.addressToBytes32(provider)      // provider (indexed)
            ],
            data: '0x'  // No non-indexed parameters
          }]
        );
        console.log(`✅ ${this.serviceName}: Liquidity event published with events (tx: ${tx})`);
      } catch (emitError) {
        // Fallback to set() if event emitter permissions not available or other errors
        console.warn(`⚠️ ${this.serviceName}: setAndEmitEvents failed:`, emitError.message);
        console.warn(`   Falling back to set() method...`);
        try {
          tx = await this.sdk.streams.set([{
            id: dataId,
            schemaId: this.schemaIds.liquidity,
            data: encodedData
          }]);
          console.log(`✅ ${this.serviceName}: Liquidity event published using set() fallback (tx: ${tx})`);
        } catch (setError) {
          console.error(`❌ ${this.serviceName}: Both setAndEmitEvents and set() failed:`, setError.message);
          throw setError;
        }
      }

      if (tx) {
        console.log(`✅ ${this.serviceName}: Liquidity event published to SDS (tx: ${tx})`);
      }

      return tx;
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to publish liquidity event:`, error);
      return null;
    }
  }

  /**
   * Publish cycle resolved event to SDS
   */
  async publishCycleResolved(cycleId, prizePool, totalSlips, timestamp, status) {
    if (!this.isInitialized || !this.sdk) {
      return null;
    }

    // Validate schema IDs are available
    if (!this.schemaIds.cycleResolved) {
      console.warn(`⚠️ ${this.serviceName}: CycleResolved schema ID not available - skipping publish`);
      return null;
    }

    try {
      const encodedData = encodeAbiParameters(
        [
          { name: 'cycleId', type: 'uint256' },
          { name: 'prizePool', type: 'uint256' },
          { name: 'totalSlips', type: 'uint256' },
          { name: 'timestamp', type: 'uint256' },
          { name: 'status', type: 'string' }
        ],
        [
          BigInt(cycleId),
          BigInt(prizePool || 0),
          BigInt(totalSlips || 0),
          BigInt(timestamp || Math.floor(Date.now() / 1000)),
          status || 'resolved'
        ]
      );

      const dataId = this.generateDataId('cycleResolved', cycleId);
      
      // ✅ Try to use setAndEmitEvents for real-time subscriptions (requires permissions)
      // Falls back to set() if permissions not available
      let tx;
      try {
        // Encode event data according to CycleResolved event schema: cycleId (uint256 indexed)
        const eventDataEncoded = encodeAbiParameters(
          [{ name: 'cycleId', type: 'uint256' }],
          [BigInt(cycleId)]
        );
        
        // setAndEmitEvents takes TWO arrays: [dataItems], [events]
        tx = await this.sdk.streams.setAndEmitEvents(
          // First array: data items
          [{
            id: dataId,
            schemaId: this.schemaIds.cycleResolved,
            data: encodedData
          }],
          // Second array: events to emit
          [{
            id: this.eventSchemaIds.cycleResolved,
            argumentTopics: [
              this.uint256ToBytes32(cycleId)  // cycleId (indexed)
            ],
            data: '0x'  // No non-indexed parameters
          }]
        );
        console.log(`✅ ${this.serviceName}: Cycle resolved published with events (tx: ${tx})`);
      } catch (emitError) {
        // Fallback to set() if event emitter permissions not available or other errors
        console.warn(`⚠️ ${this.serviceName}: setAndEmitEvents failed:`, emitError.message);
        console.warn(`   Falling back to set() method...`);
        try {
          tx = await this.sdk.streams.set([{
            id: dataId,
            schemaId: this.schemaIds.cycleResolved,
            data: encodedData
          }]);
          console.log(`✅ ${this.serviceName}: Cycle resolved published using set() fallback (tx: ${tx})`);
        } catch (setError) {
          console.error(`❌ ${this.serviceName}: Both setAndEmitEvents and set() failed:`, setError.message);
          throw setError;
        }
      }

      if (tx) {
        console.log(`✅ ${this.serviceName}: Cycle resolved published to SDS (tx: ${tx})`);
      }

      return tx;
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to publish cycle resolved:`, error);
      return null;
    }
  }

  /**
   * Publish slip evaluated event to SDS
   */
  async publishSlipEvaluated(slipId, cycleId, player, isWinner, correctPredictions, totalPredictions, rank, prizeAmount, timestamp) {
    if (!this.isInitialized || !this.sdk) {
      return null;
    }

    // Validate schema IDs are available
    if (!this.schemaIds.slipEvaluated) {
      console.warn(`⚠️ ${this.serviceName}: SlipEvaluated schema ID not available - skipping publish`);
      return null;
    }

    try {
      const encodedData = encodeAbiParameters(
        [
          { name: 'slipId', type: 'uint256' },
          { name: 'cycleId', type: 'uint256' },
          { name: 'player', type: 'address' },
          { name: 'isWinner', type: 'bool' },
          { name: 'correctPredictions', type: 'uint256' },
          { name: 'totalPredictions', type: 'uint256' },
          { name: 'rank', type: 'uint256' },
          { name: 'prizeAmount', type: 'uint256' },
          { name: 'timestamp', type: 'uint256' }
        ],
        [
          BigInt(slipId),
          BigInt(cycleId),
          player,
          isWinner || false,
          BigInt(correctPredictions || 0),
          BigInt(totalPredictions || 0),
          BigInt(rank || 0),
          BigInt(prizeAmount || 0),
          BigInt(timestamp || Math.floor(Date.now() / 1000))
        ]
      );

      const dataId = this.generateDataId('slipEvaluated', slipId);
      
      // ✅ Try to use setAndEmitEvents for real-time subscriptions (requires permissions)
      // Falls back to set() if permissions not available
      let tx;
      try {
        // Encode event data according to SlipEvaluated event schema: slipId (uint256 indexed), player (address indexed), cycleId (uint256 indexed)
        const eventDataEncoded = encodeAbiParameters(
          [
            { name: 'slipId', type: 'uint256' },
            { name: 'player', type: 'address' },
            { name: 'cycleId', type: 'uint256' }
          ],
          [BigInt(slipId), player, BigInt(cycleId)]
        );
        
        // setAndEmitEvents takes TWO arrays: [dataItems], [events]
        tx = await this.sdk.streams.setAndEmitEvents(
          // First array: data items
          [{
            id: dataId,
            schemaId: this.schemaIds.slipEvaluated,
            data: encodedData
          }],
          // Second array: events to emit
          [{
            id: this.eventSchemaIds.slipEvaluated,
            argumentTopics: [
              this.uint256ToBytes32(slipId),      // slipId (indexed)
              this.addressToBytes32(player),       // player (indexed)
              this.uint256ToBytes32(cycleId)       // cycleId (indexed)
            ],
            data: '0x'  // No non-indexed parameters
          }]
        );
        console.log(`✅ ${this.serviceName}: Slip evaluated published with events (tx: ${tx})`);
      } catch (emitError) {
        // Fallback to set() if event emitter permissions not available or other errors
        console.warn(`⚠️ ${this.serviceName}: setAndEmitEvents failed:`, emitError.message);
        console.warn(`   Falling back to set() method...`);
        try {
          tx = await this.sdk.streams.set([{
            id: dataId,
            schemaId: this.schemaIds.slipEvaluated,
            data: encodedData
          }]);
          console.log(`✅ ${this.serviceName}: Slip evaluated published using set() fallback (tx: ${tx})`);
        } catch (setError) {
          console.error(`❌ ${this.serviceName}: Both setAndEmitEvents and set() failed:`, setError.message);
          throw setError;
        }
      }

      if (tx) {
        console.log(`✅ ${this.serviceName}: Slip evaluated published to SDS (tx: ${tx})`);
      }

      return tx;
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to publish slip evaluated:`, error);
      return null;
    }
  }

  /**
   * Publish prize claimed event to SDS
   */
  async publishPrizeClaimed(player, slipId, cycleId, prizeAmount, rank, timestamp) {
    if (!this.isInitialized || !this.sdk) {
      return null;
    }

    // Validate schema IDs are available
    if (!this.schemaIds.prizeClaimed) {
      console.warn(`⚠️ ${this.serviceName}: PrizeClaimed schema ID not available - skipping publish`);
      return null;
    }

    try {
      const encodedData = encodeAbiParameters(
        [
          { name: 'player', type: 'address' },
          { name: 'slipId', type: 'uint256' },
          { name: 'cycleId', type: 'uint256' },
          { name: 'prizeAmount', type: 'uint256' },
          { name: 'rank', type: 'uint256' },
          { name: 'timestamp', type: 'uint256' }
        ],
        [
          player,
          BigInt(slipId),
          BigInt(cycleId),
          BigInt(prizeAmount || 0),
          BigInt(rank || 0),
          BigInt(timestamp || Math.floor(Date.now() / 1000))
        ]
      );

      const dataId = this.generateDataId('prizeClaimed', slipId, player);
      
      // ✅ Try to use setAndEmitEvents for real-time subscriptions (requires permissions)
      // Falls back to set() if permissions not available
      let tx;
      try {
        // Encode event data according to PrizeClaimed event schema: cycleId (uint256 indexed), player (address indexed), slipId (uint256 indexed)
        const eventDataEncoded = encodeAbiParameters(
          [
            { name: 'cycleId', type: 'uint256' },
            { name: 'player', type: 'address' },
            { name: 'slipId', type: 'uint256' }
          ],
          [BigInt(cycleId), player, BigInt(slipId)]
        );
        
        // setAndEmitEvents takes TWO arrays: [dataItems], [events]
        tx = await this.sdk.streams.setAndEmitEvents(
          // First array: data items
          [{
            id: dataId,
            schemaId: this.schemaIds.prizeClaimed,
            data: encodedData
          }],
          // Second array: events to emit
          [{
            id: this.eventSchemaIds.prizeClaimed,
            argumentTopics: [
              this.uint256ToBytes32(cycleId),     // cycleId (indexed)
              this.addressToBytes32(player),       // player (indexed)
              this.uint256ToBytes32(slipId)        // slipId (indexed)
            ],
            data: '0x'  // No non-indexed parameters
          }]
        );
        console.log(`✅ ${this.serviceName}: Prize claimed published with events (tx: ${tx})`);
      } catch (emitError) {
        // Fallback to set() if event emitter permissions not available or other errors
        console.warn(`⚠️ ${this.serviceName}: setAndEmitEvents failed:`, emitError.message);
        console.warn(`   Falling back to set() method...`);
        try {
          tx = await this.sdk.streams.set([{
            id: dataId,
            schemaId: this.schemaIds.prizeClaimed,
            data: encodedData
          }]);
          console.log(`✅ ${this.serviceName}: Prize claimed published using set() fallback (tx: ${tx})`);
        } catch (setError) {
          console.error(`❌ ${this.serviceName}: Both setAndEmitEvents and set() failed:`, setError.message);
          throw setError;
        }
      }

      if (tx) {
        console.log(`✅ ${this.serviceName}: Prize claimed published to SDS (tx: ${tx})`);
      }

      return tx;
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to publish prize claimed:`, error);
      return null;
    }
  }
}

module.exports = new SomniaDataStreamsService();

