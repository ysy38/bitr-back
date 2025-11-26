const db = require('../db/db');

async function checkBets() {
  console.log('\n========== CHECKING POOLS 11 & 12 BETS ==========\n');
  
  try {
    // Check bets for pools 11 and 12
    const betsResult = await db.query(`
      SELECT 
        pool_id,
        COUNT(*) as bet_count,
        SUM(amount::numeric) as total_bet_amount,
        COUNT(DISTINCT bettor_address) as unique_bettors
      FROM oracle.bets 
      WHERE pool_id::bigint IN (11, 12)
      GROUP BY pool_id
      ORDER BY pool_id
    `);
    
    console.log('📊 Bets Summary:');
    if (betsResult.rows.length === 0) {
      console.log('   No bets found for pools 11 and 12');
    } else {
      for (const row of betsResult.rows) {
        console.log(`\n   Pool ${row.pool_id}:`);
        console.log(`      Bet Count: ${row.bet_count}`);
        console.log(`      Total Bet Amount: ${row.total_bet_amount || '0'}`);
        console.log(`      Unique Bettors: ${row.unique_bettors}`);
      }
    }
    
    // Check contract bettor stakes
    const poolsResult = await db.query(`
      SELECT 
        pool_id,
        total_bettor_stake,
        total_creator_side_stake,
        is_settled,
        creator_side_won,
        result
      FROM oracle.pools 
      WHERE pool_id IN (11, 12)
      ORDER BY pool_id
    `);
    
    console.log('\n📊 Pool Stats from Database:');
    for (const pool of poolsResult.rows) {
      console.log(`\n   Pool ${pool.pool_id}:`);
      console.log(`      Total Bettor Stake: ${pool.total_bettor_stake || '0'}`);
      console.log(`      Total Creator Side Stake: ${pool.total_creator_side_stake || '0'}`);
      console.log(`      Is Settled: ${pool.is_settled}`);
      console.log(`      Creator Side Won: ${pool.creator_side_won}`);
      console.log(`      Result: ${pool.result}`);
      
      if (pool.total_bettor_stake === '0' || pool.total_bettor_stake === null) {
        console.log(`      ⚠️  Pool has NO bets - was settled as refund`);
        console.log(`      ❌ BUT it should have been settled with oracle outcome!`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  }
}

checkBets()
  .then(() => {
    console.log('\n✅ Check complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Check failed:', error);
    process.exit(1);
  });

