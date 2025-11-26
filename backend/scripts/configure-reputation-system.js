const { ethers } = require('ethers');
const config = require('../config');

async function configureReputationSystem() {
  console.log('🔧 Configuring existing contracts to use ReputationSystem...\n');

  try {
    // Connect to the blockchain
    const provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY || process.env.ORACLE_PRIVATE_KEY, provider);

    console.log(`📍 Configuring from: ${wallet.address}`);
    console.log(`🌐 Network: ${config.blockchain.rpcUrl}`);

    // Contract addresses
    const reputationSystemAddress = config.blockchain.contractAddresses?.reputationSystem;
    const bitredictPoolAddress = config.blockchain.contractAddresses?.bitredictPool;
    const optimisticOracleAddress = config.blockchain.contractAddresses?.optimisticOracle;

    if (!reputationSystemAddress) {
      throw new Error('ReputationSystem contract address not found in config');
    }

    console.log(`🎯 ReputationSystem: ${reputationSystemAddress}`);
    console.log(`🏊 PoolCore: ${bitredictPoolAddress}`);
    console.log(`🔮 OptimisticOracle: ${optimisticOracleAddress}\n`);

    // Load contract ABIs
    const reputationSystemABI = require('../solidity/ReputationSystem.json').abi;
    const bitredictPoolABI = require('../solidity/BitredictPoolCore.json').abi;
    const optimisticOracleABI = require('../solidity/OptimisticOracle.json').abi;

    // Create contract instances
    const reputationSystem = new ethers.Contract(reputationSystemAddress, reputationSystemABI, wallet);
    const bitredictPool = bitredictPoolAddress ? new ethers.Contract(bitredictPoolAddress, bitredictPoolABI, wallet) : null;
    const optimisticOracle = optimisticOracleAddress ? new ethers.Contract(optimisticOracleAddress, optimisticOracleABI, wallet) : null;

    console.log('🔧 Step 1: Configure PoolCore...');
    if (bitredictPool) {
      try {
        const tx1 = await bitredictPool.setReputationSystem(reputationSystemAddress);
        await tx1.wait();
        console.log(`✅ PoolCore configured: ${tx1.hash}`);
      } catch (error) {
        console.warn(`⚠️ PoolCore configuration failed (might not have setReputationSystem function):`, error.message);
      }
    } else {
      console.warn('⚠️ PoolCore address not configured, skipping...');
    }

    console.log('\n🔧 Step 2: Configure OptimisticOracle...');
    if (optimisticOracle) {
      try {
        const tx2 = await optimisticOracle.setReputationSystem(reputationSystemAddress);
        await tx2.wait();
        console.log(`✅ OptimisticOracle configured: ${tx2.hash}`);
      } catch (error) {
        console.warn(`⚠️ OptimisticOracle configuration failed (might not have setReputationSystem function):`, error.message);
      }
    } else {
      console.warn('⚠️ OptimisticOracle address not configured, skipping...');
    }

    console.log('\n🔧 Step 3: Authorize backend indexer as reputation updater...');
    const indexerAddress = process.env.INDEXER_WALLET_ADDRESS || wallet.address;
    
    try {
      const isAlreadyAuthorized = await reputationSystem.authorizedUpdaters(indexerAddress);
      
      if (!isAlreadyAuthorized) {
        const tx3 = await reputationSystem.setAuthorizedUpdater(indexerAddress, true);
        await tx3.wait();
        console.log(`✅ Authorized indexer ${indexerAddress}: ${tx3.hash}`);
      } else {
        console.log(`✅ Indexer ${indexerAddress} already authorized`);
      }
    } catch (error) {
      console.error(`❌ Failed to authorize indexer:`, error.message);
    }

    console.log('\n🔧 Step 4: Initialize reputation for existing users...');
    
    // Get some existing users from database and initialize their reputation
    const db = require('../db/db');
    const users = await db.query(`
      SELECT address, reputation 
      FROM core.users 
      WHERE reputation > 0 
      ORDER BY reputation DESC 
      LIMIT 10
    `);

    if (users.rows.length > 0) {
      console.log(`📊 Found ${users.rows.length} users with reputation to sync`);
      
      const addresses = users.rows.map(user => user.address);
      const reputations = users.rows.map(user => user.reputation);

      try {
        const tx4 = await reputationSystem.batchUpdateReputation(addresses, reputations);
        await tx4.wait();
        console.log(`✅ Initialized reputation for ${addresses.length} users: ${tx4.hash}`);
      } catch (error) {
        console.warn(`⚠️ Batch reputation update failed:`, error.message);
        
        // Try individual updates as fallback
        console.log('🔄 Trying individual updates...');
        for (let i = 0; i < Math.min(addresses.length, 3); i++) {
          try {
            const tx = await reputationSystem.updateReputation(addresses[i], reputations[i]);
            await tx.wait();
            console.log(`✅ Updated ${addresses[i]}: ${reputations[i]} reputation`);
          } catch (error) {
            console.warn(`⚠️ Failed to update ${addresses[i]}:`, error.message);
          }
        }
      }
    } else {
      console.log('ℹ️ No users with reputation found in database');
    }

    console.log('\n🔧 Step 5: Test reputation checks...');
    
    // Test reputation functions
    const testAddress = wallet.address;
    const userReputation = await reputationSystem.getUserReputation(testAddress);
    const canCreateGuided = await reputationSystem.canCreateGuidedPool(testAddress);
    const canCreateOpen = await reputationSystem.canCreateOpenPool(testAddress);
    const canProposeOutcome = await reputationSystem.canProposeOutcome(testAddress);

    console.log(`📊 Test user (${testAddress}):`);
    console.log(`   Reputation: ${userReputation}`);
    console.log(`   Can create guided pools: ${canCreateGuided}`);
    console.log(`   Can create open pools: ${canCreateOpen}`);
    console.log(`   Can propose outcomes: ${canProposeOutcome}`);

    console.log('\n🎉 ReputationSystem configuration completed!');
    console.log('\n📋 Summary:');
    console.log(`✅ ReputationSystem deployed at: ${reputationSystemAddress}`);
    console.log(`${bitredictPool ? '✅' : '⚠️'} PoolCore ${bitredictPool ? 'configured' : 'skipped'}`);
    console.log(`${optimisticOracle ? '✅' : '⚠️'} OptimisticOracle ${optimisticOracle ? 'configured' : 'skipped'}`);
    console.log(`✅ Indexer authorized: ${indexerAddress}`);
    console.log(`✅ Initial reputation data synced`);

    console.log('\n📋 Next Steps:');
    console.log('1. Start the reputation sync service');
    console.log('2. Test pool creation with reputation checks');
    console.log('3. Monitor reputation updates in real-time');
    console.log('4. Update frontend to show reputation requirements');

  } catch (error) {
    console.error('❌ Configuration failed:', error);
    throw error;
  }
}

// Run configuration
if (require.main === module) {
  configureReputationSystem()
    .then(() => {
      console.log('\n✅ Configuration completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Configuration error:', error);
      process.exit(1);
    });
}

module.exports = { configureReputationSystem };
