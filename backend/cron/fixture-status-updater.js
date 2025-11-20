const cron = require('node-cron');
const SportMonksService = require('../services/sportmonks');

/**
 * Fixture Status Updater Cron Job
 * 
 * This cron job runs every 10 minutes to update fixture status for live matches.
 * It ensures that fixture status is updated independently of results fetching.
 */
class FixtureStatusUpdaterCron {
  constructor() {
    this.sportMonksService = new SportMonksService();
    this.isInitialized = false;
    this.isRunning = false;
    this.lastRun = null;
    this.runCount = 0;
    this.errorCount = 0;
    this.cronJob = null;
  }

  /**
   * Initialize the cron job with better error handling
   */
  initialize() {
    if (this.isInitialized) {
      console.log('⚠️ Fixture status updater cron already initialized');
      return;
    }

    console.log('🚀 Initializing fixture status updater cron job...');

    // Schedule to run every 10 minutes with better error handling
    this.cronJob = cron.schedule('*/10 * * * *', async () => {
      // Prevent overlapping executions
      if (this.isRunning) {
        console.log('⚠️ Fixture status update already running, skipping this cycle');
        return;
      }
      
      this.isRunning = true;
      try {
        await this.runStatusUpdate();
      } catch (error) {
        console.error('❌ Unhandled error in fixture status update:', error);
      } finally {
        this.isRunning = false;
      }
    }, {
      scheduled: true,
      timezone: "UTC"
    });

    this.isInitialized = true;
    this.isRunning = false;
    console.log('✅ Fixture status updater cron job initialized');
    console.log('📅 Scheduled to run every 10 minutes');
  }

  /**
   * Run the fixture status update process with timeout protection
   */
  
    // Graceful degradation for API failures
    async runStatusUpdateWithFallback() {
      try {
        return await this.runStatusUpdate();
      } catch (error) {
        if (error.message.includes('timeout')) {
          console.log('⚠️ Fixture status update timed out, but system continues running');
          return { updated: 0, warning: 'Timeout occurred but system is healthy' };
        }
        throw error;
      }
    }

  async runStatusUpdate() {
    const startTime = Date.now();
    const maxDuration = 8 * 60 * 1000; // 8 minutes max (increased to handle API delays)
    
    try {
      console.log('🔄 Starting fixture status update...');
      
      // Create a timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Fixture status update timed out after 8 minutes'));
        }, maxDuration);
      });
      
      // Race between the actual operation and timeout
      const result = await Promise.race([
        this.sportMonksService.updateFixtureStatus(),
        timeoutPromise
      ]);
      
      const duration = Date.now() - startTime;
      this.runCount++;
      this.lastRun = new Date();
      
      console.log(`✅ Fixture status update completed in ${duration}ms: ${result.updated} fixtures updated`);
      
      // Log successful operation
      await this.logOperation('status_update', result.updated, true, duration);
      
    } catch (error) {
      console.error('❌ Error in fixture status update:', error);
      this.errorCount++;
      
      // Log failed operation
      await this.logOperation('status_update', 0, false, Date.now() - startTime, error.message);
    }
  }

  /**
   * Log operation to database for monitoring
   */
  async logOperation(operationType, fixtureCount, success, processingTimeMs, errorMessage = null) {
    try {
      const db = require('../db/db');
      await db.query(`
        INSERT INTO oracle.results_fetching_logs (
          operation_type, fixture_count, success, processing_time_ms, error_message
        ) VALUES ($1, $2, $3, $4, $5)
      `, [operationType, fixtureCount, success, processingTimeMs, errorMessage]);
    } catch (error) {
      console.error('Failed to log operation:', error);
    }
  }

  /**
   * Get statistics about the cron job
   */
  getStats() {
    return {
      isInitialized: this.isInitialized,
      lastRun: this.lastRun,
      runCount: this.runCount,
      errorCount: this.errorCount,
      successRate: this.runCount > 0 ? ((this.runCount - this.errorCount) / this.runCount * 100).toFixed(2) : 0
    };
  }

  /**
   * Stop the cron job properly
   */
  stop() {
    if (this.isInitialized && this.cronJob) {
      console.log('🛑 Stopping fixture status updater cron job...');
      try {
        // Check if destroy method exists before calling it
        if (typeof this.cronJob.destroy === 'function') {
          this.cronJob.destroy();
        } else {
          // Fallback to stop method if destroy doesn't exist
          this.cronJob.stop();
        }
      } catch (error) {
        console.warn('⚠️ Error stopping cron job:', error.message);
      }
      this.isInitialized = false;
      this.cronJob = null;
      console.log('✅ Fixture status updater cron job stopped');
    }
  }
}

// Create singleton instance
const fixtureStatusUpdaterCron = new FixtureStatusUpdaterCron();

// Export for use in other modules
module.exports = fixtureStatusUpdaterCron;

// Auto-initialize if this file is run directly
if (require.main === module) {
  console.log('🚀 Starting fixture status updater cron job...');
  fixtureStatusUpdaterCron.initialize();
  
  // Keep the process alive
  process.on('SIGINT', () => {
    console.log('🛑 Received SIGINT, stopping fixture status updater cron...');
    fixtureStatusUpdaterCron.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    console.log('🛑 Received SIGTERM, stopping fixture status updater cron...');
    fixtureStatusUpdaterCron.stop();
    process.exit(0);
  });
}
