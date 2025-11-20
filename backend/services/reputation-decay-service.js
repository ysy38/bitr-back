const db = require('../db/db');

/**
 * Reputation Decay Service
 * 
 * Implements reputation decay over time to prevent reputation inflation
 * and encourage continued participation.
 */
class ReputationDecayService {
    constructor() {
        this.serviceName = 'Reputation Decay Service';
        this.isRunning = false;
        
        // Decay configuration
        this.config = {
            decayInterval: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
            decayRate: 0.05, // 5% decay per week
            minReputation: 20, // Minimum reputation after decay
            maxDecayAmount: 50, // Maximum reputation that can be decayed in one cycle
            inactiveThreshold: 30 * 24 * 60 * 60 * 1000, // 30 days of inactivity
            inactiveDecayRate: 0.10 // 10% decay for inactive users
        };
    }

    async initialize() {
        try {
            console.log(`🚀 ${this.serviceName}: Initializing...`);
            
            // Start decay processing
            this.startDecayProcessing();
            
            this.isRunning = true;
            console.log(`✅ ${this.serviceName}: Service started successfully`);
            
        } catch (error) {
            console.error(`❌ ${this.serviceName}: Initialization failed:`, error);
            throw error;
        }
    }

    startDecayProcessing() {
        // Run decay check every 24 hours
        setInterval(async () => {
            try {
                await this.processReputationDecay();
            } catch (error) {
                console.error(`❌ ${this.serviceName}: Decay processing failed:`, error);
            }
        }, 24 * 60 * 60 * 1000); // 24 hours

        // Run initial decay check
        setTimeout(async () => {
            try {
                await this.processReputationDecay();
            } catch (error) {
                console.error(`❌ ${this.serviceName}: Initial decay check failed:`, error);
            }
        }, 60000); // 1 minute delay
    }

    async processReputationDecay() {
        try {
            console.log(`🔄 ${this.serviceName}: Processing reputation decay...`);
            
            const now = new Date();
            const decayThreshold = new Date(now.getTime() - this.config.decayInterval);
            const inactiveThreshold = new Date(now.getTime() - this.config.inactiveThreshold);
            
            // Get users who haven't had reputation decay in the last week
            const usersToDecay = await this.getUsersForDecay(decayThreshold);
            
            // Get inactive users (no activity in 30 days)
            const inactiveUsers = await this.getInactiveUsers(inactiveThreshold);
            
            let decayedCount = 0;
            let inactiveDecayedCount = 0;
            
            // Process regular decay
            for (const user of usersToDecay) {
                const newReputation = await this.calculateDecayedReputation(user);
                if (newReputation < user.reputation) {
                    await this.applyReputationDecay(user.address, user.reputation, newReputation, 'weekly_decay');
                    decayedCount++;
                }
            }
            
            // Process inactive user decay
            for (const user of inactiveUsers) {
                const newReputation = await this.calculateInactiveDecay(user);
                if (newReputation < user.reputation) {
                    await this.applyReputationDecay(user.address, user.reputation, newReputation, 'inactive_decay');
                    inactiveDecayedCount++;
                }
            }
            
            console.log(`✅ ${this.serviceName}: Decay processing complete - ${decayedCount} users decayed, ${inactiveDecayedCount} inactive users decayed`);
            
        } catch (error) {
            console.error(`❌ ${this.serviceName}: Failed to process reputation decay:`, error);
        }
    }

    async getUsersForDecay(decayThreshold) {
        try {
            const result = await db.query(`
                SELECT address, reputation, last_active, last_synced_at
                FROM core.users 
                WHERE reputation > $1 
                AND (last_synced_at IS NULL OR last_synced_at < $2)
                ORDER BY reputation DESC
            `, [this.config.minReputation, decayThreshold]);
            
            return result.rows;
            
        } catch (error) {
            console.error(`❌ ${this.serviceName}: Failed to get users for decay:`, error);
            return [];
        }
    }

    async getInactiveUsers(inactiveThreshold) {
        try {
            const result = await db.query(`
                SELECT address, reputation, last_active, last_synced_at
                FROM core.users 
                WHERE reputation > $1 
                AND (last_active IS NULL OR last_active < $2)
                ORDER BY reputation DESC
            `, [this.config.minReputation, inactiveThreshold]);
            
            return result.rows;
            
        } catch (error) {
            console.error(`❌ ${this.serviceName}: Failed to get inactive users:`, error);
            return [];
        }
    }

    async calculateDecayedReputation(user) {
        const currentReputation = user.reputation || 40;
        const decayAmount = Math.min(
            Math.floor(currentReputation * this.config.decayRate),
            this.config.maxDecayAmount
        );
        
        const newReputation = Math.max(
            currentReputation - decayAmount,
            this.config.minReputation
        );
        
        return newReputation;
    }

    async calculateInactiveDecay(user) {
        const currentReputation = user.reputation || 40;
        const decayAmount = Math.min(
            Math.floor(currentReputation * this.config.inactiveDecayRate),
            this.config.maxDecayAmount * 2 // Double decay for inactive users
        );
        
        const newReputation = Math.max(
            currentReputation - decayAmount,
            this.config.minReputation
        );
        
        return newReputation;
    }

    async applyReputationDecay(userAddress, oldReputation, newReputation, decayType) {
        try {
            // Update user reputation
            await db.query(`
                UPDATE core.users 
                SET reputation = $1, last_synced_at = NOW()
                WHERE address = $2
            `, [newReputation, userAddress]);
            
            // Record decay action
            await db.query(`
                INSERT INTO core.reputation_actions (
                    user_address, action_type, reputation_delta, associated_value, 
                    pool_id, timestamp, block_number, transaction_hash, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
            `, [
                userAddress,
                decayType === 'weekly_decay' ? 26 : 27, // Custom action types for decay
                newReputation - oldReputation,
                decayType,
                null,
                new Date().toISOString(),
                null,
                null
            ]);
            
            console.log(`📉 ${this.serviceName}: Applied ${decayType} to ${userAddress}: ${oldReputation} → ${newReputation}`);
            
        } catch (error) {
            console.error(`❌ ${this.serviceName}: Failed to apply reputation decay:`, error);
        }
    }

    async stop() {
        try {
            console.log(`🛑 ${this.serviceName}: Stopping service...`);
            
            this.isRunning = false;
            
            console.log(`✅ ${this.serviceName}: Service stopped`);
            
        } catch (error) {
            console.error(`❌ ${this.serviceName}: Failed to stop service:`, error);
        }
    }
}

module.exports = ReputationDecayService;
