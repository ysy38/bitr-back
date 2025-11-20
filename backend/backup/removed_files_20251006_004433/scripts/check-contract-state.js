const ethers = require('ethers');
const config = require('../config');

// Load ABIs
const poolCoreABI = require('../solidity/BitredictPoolCore.json').abi;
const guidedOracleABI = require('../solidity/GuidedOracle.json').abi;

async function checkContracts() {
  console.log('🔍 Checking contract state...\n');

  // Setup provider
  const provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
  
  // Setup contracts
  const poolCore = new ethers.Contract(
    config.blockchain.contractAddresses.poolCore,
    poolCoreABI,
    provider
  );
  
  const guidedOracle = new ethers.Contract(
    config.blockchain.contractAddresses.guidedOracle,
    guidedOracleABI,
    provider
  );

  console.log('📍 Contract Addresses:');
  console.log('   PoolCore:', config.blockchain.contractAddresses.poolCore);
  console.log('   GuidedOracle:', config.blockchain.contractAddresses.guidedOracle);
  console.log('');

  // Check pool count
  const poolCount = await poolCore.poolCount();
  console.log(`📊 Total Pools in PoolCore: ${poolCount}\n`);

  // Check Pool 0
  if (poolCount > 0) {
    console.log('🎯 Pool 0 Details:');
    console.log('─────────────────────────────────────');
    
    const pool = await poolCore.getPool(0);
    
    console.log('Creator:', pool.creator);
    console.log('Market ID:', pool.marketId);
    console.log('Oracle Type:', pool.oracleType.toString(), pool.oracleType === 0n ? '(GUIDED)' : '(OPEN)');
    console.log('Predicted Outcome:', pool.predictedOutcome);
    console.log('Result:', pool.result);
    console.log('Creator Stake:', ethers.formatEther(pool.creatorStake), 'BITR');
    console.log('Total Bettor Stake:', ethers.formatEther(pool.totalBettorStake), 'BITR');
    console.log('Event End Time:', new Date(Number(pool.eventEndTime) * 1000).toISOString());
    console.log('Is Settled:', (Number(pool.flags) & 1) === 1);
    console.log('');

    // Convert market_id to bytes32 for GuidedOracle lookup
    const marketIdBytes32 = ethers.id(pool.marketId);
    console.log('🔐 Market ID as bytes32:', marketIdBytes32);
    console.log('');

    // Check if outcome exists in GuidedOracle
    console.log('🔮 Checking GuidedOracle for outcome...');
    console.log('─────────────────────────────────────');
    
    try {
      const outcome = await guidedOracle.getOutcome(marketIdBytes32);
      console.log('✅ Outcome EXISTS in GuidedOracle');
      console.log('   Is Set:', outcome[0]);
      console.log('   Result Data:', outcome[1]);
      
      if (outcome[0]) {
        // Try to decode as string
        try {
          const resultString = ethers.toUtf8String(outcome[1]);
          console.log('   Result (decoded):', resultString);
        } catch (e) {
          console.log('   Result (hex):', ethers.hexlify(outcome[1]));
        }
      }
    } catch (error) {
      console.log('❌ Outcome DOES NOT EXIST in GuidedOracle');
      console.log('   Error:', error.message);
      console.log('');
      console.log('💡 This means:');
      console.log('   - Pool exists in PoolCore ✅');
      console.log('   - But outcome not yet submitted to GuidedOracle ❌');
      console.log('   - Oracle bot needs to call guidedOracle.submitOutcome()');
    }
    console.log('');
  }

  // Check if there are more pools
  if (Number(poolCount) > 1) {
    console.log(`\n📋 Additional Pools (${Number(poolCount) - 1}):`);
    console.log('─────────────────────────────────────');
    
    for (let i = 1; i < Number(poolCount); i++) {
      try {
        const pool = await poolCore.getPool(i);
        console.log(`\nPool ${i}:`);
        console.log('  Market ID:', pool.marketId);
        console.log('  Oracle Type:', pool.oracleType === 0n ? 'GUIDED' : 'OPEN');
        console.log('  Predicted Outcome:', pool.predictedOutcome);
        console.log('  Creator Stake:', ethers.formatEther(pool.creatorStake), 'BITR');
        console.log('  Total Bettor Stake:', ethers.formatEther(pool.totalBettorStake), 'BITR');
        console.log('  Is Settled:', (Number(pool.flags) & 1) === 1);
        
        // Convert predicted outcome to string
        try {
          const hex = pool.predictedOutcome.startsWith('0x') ? pool.predictedOutcome.slice(2) : pool.predictedOutcome;
          const str = Buffer.from(hex, 'hex').toString('utf8').replace(/\0/g, '').trim();
          if (str) console.log('  Predicted (decoded):', str);
        } catch (e) {}
      } catch (error) {
        console.log(`  ❌ Failed to fetch pool ${i}:`, error.message);
      }
    }
  }

  // Check oracle permissions
  console.log('\n🔑 GuidedOracle Permissions:');
  console.log('─────────────────────────────────────');
  try {
    const owner = await guidedOracle.owner();
    console.log('Owner:', owner);
    
    // Check if oracle bot wallet has permissions
    const oraclePrivateKey = process.env.ORACLE_PRIVATE_KEY;
    if (oraclePrivateKey) {
      const wallet = new ethers.Wallet(oraclePrivateKey.trim());
      console.log('Oracle Bot Address:', wallet.address);
      console.log('Is Bot the Owner?', owner.toLowerCase() === wallet.address.toLowerCase());
    }
  } catch (error) {
    console.log('❌ Failed to check permissions:', error.message);
  }

  console.log('\n✅ Contract check complete');
}

checkContracts().catch(console.error);
