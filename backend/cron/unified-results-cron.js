const cron = require('node-cron');
const UnifiedResultsManager = require('../services/unified-results-manager');

/**
 * Unified Results Cron Job
 * 
 * This cron job replaces all the conflicting results-related cron jobs:
 * - results-fetcher-cron.js
 * - coordinated-results-scheduler.js
 * - fixture-status-updater.js
 * - football-scheduler.js (results part)
 * 
 * It runs a single coordinated cycle that handles:
 * 1. Fixture status updates
 * 2. Results fetching and saving
 * 3. Outcome calculations
 * 4. Oddyssey cycle resolution
 */
class UnifiedResultsCron {
  constructor() {
    this.unifiedManager = new UnifiedResultsManager();
    this.isInitialized = false;
    this.lastRun = null;
    this.runCount = 0;
    this.errorCount = 0;
    this.job = null;
    this.currentRun = null;
  }

  /**
   * Initialize the cron job
   */
  initialize() {
    if (this.isInitialized) {
      console.log('⚠️ Unified Results Cron already initialized');
      return;
    }

    console.log('🚀 Initializing Unified Results Cron job...');

    // Schedule to run every 15 minutes (replaces multiple conflicting jobs)
    this.job = cron.schedule('*/15 * * * *', async () => {
      await this.runUnifiedCycle();
    }, {
      scheduled: true,
      timezone: "UTC"
    });

    this.isInitialized = true;
    console.log('✅ Unified Results Cron job initialized');
    console.log('📅 Scheduled to run every 15 minutes');

    // Setup graceful shutdown handlers
    process.on('SIGTERM', () => {
      console.log('🛑 Received SIGTERM, stopping Unified Results Cron...');
      this.stop();
    });

    process.on('SIGINT', () => {
      console.log('🛑 Received SIGINT, stopping Unified Results Cron...');
      this.stop();
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('❌ Uncaught Exception in Unified Results Cron:', error);
      this.cleanup();
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ Unhandled Rejection in Unified Results Cron:', reason);
      this.cleanup();
    });

    console.log('🔄 Replaces: results-fetcher, coordinated-results-scheduler, fixture-status-updater, football-scheduler-results');
  }

  /**
   * Run the unified results cycle
   */
  async runUnifiedCycle() {
    // Prevent overlapping runs
    if (this.currentRun) {
      console.log('⚠️ Unified Results cycle already running, skipping...');
      return;
    }

    const startTime = Date.now();
    this.currentRun = Date.now();
    
    try {
      console.log('🔄 Starting Unified Results cycle...');
      
      const result = await this.unifiedManager.runCompleteCycle();
      
      const duration = Date.now() - startTime;
      this.runCount++;
      this.lastRun = new Date();
      
      if (result.status === 'success') {
        console.log(`✅ Unified Results cycle completed in ${duration}ms`);
        console.log(`📊 Stats: ${result.stats.statusUpdates} status updates, ${result.stats.resultsFetched} results fetched, ${result.stats.outcomesCalculated} outcomes calculated, ${result.stats.cyclesResolved} cycles resolved`);
      } else if (result.status === 'skipped') {
        console.log(`⏭️ Unified Results cycle skipped: ${result.reason}`);
      } else {
        console.log(`❌ Unified Results cycle failed: ${result.error}`);
        this.errorCount++;
      }
      
    } catch (error) {
      console.error('❌ Error in Unified Results cycle:', error);
      this.errorCount++;
    } finally {
      this.currentRun = null;
    }
  }

  /**
   * Manual trigger for testing
   */
  async triggerManualRun() {
    console.log('🧪 Triggering manual Unified Results cycle...');
    await this.runUnifiedCycle();
  }

  /**
   * Get cron job status
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      isRunning: this.unifiedManager.isRunning,
      currentRun: this.currentRun,
      lastRun: this.lastRun,
      runCount: this.runCount,
      errorCount: this.errorCount,
      managerStats: this.unifiedManager.getStats()
    };
  }

  /**
   * Stop the cron job
   */
  stop() {
    if (this.job) {
      this.job.stop();
      this.job = null;
    }
    this.isInitialized = false;
    this.cleanup();
    console.log('✅ Unified Results Cron job stopped');
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    if (this.unifiedManager) {
      this.unifiedManager.cleanup();
    }
    this.currentRun = null;
  }
}

// Create singleton instance
const unifiedResultsCron = new UnifiedResultsCron();

// Export for use in other modules
module.exports = unifiedResultsCron;

// Auto-initialize if this file is run directly
if (require.main === module) {
  console.log('🚀 Starting Unified Results Cron job...');
  unifiedResultsCron.initialize();
  
  // Keep the process alive
  process.on('SIGINT', () => {
    console.log('🛑 Received SIGINT, stopping Unified Results Cron...');
    unifiedResultsCron.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    console.log('🛑 Received SIGTERM, stopping Unified Results Cron...');
    unifiedResultsCron.stop();
    process.exit(0);
  });
}
