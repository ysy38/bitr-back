const cron = require('node-cron');
const FootballOracleBot = require('../services/football-oracle-bot');
const db = require('../db/db');

class FootballScheduler {
  constructor() {
    this.footballOracleBot = new FootballOracleBot();
    this.isRunning = false;
    this.jobs = [];
  }

  async start() {
    if (this.isRunning) {
      console.log('✅ Football Scheduler is already running');
      return;
    }

    this.isRunning = true;
    console.log('🚀 Starting Football Scheduler...');

    try {
      // Connect to database
      await db.connect();

      // Start the football oracle bot
      await this.footballOracleBot.start();

      // Schedule cron jobs
      this.scheduleCronJobs();

      console.log('✅ Football Scheduler started successfully');
    } catch (error) {
      console.error('❌ Failed to start Football Scheduler:', error);
      this.isRunning = false;
      throw error;
    }
  }

  async stop() {
    this.isRunning = false;
    
    // Stop the football oracle bot
    await this.footballOracleBot.stop();
    
    // Stop all cron jobs
    this.jobs.forEach(job => {
      if (job && typeof job.destroy === 'function') {
        job.destroy();
      } else if (job && typeof job.stop === 'function') {
        job.stop();
      } else {
        console.warn('⚠️ Cron job does not have destroy or stop method:', job);
      }
    });
    this.jobs = [];
    
    console.log('⏹️ Football Scheduler stopped');
  }

  scheduleCronJobs() {
    // 1. Daily football market cleanup at 04:00 UTC
    const dailyCleanupJob = cron.schedule('0 4 * * *', async () => {
      if (!this.isRunning) return;
      
      console.log('🧹 Starting daily football market cleanup...');
      try {
        await this.cleanupOldFootballMarkets();
        console.log('✅ Daily football market cleanup completed');
      } catch (error) {
        console.error('❌ Daily football market cleanup failed:', error);
      }
    }, {
      scheduled: true,
      timezone: "UTC"
    });

    // 2. Football market statistics update every 6 hours
    const statsUpdateJob = cron.schedule('0 */6 * * *', async () => {
      if (!this.isRunning) return;
      
      console.log('📊 Updating football market statistics...');
      try {
        await this.updateFootballMarketStatistics();
        console.log('✅ Football market statistics updated');
      } catch (error) {
        console.error('❌ Football market statistics update failed:', error);
      }
    }, {
      scheduled: true,
      timezone: "UTC"
    });

    // 3. Football market health check every hour
    const healthCheckJob = cron.schedule('0 * * * *', async () => {
      if (!this.isRunning) return;
      
      console.log('🏥 Running football market health check...');
      try {
        await this.healthCheck();
        console.log('✅ Football market health check completed');
      } catch (error) {
        console.error('❌ Football market health check failed:', error);
      }
    }, {
      scheduled: true,
      timezone: "UTC"
    });

    // 4. Results resolver every 10 minutes - DISABLED (using coordinated system instead)
    // const resultsResolverJob = cron.schedule('*/10 * * * *', async () => {
    //   if (!this.isRunning) return;
    //   
    //   console.log('🔍 Running Oddyssey results resolver...');
    //   try {
    //     const OddysseyResultsResolver = require('../services/oddyssey-results-resolver');
    //     const resolver = new OddysseyResultsResolver();
    //     
    //     const results = await resolver.resolveAllPendingCycles();
    //     
    //     if (results.length === 0) {
    //       console.log('ℹ️ No cycles needed resolution');
    //     } else {
    //       const successful = results.filter(r => r.success).length;
    //       const failed = results.filter(r => !r.success).length;
    //       console.log(`✅ Resolved ${successful}/${results.length} cycles`);
    //       
    //       if (failed > 0) {
    //         console.log(`❌ ${failed} cycles failed resolution`);
    //       }
    //     }
    //   } catch (error) {
    //     console.error('❌ Results resolver failed:', error);
    //   }
    // }, {
    //   scheduled: true,
    //   timezone: "UTC"
    // });

    this.jobs = [
      dailyCleanupJob, 
      statsUpdateJob, 
      healthCheckJob
      // resultsResolverJob - DISABLED (using coordinated system instead)
    ];

    console.log('⏰ Scheduled 3 football-related cron jobs:');
    console.log('   • Daily cleanup: 04:00 UTC');
    console.log('   • Statistics update: Every 6 hours');
    console.log('   • Health check: Every hour');
    console.log('   • Results resolver: DISABLED (using coordinated system)');
  }

  async cleanupOldFootballMarkets() {
    try {
      // Remove resolved markets older than 30 days
      const result = await db.query(`
        DELETE FROM oracle.football_prediction_markets 
        WHERE resolved = true 
        AND resolved_at < NOW() - INTERVAL '30 days'
      `);

      const deletedCount = result.rowCount || 0;
      console.log(`🧹 Cleaned up ${deletedCount} old resolved football markets`);

      // Remove old resolution logs (older than 60 days)
      const logsResult = await db.query(`
        DELETE FROM oracle.football_resolution_logs 
        WHERE created_at < NOW() - INTERVAL '60 days'
      `);

      const deletedLogs = logsResult.rowCount || 0;
      if (deletedLogs > 0) {
        console.log(`🧹 Cleaned up ${deletedLogs} old football resolution logs`);
      }

    } catch (error) {
      console.error('❌ Football market cleanup failed:', error);
      throw error;
    }
  }

  async updateFootballMarketStatistics() {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Get daily stats for each outcome type
      const result = await db.query(`
        SELECT 
          outcome_type,
          COUNT(*) as total_markets,
          COUNT(*) FILTER (WHERE resolved = true) as resolved_markets,
          COUNT(*) FILTER (WHERE resolved = true AND predicted_outcome = result) as correct_predictions
        FROM oracle.football_prediction_markets
        WHERE DATE(created_at) = $1
        GROUP BY outcome_type
      `, [today]);

      for (const stats of result.rows) {
        // Get detailed breakdown by outcome type
        const breakdownResult = await db.query(`
          SELECT 
            result,
            COUNT(*) as count
          FROM oracle.football_prediction_markets
          WHERE DATE(created_at) = $1 
          AND outcome_type = $2 
          AND resolved = true
          GROUP BY result
        `, [today, stats.outcome_type]);

        const breakdown = {};
        breakdownResult.rows.forEach(row => {
          breakdown[row.result] = parseInt(row.count);
        });

        // Upsert daily stats
        await db.query(`
          INSERT INTO oracle.football_market_stats (
            outcome_type, date, total_markets, resolved_markets,
            home_wins, draw_results, away_wins,
            over_results, under_results,
            btts_yes, btts_no
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (outcome_type, date) DO UPDATE SET
            total_markets = EXCLUDED.total_markets,
            resolved_markets = EXCLUDED.resolved_markets,
            home_wins = EXCLUDED.home_wins,
            draw_results = EXCLUDED.draw_results,
            away_wins = EXCLUDED.away_wins,
            over_results = EXCLUDED.over_results,
            under_results = EXCLUDED.under_results,
            btts_yes = EXCLUDED.btts_yes,
            btts_no = EXCLUDED.btts_no
        `, [
          stats.outcome_type,
          today,
          stats.total_markets,
          stats.resolved_markets,
          breakdown['home'] || 0,
          breakdown['draw'] || 0,
          breakdown['away'] || 0,
          breakdown['over'] || 0,
          breakdown['under'] || 0,
          breakdown['yes'] || 0,
          breakdown['no'] || 0
        ]);
      }

      console.log(`📈 Updated football market statistics for ${result.rows.length} outcome types`);

    } catch (error) {
      console.error('Failed to update football market statistics:', error);
      throw error;
    }
  }

  async healthCheck() {
    try {
      // Check for stuck markets (past end time but not resolved)
      const stuckMarketsResult = await db.query(`
        SELECT COUNT(*) as count
        FROM oracle.football_prediction_markets
        WHERE resolved = false 
        AND end_time < NOW() - INTERVAL '2 hours'
      `);

      const stuckCount = parseInt(stuckMarketsResult.rows[0].count);
      if (stuckCount > 0) {
        console.warn(`⚠️ Found ${stuckCount} stuck football markets past resolution time`);
      }

      // Check for markets without results
      const noResultsResult = await db.query(`
        SELECT COUNT(*) as count
        FROM oracle.football_prediction_markets fpm
        JOIN oracle.fixtures f ON fpm.fixture_id = f.id
        LEFT JOIN oracle.fixture_results fr ON f.id::VARCHAR = fr.fixture_id::VARCHAR
        WHERE fpm.resolved = false 
        AND fpm.end_time <= NOW()
        AND fr.fixture_id IS NULL
      `);

      const noResultsCount = parseInt(noResultsResult.rows[0].count);
      if (noResultsCount > 0) {
        console.warn(`⚠️ Found ${noResultsCount} football markets without match results`);
      }

      // Check oracle bot status
      let oracleStatus = { isRunning: true }; // Default to running
      try {
        if (this.footballOracleBot && typeof this.footballOracleBot.getStatus === 'function') {
          oracleStatus = await this.footballOracleBot.getStatus();
        }
      } catch (error) {
        console.warn('⚠️ Could not check oracle bot status:', error.message);
      }

      return {
        isHealthy: stuckCount === 0 && noResultsCount === 0 && oracleStatus.isRunning,
        stuckMarkets: stuckCount,
        marketsWithoutResults: noResultsCount,
        oracleRunning: oracleStatus.isRunning,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ Football market health check failed:', error);
      return {
        isHealthy: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  // Health check method
  async getStatus() {
    try {
      const oracleStatus = await this.footballOracleBot.getStatus();
      const healthStatus = await this.healthCheck();
      
      return {
        isRunning: this.isRunning,
        activeJobs: this.jobs.length,
        oracleStatus,
        healthStatus,
        lastUpdate: new Date().toISOString(),
        nextSchedules: {
          dailyCleanup: '04:00 UTC',
          statsUpdate: 'Every 6 hours',
          healthCheck: 'Every hour'
        }
      };
    } catch (error) {
      console.error('Failed to get football scheduler status:', error);
      return {
        isRunning: this.isRunning,
        error: error.message,
        lastUpdate: new Date().toISOString()
      };
    }
  }
}

// Create singleton instance
const footballScheduler = new FootballScheduler();

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('📴 Received SIGINT. Stopping Football Scheduler...');
  await footballScheduler.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('📴 Received SIGTERM. Stopping Football Scheduler...');
  await footballScheduler.stop();
  process.exit(0);
});

module.exports = footballScheduler;

// Start scheduler if this file is run directly
if (require.main === module) {
  (async () => {
    try {
      await footballScheduler.start();
      console.log('🎯 Football Scheduler is now running. Press Ctrl+C to stop.');
    } catch (error) {
      console.error('💥 Failed to start Football Scheduler:', error);
      process.exit(1);
    }
  })();
} 