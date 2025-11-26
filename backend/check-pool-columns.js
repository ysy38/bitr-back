const db = require('./db/db');

async function check() {
  try {
    // Check what columns exist
    const schemaResult = await db.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'oracle' AND table_name = 'pools'
      ORDER BY ordinal_position
    `);
    
    console.log('\n📋 POOLS TABLE COLUMNS:');
    schemaResult.rows.forEach(col => {
      console.log(`  ${col.column_name}: ${col.data_type}`);
    });
    
    // Check Pool 2 data
    const poolResult = await db.query(`
      SELECT * FROM oracle.pools WHERE pool_id = 2
    `);
    
    const pool = poolResult.rows[0];
    console.log('\n🔍 POOL 2 RELEVANT FIELDS:');
    console.log(`  creator_stake: ${pool.creator_stake}`);
    console.log(`  total_bettor_stake: ${pool.total_bettor_stake}`);
    console.log(`  odds: ${pool.odds}`);
    console.log(`  max_pool_size: ${pool.max_pool_size}`);
    console.log(`  fill_percentage: ${pool.fill_percentage}`);
    
    // Calculate what they should be
    const creatorStake = parseFloat(pool.creator_stake) / 1e18;
    const totalBettorStake = parseFloat(pool.total_bettor_stake) / 1e18;
    const decimalOdds = pool.odds / 100;
    const maxBettorStake = (creatorStake / (decimalOdds - 1));
    const maxPoolSize = creatorStake + maxBettorStake;
    const fillPercentage = (totalBettorStake / maxBettorStake) * 100;
    
    console.log('\n✅ CALCULATED VALUES:');
    console.log(`  creatorStake: ${creatorStake.toFixed(2)}`);
    console.log(`  totalBettorStake: ${totalBettorStake.toFixed(2)}`);
    console.log(`  decimalOdds: ${decimalOdds}`);
    console.log(`  maxBettorStake: ${maxBettorStake.toFixed(2)}`);
    console.log(`  maxPoolSize: ${maxPoolSize.toFixed(2)}`);
    console.log(`  fillPercentage: ${fillPercentage.toFixed(2)}`);
    
  } catch (error) {
    console.error('Error:', error.message);
  }
  process.exit(0);
}

check();
