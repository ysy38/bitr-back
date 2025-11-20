const express = require('express');
const router = express.Router();
const db = require('../db/db');
const { ethers } = require('ethers');

// POST /api/pools/:poolId/refund
// Refund a closed pool with no bettor stakes
router.post('/:poolId/refund', async (req, res) => {
  try {
    const { poolId } = req.params;
    const { userAddress } = req.body;
    
    if (!userAddress || !userAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid user address format' 
      });
    }
    
    if (!poolId || isNaN(poolId)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Valid pool ID is required' 
      });
    }
    
    console.log(`🔍 Processing refund for pool ${poolId} by user ${userAddress}`);
    
    // Verify pool exists and user is creator
    const poolResult = await db.query(`
      SELECT 
        pool_id,
        creator_address,
        status,
        creator_stake,
        total_bettor_stake,
        category,
        league
      FROM oracle.pools 
      WHERE pool_id = $1
    `, [poolId]);
    
    if (poolResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Pool not found' 
      });
    }
    
    const pool = poolResult.rows[0];
    
    // Verify user is pool creator
    if (pool.creator_address.toLowerCase() !== userAddress.toLowerCase()) {
      return res.status(403).json({ 
        success: false, 
        error: 'Not pool creator' 
      });
    }
    
    // Verify pool is closed
    if (pool.status !== 'closed') {
      return res.status(400).json({ 
        success: false, 
        error: 'Pool not closed' 
      });
    }
    
    // Verify no bettor stakes
    if (pool.total_bettor_stake !== '0') {
      return res.status(400).json({ 
        success: false, 
        error: 'Pool has bettor stakes' 
      });
    }
    
         // Check if refund already processed
     const existingRefund = await db.query(`
       SELECT id FROM oracle.pool_refunds 
       WHERE pool_id = $1
     `, [poolId]);
    
    if (existingRefund.rows.length > 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Refund already processed' 
      });
    }
    
    // TODO: Call smart contract refund function here
    // For now, we'll just mark it as refunded in the database
    
         // Record refund in database
     await db.query(`
       INSERT INTO oracle.pool_refunds (
         pool_id,
         reason,
         refunded_at
       ) VALUES ($1, $2, NOW())
     `, [
       poolId,
       'No bets placed - automatic refund'
     ]);
    
    // Update pool status to refunded
    await db.query(`
      UPDATE oracle.pools 
      SET status = 'refunded', updated_at = NOW()
      WHERE pool_id = $1
    `, [poolId]);
    
    console.log(`✅ Refund recorded for pool ${poolId}: ${ethers.formatEther(pool.creator_stake)} BITR`);
    
    res.json({
      success: true,
      data: {
        poolId: poolId,
        refundAmount: ethers.formatEther(pool.creator_stake),
        currency: 'BITR',
        status: 'pending',
        message: 'Refund request recorded. Smart contract call pending.'
      }
    });
    
  } catch (error) {
    console.error('❌ Error processing refund:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// GET /api/pools/refundable/:userAddress
// Get all refundable pools for a user
router.get('/refundable/:userAddress', async (req, res) => {
  try {
    const { userAddress } = req.params;
    
    if (!userAddress || !userAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid user address format' 
      });
    }
    
         const result = await db.query(`
       SELECT 
         p.pool_id,
         p.creator_stake,
         p.created_at,
         p.category,
         p.league,
         CASE WHEN pr.id IS NOT NULL THEN 'refunded' ELSE 'not_refunded' END as refund_status
       FROM oracle.pools p
       LEFT JOIN oracle.pool_refunds pr ON p.pool_id = pr.pool_id
       WHERE p.creator_address = $1 
         AND p.settled = true 
         AND p.total_bettor_stake = '0'
       ORDER BY p.created_at DESC
     `, [userAddress.toLowerCase()]);
    
    const refundablePools = result.rows.map(pool => ({
      poolId: pool.pool_id,
      creatorStake: ethers.formatEther(pool.creator_stake),
      createdAt: pool.created_at,
      category: pool.category,
      league: pool.league,
      status: pool.status,
      refundStatus: pool.refund_status
    }));
    
    const totalRefundable = refundablePools.reduce((sum, pool) => 
      sum + parseFloat(pool.creatorStake), 0
    );
    
    res.json({
      success: true,
      data: {
        pools: refundablePools,
        totalAmount: totalRefundable,
        count: refundablePools.length
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching refundable pools:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// GET /api/pools/:poolId
// Get pool details (redirects to guided-markets for full pool info)
router.get('/:poolId', async (req, res) => {
  try {
    const { poolId } = req.params;
    
    if (!poolId || isNaN(poolId)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Valid pool ID is required' 
      });
    }
    
    // Redirect to guided-markets endpoint for full pool information
    const GuidedMarketService = require('../services/guided-market-service');
    const guidedMarketService = new GuidedMarketService();
    
    try {
      const poolInfo = await guidedMarketService.getPoolInfo(parseInt(poolId));
      
      if (!poolInfo) {
        return res.status(404).json({ 
          success: false, 
          error: 'Pool not found',
          message: `The requested prediction pool with ID ${poolId} could not be found.`
        });
      }
      
      res.json({
        success: true,
        data: {
          pool: poolInfo
        }
      });
    } catch (serviceError) {
      console.error('Error fetching pool from guided market service:', serviceError);
      
      // Fallback to basic pool info
      const result = await db.query(`
        SELECT 
          pool_id,
          creator_address,
          status,
          creator_stake,
          total_bettor_stake,
          category,
          league,
          created_at,
          updated_at
        FROM oracle.pools 
        WHERE pool_id = $1
      `, [poolId]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ 
          success: false, 
          error: 'Pool not found',
          message: `The requested prediction pool with ID ${poolId} could not be found.`
        });
      }
      
      const pool = result.rows[0];
      
      res.json({
        success: true,
        data: {
          poolId: pool.pool_id,
          creatorAddress: pool.creator_address,
          status: pool.status,
          creatorStake: ethers.formatEther(pool.creator_stake),
          totalBettorStake: ethers.formatEther(pool.total_bettor_stake),
          category: pool.category,
          league: pool.league,
          createdAt: pool.created_at,
          updatedAt: pool.updated_at
        }
      });
    }
    
  } catch (error) {
    console.error('❌ Error fetching pool:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router; 