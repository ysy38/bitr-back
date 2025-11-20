/**
 * Fix 4: Audit script to find and fix users stuck with low reputation
 * This script checks both database and blockchain reputation
 */

const { ethers } = require('ethers');
const config = require('../config');
const db = require('../db/db');

const REPUTATION_SYSTEM_ABI = require('../abis/ReputationSystem.json');
const REPUTATION_SYSTEM_ADDRESS = '0x70b7BcB7aF96C8B4354A4DA91365184b1DaC782A';
const DEFAULT_REPUTATION = 40;
const MIN_GUIDED_POOL_REPUTATION = 40;

async function auditStuckUsers() {
  try {
    console.log('🔍 Fix 4: Auditing users with low reputation...');
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

    // Check each user's on-chain reputation
    console.log('🔍 Checking on-chain reputation for each user...');
    const stuckUsers = [];
    const healthyUsers = [];

    for (const user of dbUsers.rows) {
      try {
        const [onChainRep, canCreateGuided, canCreateOpen, canPropose] = 
          await reputationSystem.getReputationBundle(user.address);

        const dbRep = user.reputation;
        const onChainRepNum = Number(onChainRep);

        console.log(`   👤 ${user.address}`);
        console.log(`      DB Rep: ${dbRep}, On-Chain Rep: ${onChainRepNum}`);
        console.log(`      Can create guided: ${canCreateGuided}, Can create open: ${canCreateOpen}`);

        // Check if user is stuck
        const isStuck = onChainRepNum > 0 && onChainRepNum < DEFAULT_REPUTATION;
        const needsSync = dbRep !== onChainRepNum;

        if (isStuck) {
          stuckUsers.push({
            address: user.address,
            dbReputation: dbRep,
            onChainReputation: onChainRepNum,
            canCreateGuided,
            canCreateOpen,
            canPropose,
            totalBets: user.total_bets,
            totalPools: user.total_pools_created,
            joinedAt: user.joined_at,
            lastActive: user.last_active
          });
          console.log(`      ❌ STUCK: On-chain reputation ${onChainRepNum} < ${DEFAULT_REPUTATION}`);
        } else if (needsSync) {
          console.log(`      ⚠️ OUT OF SYNC: DB ${dbRep} ≠ On-chain ${onChainRepNum}`);
        } else {
          healthyUsers.push({
            address: user.address,
            reputation: onChainRepNum,
            canCreateGuided,
            canCreateOpen
          });
          console.log(`      ✅ Healthy: Reputation ${onChainRepNum}`);
        }
        console.log('');

      } catch (error) {
        console.error(`   ❌ Error checking ${user.address}:`, error.message);
        console.log('');
      }
    }

    // Summary
    console.log('📊 Audit Summary:');
    console.log(`   ✅ Healthy users: ${healthyUsers.length}`);
    console.log(`   ❌ Stuck users: ${stuckUsers.length}`);
    console.log(`   📊 Total users: ${dbUsers.rows.length}`);
    console.log('');

    if (stuckUsers.length === 0) {
      console.log('🎉 No stuck users found! All users have proper reputation.');
      return;
    }

    // Show stuck users
    console.log('❌ Stuck Users (reputation < 40):');
    stuckUsers.forEach((user, i) => {
      console.log(`   ${i + 1}. ${user.address}`);
      console.log(`      DB: ${user.dbReputation}, On-chain: ${user.onChainReputation}`);
      console.log(`      Can create guided: ${user.canCreateGuided}`);
      console.log(`      Activity: ${user.totalBets} bets, ${user.totalPools} pools`);
      console.log(`      Joined: ${user.joinedAt}, Last active: ${user.lastActive}`);
      console.log('');
    });

    // Check if we can fix them
    console.log('🔧 Checking if we can fix stuck users...');
    const isAuthorized = await reputationSystem.authorizedUpdaters(wallet.address);
    console.log(`   Wallet authorized: ${isAuthorized}`);

    if (!isAuthorized) {
      console.log('   ❌ Cannot fix: Wallet not authorized to update reputation');
      console.log('   Run: node scripts/authorize-backend-wallet.js first');
      return;
    }

    // Fix stuck users
    console.log('');
    console.log('✨ Fixing stuck users...');
    let fixed = 0;
    let errors = 0;

    for (const user of stuckUsers) {
      try {
        // Set reputation to 0 so they get DEFAULT_REPUTATION (40)
        console.log(`   🔧 Fixing ${user.address}: ${user.onChainReputation} → 0 (will return 40)`);
        
        const tx = await reputationSystem.updateReputation(user.address, 0);
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
    console.log(`   📊 Total stuck users: ${stuckUsers.length}`);

    if (fixed > 0) {
      console.log('');
      console.log('🎉 Successfully fixed stuck users!');
      console.log('   They can now create pools with proper reputation.');
    }

    // Show healthy users
    if (healthyUsers.length > 0) {
      console.log('');
      console.log('✅ Healthy Users:');
      healthyUsers.forEach((user, i) => {
        console.log(`   ${i + 1}. ${user.address} (Rep: ${user.reputation}, Can create guided: ${user.canCreateGuided})`);
      });
    }

  } catch (error) {
    console.error('❌ Error in auditStuckUsers:', error.message);
  } finally {
    process.exit(0);
  }
}

auditStuckUsers();
