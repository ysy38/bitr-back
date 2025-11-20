const cron = require('node-cron');
const AirdropEligibilityCalculator = require('../airdrop/eligibility_calculator');
const config = require('../config');
const db = require('../db/db');

class AirdropScheduler {
  constructor() {
    this.eligibilityCalculator = new AirdropEligibilityCalculator();
    this.isRunning = false;
    this.tasks = [];
  }

  async start() {
    if (this.isRunning) {
      console.log('Airdrop scheduler already running');
      return;
    }

    console.log('🚀 Starting Airdrop Scheduler...');
    
    // Connect to database
    await db.connect();
    
    // Initialize eligibility calculator
    await this.eligibilityCalculator.initialize();
    
    this.setupTasks();
    this.isRunning = true;
    
    console.log('✅ Airdrop Scheduler started successfully');
  }

  setupTasks() {
    // Task 1: Update eligibility calculations every 5 minutes
    const eligibilityTask = cron.schedule('*/5 * * * *', async () => {
      try {
        console.log('⏰ Running eligibility update task...');
        await this.updateEligibilityCalculations();
        console.log('✅ Eligibility update completed');
      } catch (error) {
        console.error('❌ Error in eligibility update task:', error);
      }
    }, { scheduled: false });

    // Task 2: Weekly snapshot on Sundays at midnight UTC
    const snapshotTask = cron.schedule(config.airdrop.snapshotSchedule, async () => {
      try {
        console.log('📸 Taking weekly airdrop snapshot...');
        const snapshotName = `weekly_${new Date().toISOString().split('T')[0]}`;
        await this.eligibilityCalculator.takeSnapshot(snapshotName);
        console.log(`✅ Weekly snapshot '${snapshotName}' completed`);
      } catch (error) {
        console.error('❌ Error in snapshot task:', error);
      }
    }, { scheduled: false });

    // Task 3: Daily statistics update at 2 AM UTC
    const statsTask = cron.schedule('0 2 * * *', async () => {
      try {
        console.log('📊 Updating daily airdrop statistics...');
        await this.updateDailyStatistics();
        console.log('✅ Daily statistics update completed');
      } catch (error) {
        console.error('❌ Error in statistics update task:', error);
      }
    }, { scheduled: false });

    // Task 4: Cleanup old transfer patterns every week
    const cleanupTask = cron.schedule('0 3 * * 0', async () => {
      try {
        console.log('🧹 Cleaning up old transfer patterns...');
        await this.cleanupOldData();
        console.log('✅ Cleanup completed');
      } catch (error) {
        console.error('❌ Error in cleanup task:', error);
      }
    }, { scheduled: false });

    // Start all tasks
    eligibilityTask.start();
    snapshotTask.start();
    statsTask.start();
    cleanupTask.start();

    this.tasks = [eligibilityTask, snapshotTask, statsTask, cleanupTask];
    
    console.log('📅 Scheduled tasks:');
    console.log('  - Eligibility updates: Every 5 minutes');
    console.log('  - Weekly snapshots: Sundays at midnight UTC');
    console.log('  - Daily statistics: Daily at 2 AM UTC');
    console.log('  - Data cleanup: Weekly on Sundays at 3 AM UTC');
  }

  async updateEligibilityCalculations() {
    // Get users with recent activity (last 24 hours)
    const recentUsers = await db.query(`
      SELECT DISTINCT user_address 
      FROM airdrop.bitr_activities 
      WHERE timestamp >= NOW() - INTERVAL '24 hours'
      UNION
      SELECT DISTINCT user_address 
      FROM airdrop.faucet_claims 
      WHERE claimed_at >= NOW() - INTERVAL '24 hours'
      UNION
      SELECT DISTINCT user_address 
      FROM airdrop.staking_activities 
      WHERE timestamp >= NOW() - INTERVAL '24 hours'
    `);

    console.log(`Updating eligibility for ${recentUsers.rows.length} users with recent activity`);

    let updated = 0;
    for (const user of recentUsers.rows) {
      try {
        await this.eligibilityCalculator.updateUserEligibility(user.user_address);
        updated++;
      } catch (error) {
        console.error(`Error updating eligibility for ${user.user_address}:`, error);
      }
    }

    console.log(`Updated eligibility for ${updated}/${recentUsers.rows.length} users`);
  }

  async updateDailyStatistics() {
    const today = new Date().toISOString().split('T')[0];
    
    // Get comprehensive statistics
    const stats = await this.eligibilityCalculator.getAirdropStatistics();
    
    // Update or insert daily statistics
    await db.query(`
      INSERT INTO airdrop.statistics (
        metric_name, metric_value, description, created_at, updated_at
      ) VALUES 
        ('daily_faucet_claims', $1, 'Total faucet claims for ${today}', NOW(), NOW()),
        ('daily_eligible_users', $2, 'Total eligible users for ${today}', NOW(), NOW()),
        ('daily_eligible_bitr', $3, 'Total eligible BITR for ${today}', NOW(), NOW()),
        ('daily_airdrop_allocated', $4, 'Total airdrop allocated for ${today}', NOW(), NOW()),
        ('daily_suspicious_wallets', $5, 'Suspicious wallets for ${today}', NOW(), NOW()),
        ('daily_avg_bitr_actions', $6, 'Average BITR actions for ${today}', NOW(), NOW()),
        ('daily_avg_oddyssey_slips', $7, 'Average Oddyssey slips for ${today}', NOW(), NOW()),
        ('daily_eligibility_rate', $8, 'Eligibility rate for ${today}', NOW(), NOW())
      ON CONFLICT (metric_name) DO UPDATE SET
        metric_value = EXCLUDED.metric_value,
        description = EXCLUDED.description,
        updated_at = NOW()
    `, [
      stats.overview.totalFaucetClaims,
      stats.overview.totalEligible,
      stats.overview.totalEligibleBITR,
      stats.overview.totalAirdropAllocated,
      stats.overview.suspiciousWallets,
      stats.overview.averageBITRActions,
      stats.overview.averageOddysseySlips,
      stats.overview.eligibilityRate
    ]);

    console.log(`Daily statistics for ${today} updated successfully`);
  }

  async cleanupOldData() {
    // Remove transfer patterns older than 90 days
    const cleanupResult = await db.query(`
      DELETE FROM airdrop.transfer_patterns 
      WHERE timestamp < NOW() - INTERVAL '90 days'
    `);

    console.log(`Cleaned up ${cleanupResult.rowCount} old transfer pattern records`);

    // Clean up old statistics (keep 1 year)
    const statsCleanup = await db.query(`
      DELETE FROM airdrop.statistics 
      WHERE created_at < NOW() - INTERVAL '1 year'
    `);

    console.log(`Cleaned up ${statsCleanup.rowCount} old statistics records`);
  }

  async stop() {
    if (!this.isRunning) {
      console.log('Airdrop scheduler not running');
      return;
    }

    console.log('🛑 Stopping Airdrop Scheduler...');
    
    // Stop all cron tasks
    this.tasks.forEach(task => task.stop());
    this.tasks = [];
    
    this.isRunning = false;
    console.log('✅ Airdrop Scheduler stopped');
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      tasksCount: this.tasks.length,
      nextRuns: this.tasks.map(task => ({
        scheduled: task.scheduled,
        running: task.running
      }))
    };
  }
}

// Export singleton instance
const airdropScheduler = new AirdropScheduler();

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down Airdrop Scheduler gracefully...');
  await airdropScheduler.stop();
  await db.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down Airdrop Scheduler gracefully...');
  await airdropScheduler.stop();
  await db.disconnect();
  process.exit(0);
});

// Start if run directly
if (require.main === module) {
  airdropScheduler.start().catch(error => {
    console.error('Failed to start Airdrop Scheduler:', error);
    process.exit(1);
  });
}

module.exports = airdropScheduler; 