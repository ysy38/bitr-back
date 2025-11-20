const fs = require('fs');
const path = require('path');
const db = require('./db');

/**
 * Initialize missing database tables and fix schema issues
 */
async function initializeMissingTables() {
  try {
    console.log('🔧 Initializing missing database tables...');

    // Read the SQL file
    const sqlPath = path.join(__dirname, 'missing-tables-fix.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    // Execute the SQL
    await db.query(sqlContent);

    console.log('✅ Missing tables initialized successfully!');

    // Verify tables exist
    const verification = await verifyTables();
    console.log('📊 Table verification:', verification);

    return { success: true, message: 'Missing tables initialized successfully' };

  } catch (error) {
    console.error('❌ Error initializing missing tables:', error);
    throw error;
  }
}

/**
 * Verify that all required tables exist
 */
async function verifyTables() {
  try {
    const requiredTables = [
      'core.users',
      'core.user_badges', 
      'core.user_activity',
      'core.user_category_performance',
      'core.user_portfolio',
      'analytics.daily_stats',
      'analytics.category_stats',
      'analytics.pools',
      'oracle.fixtures',
      'oracle.fixture_odds',
      'oracle.daily_game_matches'
    ];

    const verification = {};

    for (const table of requiredTables) {
      const [schema, tableName] = table.split('.');
      const result = await db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = $1 AND table_name = $2
        );
      `, [schema, tableName]);
      
      verification[table] = result.rows[0].exists;
    }

    return verification;

  } catch (error) {
    console.error('❌ Error verifying tables:', error);
    throw error;
  }
}

/**
 * Check if database needs initialization
 */
async function checkDatabaseStatus() {
  try {
    const coreTablesExist = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'core' AND table_name = 'users'
      );
    `);

    const analyticsTablesExist = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'analytics' AND table_name = 'daily_stats'
      );
    `);

    return {
      coreTablesExist: coreTablesExist.rows[0].exists,
      analyticsTablesExist: analyticsTablesExist.rows[0].exists,
      needsInitialization: !coreTablesExist.rows[0].exists || !analyticsTablesExist.rows[0].exists
    };

  } catch (error) {
    console.error('❌ Error checking database status:', error);
    return { needsInitialization: true, error: error.message };
  }
}

/**
 * Get database statistics
 */
async function getDatabaseStats() {
  try {
    const stats = {};

    // Count users
    try {
      const userCount = await db.query('SELECT COUNT(*) FROM core.users');
      stats.totalUsers = parseInt(userCount.rows[0].count);
    } catch (e) {
      stats.totalUsers = 0;
    }

    // Count badges
    try {
      const badgeCount = await db.query('SELECT COUNT(*) FROM core.user_badges');
      stats.totalBadges = parseInt(badgeCount.rows[0].count);
    } catch (e) {
      stats.totalBadges = 0;
    }

    // Count activities
    try {
      const activityCount = await db.query('SELECT COUNT(*) FROM core.user_activity');
      stats.totalActivities = parseInt(activityCount.rows[0].count);
    } catch (e) {
      stats.totalActivities = 0;
    }

    // Count fixtures
    try {
      const fixtureCount = await db.query('SELECT COUNT(*) FROM oracle.fixtures');
      stats.totalFixtures = parseInt(fixtureCount.rows[0].count);
    } catch (e) {
      stats.totalFixtures = 0;
    }

    return stats;

  } catch (error) {
    console.error('❌ Error getting database stats:', error);
    return { error: error.message };
  }
}

module.exports = {
  initializeMissingTables,
  verifyTables,
  checkDatabaseStatus,
  getDatabaseStats
};

// Run initialization if called directly
if (require.main === module) {
  initializeMissingTables()
    .then(() => {
      console.log('🎉 Database initialization completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Database initialization failed:', error);
      process.exit(1);
    });
}
