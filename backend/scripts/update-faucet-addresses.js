/**
 * Update Faucet Contract Addresses
 * Updates the faucet contract with new PoolCore, Staking, and Oddyssey addresses
 */

const { ethers } = require('ethers');
const config = require('../config');

// New contract addresses (update these with your actual deployed addresses)
const NEW_ADDRESSES = {
  // Update these with your actual deployed addresses
  poolCore: process.env.BITREDICT_POOL_CORE_ADDRESS || '0x35aC19f06eD1E2E19bbB2d174EB006B54d36ab1E',
  staking: process.env.STAKING_CONTRACT_ADDRESS || '0xBA03cD2F1c150416C8d9cDf31778157B74010513', 
  oddyssey: process.env.ODDYSSEY_ADDRESS || '0x70D7D101641c72b8254Ab45Ff2a5CED9b0ad0E75'
};

// Faucet contract ABI (minimal for address updates)
const FAUCET_ABI = [
  "function updateContractAddresses(address _poolCore, address _staking, address _oddyssey) external",
  "function getContractAddresses() external view returns (address poolCore, address staking, address oddyssey)",
  "function owner() external view returns (address)"
];

async function updateFaucetAddresses() {
  console.log('🔧 Updating Faucet Contract Addresses...');

  try {
    // Initialize provider and wallet
    const provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    const wallet = new ethers.Wallet(process.env.ORACLE_PRIVATE_KEY || process.env.ORACLE_SIGNER_PRIVATE_KEY, provider);
    
    // Connect to faucet contract
    const faucetContract = new ethers.Contract(
      config.blockchain.contractAddresses.bitrFaucet,
      FAUCET_ABI,
      wallet
    );

    // Check if caller is owner
    const owner = await faucetContract.owner();
    const caller = await wallet.getAddress();
    
    console.log(`📋 Faucet Owner: ${owner}`);
    console.log(`📋 Caller: ${caller}`);
    
    if (owner.toLowerCase() !== caller.toLowerCase()) {
      throw new Error(`❌ Caller ${caller} is not the owner ${owner}`);
    }

    // Get current addresses
    const currentAddresses = await faucetContract.getContractAddresses();
    console.log('📊 Current Faucet Addresses:');
    console.log(`  PoolCore: ${currentAddresses.poolCore}`);
    console.log(`  Staking: ${currentAddresses.staking}`);
    console.log(`  Oddyssey: ${currentAddresses.oddyssey}`);

    // Check if addresses need updating
    const needsUpdate = 
      currentAddresses.poolCore.toLowerCase() !== NEW_ADDRESSES.poolCore.toLowerCase() ||
      currentAddresses.staking.toLowerCase() !== NEW_ADDRESSES.staking.toLowerCase() ||
      currentAddresses.oddyssey.toLowerCase() !== NEW_ADDRESSES.oddyssey.toLowerCase();

    if (!needsUpdate) {
      console.log('✅ Faucet addresses are already up to date');
      return;
    }

    console.log('📊 New Addresses to Set:');
    console.log(`  PoolCore: ${NEW_ADDRESSES.poolCore}`);
    console.log(`  Staking: ${NEW_ADDRESSES.staking}`);
    console.log(`  Oddyssey: ${NEW_ADDRESSES.oddyssey}`);

    // Update addresses
    console.log('🔄 Updating faucet contract addresses...');
    const tx = await faucetContract.updateContractAddresses(
      NEW_ADDRESSES.poolCore,
      NEW_ADDRESSES.staking,
      NEW_ADDRESSES.oddyssey
    );

    console.log(`📝 Transaction submitted: ${tx.hash}`);
    console.log('⏳ Waiting for confirmation...');

    const receipt = await tx.wait();
    console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);

    // Verify the update
    const updatedAddresses = await faucetContract.getContractAddresses();
    console.log('📊 Updated Faucet Addresses:');
    console.log(`  PoolCore: ${updatedAddresses.poolCore}`);
    console.log(`  Staking: ${updatedAddresses.staking}`);
    console.log(`  Oddyssey: ${updatedAddresses.oddyssey}`);

    console.log('✅ Faucet contract addresses updated successfully!');

  } catch (error) {
    console.error('❌ Error updating faucet addresses:', error);
    throw error;
  }
}

// Run if this is the main module
if (require.main === module) {
  updateFaucetAddresses()
    .then(() => {
      console.log('✅ Faucet address update completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Faucet address update failed:', error);
      process.exit(1);
    });
}

module.exports = updateFaucetAddresses;
