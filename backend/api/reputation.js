const express = require('express');
const router = express.Router();
const db = require('../db/db');
const reputationManager = require('../utils/reputationManager');
const badgeManager = require('../utils/badgeManager');

/**
 * Reputation API Routes
 * Provides reputation data, leaderboards, and badge information
 */

/**
 * GET /api/reputation/user/:address
 * Get comprehensive reputation data for a user
 */
router.get('/user/:address', async (req, res) => {
  try {
    const { address } = req.params;
    
    // Validate address format
    if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid wallet address format' 
      });
    }
    
    const normalizedAddress = address.toLowerCase();
    
    // Get reputation data from reputationManager
    const reputationData = await reputationManager.getUserReputation(normalizedAddress);
    
    // Get user badges
    let badges = [];
    try {
      badges = await badgeManager.getCurrentBadges(normalizedAddress);
    } catch (badgeError) {
      console.log('Could not fetch badges:', badgeError.message);
    }
    
    // Get reputation history
    let history = [];
    try {
      const historyResult = await db.query(`
        SELECT 
          action_type,
          reputation_delta as points,
          associated_value as description,
          timestamp,
          transaction_hash
        FROM core.reputation_actions
        WHERE user_address = $1
        ORDER BY timestamp DESC
        LIMIT 50
      `, [normalizedAddress]);
      
      history = historyResult.rows.map(row => ({
        type: row.action_type,
        points: parseInt(row.points) || 0,
        description: row.description || '',
        timestamp: row.timestamp,
        transactionHash: row.transaction_hash
      }));
    } catch (historyError) {
      console.log('Could not fetch history:', historyError.message);
    }
    
    // Calculate tier based on reputation
    const getReputationTier = (reputation) => {
      if (reputation >= 400) return 'LEGENDARY';
      if (reputation >= 300) return 'EXPERT';
      if (reputation >= 200) return 'VETERAN';
      if (reputation >= 100) return 'REGULAR';
      if (reputation >= 40) return 'ACTIVE';
      return 'NEWCOMER';
    };
    
    // Calculate privileges
    const getPrivileges = (reputation) => {
      const privileges = [];
      if (reputation >= 0) privileges.push('place_bets');
      if (reputation >= 40) privileges.push('create_guided_markets');
      if (reputation >= 100) {
        privileges.push('create_open_markets');
        privileges.push('propose_outcomes');
      }
      if (reputation >= 300) {
        privileges.push('sell_predictions');
        privileges.push('share_articles');
      }
      if (reputation >= 400) {
        privileges.push('set_custom_prices');
      }
      return privileges;
    };
    
    const reputation = reputationData.mainReputation || 40;
    
    const response = {
      success: true,
      data: {
        address: normalizedAddress,
        reputation: reputation,
        tier: getReputationTier(reputation),
        privileges: getPrivileges(reputation),
        canCreateGuided: reputation >= 40,
        canCreateOpen: reputation >= 100,
        canPropose: reputation >= 100,
        canSellPredictions: reputation >= 300,
        canShareArticles: reputation >= 300,
        badges: badges,
        history: history,
        breakdown: reputationData.breakdown || {},
        lastUpdated: new Date().toISOString()
      }
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error fetching user reputation:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch user reputation',
      details: error.message
    });
  }
});

/**
 * GET /api/reputation/leaderboard
 * Get reputation leaderboard
 */
router.get('/leaderboard', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    
    const result = await db.query(`
      SELECT 
        address,
        reputation,
        total_bets,
        won_bets,
        total_pools_created,
        joined_at
      FROM core.users
      WHERE reputation > 0
      ORDER BY reputation DESC, total_bets DESC
      LIMIT $1
    `, [Math.min(limit, 500)]);
    
    const leaderboard = result.rows.map((user, index) => ({
      rank: index + 1,
      address: user.address,
      reputation: parseInt(user.reputation) || 40,
      total_bets: parseInt(user.total_bets) || 0,
      won_bets: parseInt(user.won_bets) || 0,
      total_pools_created: parseInt(user.total_pools_created) || 0,
      joined_at: user.joined_at
    }));
    
    res.json({
      success: true,
      data: leaderboard,
      total: leaderboard.length
    });
  } catch (error) {
    console.error('Error fetching reputation leaderboard:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch reputation leaderboard' 
    });
  }
});

/**
 * GET /api/reputation/stats
 * Get platform-wide reputation statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await db.query(`
      SELECT 
        COUNT(*) as total_users,
        AVG(reputation) as avg_reputation,
        MAX(reputation) as max_reputation,
        MIN(reputation) as min_reputation,
        COUNT(CASE WHEN reputation >= 300 THEN 1 END) as expert_users,
        COUNT(CASE WHEN reputation >= 100 THEN 1 END) as regular_plus_users
      FROM core.users
      WHERE reputation > 0
    `);
    
    res.json({
      success: true,
      data: {
        total_users: parseInt(stats.rows[0].total_users) || 0,
        avg_reputation: parseFloat(stats.rows[0].avg_reputation) || 40,
        max_reputation: parseInt(stats.rows[0].max_reputation) || 40,
        min_reputation: parseInt(stats.rows[0].min_reputation) || 40,
        expert_users: parseInt(stats.rows[0].expert_users) || 0,
        regular_plus_users: parseInt(stats.rows[0].regular_plus_users) || 0
      }
    });
  } catch (error) {
    console.error('Error fetching reputation stats:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch reputation stats' 
    });
  }
});

module.exports = router;

