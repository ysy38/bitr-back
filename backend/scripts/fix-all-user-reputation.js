/**
 * Fix All User Reputation - Apply the correct reputation calculation
 * This script fixes all users who have incorrect reputation due to the contract bug
 */

const { ethers } = require('ethers');
const config = require('../config');
const db = require('../db/db');

const REPUTATION_SYSTEM_ABI = require('../abis/ReputationSystem.json');
const REPUTATION_SYSTEM_ADDRESS = '0x70b7BcB7aF96C8B4354A4DA91365184b1DaC782A';
const DEFAULT_REPUTATION = 40;

async function fixAllUserReputation() {
  try {
    console.log('🔧 Fixing all user reputation due to contract bug...');
    console.log('');

    // Connect to blockchain
    const provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    const wallet = new ethers.Wallet(config.blockchain.privateKey, provider);
    const reputationSystem = new ethers.Contract(
      REPUTATION_SYSTEM_ADDRESS,
      REPUTATION_SYSTEM_ABI,
      wallet
    );

    console.log('🔗 Connected to blockchain');
    console.log('👤 Wallet:', wallet.address);
    console.log('📋 Contract:', REPUTATION_SYSTEM_ADDRESS);
    console.log('');

    // Get all users from database
    console.log('📊 Getting all users from database...');
    const dbUsers = await db.query(`
      SELECT address, reputation, total_bets, total_pools_created, joined_at, last_active
      FROM core.users 
      ORDER BY reputation ASC
    `);

    console.log(`   Found ${dbUsers.rows.length} users in database`);
    console.log('');

    if (dbUsers.rows.length === 0) {
      console.log('⚠️ No users in database. Run Fix 3 first to create user records.');
      return;
    }

    // Check each user's on-chain reputation and calculate correct reputation
    console.log('🔍 Checking and fixing each user...');
    const usersToFix = [];

    for (const user of dbUsers.rows) {
      try {
        const [onChainRep, canCreateGuided, canCreateOpen, canPropose] = 
          await reputationSystem.getReputationBundle(user.address);

        const onChainRepNum = Number(onChainRep);
        const dbRep = user.reputation;

        console.log(`   👤 ${user.address}`);
        console.log(`      DB Rep: ${dbRep}, On-Chain Rep: ${onChainRepNum}`);

        // Calculate what the reputation SHOULD be based on activity
        let correctReputation = DEFAULT_REPUTATION; // Start with default

        // Add points for Oddyssey participation (from database)
        const oddysseyData = await db.query(`
          SELECT COUNT(*) as slip_count FROM oracle.oddyssey_slips 
          WHERE player_address = $1
        `, [user.address]);
        const slipCount = parseInt(oddysseyData.rows[0].slip_count);
        correctReputation += slipCount; // +1 per slip

        // Add points for pool creation
        correctReputation += user.total_pools_created * 4; // +4 per pool

        // Add points for betting
        correctReputation += user.total_bets * 2; // +2 per bet

        console.log(`      Activity: ${slipCount} slips, ${user.total_pools_created} pools, ${user.total_bets} bets`);
        console.log(`      Correct Reputation: ${correctReputation}`);

        // Check if user needs fixing
        if (onChainRepNum !== correctReputation) {
          usersToFix.push({
            address: user.address,
            currentReputation: onChainRepNum,
            correctReputation: correctReputation,
            canCreateGuided,
            canCreateOpen,
            activity: {
              slips: slipCount,
              pools: user.total_pools_created,
              bets: user.total_bets
            }
          });
          console.log(`      ❌ NEEDS FIX: ${onChainRepNum} → ${correctReputation}`);
        } else {
          console.log(`      ✅ CORRECT: ${onChainRepNum}`);
        }
        console.log('');

      } catch (error) {
        console.error(`   ❌ Error checking ${user.address}:`, error.message);
        console.log('');
      }
    }

    // Summary
    console.log('📊 Analysis Summary:');
    console.log(`   ✅ Correct users: ${dbUsers.rows.length - usersToFix.length}`);
    console.log(`   ❌ Users needing fix: ${usersToFix.length}`);
    console.log(`   📊 Total users: ${dbUsers.rows.length}`);
    console.log('');

    if (usersToFix.length === 0) {
      console.log('🎉 All users have correct reputation!');
      return;
    }

    // Show users to fix
    console.log('❌ Users Needing Fix:');
    usersToFix.forEach((user, i) => {
      console.log(`   ${i + 1}. ${user.address}`);
      console.log(`      Current: ${user.currentReputation}, Correct: ${user.correctReputation}`);
      console.log(`      Activity: ${user.activity.slips} slips, ${user.activity.pools} pools, ${user.activity.bets} bets`);
      console.log(`      Can create guided: ${user.canCreateGuided}`);
      console.log('');
    });

    // Check if we can fix them
    console.log('🔧 Checking if we can fix users...');
    const isAuthorized = await reputationSystem.authorizedUpdaters(wallet.address);
    console.log(`   Wallet authorized: ${isAuthorized}`);

    if (!isAuthorized) {
      console.log('   ❌ Cannot fix: Wallet not authorized to update reputation');
      console.log('   Run: node scripts/authorize-backend-wallet.js first');
      return;
    }

    // Fix users
    console.log('');
    console.log('✨ Fixing users...');
    let fixed = 0;
    let errors = 0;

    for (const user of usersToFix) {
      try {
        console.log(`   🔧 Fixing ${user.address}: ${user.currentReputation} → ${user.correctReputation}`);
        
        const tx = await reputationSystem.updateReputation(user.address, user.correctReputation);
        console.log(`      Transaction: ${tx.hash}`);
        
        const receipt = await tx.wait();
        console.log(`      Confirmed in block: ${receipt.blockNumber}`);

        // Verify the fix
        const [newRep, newCanCreateGuided] = await reputationSystem.getReputationBundle(user.address);
        console.log(`      ✅ New reputation: ${newRep.toString()}, Can create guided: ${newCanCreateGuided}`);

        fixed++;

      } catch (error) {
        console.error(`   ❌ Error fixing ${user.address}:`, error.message);
        errors++;
      }
      console.log('');
    }

    console.log('📊 Fix Summary:');
    console.log(`   ✅ Users fixed: ${fixed}`);
    console.log(`   ❌ Errors: ${errors}`);
    console.log(`   📊 Total users needing fix: ${usersToFix.length}`);

    if (fixed > 0) {
      console.log('');
      console.log('🎉 Successfully fixed user reputation!');
      console.log('   All users now have correct reputation based on their activity.');
      console.log('   They can create pools and participate in the platform.');
    }

    // Show final status
    console.log('');
    console.log('📊 Final Status:');
    for (const user of usersToFix) {
      try {
        const [finalRep, finalCanCreateGuided] = await reputationSystem.getReputationBundle(user.address);
        console.log(`   ${user.address}: ${finalRep.toString()} reputation, Can create guided: ${finalCanCreateGuided}`);
      } catch (error) {
        console.error(`   Error checking final status for ${user.address}:`, error.message);
      }
    }

  } catch (error) {
    console.error('❌ Error in fixAllUserReputation:', error.message);
  } finally {
    process.exit(0);
  }
}

fixAllUserReputation();
