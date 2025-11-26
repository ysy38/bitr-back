#!/usr/bin/env node

/**
 * Enhanced Airdrop Service
 * Manages airdrop snapshots, eligibility, and reward distribution
 * Integrates with analytics data for comprehensive airdrop management
 */

require('dotenv').config();
const db = require('../db/db');

class EnhancedAirdropService {
  constructor() {
    this.isRunning = false;
  }

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('🎁 Enhanced Airdrop Service started');
  }

  async stop() {
    this.isRunning = false;
    console.log('🛑 Enhanced Airdrop Service stopped');
  }

  /**
   * Create a new airdrop snapshot
   */
  async createSnapshot(snapshotName, blockNumber, timestamp) {
    try {
      console.log(`📸 Creating airdrop snapshot: ${snapshotName}`);

      // Get eligible users from analytics
      const eligibleUsers = await this.getEligibleUsers();
      
      const totalEligibleBitr = eligibleUsers.reduce((sum, user) => sum + user.bitr_balance, 0);

      const result = await db.query(`
        INSERT INTO airdrop.snapshots (
          snapshot_name, snapshot_block, snapshot_timestamp,
          total_eligible_wallets, total_eligible_bitr, created_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
        RETURNING id
      `, [snapshotName, blockNumber, timestamp, eligibleUsers.length, totalEligibleBitr]);

      const snapshotId = result.rows[0].id;

      // Create snapshot balances for eligible users
      for (const user of eligibleUsers) {
        const airdropAmount = this.calculateAirdropAmount(user.bitr_balance, user.activity_score);
        
        await db.query(`
          INSERT INTO airdrop.snapshot_balances (
            snapshot_id, user_address, bitr_balance, airdrop_amount, is_eligible, created_at
          ) VALUES ($1, $2, $3, $4, $5, NOW())
        `, [snapshotId, user.user_address, user.bitr_balance, airdropAmount, true]);
      }

      // Update airdrop statistics
      await this.updateAirdropStatistics(snapshotId, eligibleUsers.length, totalEligibleBitr);

      console.log(`✅ Created snapshot ${snapshotName} with ${eligibleUsers.length} eligible users`);
      return snapshotId;
    } catch (error) {
      console.error('❌ Failed to create airdrop snapshot:', error);
      throw error;
    }
  }

  /**
   * Get eligible users for airdrop
   */
  async getEligibleUsers() {
    try {
      const result = await db.query(`
        SELECT 
          ua.user_address,
          COALESCE(ua.total_staked, 0) as bitr_balance,
          COALESCE(ua.total_bets, 0) as activity_score,
          COALESCE(uss.social_score, 0) as social_score,
          COALESCE(ua.win_rate, 0) as performance_score
        FROM analytics.user_analytics ua
        LEFT JOIN analytics.user_social_stats uss ON ua.user_address = uss.user_address
        WHERE ua.total_bets > 0 OR ua.total_staked > 0
        ORDER BY (ua.total_staked + ua.total_bets * 10 + COALESCE(uss.social_score, 0)) DESC
      `);

      return result.rows.map(user => ({
        user_address: user.user_address,
        bitr_balance: user.bitr_balance,
        activity_score: user.activity_score,
        social_score: user.social_score,
        performance_score: user.performance_score
      }));
    } catch (error) {
      console.error('❌ Failed to get eligible users:', error);
      throw error;
    }
  }

  /**
   * Calculate airdrop amount based on user metrics
   */
  calculateAirdropAmount(bitrBalance, activityScore) {
    const baseAmount = Math.max(bitrBalance * 0.1, 100); // 10% of balance, minimum 100
    const activityMultiplier = Math.min(1 + (activityScore / 100), 2); // Up to 2x multiplier
    const socialMultiplier = 1.1; // 10% bonus for social activity
    
    return Math.floor(baseAmount * activityMultiplier * socialMultiplier);
  }

  /**
   * Update airdrop statistics
   */
  async updateAirdropStatistics(snapshotId, eligibleUsers, totalEligibleBitr) {
    try {
      const stats = [
        { metric_name: 'total_snapshots', metric_value: 1, description: 'Total airdrop snapshots taken' },
        { metric_name: 'total_eligible_users', metric_value: eligibleUsers, description: 'Total users eligible for airdrop' },
        { metric_name: 'total_eligible_bitr', metric_value: totalEligibleBitr, description: 'Total BITR eligible for airdrop' },
        { metric_name: 'average_airdrop_per_user', metric_value: Math.floor(totalEligibleBitr * 0.1 / eligibleUsers), description: 'Average airdrop amount per user' }
      ];

      for (const stat of stats) {
        await db.query(`
          INSERT INTO airdrop.statistics (
            metric_name, metric_value, description, created_at, updated_at
          ) VALUES ($1, $2, $3, NOW(), NOW())
          ON CONFLICT (metric_name) DO UPDATE SET
            metric_value = EXCLUDED.metric_value,
            description = EXCLUDED.description,
            updated_at = NOW()
        `, [stat.metric_name, stat.metric_value, stat.description]);
      }
    } catch (error) {
      console.error('❌ Failed to update airdrop statistics:', error);
      throw error;
    }
  }

  /**
   * Track staking activities
   */
  async trackStakingActivity(userAddress, actionType, amount, tierId, durationOption, txHash, blockNumber, timestamp) {
    try {
      await db.query(`
        INSERT INTO airdrop.staking_activities (
          user_address, action_type, amount, tier_id, duration_option,
          transaction_hash, block_number, timestamp, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      `, [userAddress, actionType, amount, tierId, durationOption, txHash, blockNumber, timestamp]);

      // Update user eligibility based on staking activity
      await this.updateUserEligibility(userAddress);
    } catch (error) {
      console.error('❌ Failed to track staking activity:', error);
      throw error;
    }
  }

  /**
   * Track transfer patterns for airdrop eligibility
   */
  async trackTransferPattern(fromAddress, toAddress, amount, txHash, blockNumber, timestamp) {
    try {
      const isSuspicious = await this.analyzeTransferPattern(fromAddress, toAddress, amount);

      await db.query(`
        INSERT INTO airdrop.transfer_patterns (
          from_address, to_address, amount, transaction_hash, block_number,
          timestamp, is_suspicious, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      `, [fromAddress, toAddress, amount, txHash, blockNumber, timestamp, isSuspicious]);

      if (isSuspicious) {
        console.log(`⚠️ Suspicious transfer detected: ${fromAddress} -> ${toAddress} (${amount} BITR)`);
      }
    } catch (error) {
      console.error('❌ Failed to track transfer pattern:', error);
      throw error;
    }
  }

  /**
   * Analyze transfer pattern for suspicious activity
   */
  async analyzeTransferPattern(fromAddress, toAddress, amount) {
    try {
      // Check for rapid transfers (potential wash trading)
      const recentTransfers = await db.query(`
        SELECT COUNT(*) as transfer_count
        FROM airdrop.transfer_patterns
        WHERE (from_address = $1 OR to_address = $1)
        AND timestamp >= NOW() - INTERVAL '1 hour'
      `, [fromAddress]);

      if (recentTransfers.rows[0].transfer_count > 10) {
        return true; // Suspicious: too many transfers in short time
      }

      // Check for round number transfers (potential bot activity)
      if (amount % 1000 === 0 && amount > 10000) {
        return true; // Suspicious: large round number transfer
      }

      // Check for self-transfers
      if (fromAddress === toAddress) {
        return true; // Suspicious: self-transfer
      }

      return false;
    } catch (error) {
      console.error('❌ Failed to analyze transfer pattern:', error);
      return false;
    }
  }

  /**
   * Update user eligibility based on activity
   */
  async updateUserEligibility(userAddress) {
    try {
      // Get user's total activity score
      const activityResult = await db.query(`
        SELECT 
          COALESCE(ua.total_bets, 0) as betting_activity,
          COALESCE(ua.total_staked, 0) as staking_activity,
          COALESCE(uss.social_score, 0) as social_activity,
          COUNT(sa.id) as staking_events
        FROM analytics.user_analytics ua
        LEFT JOIN analytics.user_social_stats uss ON ua.user_address = uss.user_address
        LEFT JOIN airdrop.staking_activities sa ON ua.user_address = sa.user_address
        WHERE ua.user_address = $1
        GROUP BY ua.user_address, ua.total_bets, ua.total_staked, uss.social_score
      `, [userAddress]);

      if (activityResult.rows.length === 0) return;

      const activity = activityResult.rows[0];
      const totalScore = activity.betting_activity + activity.staking_activity + activity.social_activity + activity.staking_events * 10;
      const isEligible = totalScore >= 100; // Minimum activity threshold

      await db.query(`
        INSERT INTO airdrop.eligibility (
          user_address, is_eligible, activity_score, last_updated, created_at
        ) VALUES ($1, $2, $3, NOW(), NOW())
        ON CONFLICT (user_address) DO UPDATE SET
          is_eligible = EXCLUDED.is_eligible,
          activity_score = EXCLUDED.activity_score,
          last_updated = NOW()
      `, [userAddress, isEligible, totalScore]);
    } catch (error) {
      console.error('❌ Failed to update user eligibility:', error);
      throw error;
    }
  }

  /**
   * Get airdrop statistics
   */
  async getAirdropStatistics() {
    try {
      const result = await db.query(`
        SELECT 
          metric_name, metric_value, description, updated_at
        FROM airdrop.statistics
        ORDER BY metric_name
      `);

      return result.rows;
    } catch (error) {
      console.error('❌ Failed to get airdrop statistics:', error);
      throw error;
    }
  }

  /**
   * Get user eligibility status
   */
  async getUserEligibility(userAddress) {
    try {
      const result = await db.query(`
        SELECT 
          e.is_eligible, e.activity_score, e.last_updated,
          ua.total_bets, ua.total_staked, ua.win_rate,
          uss.social_score
        FROM airdrop.eligibility e
        LEFT JOIN analytics.user_analytics ua ON e.user_address = ua.user_address
        LEFT JOIN analytics.user_social_stats uss ON e.user_address = uss.user_address
        WHERE e.user_address = $1
      `, [userAddress]);

      return result.rows[0] || null;
    } catch (error) {
      console.error('❌ Failed to get user eligibility:', error);
      throw error;
    }
  }

  /**
   * Get airdrop leaderboard
   */
  async getAirdropLeaderboard(limit = 50) {
    try {
      const result = await db.query(`
        SELECT 
          e.user_address,
          e.activity_score,
          e.is_eligible,
          ua.total_bets,
          ua.total_staked,
          ua.win_rate,
          uss.social_score,
          ROW_NUMBER() OVER (ORDER BY e.activity_score DESC) as rank
        FROM airdrop.eligibility e
        LEFT JOIN analytics.user_analytics ua ON e.user_address = ua.user_address
        LEFT JOIN analytics.user_social_stats uss ON e.user_address = uss.user_address
        WHERE e.is_eligible = true
        ORDER BY e.activity_score DESC
        LIMIT $1
      `, [limit]);

      return result.rows;
    } catch (error) {
      console.error('❌ Failed to get airdrop leaderboard:', error);
      throw error;
    }
  }

  /**
   * Get transfer pattern analysis
   */
  async getTransferPatternAnalysis() {
    try {
      const result = await db.query(`
        SELECT 
          COUNT(*) as total_transfers,
          COUNT(CASE WHEN is_suspicious = true THEN 1 END) as suspicious_transfers,
          SUM(amount) as total_volume,
          AVG(amount) as avg_transfer_amount,
          COUNT(DISTINCT from_address) as unique_senders,
          COUNT(DISTINCT to_address) as unique_receivers
        FROM airdrop.transfer_patterns
        WHERE timestamp >= NOW() - INTERVAL '7 days'
      `);

      return result.rows[0];
    } catch (error) {
      console.error('❌ Failed to get transfer pattern analysis:', error);
      throw error;
    }
  }

  /**
   * Get staking activity summary
   */
  async getStakingActivitySummary() {
    try {
      const result = await db.query(`
        SELECT 
          action_type,
          COUNT(*) as event_count,
          SUM(amount) as total_amount,
          AVG(amount) as avg_amount,
          COUNT(DISTINCT user_address) as unique_users
        FROM airdrop.staking_activities
        WHERE timestamp >= NOW() - INTERVAL '30 days'
        GROUP BY action_type
        ORDER BY total_amount DESC
      `);

      return result.rows;
    } catch (error) {
      console.error('❌ Failed to get staking activity summary:', error);
      throw error;
    }
  }

  /**
   * Process all airdrop data (called periodically)
   */
  async processAirdropData() {
    try {
      console.log('🔄 Processing airdrop data...');

      // Update all user eligibilities
      const usersResult = await db.query(`
        SELECT DISTINCT user_address FROM analytics.user_analytics
        WHERE user_address IS NOT NULL
      `);

      for (const user of usersResult.rows) {
        await this.updateUserEligibility(user.user_address);
      }

      // Update summary statistics
      await this.updateSummaryStatistics();

      console.log(`✅ Processed airdrop data for ${usersResult.rows.length} users`);
    } catch (error) {
      console.error('❌ Failed to process airdrop data:', error);
      throw error;
    }
  }

  /**
   * Update summary statistics
   */
  async updateSummaryStatistics() {
    try {
      const stats = await db.query(`
        SELECT 
          COUNT(DISTINCT user_address) as total_eligible_users,
          AVG(activity_score) as avg_activity_score,
          COUNT(CASE WHEN is_eligible = true THEN 1 END) as eligible_count
        FROM airdrop.eligibility
      `);

      const summaryStats = [
        { metric_name: 'total_eligible_users', metric_value: stats.rows[0].total_eligible_users, description: 'Total users with eligibility data' },
        { metric_name: 'avg_activity_score', metric_value: Math.floor(stats.rows[0].avg_activity_score || 0), description: 'Average activity score across all users' },
        { metric_name: 'eligible_users_count', metric_value: stats.rows[0].eligible_count, description: 'Number of users currently eligible for airdrop' }
      ];

      for (const stat of summaryStats) {
        await db.query(`
          INSERT INTO airdrop.summary_stats (
            metric_name, metric_value, description, created_at, updated_at
          ) VALUES ($1, $2, $3, NOW(), NOW())
          ON CONFLICT (metric_name) DO UPDATE SET
            metric_value = EXCLUDED.metric_value,
            description = EXCLUDED.description,
            updated_at = NOW()
        `, [stat.metric_name, stat.metric_value, stat.description]);
      }
    } catch (error) {
      console.error('❌ Failed to update summary statistics:', error);
      throw error;
    }
  }
}

module.exports = EnhancedAirdropService;