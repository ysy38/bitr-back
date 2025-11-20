const SportMonksService = require('./sportmonks');
const OddysseyMatchSelector = require('./oddyssey-match-selector');
const db = require('../db/db');

class StartupInitializer {
  constructor() {
    this.sportmonks = new SportMonksService();
    this.oddysseySelector = new OddysseyMatchSelector();
    this.isInitialized = false;
  }

  /**
   * Initialize system on deployment:
   * DISABLED: Auto-fetching and selection removed for manual control via admin endpoints
   * 1. Wait 2 minutes after successful deployment
   * 2. Check system status only (no auto-fetching)
   * 3. Report status for manual admin control
   */
  async initialize() {
    if (this.isInitialized) {
      console.log('📋 Startup initialization already completed');
      return;
    }

    // Prevent multiple initialization attempts using simple file check
    const fs = require('fs');
    const path = require('path');
    const initFile = '/tmp/startup_init_attempted';
    
    try {
      // Check if initialization was already attempted (prevent loops)
      if (fs.existsSync(initFile)) {
        console.log('🔒 Startup initialization already attempted - preventing loops');
        this.isInitialized = true;
        return;
      }
      
      // Mark initialization as attempted (before starting)
      fs.writeFileSync(initFile, new Date().toISOString());

      console.log('🚀 Starting deployment initialization sequence...');
      
      // Wait 2 minutes after deployment
      console.log('⏰ Waiting 2 minutes after deployment before system check...');
      await this.delay(2 * 60 * 1000); // 2 minutes
      
      // Step 1: Check system status only (no auto-fetching)
      console.log('📊 Step 1: Checking system status (no auto-fetching)...');
      try {
        const status = await this.getSystemStatus();
        console.log('✅ System status check completed');
        console.log(`📊 Status: ${status.fixtures} fixtures, ${status.oddyssey} Oddyssey matches for today`);
        
        if (status.fixtures < 10 || status.oddyssey === 0) {
          console.log('⚠️ System needs manual initialization via admin endpoints');
          console.log('   Use: /api/admin/fetch-7day-fixtures');
          console.log('   Use: /api/admin/select-oddyssey-matches');
        }
      } catch (statusError) {
        console.error('❌ Status check failed:', statusError.message);
      }
      
      this.isInitialized = true;
      console.log('🎉 Deployment initialization completed (manual control enabled)!');
      
    } catch (error) {
      console.error('❌ Deployment initialization failed:', error);
      // Don't throw - let the app continue running even if initialization fails
    }
  }

  /**
   * Ensure Oddyssey matches are selected for current date
   * PERSISTENT: Only selects once, doesn't change existing selections
   */
  async ensureOddysseyMatchesSelected() {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Check if matches already selected for today (PERSISTENT)
      const existingMatches = await db.query(`
        SELECT COUNT(*) as count 
        FROM oracle.daily_game_matches 
        WHERE game_date = $1
      `, [today]);
      
      const matchCount = parseInt(existingMatches.rows[0].count);
      
      if (matchCount > 0) {
        console.log(`✅ Oddyssey matches already selected for ${today} (${matchCount} matches) - keeping existing selections`);
        return;
      }

      console.log(`🎯 No existing Oddyssey matches for ${today} - selecting new matches...`);
      
      // Select matches for today
      const selections = await this.oddysseySelector.selectDailyMatches();
      
      if (!selections || !selections.selectedMatches || selections.selectedMatches.length === 0) {
        console.warn(`⚠️ No matches available for selection on ${today}`);
        return;
      }

      // Save selections to database
      await this.oddysseySelector.saveOddysseyMatches(selections);
      
      console.log(`✅ Selected and saved ${selections.selectedMatches.length} Oddyssey matches for ${today}`);
      console.log(`📊 Selection quality: Easy: ${selections.summary.easy}, Medium: ${selections.summary.medium}, Hard: ${selections.summary.hard}`);
      
    } catch (error) {
      console.error('❌ Error ensuring Oddyssey matches selected:', error);
      throw error;
    }
  }

  /**
   * Check if system needs initialization (called on every startup)
   */
  async checkAndInitialize() {
    try {
      // Check if we need to run initialization
      const needsInit = await this.needsInitialization();
      
      if (needsInit) {
        console.log('🔄 System needs initialization - starting sequence...');
        // Run initialization in background (don't block app startup)
        this.initialize().catch(error => {
          console.error('❌ Background initialization failed:', error);
        });
      } else {
        console.log('✅ System already initialized');
        this.isInitialized = true;
      }
      
    } catch (error) {
      console.error('❌ Error checking initialization status:', error);
    }
  }

  /**
   * Get system status (no auto-initialization)
   */
  async getSystemStatus() {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Check 1: Do we have fixtures for today?
      const fixtureResult = await db.query(`
        SELECT COUNT(*) as count 
        FROM oracle.fixtures 
        WHERE DATE(match_date) = CURRENT_DATE
      `);
      
      const fixtureCount = parseInt(fixtureResult.rows[0].count);
      
      // Check 2: Do we have Oddyssey matches for today?
      const oddysseyResult = await db.query(`
        SELECT COUNT(*) as count 
        FROM oracle.daily_game_matches 
        WHERE game_date = $1
      `, [today]);
      
      const oddysseyCount = parseInt(oddysseyResult.rows[0].count);
      
      return {
        fixtures: fixtureCount,
        oddyssey: oddysseyCount,
        today: today
      };
      
    } catch (error) {
      console.warn('⚠️ Error getting system status:', error.message);
      return { fixtures: 0, oddyssey: 0, today: new Date().toISOString().split('T')[0] };
    }
  }

  /**
   * Check if system needs initialization (DISABLED - manual control only)
   */
  async needsInitialization() {
    // DISABLED: No longer auto-initializes, manual control via admin endpoints
    console.log('🔒 Auto-initialization disabled - use admin endpoints for manual control');
    return false;
  }

  /**
   * Utility: Delay for specified milliseconds
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get initialization status
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = StartupInitializer;
