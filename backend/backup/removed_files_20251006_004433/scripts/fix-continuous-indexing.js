/**
 * Fix Continuous Database Usage
 * This script addresses the main issue preventing autosuspend
 */

const db = require('../db/db');

async function fixContinuousIndexing() {
  console.log('🔧 Fixing continuous database usage...');

  try {
    // 1. Check current database connections
    const connectionStats = await db.query(`
      SELECT 
        count(*) as active_connections,
        state,
        application_name
      FROM pg_stat_activity 
      WHERE datname = current_database()
      GROUP BY state, application_name
    `);

    console.log('📊 Current database connections:', connectionStats.rows);

    // 2. Check for long-running queries
    const longQueries = await db.query(`
      SELECT 
        pid,
        now() - pg_stat_activity.query_start AS duration,
        query,
        state
      FROM pg_stat_activity 
      WHERE (now() - pg_stat_activity.query_start) > interval '30 seconds'
      AND state != 'idle'
    `);

    if (longQueries.rows.length > 0) {
      console.log('⚠️ Found long-running queries:', longQueries.rows);
      
      // Kill long-running queries
      for (const query of longQueries.rows) {
        try {
          await db.query(`SELECT pg_terminate_backend($1)`, [query.pid]);
          console.log(`✅ Terminated long-running query PID: ${query.pid}`);
        } catch (error) {
          console.log(`❌ Failed to terminate PID ${query.pid}:`, error.message);
        }
      }
    }

    // 3. Set statement timeout to prevent long queries
    await db.query(`SET statement_timeout = '30s'`);
    console.log('✅ Set statement timeout to 30 seconds');

    // 4. Check for idle connections
    const idleConnections = await db.query(`
      SELECT count(*) as idle_count
      FROM pg_stat_activity 
      WHERE state = 'idle' 
      AND now() - state_change > interval '5 minutes'
    `);

    console.log(`📊 Idle connections older than 5 minutes: ${idleConnections.rows[0].idle_count}`);

    // 5. Force close idle connections
    if (parseInt(idleConnections.rows[0].idle_count) > 0) {
      await db.query(`
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity 
        WHERE state = 'idle' 
        AND now() - state_change > interval '5 minutes'
        AND pid != pg_backend_pid()
      `);
      console.log('✅ Terminated idle connections');
    }

    console.log('✅ Database optimization completed');

  } catch (error) {
    console.error('❌ Error fixing continuous indexing:', error);
  }
}

// Run if this is the main module
if (require.main === module) {
  fixContinuousIndexing()
    .then(() => {
      console.log('✅ Fix completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Fix failed:', error);
      process.exit(1);
    });
}

module.exports = fixContinuousIndexing;
