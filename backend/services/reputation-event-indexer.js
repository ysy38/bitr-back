const { ethers } = require('ethers');
const db = require('../db/db');
const Web3Service = require('./web3-service');
const somniaDataStreams = require('./somnia-data-streams-service');

/**
 * Reputation Event Indexer Service
 * 
 * Listens to ReputationActionOccurred events from:
 * - BitredictPoolCore.sol
 * - BitredictComboPools.sol  
 * - Oddyssey.sol
 * 
 * Processes events and updates user reputation in database
 */
class ReputationEventIndexer {
    constructor() {
        this.serviceName = 'Reputation Event Indexer';
        this.isRunning = false;
        this.eventListeners = [];
        this.web3Service = null;
        this.contracts = {};
        
        // Event processing configuration
        this.config = {
            maxRetries: 3,
            retryDelayMs: 5000,
            batchSize: 50,
            processingInterval: 10000, // 10 seconds
            maxEventsPerBatch: 100
        };
        
        // Reputation action mapping
        this.reputationActions = {
            // Pool actions
            'POOL_CREATED': 0,
            'BET_PLACED': 1,
            'BET_WON': 2,
            'BET_WON_HIGH_VALUE': 3,
            'BET_WON_MASSIVE': 4,
            'POOL_FILLED_ABOVE_60': 5,
            'POOL_SPAMMED': 6,
            'OUTCOME_PROPOSED_CORRECTLY': 7,
            'OUTCOME_PROPOSED_INCORRECTLY': 8,
            'CHALLENGE_SUCCESSFUL': 9,
            'CHALLENGE_FAILED': 10,
            'LIQUIDITY_PROVIDED': 11,
            'LIQUIDITY_REMOVED': 12,
            'SOCIAL_ENGAGEMENT': 13,
            'COMMUNITY_CONTRIBUTION': 14,
            'SPAM_DETECTED': 15,
            'ABUSE_DETECTED': 16,
            'VERIFICATION_GRANTED': 17,
            'VERIFICATION_REVOKED': 18,
            // Oddyssey actions
            'ODDYSSEY_PARTICIPATION': 19,
            'ODDYSSEY_QUALIFYING': 20,
            'ODDYSSEY_EXCELLENT': 21,
            'ODDYSSEY_OUTSTANDING': 22,
            'ODDYSSEY_PERFECT': 23,
            'ODDYSSEY_WINNER': 24,
            'ODDYSSEY_CHAMPION': 25
        };
    }

    async initialize() {
        try {
            console.log(`🚀 ${this.serviceName}: Initializing...`);
            
            // Initialize Web3 service
            this.web3Service = new Web3Service();
            await this.web3Service.initialize();
            
            // Get contracts for event listening
            this.contracts.poolCore = await this.web3Service.getPoolCoreContractForEvents();
            this.contracts.comboPools = await this.web3Service.getComboPoolsContractForEvents();
            this.contracts.oddyssey = await this.web3Service.getOddysseyContractForEvents();
            
            console.log(`✅ ${this.serviceName}: Web3 service initialized`);
            console.log(`✅ ${this.serviceName}: Contracts loaded`);
            
            // Start event listeners
            await this.setupEventListeners();
            
            // Start batch processing
            this.startBatchProcessing();
            
            this.isRunning = true;
            console.log(`✅ ${this.serviceName}: Service started successfully`);
            
        } catch (error) {
            console.error(`❌ ${this.serviceName}: Initialization failed:`, error);
            throw error;
        }
    }

    async setupEventListeners() {
        try {
            console.log(`🔗 ${this.serviceName}: Setting up event listeners...`);
            
            // Listen to PoolCore reputation events
            const poolCoreListener = this.contracts.poolCore.on('ReputationActionOccurred', async (
                user,
                action,
                value,
                poolId,
                timestamp,
                event
            ) => {
                console.log(`📊 ${this.serviceName}: PoolCore reputation event - User: ${user}, Action: ${action}, Value: ${value}`);
                await this.processReputationEvent('poolcore', user, action, value, poolId, timestamp, event);
            });
            
            // Listen to ComboPools reputation events
            const comboPoolsListener = this.contracts.comboPools.on('ReputationActionOccurred', async (
                user,
                action,
                value,
                poolId,
                timestamp,
                event
            ) => {
                console.log(`📊 ${this.serviceName}: ComboPools reputation event - User: ${user}, Action: ${action}, Value: ${value}`);
                await this.processReputationEvent('combo', user, action, value, poolId, timestamp, event);
            });
            
            // Listen to Oddyssey reputation events
            const oddysseyListener = this.contracts.oddyssey.on('ReputationActionOccurred', async (
                user,
                action,
                value,
                cycleId,
                timestamp,
                event
            ) => {
                console.log(`📊 ${this.serviceName}: Oddyssey reputation event - User: ${user}, Action: ${action}, Value: ${value}`);
                await this.processReputationEvent('oddyssey', user, action, value, cycleId, timestamp, event);
            });
            
            this.eventListeners.push(poolCoreListener, comboPoolsListener, oddysseyListener);
            
            console.log(`✅ ${this.serviceName}: Event listeners setup complete`);
            
        } catch (error) {
            console.error(`❌ ${this.serviceName}: Failed to setup event listeners:`, error);
            throw error;
        }
    }

    async processReputationEvent(source, user, action, value, poolId, timestamp, event) {
        try {
            // Convert action enum to string
            const actionString = this.getActionString(action);
            const actionType = this.reputationActions[actionString] || 0;
            
            // Get current user reputation
            const currentReputation = await this.getUserReputation(user);
            
            // Calculate reputation delta based on action
            const reputationDelta = this.calculateReputationDelta(actionString, value);
            const newReputation = Math.max(0, Math.min(500, currentReputation + reputationDelta));
            
            // Store reputation action in database
            await this.storeReputationAction(
                user,
                actionType,
                reputationDelta,
                value.toString(),
                poolId.toString(),
                timestamp,
                event.blockNumber,
                event.transactionHash,
                source
            );
            
            // Update user reputation
            await this.updateUserReputation(user, newReputation);
            
            // ✅ CRITICAL: Broadcast WebSocket update for Live Activity feed
            try {
                const wsService = require('./websocket-service');
                wsService.broadcastReputationChanged({
                    user: user,
                    action: Number(action),
                    value: value.toString(),
                    poolId: poolId?.toString() || '',
                    timestamp: Number(timestamp),
                    oldReputation: currentReputation,
                    newReputation: newReputation,
                    actionName: actionString
                });
                console.log(`📡 ${this.serviceName}: WebSocket reputation:changed broadcast sent for user ${user}`);
            } catch (wsError) {
                console.warn(`⚠️ ${this.serviceName}: WebSocket broadcast failed (non-critical):`, wsError.message);
            }
            
            // Publish to Somnia Data Streams
            try {
                await somniaDataStreams.publishReputationAction(
                    user,
                    action,
                    value,
                    poolId,
                    timestamp,
                    currentReputation,
                    newReputation,
                    actionString
                );
            } catch (sdsError) {
                console.warn(`⚠️ ${this.serviceName}: Failed to publish reputation to SDS (non-critical):`, sdsError.message);
            }
            
            console.log(`✅ ${this.serviceName}: Processed reputation event - User: ${user}, Action: ${actionString}, Delta: ${reputationDelta}, New Rep: ${newReputation}`);
            
        } catch (error) {
            console.error(`❌ ${this.serviceName}: Failed to process reputation event:`, error);
        }
    }

    getActionString(actionEnum) {
        const actionMap = {
            0: 'POOL_CREATED',
            1: 'BET_PLACED', 
            2: 'BET_WON',
            3: 'BET_WON_HIGH_VALUE',
            4: 'BET_WON_MASSIVE',
            5: 'POOL_FILLED_ABOVE_60',
            6: 'POOL_SPAMMED',
            7: 'OUTCOME_PROPOSED_CORRECTLY',
            8: 'OUTCOME_PROPOSED_INCORRECTLY',
            9: 'CHALLENGE_SUCCESSFUL',
            10: 'CHALLENGE_FAILED',
            11: 'LIQUIDITY_PROVIDED',
            12: 'LIQUIDITY_REMOVED',
            13: 'SOCIAL_ENGAGEMENT',
            14: 'COMMUNITY_CONTRIBUTION',
            15: 'SPAM_DETECTED',
            16: 'ABUSE_DETECTED',
            17: 'VERIFICATION_GRANTED',
            18: 'VERIFICATION_REVOKED',
            19: 'ODDYSSEY_PARTICIPATION',
            20: 'ODDYSSEY_QUALIFYING',
            21: 'ODDYSSEY_EXCELLENT',
            22: 'ODDYSSEY_OUTSTANDING',
            23: 'ODDYSSEY_PERFECT',
            24: 'ODDYSSEY_WINNER',
            25: 'ODDYSSEY_CHAMPION'
        };
        
        return actionMap[actionEnum] || 'UNKNOWN';
    }

    calculateReputationDelta(actionString, value) {
        const pointsMap = {
            // Pool actions
            'POOL_CREATED': 4,
            'BET_PLACED': 2,
            'BET_WON': 3,
            'BET_WON_HIGH_VALUE': 8,
            'BET_WON_MASSIVE': 15,
            'POOL_FILLED_ABOVE_60': 8,
            'POOL_SPAMMED': -15,
            'OUTCOME_PROPOSED_CORRECTLY': 12,
            'OUTCOME_PROPOSED_INCORRECTLY': -20,
            'CHALLENGE_SUCCESSFUL': 10,
            'CHALLENGE_FAILED': -12,
            'LIQUIDITY_PROVIDED': 2,
            'LIQUIDITY_REMOVED': -1,
            'SOCIAL_ENGAGEMENT': 1,
            'COMMUNITY_CONTRIBUTION': 3,
            'SPAM_DETECTED': -50,
            'ABUSE_DETECTED': -100,
            'VERIFICATION_GRANTED': 20,
            'VERIFICATION_REVOKED': -20,
            // Oddyssey actions
            'ODDYSSEY_PARTICIPATION': 1,
            'ODDYSSEY_QUALIFYING': 3,
            'ODDYSSEY_EXCELLENT': 4,
            'ODDYSSEY_OUTSTANDING': 6,
            'ODDYSSEY_PERFECT': 8,
            'ODDYSSEY_WINNER': 10,
            'ODDYSSEY_CHAMPION': 15
        };
        
        return pointsMap[actionString] || 0;
    }

    async getUserReputation(userAddress) {
        try {
            const result = await db.query(
                'SELECT reputation FROM core.users WHERE address = $1',
                [userAddress]
            );
            
            if (result.rows.length === 0) {
                // User doesn't exist, return default reputation
                return 40;
            }
            
            return result.rows[0].reputation || 40;
            
        } catch (error) {
            console.error(`❌ ${this.serviceName}: Failed to get user reputation:`, error);
            return 40; // Default reputation
        }
    }

    async storeReputationAction(userAddress, actionType, reputationDelta, associatedValue, poolId, timestamp, blockNumber, transactionHash, source) {
        try {
            await db.query(`
                INSERT INTO core.reputation_actions (
                    user_address, action_type, reputation_delta, associated_value, 
                    pool_id, timestamp, block_number, transaction_hash, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
            `, [
                userAddress,
                actionType,
                reputationDelta,
                associatedValue,
                poolId,
                new Date(timestamp * 1000).toISOString(),
                blockNumber,
                transactionHash
            ]);
            
        } catch (error) {
            console.error(`❌ ${this.serviceName}: Failed to store reputation action:`, error);
        }
    }

    async updateUserReputation(userAddress, newReputation) {
        try {
            // Upsert user record
            await db.query(`
                INSERT INTO core.users (address, reputation, joined_at, last_active)
                VALUES ($1, $2, NOW(), NOW())
                ON CONFLICT (address) 
                DO UPDATE SET 
                    reputation = $2,
                    last_active = NOW(),
                    last_synced_at = NOW()
            `, [userAddress, newReputation]);
            
        } catch (error) {
            console.error(`❌ ${this.serviceName}: Failed to update user reputation:`, error);
        }
    }

    startBatchProcessing() {
        // Process any missed events periodically
        setInterval(async () => {
            try {
                await this.processMissedEvents();
            } catch (error) {
                console.error(`❌ ${this.serviceName}: Batch processing failed:`, error);
            }
        }, this.config.processingInterval);
    }

    async processMissedEvents() {
        try {
            // Get recent events that might have been missed
            const currentBlock = await this.web3Service.provider.getBlockNumber();
            const fromBlock = Math.max(0, currentBlock - 1000); // Last 1000 blocks
            
            // Process PoolCore events
            const poolCoreFilter = this.contracts.poolCore.filters.ReputationActionOccurred();
            const poolCoreEvents = await this.contracts.poolCore.queryFilter(poolCoreFilter, fromBlock, currentBlock);
            
            // Process ComboPools events
            const comboPoolsFilter = this.contracts.comboPools.filters.ReputationActionOccurred();
            const comboPoolsEvents = await this.contracts.comboPools.queryFilter(comboPoolsFilter, fromBlock, currentBlock);
            
            // Process Oddyssey events
            const oddysseyFilter = this.contracts.oddyssey.filters.ReputationActionOccurred();
            const oddysseyEvents = await this.contracts.oddyssey.queryFilter(oddysseyFilter, fromBlock, currentBlock);
            
            console.log(`🔄 ${this.serviceName}: Found ${poolCoreEvents.length + comboPoolsEvents.length + oddysseyEvents.length} recent events to process`);
            
        } catch (error) {
            console.error(`❌ ${this.serviceName}: Failed to process missed events:`, error);
        }
    }

    async stop() {
        try {
            console.log(`🛑 ${this.serviceName}: Stopping service...`);
            
            this.isRunning = false;
            
            // Remove all event listeners
            for (const listener of this.eventListeners) {
                if (this.contracts.poolCore && listener) {
                    this.contracts.poolCore.removeListener('ReputationActionOccurred', listener);
                }
                if (this.contracts.comboPools && listener) {
                    this.contracts.comboPools.removeListener('ReputationActionOccurred', listener);
                }
                if (this.contracts.oddyssey && listener) {
                    this.contracts.oddyssey.removeListener('ReputationActionOccurred', listener);
                }
            }
            
            this.eventListeners = [];
            
            console.log(`✅ ${this.serviceName}: Service stopped`);
            
        } catch (error) {
            console.error(`❌ ${this.serviceName}: Failed to stop service:`, error);
        }
    }
}

module.exports = ReputationEventIndexer;
