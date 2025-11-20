/**
 * Grant reputation to test user for pool creation
 */

const { ethers } = require('ethers');
require('dotenv').config();

const REPUTATION_SYSTEM_ABI = require('../abis/ReputationSystem.json');
const REPUTATION_SYSTEM_ADDRESS = '0x70b7BcB7aF96C8B4354A4DA91365184b1DaC782A';
const TEST_USER_ADDRESS = '0xA336C7B8cBe75D5787F25A62FE282B83Ac0f3363';

async function grantReputation() {
  try {
    // Connect to Somnia testnet
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://dream-rpc.somnia.network');
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    
    console.log('🔗 Connected to Somnia testnet');
    console.log('👤 Wallet address:', wallet.address);
    console.log('🎯 Target user:', TEST_USER_ADDRESS);
    
    // Connect to ReputationSystem contract
    const reputationSystem = new ethers.Contract(
      REPUTATION_SYSTEM_ADDRESS,
      REPUTATION_SYSTEM_ABI,
      wallet
    );
    
    // Check current reputation
    console.log('\n📊 Checking current reputation...');
    const currentBundle = await reputationSystem.getReputationBundle(TEST_USER_ADDRESS);
    console.log('   Current reputation:', currentBundle[0].toString());
    console.log('   Can create guided:', currentBundle[1]);
    console.log('   Can create open:', currentBundle[2]);
    console.log('   Can propose:', currentBundle[3]);
    
    // Check if wallet is authorized
    console.log('\n🔐 Checking authorization...');
    const isAuthorized = await reputationSystem.authorizedUpdaters(wallet.address);
    console.log('   Is authorized updater:', isAuthorized);
    
    if (!isAuthorized) {
      console.log('\n⚠️  WARNING: Wallet is not an authorized updater!');
      console.log('   You need to call setAuthorizedUpdater from the contract owner.');
      console.log('   Contract owner should call:');
      console.log(`   reputationSystem.setAuthorizedUpdater("${wallet.address}", true)`);
      return;
    }
    
    // Grant reputation (minimum 40 for guided pools, let's give 50 for safety)
    const newReputation = 50;
    console.log(`\n✨ Granting ${newReputation} reputation to user...`);
    
    const tx = await reputationSystem.updateReputation(TEST_USER_ADDRESS, newReputation);
    console.log('   Transaction submitted:', tx.hash);
    console.log('   Waiting for confirmation...');
    
    const receipt = await tx.wait();
    console.log('✅ Transaction confirmed in block:', receipt.blockNumber);
    
    // Verify new reputation
    console.log('\n📊 Verifying new reputation...');
    const newBundle = await reputationSystem.getReputationBundle(TEST_USER_ADDRESS);
    console.log('   New reputation:', newBundle[0].toString());
    console.log('   Can create guided:', newBundle[1]);
    console.log('   Can create open:', newBundle[2]);
    console.log('   Can propose:', newBundle[3]);
    
    console.log('\n🎉 Reputation granted successfully!');
    console.log('   User can now create pools.');
    
  } catch (error) {
    console.error('❌ Error granting reputation:', error);
    if (error.reason) console.error('   Reason:', error.reason);
    if (error.message) console.error('   Message:', error.message);
  }
}

grantReputation();
