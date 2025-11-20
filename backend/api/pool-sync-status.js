const express = require('express');
const router = express.Router();
const EnhancedPoolSyncService = require('../services/event-driven-pool-sync');

const poolSyncService = new EnhancedPoolSyncService();

/**
 * GET /api/pool-sync/status
 * Get pool synchronization status
 */
router.get('/status', async (req, res) => {
  try {
    await poolSyncService.initialize();
    
    const status = poolSyncService.getStatus();
    const syncStats = await poolSyncService.getSyncStats();
    
    res.json({
      success: true,
      data: {
        service: status,
        synchronization: syncStats,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Error getting pool sync status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get pool sync status',
      message: error.message
    });
  }
});

/**
 * POST /api/pool-sync/manual
 * Trigger manual pool synchronization
 */
router.post('/manual', async (req, res) => {
  try {
    const { poolId } = req.body;
    
    await poolSyncService.initialize();
    
    if (poolId !== undefined) {
      // Sync specific pool
      const result = await poolSyncService.syncPool(poolId);
      res.json({
        success: true,
        data: {
          action: 'single_pool_sync',
          poolId: poolId,
          result: result,
          timestamp: new Date().toISOString()
        }
      });
    } else {
      // Sync all pools
      await poolSyncService.syncAllPools();
      const syncStats = await poolSyncService.getSyncStats();
      
      res.json({
        success: true,
        data: {
          action: 'full_sync',
          result: syncStats,
          timestamp: new Date().toISOString()
        }
      });
    }
  } catch (error) {
    console.error('❌ Error in manual pool sync:', error);
    res.status(500).json({
      success: false,
      error: 'Manual pool sync failed',
      message: error.message
    });
  }
});

/**
 * GET /api/pool-sync/stats
 * Get detailed synchronization statistics
 */
router.get('/stats', async (req, res) => {
  try {
    await poolSyncService.initialize();
    const syncStats = await poolSyncService.getSyncStats();
    
    res.json({
      success: true,
      data: syncStats,
      meta: {
        timestamp: new Date().toISOString(),
        service: 'EnhancedPoolSyncService'
      }
    });
  } catch (error) {
    console.error('❌ Error getting pool sync stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get pool sync stats',
      message: error.message
    });
  }
});

module.exports = router;
