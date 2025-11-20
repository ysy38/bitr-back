const cron = require('node-cron');
const OddysseyManager = require('../services/oddyssey-manager');
const OddysseyMatchSelector = require('../services/oddyssey-match-selector');
const SportMonksService = require('../services/sportmonks');

class OddysseyScheduler {
  constructor() {
    this.oddysseyManager = new OddysseyManager();
    this.oddysseyMatchSelector = new OddysseyMatchSelector();
    this.sportMonks = new SportMonksService();
    this.isRunning = false;
  }

  /**
   * Start all Oddyssey-related cron jobs
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️  OddysseyScheduler is already running');
      return;
    }

    console.log('🚀 Starting OddysseyScheduler with 1-day strategy...');

    // Initialize the services
    this.oddysseyManager.initialize().catch(error => {
      console.error('❌ Failed to initialize OddysseyManager:', error);
    });

    // Schedule daily cycle start at 00:05 UTC
    // This gives 12+ hour buffer before first match (13:00 UTC minimum)
    this.scheduleNewCycle();

    // Schedule Oddyssey match selection at 00:01 UTC (for match selection)
    // This runs before cycle creation to ensure we have fresh data
    this.scheduleMatchSelection();

    // Schedule cycle resolution checks every hour during result periods
    this.scheduleResolutionCheck();

    // Schedule data cleanup weekly
    this.scheduleDataCleanup();

    this.isRunning = true;
    console.log('✅ OddysseyScheduler started successfully');
  }

  /**
   * Stop all cron jobs
   */
  stop() {
    if (this.newCycleJob) this.newCycleJob.stop();
    if (this.matchSelectionJob) this.matchSelectionJob.stop();
    if (this.resolutionJob) this.resolutionJob.stop();
    if (this.cleanupJob) this.cleanupJob.stop();
    
    this.isRunning = false;
    console.log('🛑 OddysseyScheduler stopped');
  }

  /**
   * Schedule new daily cycle creation
   * Runs daily at 00:05 UTC
   */
  scheduleNewCycle() {
    // '5 0 * * *' = At 00:05 AM UTC every day
    this.newCycleJob = cron.schedule('5 0 * * *', async () => {
      console.log('⏰ Running daily cycle creation job...');
      
      try {
        // Use the new retry logic with built-in retries
        const result = await this.oddysseyManager.startDailyCycleWithRetry(3);
        console.log(`✅ Daily cycle created successfully:`, result);
        
        // Send notification if webhook configured
        await this.sendNotification('cycle_started', result);
        
      } catch (error) {
        console.error('❌ Failed to create daily cycle after all retries:', error);
        
        // Send error notification
        await this.sendNotification('cycle_start_failed', { error: error.message });
        
        // Check cycle sync status and alert if needed
        try {
          const syncStatus = await this.oddysseyManager.checkCycleSync();
          if (!syncStatus.isSynced) {
            console.error('🚨 CYCLE SYNC ISSUE DETECTED!');
            console.error(`DB Cycle: ${syncStatus.dbCycleId}, Contract Cycle: ${syncStatus.contractCycleId}`);
            await this.sendNotification('cycle_sync_issue', syncStatus);
          }
        } catch (syncError) {
          console.error('❌ Failed to check cycle sync status:', syncError);
        }
      }
    }, {
      scheduled: true,
      timezone: "UTC"
    });

    console.log('📅 Scheduled daily cycle creation at 00:05 UTC');
  }

  /**
   * Schedule Oddyssey match selection
   * Runs daily at 00:01 UTC (select matches for current day)
   */
  scheduleMatchSelection() {
    // '1 0 * * *' = At 00:01 UTC every day (select matches for current day)
    this.matchSelectionJob = cron.schedule('1 0 * * *', async () => {
      console.log('⏰ Running Oddyssey match selection job for CURRENT DAY...');
      
      try {
        // Calculate today's date (current day)
        const today = new Date();
        const todayDate = today.toISOString().split('T')[0];
        
        console.log(`🎯 Selecting and persisting matches for today: ${todayDate}`);
        
        // Use PersistentDailyGameManager to select and persist matches for today
        const persistentManager = new (require('../services/persistent-daily-game-manager'))();
        const result = await persistentManager.selectAndPersistDailyMatches(todayDate);
        
        console.log(`✅ Match selection completed for today (${todayDate}):`);
        console.log(`   Matches selected: ${result.matchCount}`);
        console.log(`   Overwrite protected: ${result.overwriteProtected}`);
        
        // Send notification if webhook configured
        await this.sendNotification('matches_selected', result);
        
      } catch (error) {
        console.error('❌ Failed to select Oddyssey matches for today:', error);
        
        // Send error notification
        await this.sendNotification('match_selection_failed', { error: error.message });
        
        // Retry in 30 minutes if failed
        setTimeout(async () => {
          console.log('🔄 Retrying Oddyssey match selection for today...');
          try {
            const today = new Date();
            const todayDate = today.toISOString().split('T')[0];
            
            const persistentManager = new (require('../services/persistent-daily-game-manager'))();
            const result = await persistentManager.selectAndPersistDailyMatches(todayDate);
            console.log(`✅ Oddyssey match selection completed on retry for ${todayDate}`);
          } catch (retryError) {
            console.error('❌ Retry also failed:', retryError);
          }
        }, 30 * 60 * 1000); // 30 minutes
      }
    }, {
      scheduled: true,
      timezone: "UTC"
    });

    console.log('📅 Scheduled Oddyssey match selection at 00:01 UTC (for current day)');
  }

  /**
   * Schedule cycle resolution checks
   * Runs every hour from 22:00 to 06:00 UTC (when matches typically finish)
   */
  scheduleResolutionCheck() {
    // '0 22-23,0-6 * * *' = Every hour from 22:00 to 06:00 UTC
    this.resolutionJob = cron.schedule('0 22-23,0-6 * * *', async () => {
      console.log('⏰ Running cycle resolution check...');
      
      try {
        const needsResolution = await this.checkIfCycleNeedsResolution();
        
        if (needsResolution) {
          console.log('✅ Cycle ready for resolution, triggering...');
          await this.oddysseyManager.resolveDailyCycle();
          
          // Send notification
          await this.sendNotification('cycle_resolved', { timestamp: new Date() });
        } else {
          console.log('⏳ Cycle not ready for resolution yet');
        }
        
      } catch (error) {
        console.error('❌ Error in resolution check:', error);
      }
    }, {
      scheduled: true,
      timezone: "UTC"
    });

    console.log('📅 Scheduled cycle resolution checks (22:00-06:00 UTC)');
  }

  /**
   * Schedule data cleanup
   * Runs weekly on Sunday at 03:00 UTC
   */
  scheduleDataCleanup() {
    // '0 3 * * 0' = At 03:00 AM UTC every Sunday
    this.cleanupJob = cron.schedule('0 3 * * 0', async () => {
      console.log('⏰ Running Oddyssey data cleanup...');
      
      try {
        const db = require('../db/db');
        // Clean up old cycles (keep last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const result = await db.query(`
          DELETE FROM oracle.oddyssey_cycles 
          WHERE created_at < $1
        `, [thirtyDaysAgo]);
        
        console.log(`✅ Cleaned up ${result.rowCount} old cycles`);
        
        // Clean up old match selections (keep last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        const matchResult = await db.query(`
          DELETE FROM oracle.daily_game_matches 
          WHERE game_date < $1
        `, [sevenDaysAgo.toISOString().split('T')[0]]);
        
        console.log(`✅ Cleaned up ${matchResult.rowCount} old match selections`);
        
      } catch (error) {
        console.error('❌ Error in data cleanup:', error);
      }
    }, {
      scheduled: true,
      timezone: "UTC"
    });

    console.log('📅 Scheduled data cleanup on Sundays at 03:00 UTC');
  }

  /**
   * Check if current cycle needs resolution
   */
  async checkIfCycleNeedsResolution() {
    try {
      const db = require('../db/db');
      
      // Get current cycle info
      const cycleQuery = `
        SELECT 
          cycle_id,
          is_resolved,
          matches_data,
          cycle_end_time,
          created_at
        FROM oracle.current_oddyssey_cycle
      `;
      
      const result = await db.query(cycleQuery);
      
      if (result.rows.length === 0) {
        console.log('ℹ️  No active cycle found');
        return false;
      }

      const cycle = result.rows[0];
      
      // Already resolved
      if (cycle.is_resolved) {
        return false;
      }

      // Check if enough time has passed since cycle end
      const now = new Date();
      const cycleEndTime = new Date(cycle.cycle_end_time);
      const timeSinceEnd = now - cycleEndTime;
      
      // Wait at least 2 hours after cycle end before attempting resolution
      if (timeSinceEnd < 2 * 60 * 60 * 1000) {
        console.log(`ℹ️  Cycle ${cycle.cycle_id} ended recently, waiting for match completion`);
        return false;
      }

      // Check if matches have results available
      let matches = [];
      try {
        if (cycle.matches_data && cycle.matches_data !== 'null') {
          matches = JSON.parse(cycle.matches_data);
        } else {
          console.log(`ℹ️ Cycle ${cycle.cycle_id} has no matches data`);
          return false;
        }
      } catch (parseError) {
        console.error(`❌ Error parsing matches data for cycle ${cycle.cycle_id}:`, parseError);
        return false;
      }
      
      // CRITICAL: Validate that all matches have FT state using SportMonks API
      // This replaces the old timing-based validation with proper state checking
      const canResolveByState = await this.validateMatchStateForResolution(matches);
      if (!canResolveByState) {
        console.log(`⏳ Cycle ${cycle.cycle_id} matches haven't all finished yet (waiting for FT state)`);
        return false;
      }
      
      const resultsAvailable = await this.checkMatchResultsAvailability(matches);
      
      if (resultsAvailable >= 8) { // At least 8 out of 10 matches have results
        console.log(`✅ Cycle ${cycle.cycle_id} ready for resolution (${resultsAvailable}/10 results available)`);
        return true;
      } else {
        console.log(`⏳ Cycle ${cycle.cycle_id} waiting for more results (${resultsAvailable}/10 available)`);
        return false;
      }

    } catch (error) {
      console.error('❌ Error checking cycle resolution status:', error);
      return false;
    }
  }

  /**
   * Check how many matches have results available
   */
  async checkMatchResultsAvailability(matches) {
    try {
      const db = require('../db/db');
      const fixtureIds = matches.map(m => m.id);
      
      const query = `
        SELECT COUNT(*) as completed_count
        FROM oracle.fixtures f
        LEFT JOIN oracle.fixture_results fr ON f.id::VARCHAR = fr.fixture_id::VARCHAR
        WHERE f.id = ANY($1)
          AND (f.status = 'FT' OR fr.fixture_id IS NOT NULL)
      `;
      
      const result = await db.query(query, [fixtureIds]);
      return parseInt(result.rows[0].completed_count) || 0;

    } catch (error) {
      console.error('❌ Error checking match results availability:', error);
      return 0;
    }
  }

  /**
   * Send notifications for important events
   */
  async sendNotification(eventType, data) {
    try {
      const webhookUrl = process.env.ODDYSSEY_WEBHOOK_URL;
      
      if (!webhookUrl) {
        return; // No webhook configured
      }

      const payload = {
        event: eventType,
        timestamp: new Date().toISOString(),
        data: data
      };

      const axios = require('axios');
      await axios.post(webhookUrl, payload, {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      console.log(`📡 Notification sent: ${eventType}`);

    } catch (error) {
      console.error('❌ Failed to send notification:', error);
      // Don't throw - notifications are not critical
    }
  }

  /**
   * Manual trigger for new cycle (for testing/emergency)
   */
  async triggerNewCycle() {
    console.log('🔧 Manually triggering new cycle...');
    try {
      const result = await this.oddysseyManager.startDailyCycle();
      console.log('✅ Manual cycle creation successful:', result);
      return result;
    } catch (error) {
      console.error('❌ Manual cycle creation failed:', error);
      throw error;
    }
  }

  /**
   * Manual trigger for cycle resolution (for testing/emergency)
   */
  async triggerResolution() {
    console.log('🔧 Manually triggering cycle resolution...');
    try {
      const result = await this.oddysseyManager.resolveDailyCycle();
      console.log('✅ Manual cycle resolution successful:', result);
      return result;
    } catch (error) {
      console.error('❌ Manual cycle resolution failed:', error);
      throw error;
    }
  }

  /**
   * Manual trigger for match selection (for testing/emergency)
   */
  async triggerMatchSelection() {
    console.log('🔧 Manually triggering match selection...');
    try {
      const today = new Date();
      const todayDate = today.toISOString().split('T')[0];
      
      console.log(`🎯 Selecting and persisting matches for today: ${todayDate}`);
      
      const persistentManager = new (require('../services/persistent-daily-game-manager'))();
      const result = await persistentManager.selectAndPersistDailyMatches(todayDate);
      
      console.log(`✅ Manual match selection successful:`, result);
      return result;
    } catch (error) {
      console.error('❌ Manual match selection failed:', error);
      throw error;
    }
  }

  /**
   * Get scheduler status
   */
  async getStatus() {
    // Check if all required jobs are scheduled
    const hasNewCycle = this.newCycleJob ? true : false;
    const hasMatchSelection = this.matchSelectionJob ? true : false;
    const hasResolution = this.resolutionJob ? true : false;
    const hasCleanup = this.cleanupJob ? true : false;
    
    // Return 'healthy' if all jobs are scheduled and scheduler is running
    if (this.isRunning && hasNewCycle && hasMatchSelection && hasResolution && hasCleanup) {
      return 'healthy';
    } else {
      return 'unhealthy';
    }
  }

  /**
   * Validate that all matches have finished (FT state) using SportMonks API
   * This is the proper way to check if matches are ready for resolution
   */
  async validateMatchStateForResolution(matches) {
    try {
      if (!matches || !Array.isArray(matches) || matches.length === 0) {
        console.log(`⚠️  [Scheduler] No match data available, allowing resolution`);
        return true;
      }

      // Get fixture IDs from match data
      const fixtureIds = matches.map(match => {
        if (typeof match === 'string') {
          return match;
        } else if (typeof match === 'object' && match.id) {
          return match.id;
        }
        return null;
      }).filter(id => id);

      if (fixtureIds.length === 0) {
        console.log(`⚠️  [Scheduler] No fixture IDs found, allowing resolution`);
        return true;
      }

      console.log(`🔍 [Scheduler] Checking state for ${fixtureIds.length} matches...`);

      const db = require('../db/db');
      // Check current status in database first
      const dbStatusQuery = `
        SELECT 
          f.id,
          f.home_team,
          f.away_team,
          f.status,
          f.match_date
        FROM oracle.fixtures f
        WHERE f.id = ANY($1)
        ORDER BY f.match_date DESC
      `;

      const dbResult = await db.query(dbStatusQuery, [fixtureIds]);
      const fixtures = dbResult.rows;

      let finishedCount = 0;
      let inPlayCount = 0;
      let notStartedCount = 0;

      // Count current states
      for (const fixture of fixtures) {
        const status = fixture.status?.toUpperCase() || 'UNKNOWN';
        
        if (['FT', 'AET', 'FT_PEN'].includes(status)) {
          finishedCount++;
        } else if (['INPLAY_1ST_HALF', 'INPLAY_2ND_HALF', 'INPLAY_ET', 'INPLAY_PENALTIES', 'HT'].includes(status)) {
          inPlayCount++;
        } else {
          notStartedCount++;
        }
      }

      console.log(`📊 [Scheduler] Match states:`);
      console.log(`   • Finished (FT/AET/FT_PEN): ${finishedCount}/${fixtures.length}`);
      console.log(`   • In-play: ${inPlayCount}/${fixtures.length}`);
      console.log(`   • Not started/Other: ${notStartedCount}/${fixtures.length}`);

      // If all matches are finished, we can resolve
      if (finishedCount === fixtures.length) {
        console.log(`✅ [Scheduler] All matches finished - ready for resolution`);
        return true;
      }

      // If there are in-play matches, update their states from SportMonks
      if (inPlayCount > 0 || notStartedCount > 0) {
        console.log(`🔄 [Scheduler] Updating match states from SportMonks API...`);
        
        let updatedFinishedCount = finishedCount;
        
        for (const fixture of fixtures) {
          const status = fixture.status?.toUpperCase() || 'UNKNOWN';
          
          // Skip already finished matches
          if (['FT', 'AET', 'FT_PEN'].includes(status)) {
            continue;
          }

          try {
            // Fetch current state from SportMonks
            const response = await this.sportMonks.axios.get(`/fixtures/${fixture.id}`, {
              params: {
                'api_token': this.sportMonks.apiToken,
                'include': 'state'
              }
            });

            const fixtureData = response.data.data;
            const currentState = fixtureData.state?.state?.toUpperCase() || 'UNKNOWN';
            
            console.log(`   📍 ${fixture.home_team} vs ${fixture.away_team}: ${fixture.status} → ${currentState}`);

            // Update database if state changed
            if (currentState !== fixture.status) {
              await db.query(`
                UPDATE oracle.fixtures 
                SET status = $1, updated_at = NOW() 
                WHERE id = $2
              `, [currentState, fixture.id]);
            }

            // Check if match is now finished
            if (['FT', 'AET', 'FT_PEN'].includes(currentState)) {
              updatedFinishedCount++;
            }

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 200));

          } catch (error) {
            console.warn(`⚠️  Failed to update state for fixture ${fixture.id}:`, error.message);
          }
        }

        console.log(`📊 [Scheduler] Updated states: ${updatedFinishedCount}/${fixtures.length} finished`);

        // Check if all matches are now finished
        if (updatedFinishedCount === fixtures.length) {
          console.log(`✅ [Scheduler] All matches now finished - ready for resolution`);
          return true;
        }
      }

      // Not all matches are finished yet
      const remainingMatches = fixtures.length - finishedCount;
      console.log(`⏳ [Scheduler] Cannot resolve yet - ${remainingMatches} matches still pending completion`);
      
      // Show which matches are still pending
      for (const fixture of fixtures) {
        const status = fixture.status?.toUpperCase() || 'UNKNOWN';
        if (!['FT', 'AET', 'FT_PEN'].includes(status)) {
          console.log(`   ⏳ ${fixture.home_team} vs ${fixture.away_team}: ${status}`);
        }
      }

      return false;

    } catch (error) {
      console.error(`❌ Error validating match states:`, error);
      return true; // Allow resolution on error to prevent getting stuck
    }
  }

  /**
   * DEPRECATED: Old timing-based validation - replaced by state-based validation
   * Kept for fallback compatibility
   */
  async validateMatchTimingForResolution(matches) {
    try {
      if (!matches || !Array.isArray(matches) || matches.length === 0) {
        return true;
      }

      // Get fixture IDs from match data
      const fixtureIds = matches.map(match => {
        if (typeof match === 'string') {
          return match;
        } else if (typeof match === 'object' && match.id) {
          return match.id;
        }
        return null;
      }).filter(id => id);

      if (fixtureIds.length === 0) {
        return true;
      }

      const db = require('../db/db');
      const matchQuery = `
        SELECT 
          MAX(f.match_date) as latest_match_start_time
        FROM oracle.fixtures f
        WHERE f.id = ANY($1)
      `;

      const result = await db.query(matchQuery, [fixtureIds]);
      const latestMatchStartTime = result.rows[0]?.latest_match_start_time;

      if (!latestMatchStartTime) {
        return true;
      }

      const now = new Date();
      const matchStart = new Date(latestMatchStartTime);
      const MATCH_DURATION_MS = 120 * 60 * 1000; // 2 hours
      const earliestResolutionTime = new Date(matchStart.getTime() + MATCH_DURATION_MS);

      console.log(`⏱️  [Scheduler] Match timing validation:`);
      console.log(`   • Latest match start: ${matchStart.toISOString()}`);
      console.log(`   • Earliest resolution allowed: ${earliestResolutionTime.toISOString()}`);
      console.log(`   • Current time: ${now.toISOString()}`);

      if (now.getTime() < earliestResolutionTime.getTime()) {
        const minutesUntil = Math.ceil((earliestResolutionTime.getTime() - now.getTime()) / (60 * 1000));
        console.log(`❌ Cannot resolve - must wait ${minutesUntil} more minutes`);
        return false;
      }

      console.log(`✅ Match timing validation passed`);
      return true;

    } catch (error) {
      console.error(`⚠️  Error validating match timing:`, error);
      return true; // Allow resolution on error
    }
  }
}

// Export singleton instance
const oddysseyScheduler = new OddysseyScheduler();

module.exports = oddysseyScheduler; 