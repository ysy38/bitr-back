const db = require('../db/db');
const websocketService = require('./websocket-service');

/**
 * Notification Service
 * Handles creation, fetching, and management of user notifications
 */

class NotificationService {
  constructor() {
    this.NOTIFICATION_TYPES = {
      SLIP_EVALUATED: 'slip_evaluated',
      BET_WON: 'bet_won',
      BET_LOST: 'bet_lost',
      PRIZE_AVAILABLE: 'prize_available',
      POOL_SETTLED: 'pool_settled',
      BADGE_EARNED: 'badge_earned',
      POOL_CREATED: 'pool_created',
      SLIP_PLACED: 'slip_placed'
    };
  }

  /**
   * Create a notification
   */
  async createNotification({ userAddress, type, title, message, data = {} }) {
    try {
      const result = await db.query(`
        INSERT INTO core.notifications (
          user_address, type, title, message, data, created_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
        RETURNING *
      `, [
        userAddress.toLowerCase(),
        type,
        title,
        message,
        JSON.stringify(data)
      ]);

      const notification = result.rows[0];
      
      const formattedNotification = {
        id: notification.id,
        userAddress: notification.user_address,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        data: notification.data,
        read: notification.read,
        createdAt: notification.created_at
      };
      
      console.log(`✅ Created notification for ${userAddress}: ${type}`);
      
      // Broadcast to WebSocket
      websocketService.broadcastNotificationToUser(userAddress, formattedNotification);
      
      // Broadcast updated unread count
      const unreadCount = await this.getUnreadCount(userAddress);
      websocketService.broadcastUnreadCountToUser(userAddress, unreadCount);
      
      return formattedNotification;
    } catch (error) {
      console.error('❌ Error creating notification:', error);
      throw error;
    }
  }

  /**
   * Get user notifications
   */
  async getUserNotifications(userAddress, { limit = 50, offset = 0, unreadOnly = false } = {}) {
    try {
      const whereClause = unreadOnly 
        ? 'WHERE user_address = $1 AND read = FALSE'
        : 'WHERE user_address = $1';

      const result = await db.query(`
        SELECT * FROM core.notifications
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
      `, [userAddress.toLowerCase(), limit, offset]);

      return result.rows.map(row => ({
        id: row.id,
        userAddress: row.user_address,
        type: row.type,
        title: row.title,
        message: row.message,
        data: row.data,
        read: row.read,
        createdAt: row.created_at
      }));
    } catch (error) {
      console.error('❌ Error fetching notifications:', error);
      throw error;
    }
  }

  /**
   * Get unread count
   */
  async getUnreadCount(userAddress) {
    try {
      const result = await db.query(`
        SELECT COUNT(*) as count
        FROM core.notifications
        WHERE user_address = $1 AND read = FALSE
      `, [userAddress.toLowerCase()]);

      return parseInt(result.rows[0].count);
    } catch (error) {
      console.error('❌ Error getting unread count:', error);
      return 0;
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId, userAddress) {
    try {
      await db.query(`
        UPDATE core.notifications
        SET read = TRUE
        WHERE id = $1 AND user_address = $2
      `, [notificationId, userAddress.toLowerCase()]);

      console.log(`✅ Marked notification ${notificationId} as read`);
      return true;
    } catch (error) {
      console.error('❌ Error marking notification as read:', error);
      return false;
    }
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(userAddress) {
    try {
      await db.query(`
        UPDATE core.notifications
        SET read = TRUE
        WHERE user_address = $1 AND read = FALSE
      `, [userAddress.toLowerCase()]);

      console.log(`✅ Marked all notifications as read for ${userAddress}`);
      return true;
    } catch (error) {
      console.error('❌ Error marking all as read:', error);
      return false;
    }
  }

  /**
   * Delete notification
   */
  async deleteNotification(notificationId, userAddress) {
    try {
      await db.query(`
        DELETE FROM core.notifications
        WHERE id = $1 AND user_address = $2
      `, [notificationId, userAddress.toLowerCase()]);

      console.log(`✅ Deleted notification ${notificationId}`);
      return true;
    } catch (error) {
      console.error('❌ Error deleting notification:', error);
      return false;
    }
  }

  /**
   * Delete all notifications for user
   */
  async deleteAllNotifications(userAddress) {
    try {
      await db.query(`
        DELETE FROM core.notifications
        WHERE user_address = $1
      `, [userAddress.toLowerCase()]);

      console.log(`✅ Deleted all notifications for ${userAddress}`);
      return true;
    } catch (error) {
      console.error('❌ Error deleting all notifications:', error);
      return false;
    }
  }

  /**
   * Create slip evaluated notification
   */
  async notifySlipEvaluated(userAddress, { slipId, cycleId, score, rank }) {
    const rankText = rank <= 5 ? ` (Rank #${rank} 🏆)` : '';
    return this.createNotification({
      userAddress,
      type: this.NOTIFICATION_TYPES.SLIP_EVALUATED,
      title: 'Oddyssey Results In!',
      message: `You scored ${score}/10 in Cycle ${cycleId}${rankText}`,
      data: { slipId, cycleId, score, rank }
    });
  }

  /**
   * Create bet won notification
   */
  async notifyBetWon(userAddress, { poolId, amount, poolTitle }) {
    return this.createNotification({
      userAddress,
      type: this.NOTIFICATION_TYPES.BET_WON,
      title: 'You Won! 🎉',
      message: `Won ${amount} STT on "${poolTitle}"`,
      data: { poolId, amount, poolTitle }
    });
  }

  /**
   * Create bet lost notification
   */
  async notifyBetLost(userAddress, { poolId, poolTitle }) {
    return this.createNotification({
      userAddress,
      type: this.NOTIFICATION_TYPES.BET_LOST,
      title: 'Bet Closed',
      message: `Pool "${poolTitle}" was settled`,
      data: { poolId, poolTitle }
    });
  }

  /**
   * Create prize available notification
   */
  async notifyPrizeAvailable(userAddress, { amount, sourceId, sourceType }) {
    return this.createNotification({
      userAddress,
      type: this.NOTIFICATION_TYPES.PRIZE_AVAILABLE,
      title: 'Prize Ready! 💰',
      message: `Claim ${amount} STT from ${sourceType}`,
      data: { amount, sourceId, sourceType }
    });
  }

  /**
   * Create pool settled notification
   */
  async notifyPoolSettled(userAddress, { poolId, title, outcome }) {
    return this.createNotification({
      userAddress,
      type: this.NOTIFICATION_TYPES.POOL_SETTLED,
      title: 'Market Resolved',
      message: `Pool "${title}" has been settled`,
      data: { poolId, title, outcome }
    });
  }

  /**
   * Create badge earned notification
   */
  async notifyBadgeEarned(userAddress, { badgeType, category }) {
    const badgeName = badgeType.split('_').map(w => 
      w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    ).join(' ');
    
    return this.createNotification({
      userAddress,
      type: this.NOTIFICATION_TYPES.BADGE_EARNED,
      title: 'Achievement Unlocked! ⭐',
      message: `Earned "${badgeName}" badge`,
      data: { badgeType, category }
    });
  }

  /**
   * Create pool created notification
   */
  async notifyPoolCreated(userAddress, { poolId, title }) {
    return this.createNotification({
      userAddress,
      type: this.NOTIFICATION_TYPES.POOL_CREATED,
      title: 'Pool Created ✨',
      message: `Your pool "${title}" is now live!`,
      data: { poolId, title }
    });
  }

  /**
   * Create slip placed notification
   */
  async notifySlipPlaced(userAddress, { slipId, cycleId }) {
    return this.createNotification({
      userAddress,
      type: this.NOTIFICATION_TYPES.SLIP_PLACED,
      title: 'Oddyssey Entry Confirmed',
      message: `Your predictions for Cycle ${cycleId} are in!`,
      data: { slipId, cycleId }
    });
  }

  /**
   * Clean old notifications (run as cron job)
   */
  async cleanOldNotifications(daysOld = 30) {
    try {
      const result = await db.query(`
        DELETE FROM core.notifications
        WHERE created_at < NOW() - INTERVAL '${daysOld} days'
        RETURNING id
      `);

      console.log(`🧹 Cleaned ${result.rowCount} old notifications`);
      return result.rowCount;
    } catch (error) {
      console.error('❌ Error cleaning old notifications:', error);
      return 0;
    }
  }
}

module.exports = new NotificationService();

