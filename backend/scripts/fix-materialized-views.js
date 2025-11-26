const db = require('../db/db');

/**
 * 🔧 Fix Materialized Views for Concurrent Refresh
 * 
 * This script creates the required unique indexes for materialized views
 * to enable CONCURRENT refresh operations.
 */
async function fixMaterializedViews() {
  try {
    console.log('🔧 Fixing materialized views for concurrent refresh...');
    
    // Drop existing materialized views if they exist
    const viewsToRecreate = [
      'oracle.mv_oddyssey_cycle_stats',
      'oracle.mv_oddyssey_player_stats', 
      'oracle.mv_oddyssey_daily_stats'
    ];
    
    for (const view of viewsToRecreate) {
      try {
        console.log(`🗑️ Dropping ${view}...`);
        await db.query(`DROP MATERIALIZED VIEW IF EXISTS ${view}`);
        console.log(`✅ Dropped ${view}`);
      } catch (error) {
        console.log(`⚠️ Could not drop ${view}: ${error.message}`);
      }
    }
    
    // Recreate materialized views with proper structure
    console.log('\\n📊 Creating materialized views...');
    
    // 1. Cycle Stats View
    await db.query(`
      CREATE MATERIALIZED VIEW oracle.mv_oddyssey_cycle_stats AS
      SELECT 
        cycle_id,
        COUNT(*) as total_slips,
        COUNT(DISTINCT player_address) as unique_players,
        AVG(correct_count) as avg_accuracy,
        MAX(correct_count) as max_accuracy,
        COUNT(CASE WHEN is_evaluated THEN 1 END) as evaluated_slips,
        COUNT(CASE WHEN prize_claimed THEN 1 END) as prizes_claimed
      FROM oracle.oddyssey_slips
      GROUP BY cycle_id
    `);
    console.log('✅ Created mv_oddyssey_cycle_stats');
    
    // 2. Player Stats View  
    await db.query(`
      CREATE MATERIALIZED VIEW oracle.mv_oddyssey_player_stats AS
      SELECT 
        player_address,
        COUNT(*) as total_slips,
        AVG(correct_count) as avg_accuracy,
        MAX(correct_count) as best_score,
        COUNT(CASE WHEN is_evaluated THEN 1 END) as evaluated_slips,
        COUNT(CASE WHEN prize_claimed THEN 1 END) as prizes_won,
        COUNT(DISTINCT cycle_id) as cycles_participated
      FROM oracle.oddyssey_slips
      GROUP BY player_address
    `);
    console.log('✅ Created mv_oddyssey_player_stats');
    
    // 3. Daily Stats View
    await db.query(`
      CREATE MATERIALIZED VIEW oracle.mv_oddyssey_daily_stats AS
      SELECT 
        DATE(placed_at) as date,
        COUNT(*) as total_slips,
        COUNT(DISTINCT player_address) as unique_players,
        AVG(correct_count) as avg_accuracy,
        COUNT(CASE WHEN is_evaluated THEN 1 END) as evaluated_slips
      FROM oracle.oddyssey_slips
      WHERE placed_at >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY DATE(placed_at)
    `);
    console.log('✅ Created mv_oddyssey_daily_stats');
    
    // Create unique indexes for concurrent refresh
    console.log('\\n🔑 Creating unique indexes...');
    
    // Cycle stats unique index
    await db.query(`
      CREATE UNIQUE INDEX idx_mv_cycle_stats_cycle_id_unique 
      ON oracle.mv_oddyssey_cycle_stats (cycle_id)
    `);
    console.log('✅ Created unique index for cycle_stats');
    
    // Player stats unique index
    await db.query(`
      CREATE UNIQUE INDEX idx_mv_player_stats_player_unique 
      ON oracle.mv_oddyssey_player_stats (player_address)
    `);
    console.log('✅ Created unique index for player_stats');
    
    // Daily stats unique index
    await db.query(`
      CREATE UNIQUE INDEX idx_mv_daily_stats_date_unique 
      ON oracle.mv_oddyssey_daily_stats (date)
    `);
    console.log('✅ Created unique index for daily_stats');
    
    // Create additional performance indexes
    console.log('\\n⚡ Creating performance indexes...');
    
    const performanceIndexes = [
      'CREATE INDEX idx_mv_cycle_stats_total_slips ON oracle.mv_oddyssey_cycle_stats (total_slips DESC)',
      'CREATE INDEX idx_mv_player_stats_accuracy ON oracle.mv_oddyssey_player_stats (avg_accuracy DESC)',
      'CREATE INDEX idx_mv_daily_stats_date_desc ON oracle.mv_oddyssey_daily_stats (date DESC)'
    ];
    
    for (const indexQuery of performanceIndexes) {
      try {
        await db.query(indexQuery);
        console.log(`✅ Created performance index: ${indexQuery.split(' ')[2]}`);
      } catch (error) {
        console.log(`⚠️ Could not create performance index: ${error.message}`);
      }
    }
    
    // Test concurrent refresh
    console.log('\\n🧪 Testing concurrent refresh...');
    
    for (const view of viewsToRecreate) {
      try {
        await db.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${view}`);
        console.log(`✅ Concurrent refresh successful for ${view}`);
      } catch (error) {
        console.log(`❌ Concurrent refresh failed for ${view}: ${error.message}`);
      }
    }
    
    console.log('\\n🎉 Materialized views fixed successfully!');
    
  } catch (error) {
    console.error('❌ Error fixing materialized views:', error);
    throw error;
  }
}

// Run the fix
if (require.main === module) {
  fixMaterializedViews()
    .then(() => {
      console.log('✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { fixMaterializedViews };
