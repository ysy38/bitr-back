/**
 * Slips API - Frontend Integration
 * 
 * Provides optimized slip endpoints for frontend consumption
 * Uses UnifiedSlipService for contract-direct fetching with Redis caching
 */

const express = require('express');
const router = express.Router();
const UnifiedSlipService = require('../services/unified-slip-service');

// Initialize the unified slip service
const slipService = new UnifiedSlipService();
let serviceInitialized = false;

// Initialize service on first request
async function ensureServiceInitialized() {
  if (!serviceInitialized) {
    await slipService.initialize();
    serviceInitialized = true;
  }
}

/**
 * GET /api/slips/:slipId
 * Get a single slip by ID
 */
router.get('/:slipId', async (req, res) => {
  try {
    await ensureServiceInitialized();
    
    const { slipId } = req.params;
    
    if (!slipId || isNaN(slipId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid slip ID'
      });
    }

    const slip = await slipService.getSlip(parseInt(slipId));
    
    if (!slip) {
      return res.status(404).json({
        success: false,
        error: 'Slip not found'
      });
    }

    res.json({
      success: true,
      data: slip,
      meta: {
        source: 'unified_slip_service',
        cached: slip._cached || false,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error fetching slip:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch slip',
      details: error.message
    });
  }
});

/**
 * GET /api/slips/user/:userAddress/cycle/:cycleId
 * Get all slips for a user in a specific cycle
 */
router.get('/user/:userAddress/cycle/:cycleId', async (req, res) => {
  try {
    await ensureServiceInitialized();
    
    const { userAddress, cycleId } = req.params;
    
    if (!userAddress || !cycleId || isNaN(cycleId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user address or cycle ID'
      });
    }

    const slips = await slipService.getUserSlipsForCycle(userAddress, parseInt(cycleId));
    
    res.json({
      success: true,
      data: slips,
      count: slips.length,
      meta: {
        userAddress,
        cycleId: parseInt(cycleId),
        source: 'unified_slip_service',
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error fetching user slips:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user slips',
      details: error.message
    });
  }
});

/**
 * GET /api/slips/user/:userAddress
 * Get all slips for a user across all cycles (with pagination)
 */
router.get('/user/:userAddress', async (req, res) => {
  try {
    await ensureServiceInitialized();
    
    const { userAddress } = req.params;
    const { limit = 20, offset = 0, cycleId } = req.query;
    
    if (!userAddress) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user address'
      });
    }

    // If specific cycle requested, use the cycle-specific method
    if (cycleId) {
      const slips = await slipService.getUserSlipsForCycle(userAddress, parseInt(cycleId));
      return res.json({
        success: true,
        data: slips,
        count: slips.length,
        meta: {
          userAddress,
          cycleId: parseInt(cycleId),
          source: 'unified_slip_service',
          timestamp: new Date().toISOString()
        }
      });
    }

    // For all cycles, we need to query the database for pagination
    const db = require('../db/db');
    const result = await db.query(`
      SELECT 
        slip_id, cycle_id, player_address, placed_at, 
        predictions, final_score, correct_count, is_evaluated
      FROM oracle.oddyssey_slips 
      WHERE player_address = $1 
      ORDER BY placed_at DESC 
      LIMIT $2 OFFSET $3
    `, [userAddress, parseInt(limit), parseInt(offset)]);

    const totalResult = await db.query(`
      SELECT COUNT(*) as total 
      FROM oracle.oddyssey_slips 
      WHERE player_address = $1
    `, [userAddress]);

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
      total: parseInt(totalResult.rows[0].total),
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: (parseInt(offset) + result.rows.length) < parseInt(totalResult.rows[0].total)
      },
      meta: {
        userAddress,
        source: 'database_with_contract_sync',
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error fetching user slips:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user slips',
      details: error.message
    });
  }
});

/**
 * GET /api/slips/recent
 * Get recent slips across all users (for leaderboards, activity feeds)
 */
router.get('/recent', async (req, res) => {
  try {
    const { limit = 10, evaluated = null } = req.query;
    
    const db = require('../db/db');
    let query = `
      SELECT 
        slip_id, cycle_id, player_address, placed_at, 
        predictions, final_score, correct_count, is_evaluated
      FROM oracle.oddyssey_slips 
    `;
    
    const params = [];
    if (evaluated !== null) {
      query += ` WHERE is_evaluated = $1`;
      params.push(evaluated === 'true');
    }
    
    query += ` ORDER BY placed_at DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit));

    const result = await db.query(query, params);

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
      meta: {
        filter: evaluated ? `evaluated: ${evaluated}` : 'all',
        source: 'database',
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error fetching recent slips:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch recent slips',
      details: error.message
    });
  }
});

/**
 * GET /api/slips/stats
 * Get slip statistics for dashboards
 */
router.get('/stats', async (req, res) => {
  try {
    const db = require('../db/db');
    
    const stats = await db.query(`
      SELECT 
        COUNT(*) as total_slips,
        COUNT(DISTINCT player_address) as unique_players,
        COUNT(CASE WHEN is_evaluated THEN 1 END) as evaluated_slips,
        AVG(CASE WHEN is_evaluated THEN correct_count END) as avg_correct_predictions,
        MAX(CASE WHEN is_evaluated THEN correct_count END) as max_correct_predictions,
        COUNT(CASE WHEN is_evaluated AND correct_count = 5 THEN 1 END) as perfect_slips
      FROM oracle.oddyssey_slips
    `);

    const recentActivity = await db.query(`
      SELECT DATE(placed_at) as date, COUNT(*) as slips_count
      FROM oracle.oddyssey_slips 
      WHERE placed_at >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY DATE(placed_at)
      ORDER BY date DESC
    `);

    res.json({
      success: true,
      data: {
        overview: stats.rows[0],
        recentActivity: recentActivity.rows
      },
      meta: {
        source: 'database',
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error fetching slip stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch slip statistics',
      details: error.message
    });
  }
});

module.exports = router;
