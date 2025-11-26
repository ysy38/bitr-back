#!/usr/bin/env node

/**
 * Comprehensive Analytics Aggregator
 * Aggregates data from all contract events and provides real-time analytics
 * Based on actual contract ABIs and current database schema
 */

require('dotenv').config();
const db = require('../db/db');
const cron = require('node-cron');
const { ethers } = require('ethers');

class AnalyticsAggregator {
  constructor() {
    this.isRunning = false;
    this.provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  }

  /**
   * Aggregate Odyssey-specific analytics
   */
  async aggregateOdysseyStats(targetDate = null) {
    try {
      const date = targetDate || new Date().toISOString().split('T')[0];
      console.log(`📊 Aggregating Odyssey stats for ${date}...`);

      // Get Odyssey cycle statistics
      const odysseyStats = await db.query(`
        SELECT 
          COUNT(*) as total_cycles,
          COUNT(CASE WHEN is_resolved = true THEN 1 END) as resolved_cycles,
          COUNT(CASE WHEN is_resolved = false THEN 1 END) as active_cycles,
          COALESCE(SUM(prize_pool), 0) as total_prize_pools,
          COALESCE(AVG(prize_pool), 0) as avg_prize_pool,
          COUNT(DISTINCT CASE WHEN is_resolved = true THEN cycle_id END) as completed_cycles
        FROM oracle.oddyssey_cycles 
        WHERE DATE(created_at) = $1
      `, [date]);

      // Get slip statistics
      const slipStats = await db.query(`
        SELECT 
          COUNT(*) as total_slips,
          COUNT(DISTINCT player_address) as unique_players,
          COALESCE(AVG(correct_count), 0) as avg_correct_predictions,
          COALESCE(MAX(correct_count), 0) as max_correct_predictions,
          COUNT(CASE WHEN is_evaluated = true THEN 1 END) as evaluated_slips,
          COUNT(CASE WHEN prize_claimed = true THEN 1 END) as claimed_prizes
        FROM oracle.oddyssey_slips 
        WHERE DATE(placed_at) = $1
      `, [date]);

      // Get user analytics
      const userStats = await db.query(`
        SELECT 
          COUNT(DISTINCT user_address) as active_users,
          COALESCE(AVG(accuracy_percentage), 0) as avg_accuracy,
          COALESCE(MAX(accuracy_percentage), 0) as best_accuracy
        FROM oracle.oddyssey_user_analytics 
        WHERE DATE(created_at) = $1
      `, [date]);

      // Get prize claim statistics
      const prizeStats = await db.query(`
        SELECT 
          COUNT(*) as total_claims,
          COALESCE(SUM(amount), 0) as total_prizes_claimed,
          COALESCE(AVG(amount), 0) as avg_prize_amount,
          COUNT(DISTINCT player_address) as unique_winners
        FROM oracle.oddyssey_prize_claims 
        WHERE DATE(claimed_at) = $1
      `, [date]);

      const stats = {
        date,
        odyssey: odysseyStats.rows[0] || {},
        slips: slipStats.rows[0] || {},
        users: userStats.rows[0] || {},
        prizes: prizeStats.rows[0] || {}
      };

      // Store aggregated stats
      await this.storeOdysseyDailyStats(stats);
      console.log(`✅ Odyssey stats aggregated for ${date}`);

      return stats;

    } catch (error) {
      console.error('❌ Error aggregating Odyssey stats:', error);
      throw error;
    }
  }

  /**
   * Aggregate crypto market analytics
   */
  async aggregateCryptoStats(targetDate = null) {
    try {
      const date = targetDate || new Date().toISOString().split('T')[0];
      console.log(`📊 Aggregating crypto stats for ${date}...`);

              // Get crypto market statistics
        const cryptoStats = await db.query(`
          SELECT 
            COUNT(*) as total_markets,
            COUNT(CASE WHEN resolved = true THEN 1 END) as resolved_markets,
            COUNT(CASE WHEN resolved = false THEN 1 END) as active_markets,
          0 as total_volume,
          0 as avg_volume,
          COUNT(DISTINCT coinpaprika_id) as unique_coins
        FROM oracle.crypto_prediction_markets 
        WHERE DATE(created_at) = $1
      `, [date]);

      // Get crypto price statistics
      const priceStats = await db.query(`
        SELECT 
          COUNT(*) as price_snapshots,
          COUNT(DISTINCT coinpaprika_id) as tracked_coins,
          COALESCE(AVG(price_usd), 0) as avg_price,
          COALESCE(MAX(price_usd), 0) as max_price,
          COALESCE(MIN(price_usd), 0) as min_price
        FROM oracle.crypto_price_snapshots 
        WHERE DATE(created_at) = $1
      `, [date]);

      const stats = {
        date,
        markets: cryptoStats.rows[0] || {},
        prices: priceStats.rows[0] || {}
      };

      // Store aggregated stats
      await this.storeCryptoDailyStats(stats);
      console.log(`✅ Crypto stats aggregated for ${date}`);

      return stats;

    } catch (error) {
      console.error('❌ Error aggregating crypto stats:', error);
      throw error;
    }
  }

  /**
   * Aggregate football/sports analytics
   */
  async aggregateFootballStats(targetDate = null) {
    try {
      const date = targetDate || new Date().toISOString().split('T')[0];
      console.log(`📊 Aggregating football stats for ${date}...`);

      // Get fixture statistics
      const fixtureStats = await db.query(`
        SELECT 
          COUNT(*) as total_fixtures,
          COUNT(CASE WHEN status = 'FT' THEN 1 END) as completed_matches,
          COUNT(CASE WHEN status = 'NS' THEN 1 END) as upcoming_matches,
          COUNT(CASE WHEN status = 'LIVE' THEN 1 END) as live_matches,
          COUNT(DISTINCT league_name) as unique_leagues,
          COUNT(DISTINCT home_team) + COUNT(DISTINCT away_team) as unique_teams
        FROM oracle.fixtures 
        WHERE DATE(match_date) = $1
      `, [date]);

              // Get market statistics
        const marketStats = await db.query(`
          SELECT 
            COUNT(*) as total_markets,
            COUNT(CASE WHEN resolved = true THEN 1 END) as resolved_markets,
            COUNT(CASE WHEN resolved = false THEN 1 END) as active_markets,
          0 as total_volume,
          0 as avg_volume
        FROM oracle.football_prediction_markets 
        WHERE DATE(created_at) = $1
      `, [date]);

      // Get odds statistics
      const oddsStats = await db.query(`
        SELECT 
          COUNT(*) as total_odds,
          COUNT(DISTINCT fixture_id) as fixtures_with_odds,
          COUNT(DISTINCT market_id) as unique_markets,
          COALESCE(AVG(value), 0) as avg_odds
        FROM oracle.fixture_odds 
        WHERE DATE(created_at) = $1
      `, [date]);

      const stats = {
        date,
        fixtures: fixtureStats.rows[0] || {},
        markets: marketStats.rows[0] || {},
        odds: oddsStats.rows[0] || {}
      };

      // Store aggregated stats
      await this.storeFootballDailyStats(stats);
      console.log(`✅ Football stats aggregated for ${date}`);

      return stats;

    } catch (error) {
      console.error('❌ Error aggregating football stats:', error);
      throw error;
    }
  }

  /**
   * Aggregate user activity analytics
   */
  async aggregateUserActivity(targetDate = null) {
    try {
      const date = targetDate || new Date().toISOString().split('T')[0];
      console.log(`📊 Aggregating user activity for ${date}...`);

      // Get user activity from Odyssey
      const odysseyActivity = await db.query(`
        SELECT 
          COUNT(DISTINCT player_address) as active_users,
          COUNT(*) as total_actions,
          COUNT(CASE WHEN is_evaluated = true THEN 1 END) as evaluated_slips
        FROM oracle.oddyssey_slips 
        WHERE DATE(placed_at) = $1
      `, [date]);

      // Get user performance statistics
      const userPerformance = await db.query(`
        SELECT 
          COUNT(DISTINCT user_address) as users_with_stats,
          COALESCE(AVG(overall_accuracy_percentage), 0) as avg_accuracy,
          COALESCE(MAX(overall_accuracy_percentage), 0) as best_accuracy,
          COALESCE(SUM(total_slips), 0) as total_slips_placed,
          COALESCE(SUM(total_correct_predictions), 0) as total_correct_predictions
        FROM oracle.oddyssey_cumulative_stats 
        WHERE DATE(updated_at) = $1
      `, [date]);

      // Get new user registrations (estimated from first slip)
      const newUsers = await db.query(`
        SELECT COUNT(DISTINCT player_address) as new_users
        FROM oracle.oddyssey_slips 
        WHERE DATE(placed_at) = $1
        AND player_address NOT IN (
          SELECT DISTINCT player_address 
          FROM oracle.oddyssey_slips 
          WHERE DATE(placed_at) < $1
        )
      `, [date]);

      const stats = {
        date,
        activity: odysseyActivity.rows[0] || {},
        performance: userPerformance.rows[0] || {},
        newUsers: newUsers.rows[0] || {}
      };

      // Store aggregated stats
      await this.storeUserActivityStats(stats);
      console.log(`✅ User activity aggregated for ${date}`);

      return stats;

    } catch (error) {
      console.error('❌ Error aggregating user activity:', error);
      throw error;
    }
  }

  /**
   * Generate platform overview statistics
   */
  async generatePlatformOverview() {
    try {
      console.log('📊 Generating platform overview...');

      // Get overall platform statistics
      const platformStats = await db.query(`
        SELECT 
          -- Odyssey stats
          (SELECT COUNT(*) FROM oracle.oddyssey_cycles WHERE is_resolved = true) as total_odyssey_cycles,
          (SELECT COUNT(*) FROM oracle.oddyssey_slips) as total_odyssey_slips,
          (SELECT COUNT(DISTINCT player_address) FROM oracle.oddyssey_slips) as total_odyssey_users,
          (SELECT COALESCE(SUM(prize_pool), 0) FROM oracle.oddyssey_cycles WHERE is_resolved = true) as total_odyssey_prizes,
          
          -- Crypto stats
          (SELECT COUNT(*) FROM oracle.crypto_prediction_markets WHERE resolved = true) as total_crypto_markets,
          (SELECT COUNT(DISTINCT symbol) FROM oracle.crypto_coins) as total_crypto_coins,
          0 as total_crypto_volume,
          
          -- Football stats
          (SELECT COUNT(*) FROM oracle.fixtures WHERE status = 'FT') as total_football_matches,
          (SELECT COUNT(DISTINCT league_name) FROM oracle.fixtures) as total_football_leagues,
          (SELECT COUNT(*) FROM oracle.football_prediction_markets WHERE resolved = true) as total_football_markets,
          
          -- User stats
          (SELECT COUNT(DISTINCT user_address) FROM oracle.oddyssey_cumulative_stats) as total_registered_users,
          (SELECT COALESCE(AVG(overall_accuracy_percentage), 0) FROM oracle.oddyssey_cumulative_stats) as avg_user_accuracy
      `);

      const overview = platformStats.rows[0] || {};

      // Calculate growth metrics (comparing with yesterday)
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const yesterdayStats = await db.query(`
        SELECT 
          (SELECT COUNT(*) FROM oracle.oddyssey_slips WHERE DATE(placed_at) = $1) as yesterday_slips,
          (SELECT COUNT(DISTINCT player_address) FROM oracle.oddyssey_slips WHERE DATE(placed_at) = $1) as yesterday_users
      `, [yesterday]);

      const growth = {
        slipsGrowth: yesterdayStats.rows[0]?.yesterday_slips || 0,
        usersGrowth: yesterdayStats.rows[0]?.yesterday_users || 0
      };

      const result = {
        overview,
        growth,
        timestamp: new Date().toISOString()
      };

      // Store platform overview
      await this.storePlatformOverview(result);
      console.log('✅ Platform overview generated');

      return result;

    } catch (error) {
      console.error('❌ Error generating platform overview:', error);
      throw error;
    }
  }

  /**
   * Store Odyssey daily statistics
   */
  async storeOdysseyDailyStats(stats) {
    try {
      await db.query(`
        INSERT INTO oracle.analytics_odyssey_daily 
        (date, total_cycles, resolved_cycles, active_cycles, total_prize_pools, avg_prize_pool,
         total_slips, unique_players, avg_correct_predictions, max_correct_predictions,
         evaluated_slips, claimed_prizes, active_users, avg_accuracy, best_accuracy,
         total_claims, total_prizes_claimed, avg_prize_amount, unique_winners)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        ON CONFLICT (date) DO UPDATE SET
          total_cycles = EXCLUDED.total_cycles,
          resolved_cycles = EXCLUDED.resolved_cycles,
          active_cycles = EXCLUDED.active_cycles,
          total_prize_pools = EXCLUDED.total_prize_pools,
          avg_prize_pool = EXCLUDED.avg_prize_pool,
          total_slips = EXCLUDED.total_slips,
          unique_players = EXCLUDED.unique_players,
          avg_correct_predictions = EXCLUDED.avg_correct_predictions,
          max_correct_predictions = EXCLUDED.max_correct_predictions,
          evaluated_slips = EXCLUDED.evaluated_slips,
          claimed_prizes = EXCLUDED.claimed_prizes,
          active_users = EXCLUDED.active_users,
          avg_accuracy = EXCLUDED.avg_accuracy,
          best_accuracy = EXCLUDED.best_accuracy,
          total_claims = EXCLUDED.total_claims,
          total_prizes_claimed = EXCLUDED.total_prizes_claimed,
          avg_prize_amount = EXCLUDED.avg_prize_amount,
          unique_winners = EXCLUDED.unique_winners,
          updated_at = NOW()
      `, [
        stats.date,
        stats.odyssey.total_cycles || 0,
        stats.odyssey.resolved_cycles || 0,
        stats.odyssey.active_cycles || 0,
        stats.odyssey.total_prize_pools || 0,
        stats.odyssey.avg_prize_pool || 0,
        stats.slips.total_slips || 0,
        stats.slips.unique_players || 0,
        stats.slips.avg_correct_predictions || 0,
        stats.slips.max_correct_predictions || 0,
        stats.slips.evaluated_slips || 0,
        stats.slips.claimed_prizes || 0,
        stats.users.active_users || 0,
        stats.users.avg_accuracy || 0,
        stats.users.best_accuracy || 0,
        stats.prizes.total_claims || 0,
        stats.prizes.total_prizes_claimed || 0,
        stats.prizes.avg_prize_amount || 0,
        stats.prizes.unique_winners || 0
      ]);
    } catch (error) {
      console.error('❌ Error storing Odyssey daily stats:', error);
      throw error;
    }
  }

  /**
   * Store crypto daily statistics
   */
  async storeCryptoDailyStats(stats) {
    try {
      await db.query(`
        INSERT INTO oracle.analytics_crypto_daily 
        (date, total_markets, resolved_markets, active_markets, total_volume, avg_volume,
         unique_coins, price_snapshots, tracked_coins, avg_price, max_price, min_price)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (date) DO UPDATE SET
          total_markets = EXCLUDED.total_markets,
          resolved_markets = EXCLUDED.resolved_markets,
          active_markets = EXCLUDED.active_markets,
          total_volume = EXCLUDED.total_volume,
          avg_volume = EXCLUDED.avg_volume,
          unique_coins = EXCLUDED.unique_coins,
          price_snapshots = EXCLUDED.price_snapshots,
          tracked_coins = EXCLUDED.tracked_coins,
          avg_price = EXCLUDED.avg_price,
          max_price = EXCLUDED.max_price,
          min_price = EXCLUDED.min_price,
          updated_at = NOW()
      `, [
        stats.date,
        stats.markets.total_markets || 0,
        stats.markets.resolved_markets || 0,
        stats.markets.active_markets || 0,
        stats.markets.total_volume || 0,
        stats.markets.avg_volume || 0,
        stats.markets.unique_coins || 0,
        stats.prices.price_snapshots || 0,
        stats.prices.tracked_coins || 0,
        stats.prices.avg_price || 0,
        stats.prices.max_price || 0,
        stats.prices.min_price || 0
      ]);
    } catch (error) {
      console.error('❌ Error storing crypto daily stats:', error);
      throw error;
    }
  }

  /**
   * Store football daily statistics
   */
  async storeFootballDailyStats(stats) {
    try {
      await db.query(`
        INSERT INTO oracle.analytics_football_daily 
        (date, total_fixtures, completed_matches, upcoming_matches, live_matches,
         unique_leagues, unique_teams, total_markets, resolved_markets, active_markets,
         total_volume, avg_volume, total_odds, fixtures_with_odds, unique_markets, avg_odds)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        ON CONFLICT (date) DO UPDATE SET
          total_fixtures = EXCLUDED.total_fixtures,
          completed_matches = EXCLUDED.completed_matches,
          upcoming_matches = EXCLUDED.upcoming_matches,
          live_matches = EXCLUDED.live_matches,
          unique_leagues = EXCLUDED.unique_leagues,
          unique_teams = EXCLUDED.unique_teams,
          total_markets = EXCLUDED.total_markets,
          resolved_markets = EXCLUDED.resolved_markets,
          active_markets = EXCLUDED.active_markets,
          total_volume = EXCLUDED.total_volume,
          avg_volume = EXCLUDED.avg_volume,
          total_odds = EXCLUDED.total_odds,
          fixtures_with_odds = EXCLUDED.fixtures_with_odds,
          unique_markets = EXCLUDED.unique_markets,
          avg_odds = EXCLUDED.avg_odds,
          updated_at = NOW()
      `, [
        stats.date,
        stats.fixtures.total_fixtures || 0,
        stats.fixtures.completed_matches || 0,
        stats.fixtures.upcoming_matches || 0,
        stats.fixtures.live_matches || 0,
        stats.fixtures.unique_leagues || 0,
        stats.fixtures.unique_teams || 0,
        stats.markets.total_markets || 0,
        stats.markets.resolved_markets || 0,
        stats.markets.active_markets || 0,
        stats.markets.total_volume || 0,
        stats.markets.avg_volume || 0,
        stats.odds.total_odds || 0,
        stats.odds.fixtures_with_odds || 0,
        stats.odds.unique_markets || 0,
        stats.odds.avg_odds || 0
      ]);
    } catch (error) {
      console.error('❌ Error storing football daily stats:', error);
      throw error;
    }
  }

  /**
   * Store user activity statistics
   */
  async storeUserActivityStats(stats) {
    try {
      await db.query(`
        INSERT INTO oracle.analytics_user_activity_daily 
        (date, active_users, total_actions, evaluated_slips, users_with_stats,
         avg_accuracy, best_accuracy, total_slips_placed, total_correct_predictions, new_users)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (date) DO UPDATE SET
          active_users = EXCLUDED.active_users,
          total_actions = EXCLUDED.total_actions,
          evaluated_slips = EXCLUDED.evaluated_slips,
          users_with_stats = EXCLUDED.users_with_stats,
          avg_accuracy = EXCLUDED.avg_accuracy,
          best_accuracy = EXCLUDED.best_accuracy,
          total_slips_placed = EXCLUDED.total_slips_placed,
          total_correct_predictions = EXCLUDED.total_correct_predictions,
          new_users = EXCLUDED.new_users,
          updated_at = NOW()
      `, [
        stats.date,
        stats.activity.active_users || 0,
        stats.activity.total_actions || 0,
        stats.activity.evaluated_slips || 0,
        stats.performance.users_with_stats || 0,
        stats.performance.avg_accuracy || 0,
        stats.performance.best_accuracy || 0,
        stats.performance.total_slips_placed || 0,
        stats.performance.total_correct_predictions || 0,
        stats.newUsers.new_users || 0
      ]);
    } catch (error) {
      console.error('❌ Error storing user activity stats:', error);
      throw error;
    }
  }

  /**
   * Store platform overview
   */
  async storePlatformOverview(overview) {
    try {
      await db.query(`
        INSERT INTO oracle.analytics_platform_overview 
        (overview_data, growth_data, timestamp)
        VALUES ($1, $2, $3)
        ON CONFLICT (id) DO UPDATE SET
          overview_data = EXCLUDED.overview_data,
          growth_data = EXCLUDED.growth_data,
          timestamp = EXCLUDED.timestamp
        WHERE oracle.analytics_platform_overview.id = 1
      `, [
        JSON.stringify(overview.overview),
        JSON.stringify(overview.growth),
        overview.timestamp
      ]);
    } catch (error) {
      console.error('❌ Error storing platform overview:', error);
      throw error;
    }
  }

  /**
   * Create analytics tables if they don't exist
   */
  async createAnalyticsTables() {
    try {
      console.log('🗄️ Creating analytics tables...');

      // Create Odyssey daily analytics table
      await db.query(`
        CREATE TABLE IF NOT EXISTS oracle.analytics_odyssey_daily (
          id BIGSERIAL PRIMARY KEY,
          date DATE UNIQUE NOT NULL,
          total_cycles INTEGER DEFAULT 0,
          resolved_cycles INTEGER DEFAULT 0,
          active_cycles INTEGER DEFAULT 0,
          total_prize_pools NUMERIC DEFAULT 0,
          avg_prize_pool NUMERIC DEFAULT 0,
          total_slips INTEGER DEFAULT 0,
          unique_players INTEGER DEFAULT 0,
          avg_correct_predictions NUMERIC DEFAULT 0,
          max_correct_predictions INTEGER DEFAULT 0,
          evaluated_slips INTEGER DEFAULT 0,
          claimed_prizes INTEGER DEFAULT 0,
          active_users INTEGER DEFAULT 0,
          avg_accuracy NUMERIC DEFAULT 0,
          best_accuracy NUMERIC DEFAULT 0,
          total_claims INTEGER DEFAULT 0,
          total_prizes_claimed NUMERIC DEFAULT 0,
          avg_prize_amount NUMERIC DEFAULT 0,
          unique_winners INTEGER DEFAULT 0,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);

      // Create crypto daily analytics table
      await db.query(`
        CREATE TABLE IF NOT EXISTS oracle.analytics_crypto_daily (
          id BIGSERIAL PRIMARY KEY,
          date DATE UNIQUE NOT NULL,
          total_markets INTEGER DEFAULT 0,
          resolved_markets INTEGER DEFAULT 0,
          active_markets INTEGER DEFAULT 0,
          total_volume NUMERIC DEFAULT 0,
          avg_volume NUMERIC DEFAULT 0,
          unique_coins INTEGER DEFAULT 0,
          price_snapshots INTEGER DEFAULT 0,
          tracked_coins INTEGER DEFAULT 0,
          avg_price NUMERIC DEFAULT 0,
          max_price NUMERIC DEFAULT 0,
          min_price NUMERIC DEFAULT 0,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);

      // Create football daily analytics table
      await db.query(`
        CREATE TABLE IF NOT EXISTS oracle.analytics_football_daily (
          id BIGSERIAL PRIMARY KEY,
          date DATE UNIQUE NOT NULL,
          total_fixtures INTEGER DEFAULT 0,
          completed_matches INTEGER DEFAULT 0,
          upcoming_matches INTEGER DEFAULT 0,
          live_matches INTEGER DEFAULT 0,
          unique_leagues INTEGER DEFAULT 0,
          unique_teams INTEGER DEFAULT 0,
          total_markets INTEGER DEFAULT 0,
          resolved_markets INTEGER DEFAULT 0,
          active_markets INTEGER DEFAULT 0,
          total_volume NUMERIC DEFAULT 0,
          avg_volume NUMERIC DEFAULT 0,
          total_odds INTEGER DEFAULT 0,
          fixtures_with_odds INTEGER DEFAULT 0,
          unique_markets INTEGER DEFAULT 0,
          avg_odds NUMERIC DEFAULT 0,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);

      // Create user activity daily analytics table
      await db.query(`
        CREATE TABLE IF NOT EXISTS oracle.analytics_user_activity_daily (
          id BIGSERIAL PRIMARY KEY,
          date DATE UNIQUE NOT NULL,
          active_users INTEGER DEFAULT 0,
          total_actions INTEGER DEFAULT 0,
          evaluated_slips INTEGER DEFAULT 0,
          users_with_stats INTEGER DEFAULT 0,
          avg_accuracy NUMERIC DEFAULT 0,
          best_accuracy NUMERIC DEFAULT 0,
          total_slips_placed INTEGER DEFAULT 0,
          total_correct_predictions INTEGER DEFAULT 0,
          new_users INTEGER DEFAULT 0,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);

      // Create platform overview table
      await db.query(`
        CREATE TABLE IF NOT EXISTS oracle.analytics_platform_overview (
          id INTEGER PRIMARY KEY DEFAULT 1,
          overview_data JSONB,
          growth_data JSONB,
          timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);

      // Create analytics pools table for indexer
      await db.query(`
        CREATE TABLE IF NOT EXISTS oracle.analytics_pools (
          id BIGSERIAL PRIMARY KEY,
          pool_id VARCHAR(255) UNIQUE NOT NULL,
          creator_address VARCHAR(42) NOT NULL,
          event_start_time TIMESTAMP WITH TIME ZONE,
          event_end_time TIMESTAMP WITH TIME ZONE,
          oracle_type VARCHAR(50) DEFAULT 'GUIDED',
          market_id VARCHAR(255),
          creation_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          is_settled BOOLEAN DEFAULT FALSE,
          creator_side_won BOOLEAN,
          actual_result TEXT,
          settled_at TIMESTAMP WITH TIME ZONE,
          total_bettor_stake NUMERIC DEFAULT 0,
          participant_count INTEGER DEFAULT 0,
          category VARCHAR(100),
          total_volume NUMERIC DEFAULT 0,
          fill_percentage INTEGER DEFAULT 0,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);

      console.log('✅ Analytics tables created successfully');

    } catch (error) {
      console.error('❌ Error creating analytics tables:', error);
      throw error;
    }
  }

  /**
   * Clean up old analytics data
   */
  async cleanupOldData() {
    try {
      console.log('🧹 Cleaning up old analytics data...');

      // Keep only last 365 days of daily stats
      await db.query(`
        DELETE FROM oracle.analytics_odyssey_daily 
        WHERE date < CURRENT_DATE - INTERVAL '365 days'
      `);

      await db.query(`
        DELETE FROM oracle.analytics_crypto_daily 
        WHERE date < CURRENT_DATE - INTERVAL '365 days'
      `);

      await db.query(`
        DELETE FROM oracle.analytics_football_daily 
        WHERE date < CURRENT_DATE - INTERVAL '365 days'
      `);

      await db.query(`
        DELETE FROM oracle.analytics_user_activity_daily 
        WHERE date < CURRENT_DATE - INTERVAL '365 days'
      `);

      console.log('✅ Old analytics data cleaned up');

    } catch (error) {
      console.error('❌ Error cleaning up old data:', error);
    }
  }

  /**
   * Start the aggregation service with cron jobs
   */
  async start() {
    if (this.isRunning) {
      console.log('⚠️ Analytics aggregator already running');
      return;
    }

    try {
      console.log('🚀 Starting analytics aggregator...');
      
      // Create analytics tables
      await this.createAnalyticsTables();
      
      this.isRunning = true;

      // Daily aggregation at 00:10 every day
      cron.schedule('10 0 * * *', async () => {
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        console.log(`📅 Running daily aggregation for ${yesterday}...`);
        
        try {
          await Promise.all([
            this.aggregateOdysseyStats(yesterday),
            this.aggregateCryptoStats(yesterday),
            this.aggregateFootballStats(yesterday),
            this.aggregateUserActivity(yesterday)
          ]);
          
          console.log(`✅ Daily aggregation completed for ${yesterday}`);
        } catch (error) {
          console.error(`❌ Daily aggregation failed for ${yesterday}:`, error);
        }
      });

      // Platform overview update every 6 hours
      cron.schedule('0 */6 * * *', async () => {
        console.log('📊 Updating platform overview...');
        try {
          await this.generatePlatformOverview();
          console.log('✅ Platform overview updated');
        } catch (error) {
          console.error('❌ Platform overview update failed:', error);
        }
      });

      // Weekly cleanup on Sundays at 03:00
      cron.schedule('0 3 * * 0', async () => {
        console.log('🧹 Running weekly cleanup...');
        try {
          await this.cleanupOldData();
          console.log('✅ Weekly cleanup completed');
        } catch (error) {
          console.error('❌ Weekly cleanup failed:', error);
        }
      });

      console.log('✅ Analytics aggregator cron jobs scheduled');
      console.log('📋 Scheduled jobs:');
      console.log('  - Daily aggregation: 00:10 UTC');
      console.log('  - Platform overview: Every 6 hours');
      console.log('  - Weekly cleanup: Sundays 03:00 UTC');

    } catch (error) {
      console.error('❌ Failed to start analytics aggregator:', error);
      throw error;
    }
  }

  /**
   * Stop the aggregation service
   */
  stop() {
    this.isRunning = false;
    console.log('🛑 Analytics aggregator stopped');
  }

  /**
   * Get analytics data for frontend
   */
  async getAnalyticsData(timeframe = '7d') {
    try {
      const endDate = new Date();
      let startDate;
      
      switch (timeframe) {
        case '24h':
          startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case 'all':
          startDate = new Date(0);
          break;
        default:
          startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
      }

      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      // Get all analytics data
      const [odysseyData, cryptoData, footballData, userData, overview] = await Promise.all([
        db.query(`SELECT * FROM oracle.analytics_odyssey_daily WHERE date BETWEEN $1 AND $2 ORDER BY date`, [startDateStr, endDateStr]),
        db.query(`SELECT * FROM oracle.analytics_crypto_daily WHERE date BETWEEN $1 AND $2 ORDER BY date`, [startDateStr, endDateStr]),
        db.query(`SELECT * FROM oracle.analytics_football_daily WHERE date BETWEEN $1 AND $2 ORDER BY date`, [startDateStr, endDateStr]),
        db.query(`SELECT * FROM oracle.analytics_user_activity_daily WHERE date BETWEEN $1 AND $2 ORDER BY date`, [startDateStr, endDateStr]),
        db.query(`SELECT * FROM oracle.analytics_platform_overview WHERE id = 1`)
      ]);

      return {
        timeframe,
        odyssey: odysseyData.rows,
        crypto: cryptoData.rows,
        football: footballData.rows,
        userActivity: userData.rows,
        platformOverview: overview.rows[0] || null,
        generatedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ Error getting analytics data:', error);
      throw error;
    }
  }
}

module.exports = AnalyticsAggregator; 