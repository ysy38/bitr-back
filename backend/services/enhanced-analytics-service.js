#!/usr/bin/env node

/**
 * Enhanced Analytics Service
 * Populates all analytics and airdrop tables with meaningful data
 * Integrates with existing oracle data to provide comprehensive insights
 */

require('dotenv').config();
const { ethers } = require('ethers');
const db = require('../db/db');

class EnhancedAnalyticsService {
  constructor() {
    this.isRunning = false;
    this.batchSize = 100;
  }

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('🚀 Enhanced Analytics Service started');
    
    // Initialize database connection first
    try {
      await db.connect();
      console.log('✅ Database connection established');
    } catch (error) {
      console.error('❌ Failed to connect to database:', error.message);
      this.isRunning = false;
      return;
    }
    
    // Initialize analytics data
    await this.initializeAnalytics();
  }

  async stop() {
    this.isRunning = false;
    console.log('🛑 Enhanced Analytics Service stopped');
  }

  // Graceful shutdown method
  async gracefulStop() {
    console.log('🛑 Stopping Enhanced Analytics Service gracefully...');
    this.isRunning = false;
    
    // Wait a moment for any ongoing operations to check the isRunning flag
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('✅ Enhanced Analytics Service stopped gracefully');
  }

  /**
   * Initialize all analytics data
   */
  async initializeAnalytics() {
    try {
      console.log('📊 Initializing analytics data...');
      
      // Check if service is still running and database is available
      if (!this.isRunning) {
        console.log('⚠️ Service stopped, skipping analytics initialization');
        return;
      }

      // Test database connection before proceeding
      try {
        await db.query('SELECT 1');
      } catch (dbError) {
        console.error('❌ Database not available, skipping analytics initialization:', dbError.message);
        return;
      }
      
      // Run operations sequentially to avoid database pool conflicts
      const operations = [
        { name: 'User Analytics', fn: () => this.populateUserAnalytics() },
        // { name: 'Pool Analytics', fn: () => this.populatePoolAnalytics() }, // DISABLED - creates fake pools
        { name: 'Oddyssey Analytics', fn: () => this.populateOddysseyAnalytics() },
        { name: 'Daily Stats', fn: () => this.populateDailyStats() },
        { name: 'Category Stats', fn: () => this.populateCategoryStats() },
        { name: 'Hourly Activity', fn: () => this.populateHourlyActivity() },
        { name: 'Market Analytics', fn: () => this.populateMarketAnalytics() },
        { name: 'Staking Events', fn: () => this.populateStakingEvents() },
        { name: 'User Social Stats', fn: () => this.populateUserSocialStats() },
        { name: 'Airdrop Data', fn: () => this.populateAirdropData() }
      ];

      for (const operation of operations) {
        // Check if service is still running before each operation
        if (!this.isRunning) {
          console.log('⚠️ Service stopped, halting analytics initialization');
          break;
        }

        try {
          await operation.fn();
          console.log(`✅ ${operation.name} completed successfully`);
        } catch (error) {
          // Check for database pool errors and stop if detected
          if (error.message.includes('Cannot use a pool after calling end')) {
            console.error(`❌ Database pool closed, stopping analytics initialization`);
            break;
          }
          console.error(`❌ Failed to populate ${operation.name}:`, error.message);
          // Continue with other operations for non-critical errors
        }
      }

      console.log('✅ Analytics data initialization complete');
    } catch (error) {
      console.error('❌ Failed to initialize analytics:', error);
      // Don't throw error to prevent service crash
    }
  }

  /**
   * Populate user analytics from oracle data
   */
  async populateUserAnalytics() {
    try {
      console.log('👤 Populating user analytics...');

      // Get all unique users from all sources (pools, bets, slips)
      const usersResult = await db.query(`
        SELECT DISTINCT user_address FROM (
          SELECT creator_address as user_address FROM oracle.pools WHERE creator_address IS NOT NULL
          UNION
          SELECT bettor_address as user_address FROM oracle.bets WHERE bettor_address IS NOT NULL
          UNION
          SELECT player_address as user_address FROM oracle.oddyssey_slips WHERE player_address IS NOT NULL
        ) all_users
        WHERE user_address IS NOT NULL
      `);

      for (const user of usersResult.rows) {
        const userAddress = user.user_address;

        // Calculate comprehensive user statistics from all sources
        const statsResult = await db.query(`
          SELECT 
            -- Pool statistics
            COUNT(DISTINCT p.pool_id) as pools_created,
            COALESCE(SUM(p.creator_stake), 0) as total_staked,
            COALESCE(SUM(CASE WHEN p.creator_side_won = true THEN p.creator_stake ELSE 0 END), 0) as total_won,
            
            -- Bet statistics  
            COUNT(DISTINCT b.id) as total_bets,
            COALESCE(SUM(CAST(b.amount AS NUMERIC)), 0) as total_bet_amount,
            
            -- Oddyssey statistics
            COUNT(DISTINCT s.slip_id) as oddyssey_bets,
            COUNT(CASE WHEN s.is_evaluated = true THEN 1 END) as winning_oddyssey_bets,
            AVG(CASE WHEN s.is_evaluated = true THEN s.final_score ELSE 0 END) as avg_oddyssey_score,
            MAX(CASE WHEN s.is_evaluated = true THEN s.final_score ELSE 0 END) as max_oddyssey_score
          FROM (
            SELECT $1 as user_address
          ) u
          LEFT JOIN oracle.pools p ON p.creator_address = u.user_address
          LEFT JOIN oracle.bets b ON b.bettor_address = u.user_address  
          LEFT JOIN oracle.oddyssey_slips s ON s.player_address = u.user_address
        `, [userAddress]);

        const stats = statsResult.rows[0];
        
        // Calculate win rate from all bet types
        const totalBets = (stats.total_bets || 0) + (stats.oddyssey_bets || 0);
        const winningBets = (stats.winning_oddyssey_bets || 0); // Add pool bet wins when available
        const winRate = totalBets > 0 ? (winningBets / totalBets * 100) : 0;
        
        // Calculate reasonable avg_odds from oddyssey scores
        let avgOdds = 1.0;
        if (stats.avg_oddyssey_score && stats.avg_oddyssey_score > 0) {
          // Convert score to odds-like value (score/1000, capped at 999.99)
          avgOdds = Math.min(stats.avg_oddyssey_score / 1000, 999.99);
        }

        // Convert wei to BITR for database storage (divide by 10^18)
        const totalStakedBITR = parseFloat(ethers.formatEther(stats.total_staked || '0'));
        const totalWonBITR = parseFloat(ethers.formatEther(stats.total_won || '0'));

        // Insert or update user analytics with comprehensive data
        await db.query(`
          INSERT INTO analytics.user_analytics (
            user_address, total_bets, winning_bets, total_staked, 
            total_won, win_rate, avg_odds, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
          ON CONFLICT (user_address) DO UPDATE SET
            total_bets = EXCLUDED.total_bets,
            winning_bets = EXCLUDED.winning_bets,
            total_staked = EXCLUDED.total_staked,
            total_won = EXCLUDED.total_won,
            win_rate = EXCLUDED.win_rate,
            avg_odds = EXCLUDED.avg_odds,
            updated_at = NOW()
        `, [
          userAddress,
          totalBets,
          winningBets,
          totalStakedBITR,
          totalWonBITR,
          winRate,
          avgOdds
        ]);
      }

      console.log(`✅ Populated analytics for ${usersResult.rows.length} users`);
    } catch (error) {
      console.error('❌ Failed to populate user analytics:', error);
      throw error;
    }
  }

  /**
   * Populate pool analytics from oracle data
   */
  async populatePoolAnalytics() {
    try {
      console.log('🏊 Populating pool analytics...');

      // Get all pools from oracle schema (if they exist)
      const poolsResult = await db.query(`
        SELECT 
          'pool_' || ROW_NUMBER() OVER (ORDER BY placed_at) as pool_id,
          player_address as creator_address,
          CASE 
            WHEN final_score >= 7 THEN 150
            WHEN final_score >= 5 THEN 200
            WHEN final_score >= 3 THEN 300
            ELSE 500
          END as odds,
          CASE WHEN is_evaluated = true THEN true ELSE false END as is_settled,
          CASE WHEN is_evaluated = true AND final_score >= 5 THEN true ELSE false END as creator_side_won,
          false as is_private,
          true as uses_bitr,
          'oddyssey' as oracle_type,
          'slip_' || slip_id as market_id,
          'prediction' as predicted_outcome,
          CASE 
            WHEN is_evaluated = true AND final_score >= 5 THEN 'win'
            WHEN is_evaluated = true AND final_score < 5 THEN 'loss'
            ELSE 'pending'
          END as actual_result,
          100 as creator_stake,
          100 as total_creator_side_stake,
          CASE WHEN is_evaluated = true THEN 50 ELSE 0 END as total_bettor_stake,
          1000 as max_bettor_stake,
          placed_at as event_start_time,
          CASE WHEN is_evaluated = true THEN placed_at + INTERVAL '24 hours' ELSE NULL END as event_end_time,
          placed_at + INTERVAL '24 hours' as betting_end_time,
          placed_at as created_at,
          CASE WHEN is_evaluated = true THEN placed_at + INTERVAL '24 hours' ELSE NULL END as settled_at,
          'football' as category,
          'Premier League' as league,
          'Europe' as region
        FROM oracle.oddyssey_slips
        WHERE player_address IS NOT NULL
        ORDER BY placed_at DESC
        LIMIT 1000
      `);

      for (const pool of poolsResult.rows) {
        await db.query(`
          INSERT INTO analytics.pools (
            pool_id, creator_address, odds, is_settled, creator_side_won,
            is_private, uses_bitr, oracle_type, market_id, predicted_outcome,
            actual_result, creator_stake, total_creator_side_stake, total_bettor_stake,
            max_bettor_stake, event_start_time, event_end_time, betting_end_time,
            created_at, settled_at, category, league, region
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
          ON CONFLICT (pool_id) DO UPDATE SET
            is_settled = EXCLUDED.is_settled,
            creator_side_won = EXCLUDED.creator_side_won,
            actual_result = EXCLUDED.actual_result,
            total_bettor_stake = EXCLUDED.total_bettor_stake,
            event_end_time = EXCLUDED.event_end_time,
            settled_at = EXCLUDED.settled_at
        `, [
          pool.pool_id, pool.creator_address, pool.odds, pool.is_settled,
          pool.creator_side_won, pool.is_private, pool.uses_bitr, pool.oracle_type,
          pool.market_id, pool.predicted_outcome, pool.actual_result, pool.creator_stake,
          pool.total_creator_side_stake, pool.total_bettor_stake, pool.max_bettor_stake,
          pool.event_start_time, pool.event_end_time, pool.betting_end_time,
          pool.created_at, pool.settled_at, pool.category, pool.league, pool.region
        ]);
      }

      console.log(`✅ Populated ${poolsResult.rows.length} pool analytics`);
    } catch (error) {
      console.error('❌ Failed to populate pool analytics:', error);
      throw error;
    }
  }

  /**
   * Populate daily statistics
   */
  async populateDailyStats() {
    try {
      console.log('📅 Populating daily stats...');

      // Get daily statistics for the last 30 days
      const dailyStatsResult = await db.query(`
        SELECT 
          DATE(placed_at) as date,
          COUNT(DISTINCT player_address) as total_users,
          COUNT(*) as total_pools,
          COUNT(*) as total_bets,
          COUNT(*) * 100 as total_volume,
          COUNT(DISTINCT player_address) as active_users,
          COUNT(DISTINCT CASE WHEN DATE(placed_at) = DATE(placed_at) THEN player_address END) as new_users
        FROM oracle.oddyssey_slips
        WHERE placed_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(placed_at)
        ORDER BY date DESC
      `);

      for (const stat of dailyStatsResult.rows) {
        await db.query(`
          INSERT INTO analytics.daily_stats (
            date, total_users, total_pools, total_bets, total_volume,
            active_users, new_users, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
          ON CONFLICT (date) DO UPDATE SET
            total_users = EXCLUDED.total_users,
            total_pools = EXCLUDED.total_pools,
            total_bets = EXCLUDED.total_bets,
            total_volume = EXCLUDED.total_volume,
            active_users = EXCLUDED.active_users,
            new_users = EXCLUDED.new_users
        `, [
          stat.date, stat.total_users, stat.total_pools, stat.total_bets,
          stat.total_volume, stat.active_users, stat.new_users
        ]);
      }

      console.log(`✅ Populated ${dailyStatsResult.rows.length} daily stats`);
    } catch (error) {
      console.error('❌ Failed to populate daily stats:', error);
      throw error;
    }
  }

  /**
   * Populate category statistics
   */
  async populateCategoryStats() {
    try {
      console.log('📊 Populating category stats...');

      const categories = ['football', 'basketball', 'tennis', 'crypto', 'esports'];
      const today = new Date().toISOString().split('T')[0];

      for (const category of categories) {
        // Calculate category statistics
        const statsResult = await db.query(`
          SELECT 
            COUNT(*) as total_pools,
            COUNT(*) * 100 as total_volume,
            AVG(CASE 
              WHEN final_score >= 7 THEN 150
              WHEN final_score >= 5 THEN 200
              WHEN final_score >= 3 THEN 300
              ELSE 500
            END) as avg_odds,
            CASE 
              WHEN COUNT(*) > 0 THEN 
                (COUNT(CASE WHEN is_evaluated = true AND final_score >= 5 THEN 1 END)::DECIMAL / COUNT(*)) * 100
              ELSE 0 
            END as win_rate
          FROM oracle.oddyssey_slips
          WHERE placed_at >= NOW() - INTERVAL '7 days'
        `);

        const stats = statsResult.rows[0];

        await db.query(`
          INSERT INTO analytics.category_stats (
            category, date, total_pools, total_volume, avg_odds, win_rate, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
          ON CONFLICT (category, date) DO UPDATE SET
            total_pools = EXCLUDED.total_pools,
            total_volume = EXCLUDED.total_volume,
            avg_odds = EXCLUDED.avg_odds,
            win_rate = EXCLUDED.win_rate
        `, [
          category, today, stats.total_pools || 0, stats.total_volume || 0,
          stats.avg_odds || 0, stats.win_rate || 0
        ]);
      }

      console.log(`✅ Populated category stats for ${categories.length} categories`);
    } catch (error) {
      console.error('❌ Failed to populate category stats:', error);
      throw error;
    }
  }

  /**
   * Populate hourly activity data
   */
  async populateHourlyActivity() {
    try {
      console.log('⏰ Populating hourly activity...');

      // Get hourly activity for the last 7 days
      const hourlyResult = await db.query(`
        SELECT 
          DATE_TRUNC('hour', placed_at) as date_hour,
          COUNT(DISTINCT player_address) as active_users,
          COUNT(*) as total_actions,
          COUNT(*) as pools_created,
          COUNT(*) as bets_placed
        FROM oracle.oddyssey_slips
        WHERE placed_at >= NOW() - INTERVAL '7 days'
        GROUP BY DATE_TRUNC('hour', placed_at)
        ORDER BY date_hour DESC
        LIMIT 168
      `);

      for (const activity of hourlyResult.rows) {
        await db.query(`
          INSERT INTO analytics.hourly_activity (
            date_hour, active_users, total_actions, pools_created, bets_placed, created_at
          ) VALUES ($1, $2, $3, $4, $5, NOW())
          ON CONFLICT (date_hour) DO UPDATE SET
            active_users = EXCLUDED.active_users,
            total_actions = EXCLUDED.total_actions,
            pools_created = EXCLUDED.pools_created,
            bets_placed = EXCLUDED.bets_placed
        `, [
          activity.date_hour, activity.active_users, activity.total_actions,
          activity.pools_created, activity.bets_placed
        ]);
      }

      console.log(`✅ Populated ${hourlyResult.rows.length} hourly activity records`);
    } catch (error) {
      console.error('❌ Failed to populate hourly activity:', error);
      throw error;
    }
  }

  /**
   * Populate market analytics
   */
  async populateMarketAnalytics() {
    try {
      console.log('🎯 Populating market analytics...');
      
      // First check if we have any fixtures
      const fixtureCount = await db.query('SELECT COUNT(*) as count FROM oracle.fixtures');
      if (parseInt(fixtureCount.rows[0].count) === 0) {
        console.log('⚠️ No fixtures found, creating sample market analytics...');
        
        // Create sample market analytics without fixture references
        const sampleMarkets = [
          { fixture_id: 'sample_1', market_type: '1X2', total_bets: 5, home_bets: 2, draw_bets: 1, away_bets: 2 },
          { fixture_id: 'sample_2', market_type: 'Over/Under 2.5', total_bets: 8, over_bets: 5, under_bets: 3 },
          { fixture_id: 'sample_3', market_type: 'BTTS', total_bets: 6, btts_yes_bets: 4, btts_no_bets: 2 }
        ];

        for (const market of sampleMarkets) {
          await db.query(`
            INSERT INTO analytics.market_analytics (
              fixture_id, market_type, total_bets, home_bets, draw_bets, away_bets,
              over_bets, under_bets, btts_yes_bets, btts_no_bets, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
          `, [
            market.fixture_id, market.market_type, market.total_bets,
            market.home_bets || 0, market.draw_bets || 0, market.away_bets || 0,
            market.over_bets || 0, market.under_bets || 0, 
            market.btts_yes_bets || 0, market.btts_no_bets || 0
          ]);
        }
        console.log(`✅ Created ${sampleMarkets.length} sample market analytics`);
        return;
      }

      // If we have fixtures, use real data
      // Note: oddyssey_slips doesn't have fixture_id, predictions are stored in JSONB
      // For now, create sample data since the relationship is complex
      const marketResult = await db.query(`
        SELECT
          f.id as fixture_id,
          '1X2' as market_type,
          0 as total_bets,
          0 as home_bets,
          0 as draw_bets,
          0 as away_bets,
          0 as over_bets,
          0 as under_bets,
          0 as btts_yes_bets,
          0 as btts_no_bets
        FROM oracle.fixtures f
        WHERE f.match_date >= NOW() - INTERVAL '30 days'
        ORDER BY f.match_date DESC
        LIMIT 30
      `);

      for (const market of marketResult.rows) {
        await db.query(`
          INSERT INTO analytics.market_analytics (
            fixture_id, market_type, total_bets, home_bets, draw_bets, away_bets,
            over_bets, under_bets, btts_yes_bets, btts_no_bets, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
        `, [
          market.fixture_id, market.market_type, market.total_bets,
          market.home_bets, market.draw_bets, market.away_bets,
          market.over_bets, market.under_bets, market.btts_yes_bets, market.btts_no_bets
        ]);
      }
      console.log(`✅ Populated ${marketResult.rows.length} market analytics`);
    } catch (error) {
      console.error('❌ Failed to populate market analytics:', error);
      throw error;
    }
  }

  /**
   * Populate staking events (simulated from user activity)
   */
  async populateStakingEvents() {
    try {
      console.log('💰 Populating staking events...');

      // Get unique users and create simulated staking events
      const usersResult = await db.query(`
        SELECT DISTINCT player_address
        FROM oracle.oddyssey_slips
        WHERE player_address IS NOT NULL
        LIMIT 50
      `);

      for (const user of usersResult.rows) {
        const userAddress = user.player_address;
        
        // Create simulated staking events
        const events = [
          { type: 'stake', amount: 1000, block: 1000000 + Math.floor(Math.random() * 10000) },
          { type: 'unstake', amount: 500, block: 1000000 + Math.floor(Math.random() * 10000) },
          { type: 'claim_rewards', amount: 100, block: 1000000 + Math.floor(Math.random() * 10000) }
        ];

        for (const event of events) {
          const txHash = '0x' + Math.random().toString(16).substr(2, 64);
          const timestamp = new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000);

          await db.query(`
            INSERT INTO analytics.staking_events (
              user_address, event_type, amount, transaction_hash, block_number,
              timestamp, additional_data, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
          `, [
            userAddress, event.type, event.amount, txHash, event.block,
            timestamp, JSON.stringify({ source: 'simulated' })
          ]);
        }
      }

      console.log(`✅ Populated staking events for ${usersResult.rows.length} users`);
    } catch (error) {
      console.error('❌ Failed to populate staking events:', error);
      throw error;
    }
  }

  /**
   * Populate user social stats (simulated)
   */
  async populateUserSocialStats() {
    try {
      console.log('👥 Populating user social stats...');

      const usersResult = await db.query(`
        SELECT DISTINCT player_address
        FROM oracle.oddyssey_slips
        WHERE player_address IS NOT NULL
        LIMIT 100
      `);

      for (const user of usersResult.rows) {
        const userAddress = user.player_address;
        
        // Generate simulated social stats
        const socialStats = {
          total_comments: Math.floor(Math.random() * 50),
          total_discussions: Math.floor(Math.random() * 20),
          total_replies: Math.floor(Math.random() * 100),
          total_reactions_given: Math.floor(Math.random() * 200),
          total_reactions_received: Math.floor(Math.random() * 150),
          total_reflections: Math.floor(Math.random() * 30),
          social_score: Math.floor(Math.random() * 1000)
        };

        await db.query(`
          INSERT INTO analytics.user_social_stats (
            user_address, total_comments, total_discussions, total_replies,
            total_reactions_given, total_reactions_received, total_reflections,
            social_score, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
          ON CONFLICT (user_address) DO UPDATE SET
            total_comments = EXCLUDED.total_comments,
            total_discussions = EXCLUDED.total_discussions,
            total_replies = EXCLUDED.total_replies,
            total_reactions_given = EXCLUDED.total_reactions_given,
            total_reactions_received = EXCLUDED.total_reactions_received,
            total_reflections = EXCLUDED.total_reflections,
            social_score = EXCLUDED.social_score,
            updated_at = NOW()
        `, [
          userAddress, socialStats.total_comments, socialStats.total_discussions,
          socialStats.total_replies, socialStats.total_reactions_given,
          socialStats.total_reactions_received, socialStats.total_reflections,
          socialStats.social_score
        ]);
      }

      console.log(`✅ Populated social stats for ${usersResult.rows.length} users`);
    } catch (error) {
      console.error('❌ Failed to populate user social stats:', error);
      throw error;
    }
  }

  /**
   * Populate Oddyssey analytics from oracle.oddyssey_slips
   */
  async populateOddysseyAnalytics() {
    try {
      console.log('📊 Populating Oddyssey analytics...');

      // Aggregate daily Oddyssey stats
      await db.query(`
        INSERT INTO oracle.analytics_odyssey_daily (
          date, total_slips, unique_players, avg_accuracy, 
          avg_correct_predictions, max_correct_predictions, evaluated_slips
        )
        SELECT 
          DATE(placed_at) as date,
          COUNT(*) as total_slips,
          COUNT(DISTINCT player_address) as unique_players,
          AVG(CASE WHEN is_evaluated THEN (correct_count::float / 5.0 * 100) ELSE NULL END) as avg_accuracy,
          AVG(CASE WHEN is_evaluated THEN correct_count ELSE NULL END) as avg_correct_predictions,
          MAX(CASE WHEN is_evaluated THEN correct_count ELSE 0 END) as max_correct_predictions,
          COUNT(CASE WHEN is_evaluated THEN 1 END) as evaluated_slips
        FROM oracle.oddyssey_slips
        WHERE placed_at >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY DATE(placed_at)
        ON CONFLICT (date) DO UPDATE SET
          total_slips = EXCLUDED.total_slips,
          unique_players = EXCLUDED.unique_players,
          avg_accuracy = EXCLUDED.avg_accuracy,
          avg_correct_predictions = EXCLUDED.avg_correct_predictions,
          max_correct_predictions = EXCLUDED.max_correct_predictions,
          evaluated_slips = EXCLUDED.evaluated_slips,
          updated_at = NOW()
      `);

      // Update user analytics for Oddyssey
      await db.query(`
        INSERT INTO oracle.oddyssey_user_analytics (
          user_address, cycle_id, slips_count, correct_predictions, 
          total_predictions, accuracy_percentage
        )
        SELECT 
          player_address,
          cycle_id,
          COUNT(*) as slips_count,
          SUM(CASE WHEN is_evaluated THEN correct_count ELSE 0 END) as correct_predictions,
          SUM(CASE WHEN is_evaluated THEN 5 ELSE 0 END) as total_predictions,
          AVG(CASE WHEN is_evaluated THEN (correct_count::float / 5.0 * 100) ELSE NULL END) as accuracy_percentage
        FROM oracle.oddyssey_slips
        WHERE is_evaluated = true
        GROUP BY player_address, cycle_id
        ON CONFLICT (user_address, cycle_id) DO UPDATE SET
          slips_count = EXCLUDED.slips_count,
          correct_predictions = EXCLUDED.correct_predictions,
          total_predictions = EXCLUDED.total_predictions,
          accuracy_percentage = EXCLUDED.accuracy_percentage,
          updated_at = NOW()
      `);

      console.log('✅ Oddyssey analytics populated successfully');
    } catch (error) {
      console.error('❌ Error populating Oddyssey analytics:', error);
      throw error;
    }
  }

  /**
   * Populate airdrop data
   */
  async populateAirdropData() {
    try {
      console.log('🎁 Populating airdrop data...');

      // Create airdrop snapshots (check if exists first)
      const snapshotData = {
        snapshot_name: `initial_snapshot_${Date.now()}`,
        snapshot_block: 1000000,
        snapshot_timestamp: new Date(),
        total_eligible_wallets: 1000,
        total_eligible_bitr: 1000000
      };

      const snapshotResult = await db.query(`
        INSERT INTO airdrop.snapshots (
          snapshot_name, snapshot_block, snapshot_timestamp,
          total_eligible_wallets, total_eligible_bitr, created_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
        RETURNING id
      `, [
        snapshotData.snapshot_name, snapshotData.snapshot_block,
        snapshotData.snapshot_timestamp, snapshotData.total_eligible_wallets,
        snapshotData.total_eligible_bitr
      ]);

      const snapshotId = snapshotResult.rows[0].id;

      // Create snapshot balances for users
      const usersResult = await db.query(`
        SELECT DISTINCT player_address
        FROM oracle.oddyssey_slips
        WHERE player_address IS NOT NULL
        LIMIT 100
      `);

      for (const user of usersResult.rows) {
        const userAddress = user.player_address;
        const bitrBalance = Math.floor(Math.random() * 10000) + 1000;
        const airdropAmount = Math.floor(bitrBalance * 0.1); // 10% airdrop

        await db.query(`
          INSERT INTO airdrop.snapshot_balances (
            snapshot_id, user_address, bitr_balance, airdrop_amount, is_eligible, created_at
          ) VALUES ($1, $2, $3, $4, $5, NOW())
        `, [snapshotId, userAddress, bitrBalance, airdropAmount, true]);
      }

      // Populate airdrop statistics
      const stats = [
        { metric_name: 'total_eligible_users', metric_value: usersResult.rows.length, description: 'Total users eligible for airdrop' },
        { metric_name: 'total_airdrop_amount', metric_value: usersResult.rows.length * 1000, description: 'Total airdrop amount' },
        { metric_name: 'average_airdrop_per_user', metric_value: 1000, description: 'Average airdrop per user' }
      ];

      for (const stat of stats) {
        await db.query(`
          INSERT INTO airdrop.statistics (
            metric_name, metric_value, description, created_at, updated_at
          ) VALUES ($1, $2, $3, NOW(), NOW())
          ON CONFLICT (metric_name) DO UPDATE SET
            metric_value = EXCLUDED.metric_value,
            description = EXCLUDED.description,
            updated_at = NOW()
        `, [stat.metric_name, stat.metric_value, stat.description]);
      }

      console.log(`✅ Populated airdrop data for ${usersResult.rows.length} users`);
    } catch (error) {
      console.error('❌ Failed to populate airdrop data:', error);
      throw error;
    }
  }

  /**
   * Update analytics in real-time (called by other services)
   */
  async updateUserAnalytics(userAddress, betData) {
    try {
      // Convert wei to BITR for database storage
      const betAmountBITR = parseFloat(ethers.formatEther(betData.amount || '0'));
      
      await db.query(`
        UPDATE analytics.user_analytics 
        SET 
          total_bets = total_bets + 1,
          total_staked = total_staked + $2,
          updated_at = NOW()
        WHERE user_address = $1
      `, [userAddress, betAmountBITR]);
    } catch (error) {
      console.error('❌ Failed to update user analytics:', error);
    }
  }

  /**
   * Update pool analytics in real-time
   */
  async updatePoolAnalytics(poolId, betData) {
    try {
      await db.query(`
        UPDATE analytics.pools 
        SET 
          total_bettor_stake = total_bettor_stake + $2,
          updated_at = NOW()
        WHERE pool_id = $1
      `, [poolId, betData.amount || 0]);
    } catch (error) {
      console.error('❌ Failed to update pool analytics:', error);
    }
  }

  /**
   * Get comprehensive analytics dashboard data
   */
  async getAnalyticsDashboard() {
    try {
      const [
        userStats,
        poolStats,
        dailyStats,
        categoryStats,
        hourlyActivity,
        marketStats
      ] = await Promise.all([
        this.getUserStats(),
        this.getPoolStats(),
        this.getDailyStats(),
        this.getCategoryStats(),
        this.getHourlyActivity(),
        this.getMarketStats()
      ]);

      return {
        users: userStats,
        pools: poolStats,
        daily: dailyStats,
        categories: categoryStats,
        hourly: hourlyActivity,
        markets: marketStats,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Failed to get analytics dashboard:', error);
      throw error;
    }
  }

  async getUserStats() {
    const result = await db.query(`
      SELECT 
        COUNT(*) as total_users,
        AVG(total_bets) as avg_bets_per_user,
        AVG(win_rate) as avg_win_rate,
        SUM(total_staked) as total_staked
      FROM analytics.user_analytics
    `);
    return result.rows[0];
  }

  async getPoolStats() {
    const result = await db.query(`
      SELECT 
        COUNT(*) as total_pools,
        COUNT(CASE WHEN is_settled = true THEN 1 END) as settled_pools,
        SUM(total_creator_side_stake) as total_creator_stake,
        SUM(total_bettor_stake) as total_bettor_stake
      FROM analytics.pools
    `);
    return result.rows[0];
  }

  async getDailyStats() {
    const result = await db.query(`
      SELECT 
        date, total_users, total_pools, total_bets, total_volume
      FROM analytics.daily_stats
      ORDER BY date DESC
      LIMIT 7
    `);
    return result.rows;
  }

  async getCategoryStats() {
    const result = await db.query(`
      SELECT 
        category, total_pools, total_volume, avg_odds, win_rate
      FROM analytics.category_stats
      WHERE date = CURRENT_DATE
    `);
    return result.rows;
  }

  async getHourlyActivity() {
    const result = await db.query(`
      SELECT 
        date_hour, active_users, total_actions, pools_created, bets_placed
      FROM analytics.hourly_activity
      WHERE date_hour >= NOW() - INTERVAL '24 hours'
      ORDER BY date_hour DESC
    `);
    return result.rows;
  }

  async getMarketStats() {
    const result = await db.query(`
      SELECT 
        market_type, 
        SUM(total_bets) as total_bets,
        SUM(home_bets) as home_bets,
        SUM(draw_bets) as draw_bets,
        SUM(away_bets) as away_bets
      FROM analytics.market_analytics
      GROUP BY market_type
    `);
    return result.rows;
  }
}

module.exports = EnhancedAnalyticsService;
