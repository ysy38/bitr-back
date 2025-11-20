/**
 * AUTO-REFUND SERVICE
 * Automatically refunds pools after arbitration deadline expires when no bets were placed
 */

const db = require('../db/db');
const { ethers } = require('ethers');
const config = require('../config');

class AutoRefundService {
  constructor() {
    this.isRunning = false;
    this.checkInterval = 60000; // Check every minute
  }

  async initialize() {
    console.log('🔄 AutoRefundService: Initializing...');
    this.isRunning = true;
    this.startAutoRefund();
  }

  startAutoRefund() {
    console.log('🔄 AutoRefundService: Starting auto-refund check loop');
    
    setInterval(async () => {
      try {
        await this.checkAndProcessRefunds();
      } catch (error) {
        console.error('❌ AutoRefundService: Error in check loop:', error.message);
      }
    }, this.checkInterval);
    
    // Run immediately on startup
    this.checkAndProcessRefunds();
  }

  /**
   * Check for pools eligible for refund
   */
  async checkAndProcessRefunds() {
    try {
      const now = Math.floor(Date.now() / 1000);
      
      // Find pools that:
      // 1. Have no bets (total_bettor_stake = 0)
      // 2. Are not settled yet (is_settled = false)
      // 3. Have passed arbitration deadline
      // 4. Are not already refunded (status != 'refunded')
      const result = await db.query(`
        SELECT 
          pool_id,
          creator_address,
          creator_stake,
          arbitration_deadline,
          status
        FROM oracle.pools
        WHERE total_bettor_stake = 0
          AND is_settled = false
          AND arbitration_deadline IS NOT NULL
          AND arbitration_deadline < $1
          AND status != 'refunded'
        ORDER BY arbitration_deadline ASC
      `, [now]);
      
      if (result.rows.length === 0) {
        // No refunds needed
        return;
      }
      
      console.log(`🔍 AutoRefundService: Found ${result.rows.length} pools eligible for refund`);
      
      // Process each refundable pool
      for (const pool of result.rows) {
        await this.processPoolRefund(pool, now);
      }
      
    } catch (error) {
      console.error('❌ AutoRefundService: Error checking refunds:', error.message);
    }
  }

  /**
   * Process refund for a single pool
   */
  async processPoolRefund(pool, now) {
    try {
      const hoursOverdue = Math.floor((now - pool.arbitration_deadline) / 3600);
      console.log(`💰 Processing refund for Pool ${pool.pool_id}:`);
      console.log(`   Creator: ${pool.creator_address}`);
      console.log(`   Stake: ${ethers.formatEther(pool.creator_stake)} BITR`);
      console.log(`   Arbitration ended: ${hoursOverdue} hours ago`);
      
      // Record refund in database
      await db.query(`
        INSERT INTO oracle.pool_refunds (
          pool_id,
          reason,
          refunded_at
        ) VALUES ($1, $2, NOW())
        ON CONFLICT (pool_id) DO NOTHING
      `, [
        pool.pool_id,
        'Automatic refund - no bets, arbitration expired'
      ]);
      
      // Update pool status to refunded
      await db.query(`
        UPDATE oracle.pools 
        SET status = 'refunded', updated_at = NOW()
        WHERE pool_id = $1
      `, [pool.pool_id]);
      
      console.log(`✅ Pool ${pool.pool_id} marked as refunded`);
      
      // TODO: Call smart contract refundPool function
      // await this.callRefundOnContract(pool.pool_id, pool.creator_address);
      
    } catch (error) {
      console.error(`❌ Error processing refund for pool ${pool.pool_id}:`, error.message);
    }
  }

  /**
   * Call contract refund function (when implemented)
   */
  async callRefundOnContract(poolId, creatorAddress) {
    try {
      console.log(`📝 Calling refundPool on contract for pool ${poolId}...`);
      
      // Initialize Web3Service for contract interaction
      const Web3Service = require('./web3-service');
      const web3Service = new Web3Service();
      
      // TODO: Implement contract refund call
      // const tx = await web3Service.refundPool(poolId);
      
      console.log(`✅ Refund transaction submitted for pool ${poolId}`);
    } catch (error) {
      console.error(`❌ Contract refund failed for pool ${poolId}:`, error.message);
    }
  }

  stop() {
    this.isRunning = false;
    console.log('🛑 AutoRefundService: Stopped');
  }
}

module.exports = new AutoRefundService();
