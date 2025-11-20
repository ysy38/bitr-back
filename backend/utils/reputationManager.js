const db = require('../db/db');

class ReputationManager {
  constructor() {
    this.MAX_REPUTATION = 500; // Updated from 150 to 500
    this.DEFAULT_REPUTATION = 40; // All users start with 40 points
  }

  /**
   * Record a reputation action (saves to database and calls contract)
   * @param {string} userAddress - User's wallet address
   * @param {string} actionType - Action type (e.g., 'POOL_CREATED', 'ODDYSSEY_PARTICIPATION')
   * @param {string} details - Additional details about the action
   * @param {string} referenceId - Reference ID (pool_id, slip_id, etc.)
   */
  async recordAction(userAddress, actionType, details = '', referenceId = null) {
    try {
      // Get reputation points for this action
      const points = this.getReputationPointsForAction(actionType);
      
      if (points === 0) {
        console.log(`⚠️  No reputation points defined for action: ${actionType}`);
        return;
      }
      
      // Update user reputation
      const newReputation = await this.updateUserReputation(userAddress, points);
      
      // Save to reputation_actions table
      try {
        await db.query(`
          INSERT INTO core.reputation_actions (
            user_address, action_type, reputation_delta, associated_value, 
            pool_id, timestamp, block_number, transaction_hash
          ) VALUES ($1, $2, $3, $4, $5, NOW(), NULL, NULL)
        `, [userAddress, actionType, points, details, referenceId]);
      } catch (dbError) {
        console.log(`Note: Could not save to reputation_actions (table may not exist): ${dbError.message}`);
      }
      
      // Call ReputationSystem contract if available
      try {
        const reputationContractIntegration = require('../services/reputation-contract-integration');
        await reputationContractIntegration.recordActionOnChain(userAddress, actionType, points, details);
      } catch (contractError) {
        console.log(`Note: Could not record on-chain (contract integration unavailable): ${contractError.message}`);
      }
      
      console.log(`✅ Recorded ${actionType} for ${userAddress}: ${points >= 0 ? '+' : ''}${points} points (new total: ${newReputation})`);
      
      return {
        success: true,
        points: points,
        newReputation: newReputation,
        actionType: actionType
      };
      
    } catch (error) {
      console.error(`❌ Error recording reputation action for ${userAddress}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Update user reputation (integrates both BitredictPool and Oddyssey)
   */
  async updateUserReputation(userAddress, reputationDelta) {
    try {
      // Get current reputation or set default
      const result = await db.query(
        'SELECT reputation FROM core.users WHERE address = $1',
        [userAddress]
      );
      
      let currentReputation = this.DEFAULT_REPUTATION;
      if (result.rows.length > 0) {
        currentReputation = result.rows[0].reputation;
      } else {
        // Create new user with default reputation
        await db.query(
          'INSERT INTO core.users (address, reputation, joined_at) VALUES ($1, $2, NOW()) ON CONFLICT (address) DO NOTHING',
          [userAddress, this.DEFAULT_REPUTATION]
        );
      }
      
      // Calculate new reputation (bounded between 0 and MAX_REPUTATION)
      const newReputation = Math.max(0, Math.min(this.MAX_REPUTATION, currentReputation + reputationDelta));
      
      // Update reputation
      await db.query(
        'UPDATE core.users SET reputation = $1, last_active = NOW() WHERE address = $2',
        [newReputation, userAddress]
      );
      
      console.log(`Updated reputation for ${userAddress}: ${currentReputation} -> ${newReputation} (${reputationDelta >= 0 ? '+' : ''}${reputationDelta})`);
      
      // Check for new privileges based on reputation
      await this.checkReputationPrivileges(userAddress, newReputation);
      
      return newReputation;
      
    } catch (error) {
      console.error('Error updating user reputation:', error);
      throw error;
    }
  }

  /**
   * Get user reputation with detailed breakdown
   */
  async getUserReputation(userAddress) {
    try {
      // Get main reputation
      const mainResult = await db.query(
        'SELECT reputation FROM core.users WHERE address = $1',
        [userAddress]
      );
      
      const mainReputation = mainResult.rows.length > 0 ? mainResult.rows[0].reputation : this.DEFAULT_REPUTATION;
      
      // Get Oddyssey reputation from contract (if available)
      let oddysseyReputation = 0;
      try {
        const { ethers } = require('ethers');
        const config = require('../config');
        const provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
        const oddysseyContract = new ethers.Contract(
          config.blockchain.contractAddresses.oddyssey,
          ['function getOddysseyReputation(address) external view returns (uint256, uint256, uint256)'],
          provider
        );
        
        const oddysseyResult = await oddysseyContract.getOddysseyReputation(userAddress);
        oddysseyReputation = parseInt(oddysseyResult[0]);
      } catch (error) {
        console.log(`Could not fetch Oddyssey reputation for ${userAddress}:`, error.message);
      }
      
      // Get reputation breakdown from actions (if table exists)
      let breakdown = {};
      try {
        const actionsResult = await db.query(`
          SELECT action_type, SUM(CAST(reputation_delta AS INTEGER)) as total_points
          FROM core.reputation_actions 
          WHERE user_address = $1
          GROUP BY action_type
        `, [userAddress]);
        
        actionsResult.rows.forEach(row => {
          breakdown[row.action_type] = parseInt(row.total_points);
        });
      } catch (error) {
        console.log(`Reputation actions table not available: ${error.message}`);
      }
      
      return {
        totalReputation: mainReputation,
        oddysseyReputation: oddysseyReputation,
        breakdown: breakdown,
        privileges: this.getReputationPrivileges(mainReputation)
      };
      
    } catch (error) {
      console.error('Error getting user reputation:', error);
      throw error;
    }
  }

  /**
   * Check and award reputation privileges
   */
  async checkReputationPrivileges(userAddress, reputation) {
    try {
      const privileges = this.getReputationPrivileges(reputation);
      
      // Update user privileges in database
      await db.query(`
        UPDATE core.users 
        SET can_sell_predictions = $1, can_share_articles = $2, reputation_tier = $3
        WHERE address = $4
      `, [
        privileges.canSellPredictions,
        privileges.canShareArticles,
        privileges.tier,
        userAddress
      ]);
      
      // Log new privileges if any
      if (privileges.canSellPredictions || privileges.canShareArticles) {
        console.log(`🎉 New privileges unlocked for ${userAddress}:`, privileges);
      }
      
    } catch (error) {
      console.error('Error checking reputation privileges:', error);
    }
  }

  /**
   * Get reputation privileges based on score
   */
  getReputationPrivileges(reputation) {
    return {
      canSellPredictions: reputation >= 300,
      canShareArticles: reputation >= 300,
      canSetCustomPrices: reputation >= 400, // 400+ can set custom prices
      tier: this.getReputationTier(reputation),
      maxReputation: this.MAX_REPUTATION
    };
  }

  /**
   * Get reputation tier
   */
  getReputationTier(reputation) {
    if (reputation >= 400) return 'LEGENDARY';
    if (reputation >= 300) return 'EXPERT';
    if (reputation >= 200) return 'VETERAN';
    if (reputation >= 100) return 'REGULAR';
    if (reputation >= 40) return 'ACTIVE';
    return 'NEWCOMER';
  }

  /**
   * Get reputation points for BitredictPool actions
   */
  getBitredictPoolReputationPoints(action) {
    const actions = {
      0: 4,   // POOL_CREATED
      1: 8,   // POOL_FILLED_ABOVE_60
      2: -15, // POOL_SPAMMED
      3: 8,   // BET_WON_HIGH_VALUE (5x+ odds)
      4: 12,  // OUTCOME_PROPOSED_CORRECTLY
      5: -20, // OUTCOME_PROPOSED_INCORRECTLY
      6: 10,  // CHALLENGE_SUCCESSFUL
      7: -12  // CHALLENGE_FAILED
    };
    return actions[action] || 0;
  }

  /**
   * Get reputation points for new actions
   */
  getReputationPointsForAction(actionType, value = null) {
    const actionPoints = {
      // BitredictPool actions
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
      
      // Oddyssey actions (reduced points)
      'ODDYSSEY_PARTICIPATION': 1,
      'ODDYSSEY_QUALIFYING': 3,
      'ODDYSSEY_EXCELLENT': 4,
      'ODDYSSEY_OUTSTANDING': 6,
      'ODDYSSEY_PERFECT': 8,
      'ODDYSSEY_WINNER': 10,
      'ODDYSSEY_CHAMPION': 15
    };
    
    return actionPoints[actionType] || 0;
  }

  /**
   * Get reputation points for Oddyssey actions
   */
  getOddysseyReputationPoints(correctPredictions, isWinner = false, isChampion = false) {
    let points = 0;
    
    // Base points for correct predictions
    if (correctPredictions >= 7) points = 3;  // Qualifying
    if (correctPredictions >= 8) points = 4;  // Excellent
    if (correctPredictions >= 9) points = 6;  // Outstanding
    if (correctPredictions === 10) points = 8; // Perfect score
    
    // Winner bonus (top 5 in cycle)
    if (isWinner) points += 10;
    
    // Champion bonus (can be earned only once)
    if (isChampion) points += 15;
    
    // Minimum points for participation
    if (points === 0) points = 1;
    
    return points;
  }
}

module.exports = new ReputationManager(); 