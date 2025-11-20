/**
 * Fix 3: Create database records for all users who have interacted with the system
 * This ensures reputation sync service can help them
 */

const db = require('../db/db');

async function createUserRecords() {
  try {
    console.log('🔧 Fix 3: Creating database records for all system users...');
    console.log('');

    // Get all users from oddyssey_slips
    console.log('📊 Finding users from Oddyssey participation...');
    const oddysseyUsers = await db.query(`
      SELECT DISTINCT player_address, 
             COUNT(*) as slip_count,
             MIN(placed_at) as first_activity,
             MAX(placed_at) as last_activity
      FROM oracle.oddyssey_slips 
      WHERE player_address IS NOT NULL
      GROUP BY player_address
      ORDER BY slip_count DESC
    `);

    console.log(`   Found ${oddysseyUsers.rows.length} Oddyssey users:`);
    oddysseyUsers.rows.forEach((user, i) => {
      console.log(`   ${i + 1}. ${user.player_address}`);
      console.log(`      Slips: ${user.slip_count}, First: ${user.first_activity}, Last: ${user.last_activity}`);
    });
    console.log('');

    // Get all users from pools (if any)
    console.log('📊 Finding users from pool creation...');
    const poolUsers = await db.query(`
      SELECT DISTINCT creator_address,
             COUNT(*) as pool_count,
             MIN(created_at) as first_activity,
             MAX(created_at) as last_activity
      FROM oracle.pools 
      WHERE creator_address IS NOT NULL
      GROUP BY creator_address
      ORDER BY pool_count DESC
    `);

    console.log(`   Found ${poolUsers.rows.length} pool creators:`);
    poolUsers.rows.forEach((user, i) => {
      console.log(`   ${i + 1}. ${user.creator_address}`);
      console.log(`      Pools: ${user.pool_count}, First: ${user.first_activity}, Last: ${user.last_activity}`);
    });
    console.log('');

    // Get all users from bets (if any)
    console.log('📊 Finding users from betting...');
    const betUsers = await db.query(`
      SELECT DISTINCT bettor_address,
             COUNT(*) as bet_count,
             MIN(created_at) as first_activity,
             MAX(created_at) as last_activity
      FROM oracle.bets 
      WHERE bettor_address IS NOT NULL
      GROUP BY bettor_address
      ORDER BY bet_count DESC
    `);

    console.log(`   Found ${betUsers.rows.length} bettors:`);
    betUsers.rows.forEach((user, i) => {
      console.log(`   ${i + 1}. ${user.bettor_address}`);
      console.log(`      Bets: ${user.bet_count}, First: ${user.first_activity}, Last: ${user.last_activity}`);
    });
    console.log('');

    // Combine all unique users
    const allUsers = new Set();
    
    oddysseyUsers.rows.forEach(user => allUsers.add(user.player_address.toLowerCase()));
    poolUsers.rows.forEach(user => allUsers.add(user.creator_address.toLowerCase()));
    betUsers.rows.forEach(user => allUsers.add(user.bettor_address.toLowerCase()));

    console.log(`📊 Total unique users found: ${allUsers.size}`);
    console.log('');

    // Check which users already exist in core.users
    console.log('🔍 Checking existing users in core.users...');
    const existingUsers = await db.query(`
      SELECT address FROM core.users WHERE LOWER(address) = ANY($1)
    `, [Array.from(allUsers)]);

    const existingAddresses = new Set(existingUsers.rows.map(u => u.address.toLowerCase()));
    const newUsers = Array.from(allUsers).filter(addr => !existingAddresses.has(addr.toLowerCase()));

    console.log(`   Users already in database: ${existingUsers.rows.length}`);
    console.log(`   Users needing database records: ${newUsers.length}`);
    console.log('');

    if (newUsers.length === 0) {
      console.log('✅ All users already have database records!');
      return;
    }

    // Create database records for new users
    console.log('✨ Creating database records for new users...');
    let created = 0;
    let errors = 0;

    for (const userAddress of newUsers) {
      try {
        // Find user's activity data
        const oddysseyData = oddysseyUsers.rows.find(u => u.player_address.toLowerCase() === userAddress.toLowerCase());
        const poolData = poolUsers.rows.find(u => u.creator_address.toLowerCase() === userAddress.toLowerCase());
        const betData = betUsers.rows.find(u => u.bettor_address.toLowerCase() === userAddress.toLowerCase());

        // Calculate initial reputation based on activity
        let initialReputation = 40; // DEFAULT_REPUTATION
        let totalBets = 0;
        let wonBets = 0;
        let totalPoolsCreated = 0;
        let firstActivity = null;
        let lastActivity = null;

        if (oddysseyData) {
          initialReputation += oddysseyData.slip_count; // +1 per slip
          if (!firstActivity || oddysseyData.first_activity < firstActivity) firstActivity = oddysseyData.first_activity;
          if (!lastActivity || oddysseyData.last_activity > lastActivity) lastActivity = oddysseyData.last_activity;
        }

        if (poolData) {
          initialReputation += poolData.pool_count * 4; // +4 per pool (from contract)
          totalPoolsCreated = poolData.pool_count;
          if (!firstActivity || poolData.first_activity < firstActivity) firstActivity = poolData.first_activity;
          if (!lastActivity || poolData.last_activity > lastActivity) lastActivity = poolData.last_activity;
        }

        if (betData) {
          totalBets = betData.bet_count;
          initialReputation += betData.bet_count * 2; // +2 per bet (from contract)
          if (!firstActivity || betData.first_activity < firstActivity) firstActivity = betData.first_activity;
          if (!lastActivity || betData.last_activity > lastActivity) lastActivity = betData.last_activity;
        }

        // Insert user record
        await db.query(`
          INSERT INTO core.users (
            address, 
            reputation, 
            total_bets, 
            won_bets, 
            total_pools_created,
            joined_at, 
            last_active,
            last_synced_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          userAddress,
          initialReputation,
          totalBets,
          wonBets,
          totalPoolsCreated,
          firstActivity || new Date(),
          lastActivity || new Date(),
          null // Will be set when synced to blockchain
        ]);

        console.log(`   ✅ Created: ${userAddress}`);
        console.log(`      Reputation: ${initialReputation}, Bets: ${totalBets}, Pools: ${totalPoolsCreated}`);
        created++;

      } catch (error) {
        console.error(`   ❌ Error creating record for ${userAddress}:`, error.message);
        errors++;
      }
    }

    console.log('');
    console.log('📊 Summary:');
    console.log(`   ✅ Users created: ${created}`);
    console.log(`   ❌ Errors: ${errors}`);
    console.log(`   📊 Total users in database now: ${existingUsers.rows.length + created}`);

    if (created > 0) {
      console.log('');
      console.log('🔄 Next steps:');
      console.log('   1. Run reputation sync service to update blockchain');
      console.log('   2. Run audit script to verify all users have proper reputation');
      console.log('   3. Test pool creation for previously stuck users');
    }

  } catch (error) {
    console.error('❌ Error in createUserRecords:', error.message);
  } finally {
    process.exit(0);
  }
}

createUserRecords();
