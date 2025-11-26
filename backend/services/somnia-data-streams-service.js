/**
 * Somnia Data Streams (SDS) Service - Context-Based Implementation
 * 
 * This implementation uses CONTEXT-BASED data streams (like the working examples)
 * instead of event schema subscriptions.
 * 
 * Context-based approach:
 * - Backend publishes data with sdk.streams.set() using context identifiers
 * - Frontend subscribes with context parameter (e.g., context: "pools:progress")
 * - No event schema registration needed
 * - More flexible and simpler than event-based approach
 * 
 * Contexts used:
 * - "pools:created" - Pool creation events
 * - "pools:settled" - Pool settlement events
 * - "pools:progress" - Real-time pool progress updates
 * - "bets" - Bet placement events
 * - "liquidity" - Liquidity additions
 * - "reputation" - Reputation changes
 * - "cycles" - Cycle resolutions
 * - "slips" - Slip evaluations
 * - "prizes" - Prize claims
 */

const { SDK, SchemaEncoder, zeroBytes32 } = require('@somnia-chain/streams');
const { createPublicClient, createWalletClient, http, waitForTransactionReceipt } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { somniaTestnet } = require('viem/chains');
const db = require('../db/db');

class SomniaDataStreamsService {
  constructor() {
    this.serviceName = 'SomniaDataStreamsService';
    this.sdk = null;
    this.isInitialized = false;
    this.publisherAddress = null;
    
    // ✅ Use unique context names prefixed with 'bitredict:' to avoid conflicts with SDS-indexed blockchain events
    // Context identifiers for data streams (matches frontend EVENT_CONTEXT_MAP)
    this.contexts = {
      poolsCreated: 'bitredict:pools:created',
      poolsSettled: 'bitredict:pools:settled',
      poolsProgress: 'bitredict:pools:progress',
      bets: 'bitredict:bets',
      liquidity: 'bitredict:liquidity',
      reputation: 'bitredict:reputation',
      cycles: 'bitredict:cycles',
      slips: 'bitredict:slips',
      prizes: 'bitredict:prizes'
    };
    
    this.jsonSchema = 'string jsonData';
    this.jsonEncoder = new SchemaEncoder(this.jsonSchema);
  }

  /**
   * Initialize SDS SDK with context-based publishing
   */
  async initialize() {
    if (this.isInitialized) {
      console.log(`✅ ${this.serviceName}: Already initialized`);
      return;
    }

    try {
      console.log(`🚀 ${this.serviceName}: Initializing with context-based data streams...`);
      
      const rpcUrl = process.env.SOMNIA_RPC_URL || process.env.RPC_URL || 'https://dream-rpc.somnia.network';
      let privateKey = process.env.SOMNIA_PRIVATE_KEY || process.env.PRIVATE_KEY;
      
      if (!privateKey) {
        console.warn(`⚠️ ${this.serviceName}: No private key found - SDS publishing disabled`);
        console.warn(`   Set SOMNIA_PRIVATE_KEY or PRIVATE_KEY to enable SDS publishing`);
        return;
      }

      // Ensure private key has 0x prefix
      if (!privateKey.startsWith('0x')) {
        privateKey = '0x' + privateKey;
      }

      const account = privateKeyToAccount(privateKey);
      this.publisherAddress = account.address;
      
      console.log(`📡 ${this.serviceName}: Publisher address: ${this.publisherAddress}`);
      
      // Public client for reading
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
      
      await this.registerSchema(publicClient);
      const eventSchemasRegistered = await this.registerEventSchemas(publicClient);
      
      if (!eventSchemasRegistered) {
        console.warn(`⚠️ ${this.serviceName}: Event schema registration failed - event emission will not work`);
        console.warn(`   Continuing with data publishing only (events will fail)`);
      }
      
      this.isInitialized = true;
      console.log(`✅ ${this.serviceName}: Initialized successfully (context-based mode)`);
      console.log(`   Contexts:`, Object.values(this.contexts).join(', '));
      console.log(`   Event schemas registered: ${eventSchemasRegistered ? '✅' : '❌'}`);
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Initialization failed:`, error);
      console.warn(`⚠️ ${this.serviceName}: Continuing without SDS (non-critical)`);
    }
  }

  /**
   * Register the JSON schema on-chain (idempotent)
   * Steps: Define → Compute → Check → Register → Wait → Validate
   */
  async registerSchema(publicClient) {
    if (!this.sdk) {
      console.warn(`⚠️ ${this.serviceName}: SDK not initialized, skipping schema registration`);
      return;
    }

    try {
      console.log(`📋 ${this.serviceName}: Registering schema...`);
      
      // Step 1: Define the canonical schema string
      const schema = this.jsonSchema;
      console.log(`   1. Schema defined: "${schema}"`);
      
      // Step 2: Compute the schemaId
      const schemaId = await this.sdk.streams.computeSchemaId(schema);
      console.log(`   2. Schema ID computed: ${schemaId}`);
      
      // Step 3: Check if already registered
      let isRegistered = false;
      try {
        if (typeof this.sdk.streams.isSchemaRegistered === 'function') {
          isRegistered = await this.sdk.streams.isSchemaRegistered(schemaId);
        } else if (typeof this.sdk.streams.isDataSchemaRegistered === 'function') {
          isRegistered = await this.sdk.streams.isDataSchemaRegistered(schemaId);
        }
        console.log(`   3. Schema registration check: ${isRegistered ? 'Already registered' : 'Not registered'}`);
      } catch (checkError) {
        console.warn(`   ⚠️ Could not check schema registration status:`, checkError.message);
        console.log(`   ℹ️ Proceeding with registration attempt (will be idempotent)`);
      }
      
      // Step 4: Register if not already registered
      if (!isRegistered) {
        console.log(`   4. Registering schema on-chain...`);
        try {
          const txHash = await this.sdk.streams.registerDataSchemas([
            {
              schemaName: 'bitredict_json_data',
              schema: schema,
              parentSchemaId: zeroBytes32
            }
          ], true);
          
          console.log(`   📝 Registration transaction: ${txHash}`);
          
          // Step 5: Wait for transaction receipt
          if (publicClient) {
            try {
              const receipt = await waitForTransactionReceipt(publicClient, { hash: txHash });
              console.log(`   ✅ Schema registration confirmed (block: ${receipt.blockNumber})`);
            } catch (waitError) {
              console.warn(`   ⚠️ Could not wait for transaction receipt:`, waitError.message);
            }
          }
        } catch (registerError) {
          // Handle "IDAlreadyUsed" or similar errors gracefully
          if (registerError.message && (
            registerError.message.includes('IDAlreadyUsed') ||
            registerError.message.includes('already registered') ||
            registerError.message.includes('AlreadyRegistered')
          )) {
            console.log(`   ✅ Schema already registered (detected from error)`);
            isRegistered = true;
          } else {
            throw registerError;
          }
        }
      } else {
        console.log(`   ✅ Schema already registered, skipping registration`);
      }
      
      // Step 6: Validate by encoding/decoding a sample payload
      try {
        const testData = { test: 'validation', timestamp: Date.now() };
        const testJson = JSON.stringify(testData);
        const encoded = this.jsonEncoder.encodeData([
          { name: 'jsonData', value: testJson, type: 'string' }
        ]);
        const decoded = this.jsonEncoder.decodeData(encoded);
        
        let decodedJson = '';
        for (const field of decoded) {
          if (field.name === 'jsonData') {
            decodedJson = field.value?.value || field.value || '';
            break;
          }
        }
        
        const parsed = JSON.parse(decodedJson);
        if (parsed.test === testData.test) {
          console.log(`   6. ✅ Schema validation passed (encode/decode test successful)`);
        } else {
          console.warn(`   ⚠️ Schema validation: decoded data doesn't match`);
        }
      } catch (validationError) {
        console.warn(`   ⚠️ Schema validation failed:`, validationError.message);
      }
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Schema registration failed:`, error);
      console.warn(`⚠️ ${this.serviceName}: Continuing without schema registration (publishing will still work)`);
    }
  }

  /**
   * Register event schemas for all event IDs we use
   * Required before calling emitEvents()
   */
  async registerEventSchemas(publicClient) {
    if (!this.sdk) {
      console.warn(`⚠️ ${this.serviceName}: SDK not initialized, skipping event schema registration`);
      return false;
    }

    try {
      console.log(`📋 ${this.serviceName}: Registering event schemas...`);
      console.log(`   SDK version check: registerEventSchemas method available: ${typeof this.sdk.streams.registerEventSchemas === 'function'}`);
      
      // Get all event IDs we use
      const eventIds = Object.values(this.contexts);
      console.log(`   Total event IDs to register: ${eventIds.length}`);
      
      // Define event schemas - v0.11.0 format requires nested schema object
      // Format: [{ id: string, schema: { params: EventParameter[], eventTopic: string } }]
      // Event topic format: "EventName(type1 indexed param1, type2 param2)"
      // For events with no parameters: "EventName()"
      const eventSchemaRegistrations = eventIds.map(eventId => {
        // Convert event ID to valid Solidity-style event name
        // e.g., "bitredict:bets" -> "BitredictBets" (remove colons, capitalize)
        const eventName = eventId
          .split(':')
          .map(part => part.charAt(0).toUpperCase() + part.slice(1))
          .join(''); // "bitredict:bets" -> "BitredictBets"
        return {
          id: eventId, // Event ID (e.g., "bitredict:bets")
          schema: {
            params: [], // No indexed parameters needed for our use case
            eventTopic: `${eventName}()` // Simple event topic: EventName()
          }
        };
      });
      
      console.log(`   Registering ${eventIds.length} event schemas:`, eventIds.join(', '));
      console.log(`   Sample event schema format:`, JSON.stringify(eventSchemaRegistrations[0], null, 2));
      
      try {
        // v0.11.0 format: registerEventSchemas([{ id, schema: { params, eventTopic } }])
        console.log(`   📤 Calling sdk.streams.registerEventSchemas()...`);
        const txHash = await this.sdk.streams.registerEventSchemas(eventSchemaRegistrations);
        
        console.log(`   📝 Event schema registration transaction: ${txHash}`);
        
        // Wait for transaction receipt to confirm registration
        if (publicClient && txHash) {
          try {
            console.log(`   ⏳ Waiting for transaction receipt...`);
            const receipt = await waitForTransactionReceipt(publicClient, { hash: txHash });
            console.log(`   ✅ Event schemas registration confirmed (block: ${receipt.blockNumber})`);
            console.log(`   ✅ All ${eventIds.length} event schemas are now registered and ready for use`);
            return true; // Success
          } catch (waitError) {
            console.warn(`   ⚠️ Could not wait for transaction receipt:`, waitError.message);
            console.warn(`   ⚠️ Transaction was sent (${txHash}) but confirmation failed - assuming success`);
            // Transaction was sent, assume success
            return true;
          }
        }
        console.log(`   ✅ Event schema registration transaction sent: ${txHash}`);
        return true; // Transaction hash returned, assume success
      } catch (registerError) {
        // Handle "EventTopicAlreadyRegistered" or similar errors gracefully
        const errorMsg = registerError.message || registerError.toString() || '';
        const errorName = registerError.errorName || registerError.name || '';
        
        console.error(`   ❌ Event schema registration error details:`);
        console.error(`      Error message: ${errorMsg}`);
        console.error(`      Error name: ${errorName}`);
        console.error(`      Full error:`, registerError);
        
        if (errorMsg.includes('EventTopicAlreadyRegistered') ||
            errorMsg.includes('already registered') ||
            errorMsg.includes('AlreadyRegistered') ||
            errorMsg.includes('EventSchemaAlreadyRegistered') ||
            errorName.includes('AlreadyRegistered')) {
          console.log(`   ✅ Event schemas already registered (detected from error)`);
          return true; // Already registered, so success
        } else {
          console.error(`   ❌ Event schema registration failed - event emission will not work`);
          console.error(`   ⚠️ Please check SDK version and registration format`);
          return false; // Registration failed
        }
      }
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Event schema registration failed:`, error);
      console.error(`   Error message:`, error.message);
      console.error(`   Error stack:`, error.stack);
      return false; // Registration failed
    }
  }

  /**
   * Publish pool data with context
   */
  async publishPool(poolId, eventData) {
    if (!this.isInitialized || !this.sdk) {
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
      
      // Create data object (no ABI encoding needed for context-based streams)
      const poolData = {
        poolId: pool.pool_id.toString(),
        creator: pool.creator_address,
        odds: parseInt(pool.odds),
        creatorStake: pool.creator_stake.toString(),
        totalBettorStake: pool.total_bettor_stake.toString(),
        totalCreatorSideStake: pool.total_creator_side_stake.toString(),
        maxBettorStake: pool.max_bettor_stake.toString(),
        category: pool.category || '',
        league: pool.league || '',
        homeTeam: pool.home_team || '',
        awayTeam: pool.away_team || '',
        marketId: pool.market_id || '',
        eventStartTime: pool.event_start_time ? pool.event_start_time.toString() : '0',
        eventEndTime: pool.event_end_time ? pool.event_end_time.toString() : '0',
        bettingEndTime: pool.betting_end_time ? pool.betting_end_time.toString() : '0',
        isSettled: pool.is_settled || false,
        creatorSideWon: pool.creator_side_won || false,
        title: pool.title || '',
        fillPercentage: Math.round(parseFloat(pool.fill_percentage || 0)),
        participantCount: parseInt(pool.participant_count || 0),
        currency: pool.use_bitr ? 'BITR' : 'STT',
        timestamp: Math.floor(Date.now() / 1000)
      };
      
      // Determine context based on pool state
      const context = pool.is_settled 
        ? this.contexts.poolsSettled 
        : this.contexts.poolsCreated;
      
      // Generate unique data ID
      const dataId = this.generateDataId(context, poolId);
      
      // Encode JSON data using SchemaEncoder
      const jsonString = JSON.stringify(poolData);
      const schemaId = await this.sdk.streams.computeSchemaId(this.jsonSchema);
      const encodedData = this.jsonEncoder.encodeData([
        { name: 'jsonData', value: jsonString, type: 'string' }
      ]);
      
      // ✅ Publish to SDS AND emit event for real-time subscriptions
      // Frontend subscribes to event IDs like "bitredict:pools:created", "bitredict:pools:settled"
      const eventId = context === this.contexts.poolsSettled ? 'bitredict:pools:settled' : 'bitredict:pools:created';
      
      console.log(`📡 ${this.serviceName}: Publishing pool with set...`);
      console.log(`   Pool ID: ${poolId}`);
      console.log(`   Event ID: ${eventId}`);
      console.log(`   Data ID: ${dataId}`);
      console.log(`   Schema ID: ${schemaId}`);
      console.log(`   Is Settled: ${pool.is_settled}`);
      
      try {
        const tx = await this.sdk.streams.set([{
          id: dataId,
          schemaId: schemaId,
          data: encodedData
        }]);

        console.log(`✅ ${this.serviceName}: Pool ${poolId} published (tx: ${tx})`);
        
      // Emit event separately - EventStream format: { id: string, argumentTopics: Hex[], data: Hex }
      try {
        await this.sdk.streams.emitEvents([{
          id: eventId,
          argumentTopics: [], // Empty array - no indexed topics needed
          data: '0x' // Empty data - data is already stored via set()
        }]);
        console.log(`✅ ${this.serviceName}: Event "${eventId}" emitted for pool ${poolId}`);
      } catch (emitError) {
        // Check for EventSchemaNotRegistered in multiple ways (message, errorName, or error object structure)
        const isSchemaNotRegistered = 
          (emitError.message && emitError.message.includes('EventSchemaNotRegistered')) ||
          (emitError.errorName === 'EventSchemaNotRegistered') ||
          (emitError.name === 'EventSchemaNotRegistered');
        
        if (isSchemaNotRegistered) {
          console.warn(`⚠️ ${this.serviceName}: Event schema not registered for "${eventId}" - event emission skipped`);
          console.warn(`   This is expected if event schemas haven't been registered yet`);
        } else {
          console.error(`❌ ${this.serviceName}: Error emitting event "${eventId}" for pool ${poolId}:`, emitError);
        }
        // Don't throw - data is already stored
      }
        
        return tx;
      } catch (setError) {
        console.error(`❌ ${this.serviceName}: Error in set for pool ${poolId}:`, setError);
        console.error(`   Error message: ${setError.message}`);
        console.error(`   Error stack: ${setError.stack}`);
        throw setError; // Re-throw to be caught by outer catch
      }
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to publish pool ${poolId}:`, error);
      return null;
    }
  }

  /**
   * Publish bet data with context
   */
  async publishBet(poolId, bettor, amount, isForOutcome, eventData) {
    console.log(`📡 ${this.serviceName}: publishBet called for pool ${poolId}, bettor ${bettor}`);
    console.log(`   isInitialized: ${this.isInitialized}, hasSDK: ${!!this.sdk}`);
    
    if (!this.isInitialized || !this.sdk) {
      console.warn(`⚠️ ${this.serviceName}: Cannot publish bet - SDS not initialized or SDK not available`);
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
          p.odds,
          p.use_bitr
        FROM oracle.bets b
        JOIN oracle.pools p ON b.pool_id::text = p.pool_id::text
        WHERE b.pool_id::text = $1::text AND b.bettor_address = $2
        ORDER BY b.created_at DESC
        LIMIT 1
      `, [poolId, bettor.toLowerCase()]);

      if (betResult.rows.length === 0) {
        console.warn(`⚠️ ${this.serviceName}: Bet not found in database for pool ${poolId}, bettor ${bettor} - may be duplicate that skipped DB insert`);
        // For duplicate bets that skipped DB insert, create bet data from parameters
        const betData = {
          poolId: poolId.toString(),
          bettor: bettor,
          amount: amount.toString(),
          isForOutcome: isForOutcome || false,
          timestamp: Math.floor(Date.now() / 1000),
          poolTitle: '',
          category: '',
          odds: 200,
          currency: 'STT'
        };
        
        // Continue with publishing using provided data
        const dataId = this.generateDataId(this.contexts.bets, poolId, bettor);
        const jsonString = JSON.stringify(betData);
        const schemaId = await this.sdk.streams.computeSchemaId(this.jsonSchema);
        const encodedData = this.jsonEncoder.encodeData([
          { name: 'jsonData', value: jsonString, type: 'string' }
        ]);
        const eventId = this.contexts.bets;
        
        console.log(`📡 ${this.serviceName}: Publishing bet with set (duplicate bet, using provided data)...`);
        console.log(`   Event ID: ${eventId}`);
        console.log(`   Data ID: ${dataId}`);
        console.log(`   Schema ID: ${schemaId}`);
        
        const tx = await this.sdk.streams.set([{
          id: dataId,
          schemaId: schemaId,
          data: encodedData
        }]);

        console.log(`✅ ${this.serviceName}: Bet published (tx: ${tx})`);
        
        // Emit event separately - EventStream format: { id: string, argumentTopics: Hex[], data: Hex }
        try {
        await this.sdk.streams.emitEvents([{
          id: eventId,
          argumentTopics: [],
          data: '0x'
        }]);
        console.log(`✅ ${this.serviceName}: Event "${eventId}" emitted`);
      } catch (emitError) {
        const isSchemaNotRegistered = 
          (emitError.message && emitError.message.includes('EventSchemaNotRegistered')) ||
          (emitError.errorName === 'EventSchemaNotRegistered') ||
          (emitError.name === 'EventSchemaNotRegistered');
        
        if (isSchemaNotRegistered) {
          console.warn(`⚠️ ${this.serviceName}: Event schema not registered for "${eventId}" - event emission skipped`);
        } else {
          console.error(`❌ ${this.serviceName}: Error emitting event "${eventId}":`, emitError);
        }
      }
        
        return tx;
      }

      const bet = betResult.rows[0];
      
      // Create bet data object
      const betData = {
        poolId: bet.pool_id.toString(),
        bettor: bet.bettor_address,
        amount: bet.amount.toString(),
        isForOutcome: bet.is_for_outcome || false,
        timestamp: Math.floor(new Date(bet.created_at).getTime() / 1000),
        poolTitle: bet.pool_title || '',
        category: bet.category || '',
        odds: parseInt(bet.odds || 200),
        currency: bet.use_bitr ? 'BITR' : 'STT'
      };

      const dataId = this.generateDataId(this.contexts.bets, poolId, bettor);
      
      // Encode JSON data using SchemaEncoder
      const jsonString = JSON.stringify(betData);
      const schemaId = await this.sdk.streams.computeSchemaId(this.jsonSchema);
      const encodedData = this.jsonEncoder.encodeData([
        { name: 'jsonData', value: jsonString, type: 'string' }
      ]);
      const eventId = this.contexts.bets;
      
      // ✅ Publish to SDS using set, then emit event separately
      console.log(`📡 ${this.serviceName}: Publishing bet with set...`);
      console.log(`   Event ID: ${eventId}`);
      console.log(`   Data ID: ${dataId}`);
      console.log(`   Schema ID: ${schemaId}`);
      
      const tx = await this.sdk.streams.set([{
        id: dataId,
        schemaId: schemaId,
        data: encodedData
      }]);

      console.log(`✅ ${this.serviceName}: Bet published (tx: ${tx})`);
      
      // Emit event separately - EventStream format: { id: string, argumentTopics: Hex[], data: Hex }
      // Note: Event schemas must be registered before emitting (done in initialize())
      try {
        await this.sdk.streams.emitEvents([{
          id: eventId,
          argumentTopics: [], // Empty array - no indexed topics needed
          data: '0x' // Empty data - data is already stored via set()
        }]);
        console.log(`✅ ${this.serviceName}: Event "${eventId}" emitted`);
        console.log(`📡 ${this.serviceName}: Event "${eventId}" should trigger frontend subscriptions`);
      } catch (emitError) {
        const isSchemaNotRegistered = 
          (emitError.message && emitError.message.includes('EventSchemaNotRegistered')) ||
          (emitError.errorName === 'EventSchemaNotRegistered') ||
          (emitError.name === 'EventSchemaNotRegistered');
        
        if (isSchemaNotRegistered) {
          console.warn(`⚠️ ${this.serviceName}: Event schema not registered for "${eventId}" - event emission skipped`);
          console.warn(`   ℹ️ This is expected if event schemas haven't been registered yet`);
          console.warn(`   ℹ️ Data is still stored via set(), but frontend won't receive real-time notifications`);
        } else {
          console.error(`❌ ${this.serviceName}: Error emitting event "${eventId}":`, emitError);
        }
        // Don't throw - data is already stored
      }
      
      return tx;
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to publish bet:`, error);
      return null;
    }
  }

  /**
   * Publish pool progress updates with context
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
      
      // Create progress data object
      const progressData = {
        poolId: poolId.toString(),
        fillPercentage: Math.round(parseFloat(progress.fill_percentage || 0)),
        totalBettorStake: progress.total_bettor_stake.toString(),
        totalCreatorSideStake: progress.total_creator_side_stake.toString(),
        maxPoolSize: Math.round(parseFloat(progress.max_pool_size || 0)).toString(),
        participantCount: parseInt(progress.participant_count || 0),
        betCount: parseInt(progress.bet_count || 0),
        currentMaxBettorStake: Math.round(parseFloat(progress.current_max_bettor_stake || 0)).toString(),
        effectiveCreatorSideStake: Math.round(parseFloat(progress.effective_creator_side_stake || 0)).toString(),
        timestamp: Math.floor(Date.now() / 1000)
      };

      const dataId = this.generateDataId(this.contexts.poolsProgress, poolId);
      
      // Encode JSON data using SchemaEncoder
      const jsonString = JSON.stringify(progressData);
      const schemaId = await this.sdk.streams.computeSchemaId(this.jsonSchema);
      const encodedData = this.jsonEncoder.encodeData([
        { name: 'jsonData', value: jsonString, type: 'string' }
      ]);
      const eventId = this.contexts.poolsProgress;
      
      // ✅ Publish to SDS using set, then emit event separately
      const tx = await this.sdk.streams.set([{
        id: dataId,
        schemaId: schemaId,
        data: encodedData
      }]);

      console.log(`✅ ${this.serviceName}: Pool progress ${poolId} published (tx: ${tx})`);
      
      // Emit event separately - EventStream format: { id: string, argumentTopics: Hex[], data: Hex }
      try {
        await this.sdk.streams.emitEvents([{
          id: eventId,
          argumentTopics: [], // Empty array - no indexed topics needed
          data: '0x' // Empty data - data is already stored via set()
        }]);
        console.log(`✅ ${this.serviceName}: Event "${eventId}" emitted for pool progress ${poolId}`);
      } catch (emitError) {
        const isSchemaNotRegistered = 
          (emitError.message && emitError.message.includes('EventSchemaNotRegistered')) ||
          (emitError.errorName === 'EventSchemaNotRegistered') ||
          (emitError.name === 'EventSchemaNotRegistered');
        
        if (isSchemaNotRegistered) {
          console.warn(`⚠️ ${this.serviceName}: Event schema not registered for "${eventId}" - event emission skipped`);
        } else {
          console.error(`❌ ${this.serviceName}: Error emitting event "${eventId}" for pool progress:`, emitError);
        }
      }
      
      return tx;
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to publish pool progress:`, error);
      return null;
    }
  }

  /**
   * Publish liquidity event with context
   */
  async publishLiquidityEvent(poolId, provider, amount, eventData) {
    if (!this.isInitialized || !this.sdk) {
      return null;
    }

    try {
      // ✅ CRITICAL: Fetch pool info to get currency (use_bitr flag)
      let currency = 'STT'; // Default to STT
      try {
        const poolResult = await db.query(`
          SELECT use_bitr
          FROM oracle.pools
          WHERE pool_id::text = $1::text
          LIMIT 1
        `, [poolId.toString()]);
        
        if (poolResult.rows.length > 0) {
          currency = poolResult.rows[0].use_bitr ? 'BITR' : 'STT';
        }
      } catch (dbError) {
        console.warn(`⚠️ ${this.serviceName}: Failed to fetch pool currency, defaulting to STT:`, dbError.message);
      }

      // ✅ CRITICAL: Convert wei amount to token amount for display
      // Both BITR and STT use 18 decimals (1e18)
      const amountBigInt = typeof amount === 'bigint' ? amount : BigInt(amount.toString());
      const amountInTokens = (Number(amountBigInt) / 1e18).toString();
      
      const liquidityData = {
        poolId: poolId.toString(),
        provider: provider.toLowerCase(),
        amount: amountInTokens, // ✅ Send token amount (not wei) for correct display
        amountWei: amountBigInt.toString(), // ✅ Also include wei for calculations if needed
        currency: currency, // ✅ CRITICAL: Include currency (BITR or STT)
        timestamp: Math.floor(Date.now() / 1000)
      };

      const dataId = this.generateDataId(this.contexts.liquidity, poolId, provider);
      
      // Encode JSON data using SchemaEncoder
      const jsonString = JSON.stringify(liquidityData);
      const schemaId = await this.sdk.streams.computeSchemaId(this.jsonSchema);
      const encodedData = this.jsonEncoder.encodeData([
        { name: 'jsonData', value: jsonString, type: 'string' }
      ]);
      const eventId = this.contexts.liquidity;
      
      // ✅ Publish to SDS using set, then emit event separately
      const tx = await this.sdk.streams.set([{
        id: dataId,
        schemaId: schemaId,
        data: encodedData
      }]);

      console.log(`✅ ${this.serviceName}: Liquidity event published (tx: ${tx}, poolId: ${poolId}, amount: ${amount}, currency: ${currency}, timestamp: ${liquidityData.timestamp})`);
      
      // Emit event separately - EventStream format: { id: string, argumentTopics: Hex[], data: Hex }
      try {
        await this.sdk.streams.emitEvents([{
          id: eventId,
          argumentTopics: [], // Empty array - no indexed topics needed
          data: '0x' // Empty data - data is already stored via set()
        }]);
        console.log(`✅ ${this.serviceName}: Event "${eventId}" emitted for liquidity`);
      } catch (emitError) {
        const isSchemaNotRegistered = 
          (emitError.message && emitError.message.includes('EventSchemaNotRegistered')) ||
          (emitError.errorName === 'EventSchemaNotRegistered') ||
          (emitError.name === 'EventSchemaNotRegistered');
        
        if (isSchemaNotRegistered) {
          console.warn(`⚠️ ${this.serviceName}: Event schema not registered for "${eventId}" - event emission skipped`);
        } else {
          console.error(`❌ ${this.serviceName}: Error emitting event "${eventId}" for liquidity:`, emitError);
        }
      }
      
      return tx;
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to publish liquidity event:`, error);
      return null;
    }
  }

  /**
   * Publish reputation action with context
   */
  async publishReputationAction(user, action, value, poolId, timestamp, oldReputation, newReputation, actionName) {
    if (!this.isInitialized || !this.sdk) {
      return null;
    }

    try {
      const reputationData = {
        user: user,
        action: parseInt(action),
        value: value.toString(),
        poolId: poolId ? poolId.toString() : '0',
        timestamp: timestamp || Math.floor(Date.now() / 1000),
        oldReputation: oldReputation.toString(),
        newReputation: newReputation.toString(),
        actionName: actionName || ''
      };

      const dataId = this.generateDataId(this.contexts.reputation, user, timestamp || Date.now());
      
      // Encode JSON data using SchemaEncoder
      const jsonString = JSON.stringify(reputationData);
      const schemaId = await this.sdk.streams.computeSchemaId(this.jsonSchema);
      const encodedData = this.jsonEncoder.encodeData([
        { name: 'jsonData', value: jsonString, type: 'string' }
      ]);
      const eventId = this.contexts.reputation;
      
      // ✅ Publish to SDS using set, then emit event separately
      const tx = await this.sdk.streams.set([{
        id: dataId,
        schemaId: schemaId,
        data: encodedData
      }]);

      console.log(`✅ ${this.serviceName}: Reputation action published (tx: ${tx})`);
      
      // Emit event separately - EventStream format: { id: string, argumentTopics: Hex[], data: Hex }
      try {
        await this.sdk.streams.emitEvents([{
          id: eventId,
          argumentTopics: [], // Empty array - no indexed topics needed
          data: '0x' // Empty data - data is already stored via set()
        }]);
        console.log(`✅ ${this.serviceName}: Event "${eventId}" emitted for reputation`);
      } catch (emitError) {
        const isSchemaNotRegistered = 
          (emitError.message && emitError.message.includes('EventSchemaNotRegistered')) ||
          (emitError.errorName === 'EventSchemaNotRegistered') ||
          (emitError.name === 'EventSchemaNotRegistered');
        
        if (isSchemaNotRegistered) {
          console.warn(`⚠️ ${this.serviceName}: Event schema not registered for "${eventId}" - event emission skipped`);
        } else {
          console.error(`❌ ${this.serviceName}: Error emitting event "${eventId}" for reputation:`, emitError);
        }
      }
      
      return tx;
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to publish reputation action:`, error);
      return null;
    }
  }

  /**
   * Publish cycle resolved event with context
   */
  async publishCycleResolved(cycleId, prizePool, totalSlips, timestamp, status) {
    if (!this.isInitialized || !this.sdk) {
      return null;
    }

    try {
      const cycleData = {
        cycleId: cycleId.toString(), // ✅ Backend sends as string (BigInt from DB)
        prizePool: prizePool.toString(), // ✅ Backend sends as string (raw wei amount)
        totalSlips: parseInt(totalSlips || 0),
        status: status || 'resolved',
        timestamp: timestamp || Math.floor(Date.now() / 1000) // ✅ CRITICAL: Include timestamp
      };

      const dataId = this.generateDataId(this.contexts.cycles, cycleId, timestamp || Date.now());
      
      // Encode JSON data using SchemaEncoder
      const jsonString = JSON.stringify(cycleData);
      const schemaId = await this.sdk.streams.computeSchemaId(this.jsonSchema);
      const encodedData = this.jsonEncoder.encodeData([
        { name: 'jsonData', value: jsonString, type: 'string' }
      ]);
      const eventId = this.contexts.cycles;
      
      // ✅ Publish to SDS using set, then emit event separately
      const tx = await this.sdk.streams.set([{
        id: dataId,
        schemaId: schemaId,
        data: encodedData
      }]);

      console.log(`✅ ${this.serviceName}: Cycle resolved event published (tx: ${tx}, cycleId: ${cycleId}, timestamp: ${cycleData.timestamp})`);
      
      // Emit event separately - EventStream format: { id: string, argumentTopics: Hex[], data: Hex }
      try {
        await this.sdk.streams.emitEvents([{
          id: eventId,
          argumentTopics: [], // Empty array - no indexed topics needed
          data: '0x' // Empty data - data is already stored via set()
        }]);
        console.log(`✅ ${this.serviceName}: Event "${eventId}" emitted for cycle resolved`);
      } catch (emitError) {
        const isSchemaNotRegistered = 
          (emitError.message && emitError.message.includes('EventSchemaNotRegistered')) ||
          (emitError.errorName === 'EventSchemaNotRegistered') ||
          (emitError.name === 'EventSchemaNotRegistered');
        
        if (isSchemaNotRegistered) {
          console.warn(`⚠️ ${this.serviceName}: Event schema not registered for "${eventId}" - event emission skipped`);
        } else {
          console.error(`❌ ${this.serviceName}: Error emitting event "${eventId}" for cycle:`, emitError);
        }
      }
      
      return tx;
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to publish cycle resolved:`, error);
      return null;
    }
  }

  /**
   * Publish slip evaluated event with context
   */
  async publishSlipEvaluated(slipId, cycleId, player, isWinner, correctPredictions, totalPredictions, rank, prizeAmount, timestamp) {
    if (!this.isInitialized || !this.sdk) {
      return null;
    }

    try {
      const slipData = {
        slipId: slipId.toString(), // ✅ Backend sends as string (BigInt from DB)
        cycleId: cycleId.toString(), // ✅ Backend sends as string (BigInt from DB)
        player: player.toLowerCase(), // ✅ Backend sends as address string
        isWinner: Boolean(isWinner),
        correctPredictions: Number(correctPredictions || 0),
        totalPredictions: Number(totalPredictions || 10),
        rank: Number(rank || 0),
        prizeAmount: prizeAmount.toString(), // ✅ Backend sends as string (raw wei amount)
        timestamp: timestamp || Math.floor(Date.now() / 1000) // ✅ CRITICAL: Include timestamp
      };

      const dataId = this.generateDataId(this.contexts.slips, slipId, timestamp || Date.now());
      
      // Encode JSON data using SchemaEncoder
      const jsonString = JSON.stringify(slipData);
      const schemaId = await this.sdk.streams.computeSchemaId(this.jsonSchema);
      const encodedData = this.jsonEncoder.encodeData([
        { name: 'jsonData', value: jsonString, type: 'string' }
      ]);
      const eventId = this.contexts.slips;
      
      // ✅ Publish to SDS using set, then emit event separately
      const tx = await this.sdk.streams.set([{
        id: dataId,
        schemaId: schemaId,
        data: encodedData
      }]);

      console.log(`✅ ${this.serviceName}: Slip evaluated event published (tx: ${tx}, slipId: ${slipId}, timestamp: ${slipData.timestamp})`);
      
      // Emit event separately - EventStream format: { id: string, argumentTopics: Hex[], data: Hex }
      try {
        await this.sdk.streams.emitEvents([{
          id: eventId,
          argumentTopics: [], // Empty array - no indexed topics needed
          data: '0x' // Empty data - data is already stored via set()
        }]);
        console.log(`✅ ${this.serviceName}: Event "${eventId}" emitted for slip evaluated`);
      } catch (emitError) {
        const isSchemaNotRegistered = 
          (emitError.message && emitError.message.includes('EventSchemaNotRegistered')) ||
          (emitError.errorName === 'EventSchemaNotRegistered') ||
          (emitError.name === 'EventSchemaNotRegistered');
        
        if (isSchemaNotRegistered) {
          console.warn(`⚠️ ${this.serviceName}: Event schema not registered for "${eventId}" - event emission skipped`);
        } else {
          console.error(`❌ ${this.serviceName}: Error emitting event "${eventId}" for slip:`, emitError);
        }
      }
      
      return tx;
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to publish slip evaluated:`, error);
      return null;
    }
  }

  /**
   * Publish prize claimed event with context
   */
  async publishPrizeClaimed(player, slipId, cycleId, prizeAmount, rank, timestamp) {
    if (!this.isInitialized || !this.sdk) {
      return null;
    }

    try {
      const prizeData = {
        player: player.toLowerCase(), // ✅ Backend sends as address string
        slipId: slipId.toString(), // ✅ Backend sends as string (BigInt from DB)
        cycleId: cycleId.toString(), // ✅ Backend sends as string (BigInt from DB)
        prizeAmount: prizeAmount.toString(), // ✅ Backend sends as string (raw wei amount)
        rank: Number(rank || 0),
        timestamp: timestamp || Math.floor(Date.now() / 1000) // ✅ CRITICAL: Include timestamp
      };

      const dataId = this.generateDataId(this.contexts.prizes, player, slipId, timestamp || Date.now());
      
      // Encode JSON data using SchemaEncoder
      const jsonString = JSON.stringify(prizeData);
      const schemaId = await this.sdk.streams.computeSchemaId(this.jsonSchema);
      const encodedData = this.jsonEncoder.encodeData([
        { name: 'jsonData', value: jsonString, type: 'string' }
      ]);
      const eventId = this.contexts.prizes;
      
      // ✅ Publish to SDS using set, then emit event separately
      const tx = await this.sdk.streams.set([{
        id: dataId,
        schemaId: schemaId,
        data: encodedData
      }]);

      console.log(`✅ ${this.serviceName}: Prize claimed event published (tx: ${tx}, slipId: ${slipId}, timestamp: ${prizeData.timestamp})`);
      
      // Emit event separately - EventStream format: { id: string, argumentTopics: Hex[], data: Hex }
      try {
        await this.sdk.streams.emitEvents([{
          id: eventId,
          argumentTopics: [], // Empty array - no indexed topics needed
          data: '0x' // Empty data - data is already stored via set()
        }]);
        console.log(`✅ ${this.serviceName}: Event "${eventId}" emitted for prize claimed`);
      } catch (emitError) {
        const isSchemaNotRegistered = 
          (emitError.message && emitError.message.includes('EventSchemaNotRegistered')) ||
          (emitError.errorName === 'EventSchemaNotRegistered') ||
          (emitError.name === 'EventSchemaNotRegistered');
        
        if (isSchemaNotRegistered) {
          console.warn(`⚠️ ${this.serviceName}: Event schema not registered for "${eventId}" - event emission skipped`);
        } else {
          console.error(`❌ ${this.serviceName}: Error emitting event "${eventId}" for prize:`, emitError);
        }
      }
      
      return tx;
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to publish prize claimed:`, error);
      return null;
    }
  }

  /**
   * Generate deterministic data ID
   */
  generateDataId(context, ...args) {
    const idString = `${context}:${args.join(':')}:${Date.now()}`;
    // Use simple hash for ID
    return `0x${Buffer.from(idString).toString('hex').padStart(64, '0').slice(0, 64)}`;
  }

  /**
   * Get or compute schemaId for a context
   * For context-based streams, we use a deterministic schemaId derived from context
   */
  getSchemaIdForContext(context) {
    // Use context as schema identifier - convert to hex bytes32
    // This allows frontend to subscribe by context while backend uses schemaId
    const contextBytes = Buffer.from(context, 'utf8');
    const hash = require('crypto').createHash('sha256').update(contextBytes).digest();
    return `0x${hash.toString('hex').slice(0, 64)}`;
  }
}

// Singleton instance
let instance = null;

function getInstance() {
  if (!instance) {
    instance = new SomniaDataStreamsService();
  }
  return instance;
}

// Export singleton instance methods directly for convenience
// This allows both: somniaDataStreams.publishBet() and somniaDataStreams.getInstance()
const serviceInstance = getInstance();

module.exports = {
  getInstance,
  // Expose all public methods directly
  initialize: (...args) => serviceInstance.initialize(...args),
  publishPool: (...args) => serviceInstance.publishPool(...args),
  publishBet: (...args) => serviceInstance.publishBet(...args),
  publishPoolProgress: (...args) => serviceInstance.publishPoolProgress(...args),
  publishLiquidityEvent: (...args) => serviceInstance.publishLiquidityEvent(...args),
  publishReputationAction: (...args) => serviceInstance.publishReputationAction(...args),
  publishCycleResolved: (...args) => serviceInstance.publishCycleResolved(...args),
  publishSlipEvaluated: (...args) => serviceInstance.publishSlipEvaluated(...args),
  publishPrizeClaimed: (...args) => serviceInstance.publishPrizeClaimed(...args),
  // Expose properties
  get isInitialized() { return serviceInstance.isInitialized; },
  get contexts() { return serviceInstance.contexts; }
};
