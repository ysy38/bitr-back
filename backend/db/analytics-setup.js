const db = require('./db');

/**
 * Setup analytics tables for the platform
 */
async function setupAnalyticsTables() {
  try {
    console.log('📊 Setting up analytics tables...');

    // Create analytics schema if it doesn't exist
    await db.query(`
      CREATE SCHEMA IF NOT EXISTS analytics;
    `);

    // Create daily_stats table
    await db.query(`
      CREATE TABLE IF NOT EXISTS analytics.daily_stats (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL UNIQUE,
        total_volume DECIMAL(20,8) DEFAULT 0,
        total_pools INTEGER DEFAULT 0,
        total_bets INTEGER DEFAULT 0,
        total_users INTEGER DEFAULT 0,
        active_users INTEGER DEFAULT 0,
        new_users INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create category_stats table
    await db.query(`
      CREATE TABLE IF NOT EXISTS analytics.category_stats (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        category VARCHAR(50) NOT NULL,
        total_pools INTEGER DEFAULT 0,
        total_volume DECIMAL(20,8) DEFAULT 0,
        avg_odds DECIMAL(10,6) DEFAULT 0,
        win_rate DECIMAL(5,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(date, category)
      );
    `);

    // Create pools table for analytics
    await db.query(`
      CREATE TABLE IF NOT EXISTS analytics.pools (
        pool_id VARCHAR(50) PRIMARY KEY,
        creator_address VARCHAR(42) NOT NULL,
        odds INTEGER,
        is_settled BOOLEAN DEFAULT FALSE,
        creator_side_won BOOLEAN,
        is_private BOOLEAN DEFAULT FALSE,
        uses_bitr BOOLEAN DEFAULT FALSE,
        oracle_type VARCHAR(50),
        market_id VARCHAR(50),
        predicted_outcome VARCHAR(50),
        actual_result VARCHAR(50),
        creator_stake DECIMAL(78,18) NOT NULL,
        total_creator_side_stake DECIMAL(78,18) NOT NULL,
        total_bettor_stake DECIMAL(78,18) DEFAULT 0,
        max_bettor_stake DECIMAL(78,18),
        event_start_time TIMESTAMP,
        event_end_time TIMESTAMP,
        betting_end_time TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        settled_at TIMESTAMP
      );
    `);

    // Create hourly_activity table
    await db.query(`
      CREATE TABLE IF NOT EXISTS analytics.hourly_activity (
        id SERIAL PRIMARY KEY,
        date_hour TIMESTAMP NOT NULL,
        active_users INTEGER DEFAULT 0,
        total_actions INTEGER DEFAULT 0,
        pools_created INTEGER DEFAULT 0,
        bets_placed INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(date_hour)
      );
    `);

    // Create staking_events table
    await db.query(`
      CREATE TABLE IF NOT EXISTS analytics.staking_events (
        id SERIAL PRIMARY KEY,
        user_address VARCHAR(42) NOT NULL,
        action_type VARCHAR(20) NOT NULL,
        amount DECIMAL(20,8),
        tier_id INTEGER,
        duration_option INTEGER,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        transaction_hash VARCHAR(66),
        block_number BIGINT
      );
    `);

    // Create indexes for better performance
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON analytics.daily_stats(date);
      CREATE INDEX IF NOT EXISTS idx_category_stats_date ON analytics.category_stats(date);
      CREATE INDEX IF NOT EXISTS idx_pools_settled ON analytics.pools(is_settled);
      CREATE INDEX IF NOT EXISTS idx_hourly_activity_hour ON analytics.hourly_activity(date_hour);
      CREATE INDEX IF NOT EXISTS idx_staking_events_user ON analytics.staking_events(user_address);
      CREATE INDEX IF NOT EXISTS idx_staking_events_timestamp ON analytics.staking_events(timestamp);
    `);

    console.log('✅ Analytics tables setup completed');

    // Insert some sample data for testing
    await insertSampleData();

  } catch (error) {
    console.error('❌ Error setting up analytics tables:', error);
    throw error;
  }
}

/**
 * Insert sample data for testing
 */
async function insertSampleData() {
  try {
    console.log('📝 Inserting sample analytics data...');

    // Insert sample daily stats
    await db.query(`
      INSERT INTO analytics.daily_stats (date, total_volume, total_pools, total_bets, total_users, active_users, new_users)
      VALUES 
        (CURRENT_DATE, 1000.00, 5, 25, 10, 8, 2),
        (CURRENT_DATE - INTERVAL '1 day', 800.00, 4, 20, 8, 6, 1),
        (CURRENT_DATE - INTERVAL '2 days', 1200.00, 6, 30, 12, 10, 3)
      ON CONFLICT (date) DO NOTHING;
    `);

    // Insert sample category stats
    await db.query(`
      INSERT INTO analytics.category_stats (date, category, total_pools, total_volume, avg_odds, win_rate)
      VALUES 
        (CURRENT_DATE, 'Sports', 3, 600.00, 2.50, 65.00),
        (CURRENT_DATE, 'Crypto', 2, 400.00, 1.80, 55.00)
      ON CONFLICT (date, category) DO NOTHING;
    `);

    // Insert sample pools
    await db.query(`
      INSERT INTO analytics.pools (pool_id, creator_address, odds, is_settled, creator_side_won, is_private, uses_bitr, oracle_type, market_id, predicted_outcome, actual_result, creator_stake, total_creator_side_stake, total_bettor_stake, max_bettor_stake, event_start_time, event_end_time, betting_end_time)
      VALUES 
        ('pool_001', '0x1234567890123456789012345678901234567890', 2.00, false, null, false, false, 'guided', 'market_1', 'outcome_a', null, 100.00, 100.00, 0.00, null, '2023-10-26T10:00:00Z', '2023-10-26T12:00:00Z', '2023-10-26T11:00:00Z'),
        ('pool_002', '0x2345678901234567890123456789012345678901', 1.50, false, null, false, false, 'guided', 'market_2', 'outcome_b', null, 50.00, 50.00, 0.00, null, '2023-10-26T11:00:00Z', '2023-10-26T13:00:00Z', '2023-10-26T12:00:00Z')
      ON CONFLICT (pool_id) DO NOTHING;
    `);

    console.log('✅ Sample data inserted');

  } catch (error) {
    console.error('❌ Error inserting sample data:', error);
    // Don't throw - this is optional
  }
}

/**
 * Check analytics tables status
 */
async function checkAnalyticsStatus() {
  try {
    const tables = [
      'analytics.daily_stats',
      'analytics.category_stats', 
      'analytics.pools',
      'analytics.hourly_activity',
      'analytics.staking_events'
    ];

    const status = {};

    for (const table of tables) {
      const result = await db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema || '.' || table_name = $1
        );
      `, [table]);
      
      status[table] = result.rows[0].exists;
    }

    return status;

  } catch (error) {
    console.error('❌ Error checking analytics status:', error);
    throw error;
  }
}

module.exports = {
  setupAnalyticsTables,
  checkAnalyticsStatus,
  insertSampleData
};

// Run setup if called directly
if (require.main === module) {
  setupAnalyticsTables()
    .then(() => {
      console.log('🎉 Analytics setup completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Analytics setup failed:', error);
      process.exit(1);
    });
}
