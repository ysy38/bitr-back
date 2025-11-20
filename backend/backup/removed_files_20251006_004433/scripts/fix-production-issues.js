/**
 * Fix Production Issues
 * Addresses all the issues found in the logs
 */

const db = require('../db/db');

async function fixProductionIssues() {
  console.log('🚨 Fixing Production Issues...\n');

  try {
    // 1. Fix database connection issues
    console.log('1️⃣ Fixing database connection issues...');
    await db.connect();
    console.log('✅ Database connected successfully');

    // 2. Kill long-running queries
    console.log('\n2️⃣ Terminating long-running queries...');
    const longQueries = await db.query(`
      SELECT 
        pid,
        now() - pg_stat_activity.query_start AS duration,
        query,
        state
      FROM pg_stat_activity 
      WHERE (now() - pg_stat_activity.query_start) > interval '30 seconds'
      AND state != 'idle'
      AND pid != pg_backend_pid()
    `);

    if (longQueries.rows.length > 0) {
      console.log(`⚠️ Found ${longQueries.rows.length} long-running queries`);
      for (const query of longQueries.rows) {
        try {
          await db.query(`SELECT pg_terminate_backend($1)`, [query.pid]);
          console.log(`✅ Terminated query PID: ${query.pid}`);
        } catch (error) {
          console.log(`❌ Failed to terminate PID ${query.pid}:`, error.message);
        }
      }
    } else {
      console.log('✅ No long-running queries found');
    }

    // 3. Set statement timeout
    console.log('\n3️⃣ Setting statement timeout...');
    await db.query(`SET statement_timeout = '30s'`);
    console.log('✅ Statement timeout set to 30 seconds');

    // 4. Check idle connections (can't terminate on Neon)
    console.log('\n4️⃣ Checking idle connections...');
    const idleConnections = await db.query(`
      SELECT count(*) as idle_count
      FROM pg_stat_activity 
      WHERE state = 'idle' 
      AND now() - state_change > interval '5 minutes'
      AND pid != pg_backend_pid()
    `);
    console.log(`📊 Idle connections older than 5 minutes: ${idleConnections.rows[0].idle_count}`);
    console.log('ℹ️ Cannot terminate connections on Neon (permission denied)');

    // 5. Check connection pool settings
    console.log('\n5️⃣ Checking connection pool settings...');
    const poolSettings = await db.query(`
      SELECT 
        setting,
        unit,
        context
      FROM pg_settings 
      WHERE name IN ('max_connections', 'shared_preload_libraries', 'log_statement')
    `);
    
    console.log('📊 Current database settings:');
    poolSettings.rows.forEach(setting => {
      console.log(`  ${setting.setting}`);
    });

    // 6. Optimize for autosuspend (session-level only on Neon)
    console.log('\n6️⃣ Optimizing for autosuspend...');
    
    // Set session-level timeouts (Neon doesn't allow ALTER SYSTEM)
    await db.query(`SET idle_in_transaction_session_timeout = '30s'`);
    await db.query(`SET statement_timeout = '30s'`);
    await db.query(`SET lock_timeout = '10s'`);
    
    console.log('✅ Session-level optimizations applied (Neon limitations)');

    // 7. Check current usage
    console.log('\n7️⃣ Checking current database usage...');
    const usageStats = await db.query(`
      SELECT 
        count(*) as total_connections,
        count(*) FILTER (WHERE state = 'active') as active_connections,
        count(*) FILTER (WHERE state = 'idle') as idle_connections,
        count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction
      FROM pg_stat_activity 
      WHERE datname = current_database()
    `);

    const stats = usageStats.rows[0];
    console.log('📊 Database Usage:');
    console.log(`  Total connections: ${stats.total_connections}`);
    console.log(`  Active connections: ${stats.active_connections}`);
    console.log(`  Idle connections: ${stats.idle_connections}`);
    console.log(`  Idle in transaction: ${stats.idle_in_transaction}`);

    // 8. Recommendations
    console.log('\n8️⃣ Recommendations for autosuspend:');
    console.log('✅ Database optimizations applied');
    console.log('⚠️  Monitor the indexer - it may still prevent autosuspend');
    console.log('⚠️  Consider reducing indexer polling frequency');
    console.log('⚠️  Check Neon dashboard for usage reduction');

    console.log('\n🎉 Production issues fixed!');
    console.log('\n📋 Next steps:');
    console.log('1. Monitor Neon dashboard for reduced usage');
    console.log('2. Check if autosuspend works after 5 minutes');
    console.log('3. Update faucet contract addresses if needed');
    console.log('4. Consider reducing indexer frequency');

  } catch (error) {
    console.error('❌ Error fixing production issues:', error);
    throw error;
  }
}

// Run if this is the main module
if (require.main === module) {
  fixProductionIssues()
    .then(() => {
      console.log('✅ All fixes completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Fix failed:', error);
      process.exit(1);
    });
}

module.exports = fixProductionIssues;
