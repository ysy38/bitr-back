/**
 * Authorize backend wallet to update reputation
 * This must be run by the ReputationSystem contract OWNER
 */

const { ethers } = require('ethers');
require('dotenv').config();

const REPUTATION_SYSTEM_ABI = require('../abis/ReputationSystem.json');
const REPUTATION_SYSTEM_ADDRESS = '0x70b7BcB7aF96C8B4354A4DA91365184b1DaC782A';
const BACKEND_WALLET = '0x483fc7FD690dCf2a01318282559C389F385d4428';

async function authorizeBackend() {
  try {
    console.log('🔗 Connecting to Somnia testnet...');
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://dream-rpc.somnia.network');
    
    // This wallet must be the contract OWNER
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    
    console.log('👤 Owner wallet address:', wallet.address);
    console.log('🎯 Backend wallet to authorize:', BACKEND_WALLET);
    
    // Connect to ReputationSystem contract
    const reputationSystem = new ethers.Contract(
      REPUTATION_SYSTEM_ADDRESS,
      REPUTATION_SYSTEM_ABI,
      wallet
    );
    
    // Check if wallet is the owner
    console.log('\n🔐 Checking contract ownership...');
    const owner = await reputationSystem.owner();
    console.log('   Contract owner:', owner);
    console.log('   Your wallet:', wallet.address);
    console.log('   Are you owner?', owner.toLowerCase() === wallet.address.toLowerCase());
    
    if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
      console.log('\n❌ ERROR: You are not the contract owner!');
      console.log('   Only the owner can authorize updaters.');
      console.log('   Contract owner is:', owner);
      return;
    }
    
    // Check current authorization status
    console.log('\n📊 Checking current authorization...');
    const isAuthorized = await reputationSystem.authorizedUpdaters(BACKEND_WALLET);
    console.log('   Backend wallet is authorized:', isAuthorized);
    
    if (isAuthorized) {
      console.log('\n✅ Backend wallet is already authorized!');
      console.log('   No action needed.');
      return;
    }
    
    // Authorize backend wallet
    console.log('\n✨ Authorizing backend wallet...');
    const tx = await reputationSystem.setAuthorizedUpdater(BACKEND_WALLET, true);
    console.log('   Transaction submitted:', tx.hash);
    console.log('   Waiting for confirmation...');
    
    const receipt = await tx.wait();
    console.log('✅ Transaction confirmed in block:', receipt.blockNumber);
    
    // Verify authorization
    console.log('\n📊 Verifying authorization...');
    const nowAuthorized = await reputationSystem.authorizedUpdaters(BACKEND_WALLET);
    console.log('   Backend wallet is now authorized:', nowAuthorized);
    
    if (nowAuthorized) {
      console.log('\n🎉 Success! Backend wallet is now authorized to update reputation.');
      console.log('   You can now run: node scripts/grant-test-reputation.js');
    } else {
      console.log('\n❌ Authorization failed. Please check the transaction.');
    }
    
  } catch (error) {
    console.error('\n❌ Error authorizing backend:', error);
    if (error.reason) console.error('   Reason:', error.reason);
    if (error.message) console.error('   Message:', error.message);
  }
}

authorizeBackend();

