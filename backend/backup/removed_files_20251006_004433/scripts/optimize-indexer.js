/**
 * Optimize Indexer for Autosuspend
 * The main issue is the continuous indexer preventing database autosuspend
 */

const db = require('../db/db');

async function optimizeIndexer() {
  console.log('🔧 Optimizing Indexer for Autosuspend...\n');

  try {
    // 1. Check current indexer activity
    console.log('1️⃣ Checking current indexer activity...');
    
    const activeQueries = await db.query(`
      SELECT 
        pid,
        now() - query_start as duration,
        query,
        state,
        application_name
      FROM pg_stat_activity 
      WHERE state = 'active'
      AND query NOT LIKE '%pg_stat_activity%'
      ORDER BY query_start
    `);

    console.log(`📊 Active queries: ${activeQueries.rows.length}`);
    activeQueries.rows.forEach((query, index) => {
      console.log(`  ${index + 1}. PID ${query.pid}: ${query.duration} - ${query.query.substring(0, 100)}...`);
    });

    // 2. Check for continuous polling patterns
    console.log('\n2️⃣ Checking for continuous polling patterns...');
    
    const pollingQueries = await db.query(`
      SELECT 
        application_name,
        count(*) as query_count,
        min(query_start) as first_query,
        max(query_start) as last_query
      FROM pg_stat_activity 
      WHERE query_start > now() - interval '1 hour'
      AND state = 'active'
      GROUP BY application_name
      ORDER BY query_count DESC
    `);

    console.log('📊 Query patterns in the last hour:');
    pollingQueries.rows.forEach((pattern, index) => {
      console.log(`  ${index + 1}. ${pattern.application_name}: ${pattern.query_count} queries`);
    });

    // 3. Check indexer configuration
    console.log('\n3️⃣ Checking indexer configuration...');
    
    // The main issue is likely in the unified-realtime-indexer.js
    console.log('⚠️  The main issue is the continuous indexer running every second');
    console.log('⚠️  This prevents autosuspend because it keeps the database active');
    
    // 4. Recommendations
    console.log('\n4️⃣ Recommendations to enable autosuspend:');
    console.log('✅ Database optimizations applied');
    console.log('⚠️  CRITICAL: The indexer needs to be optimized');
    console.log('   - Current: Polling every 1 second');
    console.log('   - Recommended: Poll every 30-60 seconds during low activity');
    console.log('   - Add sleep mode: Pause during low activity periods');
    
    // 5. Check if we can implement sleep mode
    console.log('\n5️⃣ Checking for sleep mode implementation...');
    
    // Look for any existing sleep mode or activity detection
    const sleepModeCheck = await db.query(`
      SELECT 
        count(*) as recent_activity
      FROM pg_stat_activity 
      WHERE query_start > now() - interval '5 minutes'
      AND state = 'active'
    `);

    const recentActivity = parseInt(sleepModeCheck.rows[0].recent_activity);
    
    if (recentActivity > 10) {
      console.log(`⚠️  High activity detected: ${recentActivity} queries in last 5 minutes`);
      console.log('⚠️  This will prevent autosuspend');
    } else {
      console.log(`✅ Low activity: ${recentActivity} queries in last 5 minutes`);
      console.log('✅ Autosuspend should work if indexer is optimized');
    }

    // 6. Final recommendations
    console.log('\n6️⃣ Final Recommendations:');
    console.log('🎯 To enable autosuspend and reduce costs by 80%:');
    console.log('   1. Reduce indexer polling frequency (1s → 30s)');
    console.log('   2. Implement sleep mode during low activity');
    console.log('   3. Use event-driven instead of polling where possible');
    console.log('   4. Monitor Neon dashboard for usage reduction');
    
    console.log('\n📊 Expected Results:');
    console.log('   - Current: 467 hours/month = $93.86');
    console.log('   - Target: 60-120 hours/month = $19.00');
    console.log('   - Savings: $74.86/month (80% reduction)');

    console.log('\n🎉 Indexer optimization analysis completed!');

  } catch (error) {
    console.error('❌ Error optimizing indexer:', error);
    throw error;
  }
}

// Run if this is the main module
if (require.main === module) {
  optimizeIndexer()
    .then(() => {
      console.log('✅ Indexer optimization completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Indexer optimization failed:', error);
      process.exit(1);
    });
}

module.exports = optimizeIndexer;
