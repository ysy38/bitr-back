const db = require('../db/db');

async function checkReputation() {
  try {
    const userAddress = '0xA336C7B8cBe75D5787F25A62FE282B83Ac0f3363';
    
    console.log('🔍 Checking database reputation for:', userAddress);
    console.log('');
    
    // Check if user exists in core.users
    const userQuery = await db.query(`
      SELECT 
        address, 
        reputation,
        total_bets,
        won_bets,
        total_pools_created,
        joined_at,
        last_active,
        last_synced_at
      FROM core.users 
      WHERE LOWER(address) = LOWER($1)
    `, [userAddress]);
    
    if (userQuery.rows.length === 0) {
      console.log('❌ User NOT found in core.users table');
      console.log('   This means user has never interacted with the platform via database');
    } else {
      console.log('✅ User found in core.users:');
      const user = userQuery.rows[0];
      console.log('   Address:', user.address);
      console.log('   Reputation:', user.reputation);
      console.log('   Total bets:', user.total_bets);
      console.log('   Won bets:', user.won_bets);
      console.log('   Total pools created:', user.total_pools_created);
      console.log('   Joined at:', user.joined_at);
      console.log('   Last active:', user.last_active);
      console.log('   Last synced at:', user.last_synced_at);
    }
    console.log('');
    
    // Check if user has any bets
    const betsQuery = await db.query(`
      SELECT COUNT(*) as bet_count
      FROM core.bets
      WHERE LOWER(user_address) = LOWER($1)
    `, [userAddress]);
    console.log('📊 Bets:', betsQuery.rows[0].bet_count);
    
    // Check if user has any pools
    const poolsQuery = await db.query(`
      SELECT COUNT(*) as pool_count
      FROM core.prediction_pools
      WHERE LOWER(creator_address) = LOWER($1)
    `, [userAddress]);
    console.log('📊 Pools created:', poolsQuery.rows[0].pool_count);
    
    // Check if user has any oddyssey slips
    const slipsQuery = await db.query(`
      SELECT COUNT(*) as slip_count
      FROM oracle.oddyssey_slips
      WHERE LOWER(user_address) = LOWER($1)
    `, [userAddress]);
    console.log('📊 Oddyssey slips:', slipsQuery.rows[0].slip_count);
    
    console.log('');
    console.log('🔬 Analysis:');
    if (userQuery.rows.length === 0) {
      console.log('   User has NO database record');
      console.log('   Reputation was likely set directly on-chain');
      console.log('   This is the source of the 1-point reputation!');
    } else if (userQuery.rows[0].reputation === 0 || userQuery.rows[0].reputation === null) {
      console.log('   User has database record but 0 reputation');
      console.log('   If on-chain reputation is 1, it was manually set');
    } else {
      console.log(`   User has database reputation of ${userQuery.rows[0].reputation}`);
      console.log('   This should be synced to blockchain by reputation-sync-service');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    process.exit(0);
  }
}

checkReputation();
