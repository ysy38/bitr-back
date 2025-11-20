const { ethers } = require('ethers');
require('dotenv').config();

// Contract addresses from new deployment
const POOL_CORE_ADDRESS = '0x7055e853562c7306264F3E0d50C56160C3F0d5Cf';
const GUIDED_ORACLE_ADDRESS = '0x1Ef65F8F1D11829CB72E5D66038B3900d441d944';

// ABI for PoolCore contract
const PoolCoreABI = [
  "function getPoolInfo(uint256 poolId) external view returns (address creator, uint16 odds, uint8 flags, uint8 oracleType, uint8 marketType, uint8 reserved, uint256 creatorStake, uint256 totalCreatorSideStake, uint256 totalBettorStake, uint256 maxBettorStake, uint256 eventStartTime, uint256 eventEndTime, uint256 bettingEndTime, uint256 resultTimestamp, bytes32 marketId, bytes32 predictedOutcome, bytes32 result)",
  "function isPoolSettled(uint256 poolId) external view returns (bool)",
  "function poolCount() external view returns (uint256)"
];

// ABI for GuidedOracle contract
const GuidedOracleABI = [
  "function getOutcome(string memory marketId) external view returns (bool isSet, bytes memory resultData)",
  "function outcomes(string memory marketId) external view returns (bool isSet, bytes memory resultData, uint256 timestamp)"
];

async function checkPool0State() {
  try {
    console.log('🔍 Checking Pool 0 state and contract validation...\n');
    
    // Initialize provider and contracts
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const poolCore = new ethers.Contract(POOL_CORE_ADDRESS, PoolCoreABI, provider);
    const guidedOracle = new ethers.Contract(GUIDED_ORACLE_ADDRESS, GuidedOracleABI, provider);
    
    // Check total pool count
    const totalPools = await poolCore.poolCount();
    console.log(`📊 Total pools in contract: ${totalPools}`);
    
    if (totalPools == 0) {
      console.log('❌ No pools found in contract!');
      return;
    }
    
    // Check Pool 0 details
    console.log('\n🎯 Pool 0 Details:');
    const poolInfo = await poolCore.getPoolInfo(0);
    const isSettled = await poolCore.isPoolSettled(0);
    
    console.log(`  Creator: ${poolInfo.creator}`);
    console.log(`  Odds: ${poolInfo.odds}`);
    console.log(`  Flags: ${poolInfo.flags} (binary: ${poolInfo.flags.toString(2)})`);
    console.log(`  Oracle Type: ${poolInfo.oracleType} (0=GUIDED, 1=OPEN)`);
    console.log(`  Market Type: ${poolInfo.marketType}`);
    console.log(`  Creator Stake: ${ethers.formatEther(poolInfo.creatorStake)} BITR`);
    console.log(`  Total Creator Side Stake: ${ethers.formatEther(poolInfo.totalCreatorSideStake)} BITR`);
    console.log(`  Total Bettor Stake: ${ethers.formatEther(poolInfo.totalBettorStake)} BITR`);
    console.log(`  Event Start Time: ${new Date(Number(poolInfo.eventStartTime) * 1000).toISOString()}`);
    console.log(`  Event End Time: ${new Date(Number(poolInfo.eventEndTime) * 1000).toISOString()}`);
    console.log(`  Betting End Time: ${new Date(Number(poolInfo.bettingEndTime) * 1000).toISOString()}`);
    console.log(`  Result Timestamp: ${poolInfo.resultTimestamp > 0 ? new Date(Number(poolInfo.resultTimestamp) * 1000).toISOString() : 'Not set'}`);
    console.log(`  Market ID: ${poolInfo.marketId}`);
    console.log(`  Predicted Outcome: ${poolInfo.predictedOutcome}`);
    console.log(`  Result: ${poolInfo.result}`);
    console.log(`  Is Settled: ${isSettled}`);
    
    // Check current time vs event times
    const currentTime = Math.floor(Date.now() / 1000);
    const eventStartTime = Number(poolInfo.eventStartTime);
    const eventEndTime = Number(poolInfo.eventEndTime);
    const bettingEndTime = Number(poolInfo.bettingEndTime);
    
    console.log('\n⏰ Time Analysis:');
    console.log(`  Current Time: ${new Date(currentTime * 1000).toISOString()}`);
    console.log(`  Event Started: ${currentTime >= eventStartTime ? '✅ YES' : '❌ NO'}`);
    console.log(`  Event Ended: ${currentTime >= eventEndTime ? '✅ YES' : '❌ NO'}`);
    console.log(`  Betting Ended: ${currentTime >= bettingEndTime ? '✅ YES' : '❌ NO'}`);
    
    // Check if pool can be settled
    console.log('\n🔒 Settlement Validation:');
    console.log(`  Pool Already Settled: ${isSettled ? '✅ YES' : '❌ NO'}`);
    console.log(`  Event End Time Passed: ${currentTime >= eventEndTime ? '✅ YES' : '❌ NO'}`);
    console.log(`  Can Be Settled: ${!isSettled && currentTime >= eventEndTime ? '✅ YES' : '❌ NO'}`);
    
    // Check GuidedOracle outcome
    if (poolInfo.oracleType == 0) { // GUIDED oracle
      console.log('\n🔮 GuidedOracle Outcome Check:');
      const marketId = ethers.toUtf8String(poolInfo.marketId);
      console.log(`  Market ID: ${marketId}`);
      
      try {
        const [isSet, resultData] = await guidedOracle.getOutcome(marketId);
        console.log(`  Outcome Set: ${isSet ? '✅ YES' : '❌ NO'}`);
        if (isSet) {
          console.log(`  Result Data: ${ethers.toUtf8String(resultData)}`);
        }
        
        // Also check the outcomes mapping directly
        const outcomeStruct = await guidedOracle.outcomes(marketId);
        console.log(`  Direct Check - Is Set: ${outcomeStruct.isSet}`);
        console.log(`  Direct Check - Result: ${ethers.toUtf8String(outcomeStruct.resultData)}`);
        console.log(`  Direct Check - Timestamp: ${new Date(Number(outcomeStruct.timestamp) * 1000).toISOString()}`);
        
      } catch (error) {
        console.log(`  ❌ Error checking outcome: ${error.message}`);
      }
    }
    
    // Test settlement attempt (simulation)
    console.log('\n🧪 Settlement Test (Simulation):');
    if (!isSettled && currentTime >= eventEndTime) {
      console.log('  ✅ Pool meets basic settlement criteria');
      if (poolInfo.oracleType == 0) { // GUIDED
        try {
          const [isSet, resultData] = await guidedOracle.getOutcome(ethers.toUtf8String(poolInfo.marketId));
          if (isSet) {
            console.log('  ✅ GuidedOracle has outcome available');
            console.log('  ✅ Pool can be settled via settlePoolAutomatically()');
          } else {
            console.log('  ❌ GuidedOracle has no outcome - cannot settle yet');
          }
        } catch (error) {
          console.log(`  ❌ Error checking oracle outcome: ${error.message}`);
        }
      }
    } else {
      console.log('  ❌ Pool cannot be settled yet');
      if (isSettled) console.log('    - Pool already settled');
      if (currentTime < eventEndTime) console.log('    - Event has not ended yet');
    }
    
    console.log('\n📋 Summary:');
    console.log(`  Pool 0 is ${isSettled ? 'SETTLED' : 'ACTIVE'}`);
    console.log(`  Event ${currentTime >= eventEndTime ? 'HAS ENDED' : 'HAS NOT ENDED'}`);
    console.log(`  Settlement ${!isSettled && currentTime >= eventEndTime ? 'POSSIBLE' : 'NOT POSSIBLE'}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the check
checkPool0State().then(() => {
  console.log('\n✅ Pool state check completed');
  process.exit(0);
}).catch(error => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});
