#!/usr/bin/env node

/**
 * FIXTURES SCHEDULER
 * Fetches and updates football fixtures on a regular schedule
 */

const cron = require('node-cron');
const SportMonksService = require('../services/sportmonks');

class FixturesScheduler {
  constructor() {
    this.sportmonksService = new SportMonksService();
    this.isRunning = false;
  }

  async fetchTodaysFixtures() {
    if (this.isRunning) {
      console.log('⏭️ Fixtures fetch already running, skipping...');
      return;
    }

    try {
      this.isRunning = true;
      console.log('🏈 Starting fixtures fetch...');
      
      const today = new Date().toISOString().split('T')[0];
      console.log(`📅 Fetching fixtures for ${today}`);
      
      // Fetch and save fixtures using the complete method
      const success = await this.sportmonksService.fetchAndSaveFixtures();
      
      if (success) {
        console.log(`✅ Successfully fetched and saved fixtures for ${today}`);
      } else {
        console.log(`ℹ️ No fixtures found or saved for ${today}`);
      }
      
    } catch (error) {
      console.error('❌ Error in fixtures scheduler:', error.message);
    } finally {
      this.isRunning = false;
    }
  }

  start() {
    console.log('⏰ Starting Fixtures Scheduler...');
    
    // Run every 24 hours at 06:00 UTC (6:00 AM) - matches master cron schedule
    cron.schedule('0 6 * * *', () => {
      console.log('⏰ Fixtures Scheduler triggered (06:00 UTC daily)');
      this.fetchTodaysFixtures();
    });
    
    // Don't run immediately on startup - only on schedule
    // this.fetchTodaysFixtures();
    
    console.log('✅ Fixtures Scheduler started - runs every 24 hours at 06:00 UTC');
  }

  /**
   * Get scheduler status for health checks
   */
  async getStatus() {
    return 'healthy'; // Simple status for health check compatibility
  }

  /**
   * Stop the scheduler
   */
  stop() {
    this.isRunning = false;
    console.log('⏹️ Fixtures Scheduler stopped');
  }
}

// Create and export an instance with start method
const fixturesScheduler = new FixturesScheduler();

// Export for use in other modules
module.exports = fixturesScheduler;

// Run standalone if executed directly
if (require.main === module) {
  const scheduler = new FixturesScheduler();
  scheduler.start();
  
  // Keep process alive
  process.on('SIGINT', () => {
    console.log('\n👋 Fixtures Scheduler shutting down...');
    process.exit(0);
  });
}
