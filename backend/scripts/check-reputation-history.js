/**
 * Check reputation history for a user
 */

const { ethers } = require('ethers');
require('dotenv').config();

const REPUTATION_SYSTEM_ABI = require('../abis/ReputationSystem.json');
const REPUTATION_SYSTEM_ADDRESS = '0x70b7BcB7aF96C8B4354A4DA91365184b1DaC782A';
const USER_ADDRESS = '0xA336C7B8cBe75D5787F25A62FE282B83Ac0f3363';

async function checkHistory() {
  try {
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://dream-rpc.somnia.network');
    const reputationSystem = new ethers.Contract(
      REPUTATION_SYSTEM_ADDRESS,
      REPUTATION_SYSTEM_ABI,
      provider
    );
    
    console.log('🔍 Checking reputation history for:', USER_ADDRESS);
    console.log('');
    
    // Get current reputation data
    const currentRep = await reputationSystem.userReputation(USER_ADDRESS);
    const totalActions = await reputationSystem.totalActions(USER_ADDRESS);
    const successfulActions = await reputationSystem.successfulActions(USER_ADDRESS);
    const isVerified = await reputationSystem.isVerifiedCreator(USER_ADDRESS);
    const streak = await reputationSystem.predictionStreak(USER_ADDRESS);
    const longestStreak = await reputationSystem.longestStreak(USER_ADDRESS);
    
    console.log('📊 Current Reputation Data:');
    console.log('   Raw reputation score:', currentRep.toString());
    console.log('   Total actions:', totalActions.toString());
    console.log('   Successful actions:', successfulActions.toString());
    console.log('   Is verified creator:', isVerified);
    console.log('   Current prediction streak:', streak.toString());
    console.log('   Longest streak:', longestStreak.toString());
    console.log('');
    
    // Query events - ReputationUpdated
    console.log('📜 Querying ReputationUpdated events...');
    const filter = reputationSystem.filters.ReputationUpdated(USER_ADDRESS);
    const events = await reputationSystem.queryFilter(filter, 0, 'latest');
    
    if (events.length === 0) {
      console.log('   ⚠️ No ReputationUpdated events found');
    } else {
      console.log(`   Found ${events.length} ReputationUpdated event(s):`);
      events.forEach((event, i) => {
        console.log(`   ${i + 1}. Block ${event.blockNumber}:`);
        console.log(`      Old: ${event.args.oldReputation.toString()}`);
        console.log(`      New: ${event.args.newReputation.toString()}`);
        console.log(`      Reason: ${event.args.reason}`);
        console.log(`      Tx: ${event.transactionHash}`);
      });
    }
    console.log('');
    
    // Query events - ReputationActionRecorded
    console.log('📜 Querying ReputationActionRecorded events...');
    const actionFilter = reputationSystem.filters.ReputationActionRecorded(USER_ADDRESS);
    const actionEvents = await reputationSystem.queryFilter(actionFilter, 0, 'latest');
    
    if (actionEvents.length === 0) {
      console.log('   ⚠️ No ReputationActionRecorded events found');
    } else {
      console.log(`   Found ${actionEvents.length} ReputationActionRecorded event(s):`);
      actionEvents.forEach((event, i) => {
        console.log(`   ${i + 1}. Block ${event.blockNumber}:`);
        console.log(`      Action: ${event.args.action} (enum value)`);
        console.log(`      Points: ${event.args.points.toString()}`);
        console.log(`      Details: ${event.args.details}`);
        console.log(`      Tx: ${event.transactionHash}`);
      });
    }
    console.log('');
    
    // Analysis
    console.log('🔬 Analysis:');
    if (currentRep.toString() === '0') {
      console.log('   ✅ User has NO reputation record (would get DEFAULT_REPUTATION = 40)');
    } else if (currentRep.toString() === '1') {
      console.log('   ⚠️ User has 1 reputation point stored');
      console.log('   This prevents them from getting DEFAULT_REPUTATION (40)');
      console.log('   Likely cause: Backend synced 1 action without proper reputation calculation');
    } else {
      console.log(`   User has ${currentRep.toString()} reputation points`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkHistory();
