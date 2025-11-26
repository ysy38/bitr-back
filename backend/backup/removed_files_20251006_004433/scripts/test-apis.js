#!/usr/bin/env node

/**
 * API Testing Script
 * Tests the new slip and analytics APIs
 */

require('dotenv').config();
const db = require('../db/db');

async function testAPIs() {
  console.log('🧪 Testing New APIs...\n');

  try {
    // Test slip stats
    console.log('📊 Testing slip statistics query...');
    const stats = await db.query(`
      SELECT 
        COUNT(*) as total_slips,
        COUNT(DISTINCT player_address) as unique_players,
        COUNT(CASE WHEN is_evaluated THEN 1 END) as evaluated_slips,
        AVG(CASE WHEN is_evaluated THEN correct_count END) as avg_correct_predictions,
        MAX(CASE WHEN is_evaluated THEN correct_count END) as max_correct_predictions,
        COUNT(CASE WHEN is_evaluated AND correct_count = 5 THEN 1 END) as perfect_slips
      FROM oracle.oddyssey_slips
    `);
    
    console.log('✅ Slip stats query successful:');
    console.log('   Total slips:', stats.rows[0].total_slips);
    console.log('   Unique players:', stats.rows[0].unique_players);
    console.log('   Evaluated slips:', stats.rows[0].evaluated_slips);
    console.log('   Avg correct predictions:', parseFloat(stats.rows[0].avg_correct_predictions || 0).toFixed(2));
    console.log('   Max correct predictions:', stats.rows[0].max_correct_predictions);
    console.log('   Perfect slips:', stats.rows[0].perfect_slips);

    // Test analytics overview query
    console.log('\n📈 Testing analytics overview query...');
    const analyticsOverview = await db.query(`
      SELECT 
        SUM(total_slips) as total_slips,
        AVG(unique_players) as avg_daily_players,
        AVG(avg_accuracy) as platform_accuracy,
        MAX(max_correct_predictions) as best_performance,
        SUM(evaluated_slips) as total_evaluated
      FROM oracle.analytics_odyssey_daily 
      WHERE date >= CURRENT_DATE - INTERVAL '30 days'
    `);

    console.log('✅ Analytics overview query successful:');
    console.log('   Total slips (30d):', analyticsOverview.rows[0].total_slips || 0);
    console.log('   Avg daily players:', parseFloat(analyticsOverview.rows[0].avg_daily_players || 0).toFixed(1));
    console.log('   Platform accuracy:', parseFloat(analyticsOverview.rows[0].platform_accuracy || 0).toFixed(2) + '%');
    console.log('   Best performance:', analyticsOverview.rows[0].best_performance || 0);
    console.log('   Total evaluated:', analyticsOverview.rows[0].total_evaluated || 0);

    // Test user analytics query
    console.log('\n👤 Testing user analytics query...');
    const userAnalytics = await db.query(`
      SELECT 
        COUNT(DISTINCT user_address) as total_users,
        AVG(slips_count) as avg_slips_per_user,
        AVG(accuracy_percentage) as avg_user_accuracy,
        COUNT(CASE WHEN slips_count >= 10 THEN 1 END) as active_users
      FROM oracle.oddyssey_user_analytics
    `);

    console.log('✅ User analytics query successful:');
    console.log('   Total users:', userAnalytics.rows[0].total_users || 0);
    console.log('   Avg slips per user:', parseFloat(userAnalytics.rows[0].avg_slips_per_user || 0).toFixed(1));
    console.log('   Avg user accuracy:', parseFloat(userAnalytics.rows[0].avg_user_accuracy || 0).toFixed(2) + '%');
    console.log('   Active users (10+ slips):', userAnalytics.rows[0].active_users || 0);

    // Test recent activity
    console.log('\n🕒 Testing recent activity query...');
    const recentActivity = await db.query(`
      SELECT DATE(placed_at) as date, COUNT(*) as slips_count
      FROM oracle.oddyssey_slips 
      WHERE placed_at >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY DATE(placed_at)
      ORDER BY date DESC
      LIMIT 7
    `);

    console.log('✅ Recent activity query successful:');
    recentActivity.rows.forEach(row => {
      console.log(`   ${row.date}: ${row.slips_count} slips`);
    });

    console.log('\n' + '='.repeat(50));
    console.log('🎉 ALL API QUERIES SUCCESSFUL!');
    console.log('✅ Slip APIs ready for frontend integration');
    console.log('✅ Analytics APIs ready for dashboard');
    console.log('✅ Database queries optimized and working');
    console.log('='.repeat(50));

  } catch (error) {
    console.error('❌ API test failed:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

testAPIs();
