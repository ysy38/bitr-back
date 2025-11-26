const express = require('express');
const router = express.Router();
const notificationService = require('../services/notification-service');

/**
 * GET /api/notifications
 * Get user notifications
 */
router.get('/', async (req, res) => {
  try {
    const { address } = req.query;
    
    if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Valid wallet address required' 
      });
    }

    const { limit = 50, offset = 0, unreadOnly = false } = req.query;
    
    const notifications = await notificationService.getUserNotifications(address, {
      limit: parseInt(limit),
      offset: parseInt(offset),
      unreadOnly: unreadOnly === 'true'
    });

    const unreadCount = await notificationService.getUnreadCount(address);

    res.json({
      success: true,
      notifications,
      unreadCount,
      total: notifications.length
    });
  } catch (error) {
    console.error('❌ Error fetching notifications:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch notifications',
      details: error.message
    });
  }
});

/**
 * GET /api/notifications/unread-count
 * Get unread notification count
 */
router.get('/unread-count', async (req, res) => {
  try {
    const { address } = req.query;
    
    if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Valid wallet address required' 
      });
    }

    const unreadCount = await notificationService.getUnreadCount(address);

    res.json({
      success: true,
      unreadCount
    });
  } catch (error) {
    console.error('❌ Error getting unread count:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get unread count',
      details: error.message
    });
  }
});

/**
 * POST /api/notifications/:id/read
 * Mark notification as read
 */
router.post('/:id/read', async (req, res) => {
  try {
    const { id } = req.params;
    const { address } = req.body;
    
    if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Valid wallet address required' 
      });
    }

    const success = await notificationService.markAsRead(parseInt(id), address);

    res.json({ success });
  } catch (error) {
    console.error('❌ Error marking as read:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to mark as read',
      details: error.message
    });
  }
});

/**
 * POST /api/notifications/read-all
 * Mark all notifications as read
 */
router.post('/read-all', async (req, res) => {
  try {
    const { address } = req.body;
    
    if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Valid wallet address required' 
      });
    }

    const success = await notificationService.markAllAsRead(address);

    res.json({ success });
  } catch (error) {
    console.error('❌ Error marking all as read:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to mark all as read',
      details: error.message
    });
  }
});

/**
 * DELETE /api/notifications/:id
 * Delete notification
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { address } = req.body;
    
    if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Valid wallet address required' 
      });
    }

    const success = await notificationService.deleteNotification(parseInt(id), address);

    res.json({ success });
  } catch (error) {
    console.error('❌ Error deleting notification:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete notification',
      details: error.message
    });
  }
});

/**
 * DELETE /api/notifications
 * Delete all notifications
 */
router.delete('/', async (req, res) => {
  try {
    const { address } = req.body;
    
    if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Valid wallet address required' 
      });
    }

    const success = await notificationService.deleteAllNotifications(address);

    res.json({ success });
  } catch (error) {
    console.error('❌ Error deleting all notifications:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete all notifications',
      details: error.message
    });
  }
});

module.exports = router;

