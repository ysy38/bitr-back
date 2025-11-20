/**
 * Pool Reputation Integration
 * 
 * This service integrates pool events with the ReputationSystem contract
 * to ensure all pool creation, betting, and winning is properly recorded on-chain.
 */

const ReputationContractIntegration = require('./reputation-contract-integration');

class PoolReputationIntegration {
    constructor() {
        this.serviceName = 'Pool Reputation Integration';
        this.reputationIntegration = new ReputationContractIntegration();
        this.isInitialized = false;
    }

    async initialize() {
        try {
            console.log(`🚀 ${this.serviceName}: Initializing...`);
            await this.reputationIntegration.initialize();
            this.isInitialized = true;
            console.log(`✅ ${this.serviceName}: Initialized successfully`);
        } catch (error) {
            console.error(`❌ ${this.serviceName}: Initialization failed:`, error.message);
            throw error;
        }
    }

    /**
     * Record pool creation
     * This should be called when a user creates a new pool
     */
    async recordPoolCreation(userAddress, poolId, isGuided = true, stakeAmount) {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            console.log(`🏊 ${this.serviceName}: Recording pool creation...`);
            console.log(`   User: ${userAddress}`);
            console.log(`   Pool ID: ${poolId}`);
            console.log(`   Type: ${isGuided ? 'Guided' : 'Open'}`);
            console.log(`   Stake: ${stakeAmount}`);

            const result = await this.reputationIntegration.recordPoolCreation(
                userAddress,
                poolId,
                isGuided
            );

            console.log(`✅ ${this.serviceName}: Pool creation recorded successfully`);
            return result;

        } catch (error) {
            console.error(`❌ ${this.serviceName}: Failed to record pool creation:`, error.message);
            throw error;
        }
    }

    /**
     * Record bet placement
     * This should be called when a user places a bet on a pool
     */
    async recordBetPlaced(userAddress, poolId, betAmount, isForOutcome) {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            console.log(`🎯 ${this.serviceName}: Recording bet placement...`);
            console.log(`   User: ${userAddress}`);
            console.log(`   Pool ID: ${poolId}`);
            console.log(`   Bet Amount: ${betAmount}`);
            console.log(`   For Outcome: ${isForOutcome}`);

            const result = await this.reputationIntegration.recordBetPlaced(
                userAddress,
                poolId,
                betAmount
            );

            console.log(`✅ ${this.serviceName}: Bet placement recorded successfully`);
            return result;

        } catch (error) {
            console.error(`❌ ${this.serviceName}: Failed to record bet placement:`, error.message);
            throw error;
        }
    }

    /**
     * Record bet win
     * This should be called when a user wins a bet
     */
    async recordBetWon(userAddress, poolId, winnings, odds, betAmount) {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            console.log(`🎉 ${this.serviceName}: Recording bet win...`);
            console.log(`   User: ${userAddress}`);
            console.log(`   Pool ID: ${poolId}`);
            console.log(`   Winnings: ${winnings}`);
            console.log(`   Odds: ${odds}x`);
            console.log(`   Bet Amount: ${betAmount}`);

            const result = await this.reputationIntegration.recordBetWon(
                userAddress,
                poolId,
                winnings,
                odds
            );

            console.log(`✅ ${this.serviceName}: Bet win recorded successfully`);
            return result;

        } catch (error) {
            console.error(`❌ ${this.serviceName}: Failed to record bet win:`, error.message);
            throw error;
        }
    }

    /**
     * Record pool filled above 60%
     * This should be called when a pool reaches 60%+ capacity
     */
    async recordPoolFilled(userAddress, poolId, fillPercentage, totalLiquidity) {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            console.log(`💧 ${this.serviceName}: Recording pool filled...`);
            console.log(`   Creator: ${userAddress}`);
            console.log(`   Pool ID: ${poolId}`);
            console.log(`   Fill Percentage: ${fillPercentage}%`);
            console.log(`   Total Liquidity: ${totalLiquidity}`);

            const result = await this.reputationIntegration.recordPoolFilled(
                userAddress,
                poolId,
                fillPercentage
            );

            console.log(`✅ ${this.serviceName}: Pool filled recorded successfully`);
            return result;

        } catch (error) {
            console.error(`❌ ${this.serviceName}: Failed to record pool filled:`, error.message);
            throw error;
        }
    }

    /**
     * Record pool spam detection
     * This should be called when a pool is marked as spam
     */
    async recordPoolSpam(userAddress, poolId, reason) {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            console.log(`🚫 ${this.serviceName}: Recording pool spam...`);
            console.log(`   User: ${userAddress}`);
            console.log(`   Pool ID: ${poolId}`);
            console.log(`   Reason: ${reason}`);

            const result = await this.reputationIntegration.recordReputationAction(
                userAddress,
                'POOL_SPAMMED',
                `Pool ${poolId} marked as spam: ${reason}`
            );

            console.log(`✅ ${this.serviceName}: Pool spam recorded successfully`);
            return result;

        } catch (error) {
            console.error(`❌ ${this.serviceName}: Failed to record pool spam:`, error.message);
            throw error;
        }
    }

    /**
     * Record outcome proposal
     * This should be called when a user proposes an outcome for a pool
     */
    async recordOutcomeProposal(userAddress, poolId, proposedOutcome, isCorrect) {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            console.log(`📝 ${this.serviceName}: Recording outcome proposal...`);
            console.log(`   User: ${userAddress}`);
            console.log(`   Pool ID: ${poolId}`);
            console.log(`   Proposed Outcome: ${proposedOutcome}`);
            console.log(`   Is Correct: ${isCorrect}`);

            const actionType = isCorrect ? 'OUTCOME_PROPOSED_CORRECTLY' : 'OUTCOME_PROPOSED_INCORRECTLY';
            const details = `Proposed outcome "${proposedOutcome}" for pool ${poolId} - ${isCorrect ? 'Correct' : 'Incorrect'}`;

            const result = await this.reputationIntegration.recordReputationAction(
                userAddress,
                actionType,
                details
            );

            console.log(`✅ ${this.serviceName}: Outcome proposal recorded successfully`);
            return result;

        } catch (error) {
            console.error(`❌ ${this.serviceName}: Failed to record outcome proposal:`, error.message);
            throw error;
        }
    }

    /**
     * Record challenge result
     * This should be called when a user challenges an outcome
     */
    async recordChallenge(userAddress, poolId, challengeSuccessful) {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            console.log(`⚔️ ${this.serviceName}: Recording challenge...`);
            console.log(`   User: ${userAddress}`);
            console.log(`   Pool ID: ${poolId}`);
            console.log(`   Challenge Successful: ${challengeSuccessful}`);

            const actionType = challengeSuccessful ? 'CHALLENGE_SUCCESSFUL' : 'CHALLENGE_FAILED';
            const details = `Challenged outcome for pool ${poolId} - ${challengeSuccessful ? 'Successful' : 'Failed'}`;

            const result = await this.reputationIntegration.recordReputationAction(
                userAddress,
                actionType,
                details
            );

            console.log(`✅ ${this.serviceName}: Challenge recorded successfully`);
            return result;

        } catch (error) {
            console.error(`❌ ${this.serviceName}: Failed to record challenge:`, error.message);
            throw error;
        }
    }

    /**
     * Get user's pool reputation summary
     */
    async getUserPoolReputation(userAddress) {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            const reputationData = await this.reputationIntegration.getUserReputation(userAddress);
            
            return {
                ...reputationData,
                canCreateGuidedPools: reputationData.canCreateGuided,
                canCreateOpenPools: reputationData.canCreateOpen,
                canProposeOutcomes: reputationData.canPropose
            };

        } catch (error) {
            console.error(`❌ ${this.serviceName}: Failed to get user pool reputation:`, error.message);
            throw error;
        }
    }

    async stop() {
        console.log(`🛑 ${this.serviceName}: Stopping...`);
        if (this.reputationIntegration) {
            await this.reputationIntegration.stop();
        }
    }
}

module.exports = PoolReputationIntegration;
