const cron = require('node-cron');
const ReputationSyncService = require('../services/reputation-sync-service');

/**
 * Reputation Sync Cron Job
 * Synchronizes reputation data and calculates user rankings
 */
class ReputationSyncCron {
  constructor() {
    this.reputationService = new ReputationSyncService();
    this.isRunning = false;
  }

  /**
   * Start reputation sync cron jobs
   */
  async start() {
    if (this.isRunning) {
      console.log('⚠️ Reputation sync cron is already running');
      return;
    }

    console.log('🏆 Starting reputation sync cron jobs...');

    // Initialize the reputation service first
    await this.reputationService.initialize();
    
    // Start continuous sync service
    await this.reputationService.start();

    // Sync reputation data every 5 minutes (immediate sync of pending changes)
    cron.schedule('*/5 * * * *', async () => {
      await this.syncReputationData();
    }, {
      scheduled: true,
      timezone: 'UTC'
    });

    // Get sync status every hour for logging
    cron.schedule('0 * * * *', async () => {
      await this.logSyncStatus();
    }, {
      scheduled: true,
      timezone: 'UTC'
    });

    this.isRunning = true;
    console.log('✅ Reputation sync cron jobs started');
    console.log('🏆 Reputation sync cron job started');
  }

  /**
   * Sync reputation data (manual trigger)
   */
  async syncReputationData() {
    try {
      console.log('🔄 [MANUAL] Triggering reputation sync...');
      
      // The service already syncs automatically, but we can trigger it manually
      await this.reputationService.syncReputationScores();
      
    } catch (error) {
      console.error('❌ Reputation sync failed:', error);
    }
  }

  /**
   * Log sync status
   */
  async logSyncStatus() {
    try {
      const status = await this.reputationService.getSyncStatus();
      
      if (status && !status.error) {
        console.log('📊 Reputation Sync Status:');
        console.log(`   Running: ${status.isRunning}`);
        console.log(`   Pending Sync: ${status.pendingSyncCount} users`);
        console.log(`   Total Users with Reputation: ${status.totalUsersWithReputation}`);
        console.log(`   Wallet: ${status.walletAddress}`);
        console.log(`   Authorized: ${status.isAuthorized}`);
      }
      
    } catch (error) {
      console.error('❌ Failed to get sync status:', error);
    }
  }

  /**
   * Stop reputation sync
   */
  async stop() {
    this.isRunning = false;
    await this.reputationService.stop();
    console.log('🛑 Reputation sync cron jobs stopped');
  }
}

// Create and start the reputation sync cron
const reputationSyncCron = new ReputationSyncCron();

// Start if run directly
if (require.main === module) {
  reputationSyncCron.start();
  
  // Keep the process alive
  console.log('🏆 Reputation sync cron job started');
  
  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('🛑 Received SIGTERM, shutting down reputation sync...');
    reputationSyncCron.stop();
    process.exit(0);
  });
  
  process.on('SIGINT', () => {
    console.log('🛑 Received SIGINT, shutting down reputation sync...');
    reputationSyncCron.stop();
    process.exit(0);
  });
}

module.exports = reputationSyncCron;
