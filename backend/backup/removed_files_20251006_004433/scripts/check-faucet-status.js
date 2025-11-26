/**
 * Check Faucet Contract Status
 * The faucet contract doesn't need address updates - it's already configured
 */

const { ethers } = require('ethers');
const config = require('../config');

// Faucet contract ABI (minimal for status checking)
const FAUCET_ABI = [
  "function getFaucetStats() external view returns (uint256 balance, uint256 totalDistributed, uint256 userCount, bool active)",
  "function owner() external view returns (address)",
  "function bitrToken() external view returns (address)",
  "function oddyssey() external view returns (address)",
  "function hasSufficientBalance() external view returns (bool)",
  "function maxPossibleClaims() external view returns (uint256)"
];

async function checkFaucetStatus() {
  console.log('🔍 Checking Faucet Contract Status...\n');

  try {
    // Initialize provider
    const provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    
    // Connect to faucet contract
    const faucetContract = new ethers.Contract(
      config.blockchain.contractAddresses.bitrFaucet,
      FAUCET_ABI,
      provider
    );

    console.log('📋 Faucet Contract Information:');
    console.log(`  Address: ${config.blockchain.contractAddresses.bitrFaucet}`);
    console.log(`  Owner: ${await faucetContract.owner()}`);
    console.log(`  BITR Token: ${await faucetContract.bitrToken()}`);
    console.log(`  Oddyssey: ${await faucetContract.oddyssey()}`);

    // Get faucet statistics
    const stats = await faucetContract.getFaucetStats();
    const hasBalance = await faucetContract.hasSufficientBalance();
    const maxClaims = await faucetContract.maxPossibleClaims();

    console.log('\n📊 Faucet Statistics:');
    console.log(`  Active: ${stats.active}`);
    console.log(`  Balance: ${ethers.formatEther(stats.balance)} BITR`);
    console.log(`  Total Distributed: ${ethers.formatEther(stats.totalDistributed)} BITR`);
    console.log(`  Total Users: ${stats.userCount.toString()}`);
    console.log(`  Has Sufficient Balance: ${hasBalance}`);
    console.log(`  Max Possible Claims: ${maxClaims.toString()}`);

    // Check if faucet is working properly
    console.log('\n✅ Faucet Status:');
    if (stats.active && hasBalance) {
      console.log('  🟢 Faucet is ACTIVE and has sufficient balance');
      console.log('  🟢 Users can claim BITR tokens');
    } else if (!stats.active) {
      console.log('  🔴 Faucet is INACTIVE');
    } else if (!hasBalance) {
      console.log('  🔴 Faucet has INSUFFICIENT balance');
    }

    console.log('\n📝 Note: The faucet contract is already configured with the correct addresses.');
    console.log('📝 No address updates are needed - the faucet works with the deployed contracts.');

    console.log('\n🎉 Faucet status check completed!');

  } catch (error) {
    console.error('❌ Error checking faucet status:', error);
    throw error;
  }
}

// Run if this is the main module
if (require.main === module) {
  checkFaucetStatus()
    .then(() => {
      console.log('✅ Faucet status check completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Faucet status check failed:', error);
      process.exit(1);
    });
}

module.exports = checkFaucetStatus;
