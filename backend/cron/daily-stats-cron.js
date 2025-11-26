/**
 * Daily Stats Cron Job
 * Calculates comprehensive daily statistics for platform analytics
 * Runs daily at 02:00 UTC to process previous day's data
 */

require('dotenv').config();
const DailyStatsService = require('../services/daily-stats-service');

class DailyStatsCron {
  constructor() {
    this.dailyStatsService = new DailyStatsService();
    this.isRunning = false;
  }

  async start() {
    if (this.isRunning) {
      console.log('⚠️ Daily Stats Cron is already running');
      return;
    }

    this.isRunning = true;
    console.log('📊 Starting Daily Stats Cron...');

    // Calculate stats for yesterday (default behavior)
    await this.calculateYesterdayStats();

    // Schedule daily calculation at 02:00 UTC
    const cron = require('node-cron');
    
    cron.schedule('0 2 * * *', async () => {
      console.log('⏰ Daily Stats Cron triggered (02:00 UTC)');
      await this.calculateYesterdayStats();
    });

    console.log('✅ Daily Stats Cron started - runs daily at 02:00 UTC');
  }

  async stop() {
    this.isRunning = false;
    console.log('🛑 Daily Stats Cron stopped');
  }

  /**
   * Calculate statistics for yesterday
   */
  async calculateYesterdayStats() {
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayDate = yesterday.toISOString().split('T')[0];

      console.log(`📊 Calculating daily stats for ${yesterdayDate}...`);

      // Calculate all daily statistics
      await this.dailyStatsService.calculateAllDailyStats(yesterdayDate);

      console.log(`✅ Daily stats calculated successfully for ${yesterdayDate}`);

    } catch (error) {
      console.error('❌ Error calculating yesterday stats:', error);
      throw error;
    }
  }

  /**
   * Calculate statistics for a specific date
   */
  async calculateStatsForDate(targetDate) {
    try {
      console.log(`📊 Calculating daily stats for ${targetDate}...`);

      await this.dailyStatsService.calculateAllDailyStats(targetDate);

      console.log(`✅ Daily stats calculated successfully for ${targetDate}`);

    } catch (error) {
      console.error(`❌ Error calculating stats for ${targetDate}:`, error);
      throw error;
    }
  }

  /**
   * Backfill missing daily stats for a date range
   */
  async backfillStats(startDate, endDate) {
    try {
      console.log(`📊 Backfilling daily stats from ${startDate} to ${endDate}...`);

      const start = new Date(startDate);
      const end = new Date(endDate);
      const dates = [];

      // Generate date range
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        dates.push(d.toISOString().split('T')[0]);
      }

      let processed = 0;
      let errors = 0;

      for (const date of dates) {
        try {
          await this.dailyStatsService.calculateAllDailyStats(date);
          processed++;
          console.log(`✅ Processed ${date} (${processed}/${dates.length})`);
        } catch (error) {
          errors++;
          console.error(`❌ Error processing ${date}:`, error.message);
        }
      }

      console.log(`📊 Backfill completed: ${processed} successful, ${errors} errors`);

    } catch (error) {
      console.error('❌ Error during backfill:', error);
      throw error;
    }
  }

  /**
   * Get cron status
   */
  async getStatus() {
    return {
      isRunning: this.isRunning,
      service: 'Daily Stats Cron',
      schedule: 'Daily at 02:00 UTC',
      description: 'Calculates comprehensive daily statistics for platform analytics'
    };
  }
}

// Create singleton instance
const dailyStatsCron = new DailyStatsCron();

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 Received SIGTERM, shutting down Daily Stats Cron...');
  await dailyStatsCron.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 Received SIGINT, shutting down Daily Stats Cron...');
  await dailyStatsCron.stop();
  process.exit(0);
});

// Export for use in other modules
module.exports = dailyStatsCron;

// Start if run directly
if (require.main === module) {
  dailyStatsCron.start().catch(console.error);
}
