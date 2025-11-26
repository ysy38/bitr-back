const express = require('express');
const router = express.Router();
const masterCron = require('../cron/master-consolidated-cron');
const cronCoordinator = require('../services/cron-coordinator');
const { adminAuth } = require('../utils/admin-auth');

// Get system status
router.get('/status', async (req, res) => {
  try {
    const status = masterCron.getStatus();
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('Error getting coordination status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get coordination status',
      error: error.message
    });
  }
});

// Health endpoint removed - use /api/unified-stats/health instead

// Manual job trigger endpoint
router.post('/trigger/:jobName', ...adminAuth(), async (req, res) => {
  try {
    const { jobName } = req.params;

    await masterCron.triggerJob(jobName);
    
    res.json({
      success: true,
      message: `Job ${jobName} triggered successfully`
    });
  } catch (error) {
    console.error(`Error triggering job ${req.params.jobName}:`, error);
    res.status(500).json({
      success: false,
      message: `Failed to trigger job ${req.params.jobName}`,
      error: error.message
    });
  }
});

// Emergency restart endpoint
router.post('/emergency/restart', ...adminAuth(), async (req, res) => {
  try {

    // Start restart in background to avoid request timeout
    setImmediate(async () => {
      try {
        await masterCron.stop();
        await masterCron.initialize();
        console.log('✅ Master consolidated cron restarted successfully');
      } catch (error) {
        console.error('❌ Failed to restart master consolidated cron:', error);
      }
    });
    
    res.json({
      success: true,
      message: 'Master consolidated cron restart initiated'
    });
  } catch (error) {
    console.error('Error initiating restart:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initiate restart',
      error: error.message
    });
  }
});

// Get specific job execution history
router.get('/history/:jobName', async (req, res) => {
  try {
    const { jobName } = req.params;
    const { limit = 20 } = req.query;
    
    const history = await cronCoordinator.getExecutionHistory(jobName, parseInt(limit));
    
    res.json({
      success: true,
      data: {
        jobName,
        history
      }
    });
  } catch (error) {
    console.error('Error getting job execution history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get job execution history',
      error: error.message
    });
  }
});

// Force release specific lock
router.post('/locks/:jobName/release', async (req, res) => {
  try {
    const { jobName } = req.params;
    const result = await cronCoordinator.forceReleaseLock(jobName);
    
    res.json({
      success: true,
      message: result ? 'Lock released successfully' : 'No lock found for job',
      data: { jobName, released: result }
    });
  } catch (error) {
    console.error('Error releasing lock:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to release lock',
      error: error.message
    });
  }
});

// Check if specific job is locked
router.get('/locks/:jobName/status', async (req, res) => {
  try {
    const { jobName } = req.params;
    const isLocked = await cronCoordinator.isLocked(jobName);
    
    res.json({
      success: true,
      data: {
        jobName,
        isLocked,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error checking lock status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check lock status',
      error: error.message
    });
  }
});

module.exports = router;