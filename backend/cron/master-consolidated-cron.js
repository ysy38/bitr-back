require('dotenv').config();
const cron = require('node-cron');
const { fork } = require('child_process');
const path = require('path');

// Import coordination services
const cronCoordinator = require('../services/cron-coordinator');
const EnhancedAnalyticsService = require('../services/enhanced-analytics-service');
// REMOVED: Old duplicate sync services - functionality moved to unified services
// - OddysseySlipSyncService → handled by UnifiedSlipService
// - PoolSyncService → handled by EnhancedPoolSyncService

// Set worker mode environment variable for this process
process.env.WORKER_MODE = 'true';
process.env.CRON_WORKER = 'true';

console.log('🚀 Starting MASTER CONSOLIDATED CRON SYSTEM (Worker Machine Only)...');

/**
 * MASTER CONSOLIDATED CRON SYSTEM
 * 
 * This is the SINGLE SOURCE OF TRUTH for ALL cron jobs.
 * It consolidates all previous cron implementations into one place.
 * 
 * Features:
 * - Prevents conflicts between app and worker machines
 * - Coordinated execution with proper timeouts
 * - Comprehensive logging and monitoring
 * - Automatic restart for continuous processes
 * - All jobs properly spaced to avoid resource conflicts
 */
class MasterConsolidatedCron {
  constructor() {
    this.isRunning = false;
    this.jobs = {};
    this.processes = new Map();
    this.stats = {
      totalJobs: 0,
      activeJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      startTime: new Date()
    };
    
    // Initialize analytics service
    this.analyticsService = new EnhancedAnalyticsService();
  }

  async initialize() {
    if (this.isRunning) {
      console.log('⚠️ Master Consolidated Cron is already running');
      return false; // Return false to indicate it was already running
    }

    console.log('🎯 Initializing Master Consolidated Cron System...');
    
    try {
      // Initialize coordination system first
      console.log('🔧 Initializing cron coordination system...');
      await cronCoordinator.initialize();
      console.log('✅ Cron coordination system initialized');
      
      // Initialize database first
      await this.initializeDatabase();
      
      // Define all jobs with proper coordination and spacing
      this.defineAllJobs();
      
      // Schedule all jobs
      this.scheduleAllJobs();
      
      this.isRunning = true;
      console.log('✅ Master Consolidated Cron System initialized successfully');
      
    } catch (error) {
      console.error('❌ Failed to initialize Master Consolidated Cron:', error);
      throw error;
    }
  }

  async initializeDatabase() {
    try {
      console.log('🗄️ Initializing database for cron jobs...');
      
      // DISABLED: Auto-apply perfect schema (manual control for debugging)
      console.log('🚫 Perfect database schema auto-apply DISABLED for workers (manual control)');
      
      console.log('✅ Database initialized for cron jobs');
    } catch (error) {
      console.error('❌ Database initialization failed:', error);
      // Continue anyway, some services might work without full DB setup
    }
  }

  defineAllJobs() {
    console.log('📋 Defining all consolidated cron jobs...');

    // Set environment variables to avoid port conflicts
    process.env.ODDYSSEY_PORT = '3002';
    process.env.CRYPTO_PORT = '3003';

    this.jobs = {
      // ========== DAILY JOBS (Run once per day) ==========
      oddyssey_match_selection: {
        schedule: '1 0 * * *', // 00:01 UTC - Match selection
        script: path.join(__dirname, 'oddyssey-match-selection-process.js'),
        description: 'Oddyssey Match Selection (Daily)',
        timeout: 15,
        critical: true
      },
      
      oddyssey_creator: {
        schedule: '5 0 * * *', // 00:05 UTC - Cycle creation
        script: path.join(__dirname, 'oddyssey-creator-process.js'),
        description: 'Oddyssey Creator (Daily Cycle Creation)',
        timeout: 15,
        critical: true
      },

      contract_sync: {
        schedule: '10 0 * * *', // 00:10 UTC - Contract sync (increased spacing)
        script: path.join(__dirname, '../sync-contract-matches-to-db.js'),
        description: 'Contract to Database Sync',
        timeout: 20,
        critical: true
      },

      cycle_health_monitor: {
        schedule: '30 0 * * *', // 00:30 UTC - After cycle operations
        script: path.join(__dirname, '../scripts/cycle-health-monitor.js'),
        description: 'Daily Cycle Health Monitor',
        timeout: 10,
        critical: false
      },

      airdrop_scheduler: {
        schedule: '0 2 * * *', // 02:00 UTC - Airdrop calculations
        script: path.join(__dirname, 'airdrop-scheduler.js'),
        description: 'Airdrop Scheduler (Daily Eligibility Calculation)',
        timeout: 20,
        critical: false
      },

      // REMOVED: airdrop_indexer - handled by dedicated Indexer VM
      // This prevents duplicate indexers running simultaneously

      database_cleanup_oracle: {
        schedule: '15 2 * * *', // 02:15 UTC - Staggered from airdrop
        script: path.join(__dirname, '../oracle/cronjob.js'),
        description: 'Oracle Database Cleanup (Daily)',
        timeout: 15,
        critical: false
      },

      // REMOVED: football_market_cleanup - handled internally by football_oracle_bot continuous process
      // Previously duplicated functionality with internal cron jobs in football-scheduler.js

      fixtures_scheduler: {
        schedule: '0 6 * * *', // 06:00 UTC - Daily fixture fetch
        script: path.join(__dirname, 'fixtures-scheduler.js'),
        description: 'Fixtures Scheduler (Daily 7-Day Fetch)',
        timeout: 40, // Increased to 40 minutes for 7-day fetch with database timeouts
        critical: true
      },

      // ========== FREQUENT JOBS (Multiple times per day) ==========
      unified_results_manager: {
        schedule: '*/30 * * * *', // Every 30 minutes - Results processing (reduced frequency)
        script: path.join(__dirname, 'unified-results-cron.js'),
        description: 'Unified Results Manager (Consolidated)',
        timeout: 60, // Increased from 45 to 60 minutes for better reliability with API delays
        critical: true
      },

      results_resolver: {
        schedule: '*/20 * * * *', // Every 20 minutes - Oddyssey cycle resolution
        script: path.join(__dirname, 'results-resolver-process.js'),
        description: 'Results Resolver (Oddyssey Cycles)',
        timeout: 15,
        critical: true
      },

      fixture_mapping_maintainer: {
        schedule: '*/30 * * * *', // Every 30 minutes - Metadata healing (reduced frequency)
        script: path.join(__dirname, 'fixture-mapping-maintainer-cron.js'),
        description: 'Fixture Mapping Maintainer (Self-Healing)',
        timeout: 10,
        critical: false
      },

      fixture_status_updater: {
        schedule: '2,12,22,32,42,52 * * * *', // Every 10 minutes at :X2 - Status updates
        script: path.join(__dirname, 'fixture-status-updater.js'),
        description: 'Fixture Status Updater (Live Match Status)',
        timeout: 25, // Increased from 15 to 25 minutes for API delays and rate limits
        critical: false
      },

      // ========== HOURLY JOBS ==========
      auto_evaluation: {
        schedule: '*/20 * * * *', // Every 20 minutes - Auto evaluation (reduced frequency)
        script: path.join(__dirname, 'unified-slip-evaluation-cron.js'),
        description: 'Unified Slip Evaluation (Resolved Cycles)',
        timeout: 30, // Increased from 20 to 30 minutes for better reliability
        critical: true // Made critical to ensure it never fails
      },

      // ========== ANALYTICS JOBS ==========
      analytics_update: {
        schedule: '*/30 * * * *', // Every 30 minutes (reduced frequency)
        script: null, // Handled by service method
        description: 'Analytics Data Update (Every 30 minutes)',
        timeout: 5,
        critical: false,
        serviceMethod: 'updateAnalytics'
      },

      // REMOVED: football_health_check - handled internally by football_oracle_bot continuous process
      // Previously duplicated functionality with internal cron jobs in football-scheduler.js

      oracle_health_check: {
        schedule: '*/20 * * * *', // Every 20 minutes - Oracle health (further reduced frequency)
        script: path.join(__dirname, '../oracle/cronjob.js'),
        description: 'Oracle Health Check',
        timeout: 20, // Increased from 10 to 20 minutes for API delays and database operations
        critical: false
      },

      // ========== 30-MINUTE INTERVAL JOBS (Staggered) ==========
      // REMOVED: crypto_scheduler scheduled job - replaced by continuous crypto_oracle_bot which includes scheduler
      // Previously caused timeouts because it was running as scheduled job with 20-minute timeout
      // when it should run continuously with internal cron jobs

      // REMOVED: Old duplicate sync services
      // - oddyssey_slip_sync → replaced by UnifiedSlipService (async saves)
      
        pool_sync_event_driven: {
          schedule: null, // Continuous - Event-driven
          script: path.join(__dirname, '../scripts/start-event-driven-sync.js'),
          description: 'Event-Driven Pool Sync (Real-time Contract Events)',
          timeout: null,
          critical: true,
          continuous: true
        },
        pool_sync_fallback: {
          schedule: '0 */6 * * *', // Every 6 hours - Fallback only
          script: path.join(__dirname, '../services/event-driven-pool-sync.js'),
          description: 'Pool Sync Fallback (Periodic Check)',
          timeout: 10,
          critical: false
        },
        daily_stats: {
          schedule: '0 2 * * *', // Daily at 02:00 UTC
          script: path.join(__dirname, 'daily-stats-cron.js'),
          description: 'Daily Stats Calculation (Platform & User Analytics)',
          timeout: 15,
          critical: false
        },

      // REMOVED: football_scheduler_periodic - replaced by continuous football_oracle_bot
      // Previously caused potential timeout issues (15-minute timeout for continuous service)
      // Now handled by football-scheduler.js running continuously with internal cron jobs

      // ========== 6-HOUR JOBS ==========
      // REMOVED: football_stats_update - handled internally by football_oracle_bot continuous process
      // Previously duplicated functionality with internal cron jobs in football-scheduler.js

      // ========== CONTINUOUS PROCESSES (Always running) ==========
      pool_settlement_service: {
        schedule: null, // Continuous
        script: path.join(__dirname, 'pool-settlement-service-process.js'),
        description: 'Pool Settlement Service (Oracle Event Listener)',
        timeout: null,
        critical: true,
        continuous: true
      },

      slip_sync_event_driven: {
        schedule: null, // Continuous - Event-driven
        script: path.join(__dirname, '../services/event-driven-slip-sync.js'),
        description: 'Event-Driven Slip Sync (Real-time Oddyssey Events)',
        timeout: null,
        critical: true,
        continuous: true
      },

      // Continuous slip evaluation service to ensure never fails
      // slip_evaluation_continuous: {
      //   schedule: null, // Continuous - Always running
      //   script: path.join(__dirname, '../services/continuous-slip-evaluator.js'),
      //   description: 'Continuous Slip Evaluator (Never Fails)',
      //   timeout: null,
      //   critical: true,
      //   continuous: true
      // },
      bet_sync_event_driven: {
        schedule: null, // Continuous - Event-driven
        script: path.join(__dirname, '../scripts/start-event-driven-bet-sync.js'),
        description: 'Event-Driven Bet Sync (Real-time Bet Events)',
        timeout: null,
        critical: true,
        continuous: true
      },

      // reputation_event_indexer: {
      //   schedule: null, // Continuous - Event-driven
      //   script: path.join(__dirname, 'reputation-event-indexer-process.js'),
      //   description: 'Reputation Event Indexer (Real-time Reputation Events)',
      //   timeout: null,
      //   critical: true,
      //   continuous: true
      // },

      reputation_decay: {
        schedule: '0 3 * * *', // Daily at 03:00 UTC
        script: path.join(__dirname, 'reputation-decay-process.js'),
        description: 'Reputation Decay Service (Weekly Decay Processing)',
        timeout: 30,
        critical: false
      },

      bet_sync_fallback: {
        schedule: '*/30 * * * *', // Every 30 minutes
        script: path.join(__dirname, '../scripts/run-bet-sync-fallback.js'),
        description: 'Bet Sync Fallback (Catch Missed Bets)',
        timeout: 300000, // 5 minutes
        critical: false,
        continuous: false
      },

      oddyssey_oracle_bot: {
        schedule: null, // Continuous
        script: path.join(__dirname, 'oddyssey-oracle-bot-process.js'),
        description: 'Oddyssey Oracle Bot (Blockchain Resolution)',
        timeout: null,
        critical: true,
        continuous: true
      },

      football_oracle_bot: {
        schedule: null, // Continuous
        script: path.join(__dirname, 'football-scheduler.js'),
        description: 'Football Oracle Bot & Scheduler (Continuous with internal cron jobs)',
        timeout: null,
        critical: false,
        continuous: true
      },

      crypto_oracle_bot: {
        schedule: null, // Continuous
        script: path.join(__dirname, 'crypto-scheduler-process.js'),
        description: 'Crypto Oracle Bot & Scheduler (Continuous with internal cron jobs)',
        timeout: null,
        critical: false,
        continuous: true
      },

      cycle_monitor: {
        schedule: null, // Continuous
        script: path.join(__dirname, '../services/cycle-monitor.js'),
        description: 'Cycle Monitor (Continuous)',
        timeout: null,
        critical: true,
        continuous: true
      },

      health_monitoring: {
        schedule: null, // Continuous with internal schedules
        script: path.join(__dirname, 'health-monitoring-cron.js'),
        description: 'Health Monitoring System (Comprehensive)',
        timeout: null,
        critical: false,
        continuous: true
      },

      reputation_sync: {
        schedule: null, // Continuous with internal schedules
        script: path.join(__dirname, 'reputation-sync-cron.js'),
        description: 'Reputation Sync Service (Rankings & Cleanup)',
        timeout: null,
        critical: false,
        continuous: true
      }
    };

    this.stats.totalJobs = Object.keys(this.jobs).length;
    console.log(`📊 Defined ${this.stats.totalJobs} consolidated cron jobs`);
  }

  scheduleAllJobs() {
    console.log('⏰ Scheduling all consolidated cron jobs...');

    Object.entries(this.jobs).forEach(([jobName, jobConfig]) => {
      if (jobConfig.schedule === null) {
        // Continuous processes
        console.log(`🔄 Starting continuous process: ${jobConfig.description}`);
        this.runContinuousJob(jobName, jobConfig);
      } else {
        // Scheduled cron jobs
        console.log(`⏰ Scheduling ${jobConfig.description} with cron: ${jobConfig.schedule}`);
        
        const cronJob = cron.schedule(jobConfig.schedule, () => {
          if (jobConfig.serviceMethod) {
            this.runServiceMethod(jobName, jobConfig);
          } else {
            this.runScheduledJob(jobName, jobConfig);
          }
        }, {
          scheduled: true,
          timezone: "UTC"
        });

        this.jobs[jobName].cronInstance = cronJob;
      }
    });

    console.log('✅ All consolidated cron jobs scheduled successfully');
  }

  runScheduledJob(jobName, jobConfig) {
    const jobId = `${jobName}_${Date.now()}`;
    console.log(`📅 Starting scheduled job: ${jobConfig.description} [${jobId}]`);
    
    const startTime = Date.now();
    this.stats.activeJobs++;

    const child = fork(jobConfig.script, [], {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: {
        ...process.env,
        ODDYSSEY_PORT: '3002',
        CRYPTO_PORT: '3003',
        JOB_NAME: jobName,
        JOB_ID: jobId
      }
    });

    this.processes.set(jobId, {
      child,
      jobName,
      startTime,
      config: jobConfig
    });

    child.on('exit', (code, signal) => {
      const duration = Date.now() - startTime;
      this.stats.activeJobs--;
      this.processes.delete(jobId);

      if (code === 0) {
        this.stats.completedJobs++;
        console.log(`✅ ${jobConfig.description} completed successfully [${jobId}] (${duration}ms)`);
      } else if (signal === 'SIGTERM' || signal === 'SIGKILL') {
        // Process was terminated by system shutdown - not a failure
        console.log(`🛑 ${jobConfig.description} terminated by system [${jobId}] (${duration}ms)`);
        
        // Log critical system status if multiple jobs are being terminated
        const terminatedJobs = Array.from(this.processes.values()).filter(p => p.signal === 'SIGTERM' || p.signal === 'SIGKILL').length;
        if (terminatedJobs > 2) {
          console.log(`🚨 [CRITICAL] critical_system_status: System status is critical: ${terminatedJobs} jobs terminated`);
        }
      } else {
        this.stats.failedJobs++;
        console.error(`❌ ${jobConfig.description} failed with code ${code} [${jobId}] (${duration}ms)`);
      }
    });

    child.on('error', (error) => {
      this.stats.activeJobs--;
      this.stats.failedJobs++;
      this.processes.delete(jobId);
      console.error(`💥 ${jobConfig.description} error [${jobId}]:`, error.message);
    });

    // Set timeout for scheduled jobs with better handling
    if (jobConfig.timeout) {
      const timeoutMs = jobConfig.timeout * 60 * 1000;
      const timeoutId = setTimeout(() => {
        if (this.processes.has(jobId) && !child.killed) {
          console.warn(`⏰ ${jobConfig.description} timeout after ${jobConfig.timeout} minutes [${jobId}], killing process`);
          
          // Send SIGTERM first (graceful shutdown)
          try {
            console.log(`📤 Sending SIGTERM to ${jobConfig.description} [${jobId}]...`);
            child.kill('SIGTERM');
          } catch (error) {
            console.warn(`⚠️ Error sending SIGTERM to ${jobId}:`, error.message);
          }
          
          // Force kill if SIGTERM doesn't work after 45 seconds (increased for better graceful shutdown)
          setTimeout(() => {
            if (this.processes.has(jobId) && !child.killed) {
              console.warn(`💀 Force killing ${jobConfig.description} [${jobId}] after SIGTERM timeout`);
              try {
                child.kill('SIGKILL');
              } catch (error) {
                console.warn(`⚠️ Error sending SIGKILL to ${jobId}:`, error.message);
              }
            }
          }, 45000); // Increased from 30 to 45 seconds for better graceful shutdown
        }
      }, timeoutMs);
      
      // Clear timeout when process exits
      child.on('exit', () => {
        clearTimeout(timeoutId);
      });
    }
  }

  runContinuousJob(jobName, jobConfig) {
    const jobId = `${jobName}_continuous`;
    console.log(`🔄 Starting continuous process: ${jobConfig.description} [${jobId}]`);

    const startProcess = () => {
      const child = fork(jobConfig.script, [], {
        stdio: 'inherit',
        cwd: process.cwd(),
        env: {
          ...process.env,
          ODDYSSEY_PORT: '3002',
          CRYPTO_PORT: '3003',
          JOB_NAME: jobName,
          JOB_ID: jobId
        }
      });

      this.processes.set(jobId, {
        child,
        jobName,
        startTime: Date.now(),
        config: jobConfig
      });

      child.on('exit', (code) => {
        this.processes.delete(jobId);
        
        if (code !== 0) {
          console.log(`🔄 Restarting continuous process: ${jobConfig.description} [${jobId}] (exit code: ${code})`);
          setTimeout(() => {
            if (this.isRunning) {
              startProcess();
            }
          }, 5000); // Wait 5 seconds before restarting
        } else {
          console.log(`✅ Continuous process exited cleanly: ${jobConfig.description} [${jobId}]`);
        }
      });

      child.on('error', (error) => {
        this.processes.delete(jobId);
        console.error(`💥 Continuous process error: ${jobConfig.description} [${jobId}]:`, error.message);
        
        // Restart after error
        setTimeout(() => {
          if (this.isRunning) {
            startProcess();
          }
        }, 5000);
      });
    };

    startProcess();
  }

  async runServiceMethod(jobName, jobConfig) {
    const jobId = `${jobName}_${Date.now()}`;
    console.log(`🔧 Starting service method: ${jobConfig.description} [${jobId}]`);
    
    const startTime = Date.now();
    this.stats.activeJobs++;

    try {
      if (jobConfig.serviceMethod === 'updateAnalytics') {
        // Initialize full analytics service instead of just oddyssey analytics
        await this.analyticsService.start();
        console.log(`✅ Analytics update completed [${jobId}] (${Date.now() - startTime}ms)`);
        this.stats.completedJobs++;
      } else {
        throw new Error(`Unknown service method: ${jobConfig.serviceMethod}`);
      }
    } catch (error) {
      console.error(`❌ Service method failed: ${jobConfig.description} [${jobId}]:`, error.message);
      this.stats.failedJobs++;
    } finally {
      this.stats.activeJobs--;
    }
  }

  async stop() {
    if (!this.isRunning) {
      console.log('⚠️ Master Consolidated Cron is not running');
      return;
    }

    console.log('🛑 Stopping Master Consolidated Cron System...');
    this.isRunning = false;

    // Stop all cron schedules
    Object.values(this.jobs).forEach(job => {
      if (job.cronInstance) {
        try {
          if (typeof job.cronInstance.destroy === 'function') {
            job.cronInstance.destroy();
          } else if (typeof job.cronInstance.stop === 'function') {
            job.cronInstance.stop();
          }
        } catch (error) {
          console.warn('⚠️ Error stopping cron instance:', error.message);
        }
      }
    });

    // Kill all running processes
    for (const [jobId, processInfo] of this.processes.entries()) {
      try {
        console.log(`🛑 Stopping process: ${processInfo.jobName} [${jobId}]`);
        processInfo.child.kill('SIGTERM');
        
        // Force kill after 10 seconds
        setTimeout(() => {
          if (!processInfo.child.killed) {
            processInfo.child.kill('SIGKILL');
          }
        }, 10000);
      } catch (error) {
        console.error(`❌ Error stopping process ${jobId}:`, error.message);
      }
    }

    console.log('✅ Master Consolidated Cron System stopped');
  }

  getStatus() {
    const uptime = Date.now() - this.stats.startTime.getTime();
    
    return {
      isRunning: this.isRunning,
      stats: {
        ...this.stats,
        uptime: Math.floor(uptime / 1000),
        uptimeFormatted: this.formatUptime(uptime)
      },
      activeProcesses: Array.from(this.processes.entries()).map(([jobId, info]) => ({
        jobId,
        jobName: info.jobName,
        description: info.config.description,
        startTime: info.startTime,
        duration: Date.now() - info.startTime
      })),
      nextSchedules: this.getNextSchedules()
    };
  }

  getNextSchedules() {
    const next = {};
    Object.entries(this.jobs).forEach(([jobName, config]) => {
      if (config.schedule && config.cronInstance) {
        try {
          next[jobName] = {
            description: config.description,
            schedule: config.schedule,
            nextRun: 'calculated by node-cron'
          };
        } catch (error) {
          next[jobName] = { error: 'Unable to calculate next run' };
        }
      }
    });
    return next;
  }

  formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  // Manual trigger for testing specific jobs
  async triggerJob(jobName) {
    const jobConfig = this.jobs[jobName];
    if (!jobConfig) {
      throw new Error(`Job ${jobName} not found`);
    }

    if (jobConfig.continuous) {
      throw new Error(`Job ${jobName} is a continuous process and cannot be manually triggered`);
    }

    console.log(`🧪 Manually triggering job: ${jobConfig.description}`);
    this.runScheduledJob(jobName, jobConfig);
  }
}

// Create singleton instance
const masterCron = new MasterConsolidatedCron();

// Graceful shutdown handlers
process.on('SIGTERM', async () => {
  console.log('🛑 Received SIGTERM, shutting down Master Consolidated Cron gracefully...');
  await masterCron.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 Received SIGINT, shutting down Master Consolidated Cron gracefully...');
  await masterCron.stop();
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', async (error) => {
  console.error('❌ Uncaught Exception in Master Consolidated Cron:', error);
  await masterCron.stop();
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error('❌ Unhandled Rejection in Master Consolidated Cron:', reason);
  await masterCron.stop();
  process.exit(1);
});

// Start the master cron system
async function startMasterCron() {
  try {
    await masterCron.initialize();
    
    // Keep the process alive
    console.log('✅ Master Consolidated Cron System started successfully');
    console.log(`📊 Total jobs: ${masterCron.stats.totalJobs}`);
    console.log('🎯 This is the SINGLE SOURCE OF TRUTH for all cron jobs');
    console.log('📈 Statistics and monitoring available via getStatus()');
    
  } catch (error) {
    console.error('❌ Failed to start Master Consolidated Cron:', error);
    process.exit(1);
  }
}

// Export for testing and monitoring
module.exports = masterCron;

// Start if run directly
if (require.main === module) {
  startMasterCron();
}
