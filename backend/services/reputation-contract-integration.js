/**
 * Reputation Contract Integration Service
 * 
 * This service ensures that ALL reputation events are properly recorded on-chain
 * by calling the ReputationSystem contract's recordReputationAction function.
 * 
 * This is the missing piece that connects backend events to on-chain reputation.
 */

const { ethers } = require('ethers');
const config = require('../config');
const db = require('../db/db');

const REPUTATION_SYSTEM_ABI = require('../abis/ReputationSystem.json');
const REPUTATION_SYSTEM_ADDRESS = '0x70b7BcB7aF96C8B4354A4DA91365184b1DaC782A';

class ReputationContractIntegration {
    constructor() {
        this.serviceName = 'Reputation Contract Integration';
        this.isRunning = false;
        this.web3Service = null;
        this.reputationContract = null;
        
        // Reputation action mapping (matches contract enum)
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
            
            // Initialize Web3Service
            this.web3Service = new (require('./web3-service'))();
            await this.web3Service.initialize();
            
            // Initialize reputation contract
            const provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
            const wallet = new ethers.Wallet(config.blockchain.privateKey, provider);
            this.reputationContract = new ethers.Contract(
                REPUTATION_SYSTEM_ADDRESS,
                REPUTATION_SYSTEM_ABI,
                wallet
            );
            
            console.log(`✅ ${this.serviceName}: Initialized successfully`);
            console.log(`   Contract: ${REPUTATION_SYSTEM_ADDRESS}`);
            console.log(`   Wallet: ${wallet.address}`);
            
        } catch (error) {
            console.error(`❌ ${this.serviceName}: Initialization failed:`, error.message);
            throw error;
        }
    }

    /**
     * Record reputation action on-chain
     * This is the main function that should be called for all reputation events
     */
    async recordReputationAction(userAddress, actionType, details = '') {
        try {
            console.log(`🔄 ${this.serviceName}: Recording reputation action...`);
            console.log(`   User: ${userAddress}`);
            console.log(`   Action: ${actionType}`);
            console.log(`   Details: ${details}`);
            
            // Get action enum value
            const actionEnum = this.reputationActions[actionType];
            if (actionEnum === undefined) {
                throw new Error(`Unknown reputation action: ${actionType}`);
            }
            
            // Call contract
            const tx = await this.reputationContract.recordReputationAction(
                userAddress,
                actionEnum,
                details
            );
            
            console.log(`   Transaction: ${tx.hash}`);
            
            // Wait for confirmation
            const receipt = await tx.wait();
            console.log(`   Confirmed in block: ${receipt.blockNumber}`);
            
            // Store in database for tracking
            await this.saveReputationActionToDatabase({
                userAddress,
                actionType,
                details,
                transactionHash: tx.hash,
                blockNumber: receipt.blockNumber,
                timestamp: new Date()
            });
            
            console.log(`✅ ${this.serviceName}: Reputation action recorded successfully`);
            
            return {
                success: true,
                transactionHash: tx.hash,
                blockNumber: receipt.blockNumber
            };
            
        } catch (error) {
            console.error(`❌ ${this.serviceName}: Failed to record reputation action:`, error.message);
            throw error;
        }
    }

    /**
     * Record Oddyssey participation
     */
    async recordOddysseyParticipation(userAddress, correctPredictions, isWinner = false, isChampion = false) {
        try {
            let actionType = 'ODDYSSEY_PARTICIPATION';
            let details = `Participated in Oddyssey with ${correctPredictions} correct predictions`;
            
            // Determine action type based on performance
            if (isChampion) {
                actionType = 'ODDYSSEY_CHAMPION';
                details = 'Won multiple Oddyssey cycles (Champion)';
            } else if (isWinner) {
                actionType = 'ODDYSSEY_WINNER';
                details = 'Won Oddyssey cycle (Top 5)';
            } else if (correctPredictions >= 10) {
                actionType = 'ODDYSSEY_PERFECT';
                details = 'Perfect 10/10 predictions';
            } else if (correctPredictions >= 9) {
                actionType = 'ODDYSSEY_OUTSTANDING';
                details = 'Outstanding 9+ correct predictions';
            } else if (correctPredictions >= 8) {
                actionType = 'ODDYSSEY_EXCELLENT';
                details = 'Excellent 8+ correct predictions';
            } else if (correctPredictions >= 7) {
                actionType = 'ODDYSSEY_QUALIFYING';
                details = 'Qualifying 7+ correct predictions';
            }
            
            return await this.recordReputationAction(userAddress, actionType, details);
            
        } catch (error) {
            console.error(`❌ ${this.serviceName}: Failed to record Oddyssey participation:`, error.message);
            throw error;
        }
    }

    /**
     * Record pool creation
     */
    async recordPoolCreation(userAddress, poolId, isGuided = true) {
        try {
            const actionType = 'POOL_CREATED';
            const details = `Created ${isGuided ? 'guided' : 'open'} pool: ${poolId}`;
            
            return await this.recordReputationAction(userAddress, actionType, details);
            
        } catch (error) {
            console.error(`❌ ${this.serviceName}: Failed to record pool creation:`, error.message);
            throw error;
        }
    }

    /**
     * Record bet placement
     */
    async recordBetPlaced(userAddress, poolId, amount) {
        try {
            const actionType = 'BET_PLACED';
            const details = `Placed bet on pool ${poolId} for ${amount} tokens`;
            
            return await this.recordReputationAction(userAddress, actionType, details);
            
        } catch (error) {
            console.error(`❌ ${this.serviceName}: Failed to record bet placement:`, error.message);
            throw error;
        }
    }

    /**
     * Record bet win
     */
    async recordBetWon(userAddress, poolId, winnings, odds) {
        try {
            let actionType = 'BET_WON';
            let details = `Won bet on pool ${poolId} with ${odds}x odds`;
            
            // Determine if it's a high-value or massive win
            if (odds >= 10) {
                actionType = 'BET_WON_MASSIVE';
                details = `Massive win on pool ${poolId} with ${odds}x odds (10x+)`;
            } else if (odds >= 5) {
                actionType = 'BET_WON_HIGH_VALUE';
                details = `High-value win on pool ${poolId} with ${odds}x odds (5x+)`;
            }
            
            return await this.recordReputationAction(userAddress, actionType, details);
            
        } catch (error) {
            console.error(`❌ ${this.serviceName}: Failed to record bet win:`, error.message);
            throw error;
        }
    }

    /**
     * Record pool filled above 60%
     */
    async recordPoolFilled(userAddress, poolId, fillPercentage) {
        try {
            if (fillPercentage >= 60) {
                const actionType = 'POOL_FILLED_ABOVE_60';
                const details = `Pool ${poolId} filled to ${fillPercentage}% capacity`;
                
                return await this.recordReputationAction(userAddress, actionType, details);
            }
            
        } catch (error) {
            console.error(`❌ ${this.serviceName}: Failed to record pool filled:`, error.message);
            throw error;
        }
    }

    /**
     * Save reputation action to database for tracking
     */
    async saveReputationActionToDatabase(reputationData) {
        try {
            await db.query(`
                INSERT INTO core.reputation_actions (
                    user_address,
                    action_type,
                    reputation_delta,
                    associated_value,
                    pool_id,
                    timestamp,
                    block_number,
                    transaction_hash
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [
                reputationData.userAddress,
                reputationData.actionType,
                this.getReputationPoints(reputationData.actionType),
                reputationData.details,
                reputationData.poolId || null,
                reputationData.timestamp,
                reputationData.blockNumber,
                reputationData.transactionHash
            ]);
            
        } catch (error) {
            console.error(`❌ ${this.serviceName}: Failed to save reputation action to database:`, error.message);
            // Don't throw - this is just for tracking
        }
    }

    /**
     * Get reputation points for an action
     */
    getReputationPoints(actionType) {
        const pointsMap = {
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
            'ODDYSSEY_PARTICIPATION': 1,
            'ODDYSSEY_QUALIFYING': 3,
            'ODDYSSEY_EXCELLENT': 4,
            'ODDYSSEY_OUTSTANDING': 6,
            'ODDYSSEY_PERFECT': 8,
            'ODDYSSEY_WINNER': 10,
            'ODDYSSEY_CHAMPION': 15
        };
        
        return pointsMap[actionType] || 0;
    }

    /**
     * Check if service is authorized to update reputation
     */
    async checkAuthorization() {
        try {
            const isAuthorized = await this.reputationContract.authorizedUpdaters(this.reputationContract.runner.address);
            console.log(`🔐 ${this.serviceName}: Authorization status: ${isAuthorized}`);
            return isAuthorized;
        } catch (error) {
            console.error(`❌ ${this.serviceName}: Failed to check authorization:`, error.message);
            return false;
        }
    }

    /**
     * Get user's current reputation from contract
     */
    async getUserReputation(userAddress) {
        try {
            const [reputation, canCreateGuided, canCreateOpen, canPropose] = 
                await this.reputationContract.getReputationBundle(userAddress);
            
            return {
                reputation: Number(reputation),
                canCreateGuided,
                canCreateOpen,
                canPropose
            };
        } catch (error) {
            console.error(`❌ ${this.serviceName}: Failed to get user reputation:`, error.message);
            throw error;
        }
    }

    async stop() {
        console.log(`🛑 ${this.serviceName}: Stopping...`);
        this.isRunning = false;
    }
}

module.exports = ReputationContractIntegration;
