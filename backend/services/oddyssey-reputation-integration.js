/**
 * Oddyssey Reputation Integration
 * 
 * This service integrates Oddyssey events with the ReputationSystem contract
 * to ensure all Oddyssey participation is properly recorded on-chain.
 */

const ReputationContractIntegration = require('./reputation-contract-integration');

class OddysseyReputationIntegration {
    constructor() {
        this.serviceName = 'Oddyssey Reputation Integration';
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
     * Record Oddyssey slip placement
     * This should be called when a user places an Oddyssey slip
     */
    async recordSlipPlaced(userAddress, slipId, cycleId) {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            console.log(`🎮 ${this.serviceName}: Recording slip placement...`);
            console.log(`   User: ${userAddress}`);
            console.log(`   Slip ID: ${slipId}`);
            console.log(`   Cycle ID: ${cycleId}`);

            // Record basic participation
            const result = await this.reputationIntegration.recordReputationAction(
                userAddress,
                'ODDYSSEY_PARTICIPATION',
                `Placed slip ${slipId} in cycle ${cycleId}`
            );

            console.log(`✅ ${this.serviceName}: Slip placement recorded successfully`);
            return result;

        } catch (error) {
            console.error(`❌ ${this.serviceName}: Failed to record slip placement:`, error.message);
            throw error;
        }
    }

    /**
     * Record Oddyssey cycle evaluation
     * This should be called when a cycle is evaluated and results are known
     */
    async recordCycleEvaluation(userAddress, cycleId, correctPredictions, isWinner = false, isChampion = false) {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            console.log(`🎮 ${this.serviceName}: Recording cycle evaluation...`);
            console.log(`   User: ${userAddress}`);
            console.log(`   Cycle ID: ${cycleId}`);
            console.log(`   Correct Predictions: ${correctPredictions}`);
            console.log(`   Is Winner: ${isWinner}`);
            console.log(`   Is Champion: ${isChampion}`);

            // Record performance-based reputation action
            const result = await this.reputationIntegration.recordOddysseyParticipation(
                userAddress,
                correctPredictions,
                isWinner,
                isChampion
            );

            console.log(`✅ ${this.serviceName}: Cycle evaluation recorded successfully`);
            return result;

        } catch (error) {
            console.error(`❌ ${this.serviceName}: Failed to record cycle evaluation:`, error.message);
            throw error;
        }
    }

    /**
     * Record Oddyssey prize claim
     * This should be called when a user claims their Oddyssey prize
     */
    async recordPrizeClaim(userAddress, cycleId, prizeAmount) {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            console.log(`🎮 ${this.serviceName}: Recording prize claim...`);
            console.log(`   User: ${userAddress}`);
            console.log(`   Cycle ID: ${cycleId}`);
            console.log(`   Prize Amount: ${prizeAmount}`);

            // Record prize claim as social engagement
            const result = await this.reputationIntegration.recordReputationAction(
                userAddress,
                'SOCIAL_ENGAGEMENT',
                `Claimed Oddyssey prize of ${prizeAmount} tokens for cycle ${cycleId}`
            );

            console.log(`✅ ${this.serviceName}: Prize claim recorded successfully`);
            return result;

        } catch (error) {
            console.error(`❌ ${this.serviceName}: Failed to record prize claim:`, error.message);
            throw error;
        }
    }

    /**
     * Get user's Oddyssey reputation summary
     */
    async getUserOddysseyReputation(userAddress) {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            const reputationData = await this.reputationIntegration.getUserReputation(userAddress);
            
            return {
                ...reputationData,
                oddysseyEligible: reputationData.reputation >= 40, // Can participate in Oddyssey
                canCreatePools: reputationData.canCreateGuided
            };

        } catch (error) {
            console.error(`❌ ${this.serviceName}: Failed to get user Oddyssey reputation:`, error.message);
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

module.exports = OddysseyReputationIntegration;
