const { ethers } = require('ethers');
require('dotenv').config();

// Contract addresses from new deployment
const POOL_CORE_ADDRESS = '0x7055e853562c7306264F3E0d50C56160C3F0d5Cf';
const GUIDED_ORACLE_ADDRESS = '0x1Ef65F8F1D11829CB72E5D66038B3900d441d944';

// Basic ABI for checking contract state
const BasicABI = [
  "function poolCount() external view returns (uint256)",
  "function pools(uint256) external view returns (address creator, uint16 odds, uint8 flags, uint8 oracleType, uint8 marketType, uint8 reserved, uint256 creatorStake, uint256 totalCreatorSideStake, uint256 totalBettorStake, uint256 maxBettorStake, uint256 eventStartTime, uint256 eventEndTime, uint256 bettingEndTime, uint256 resultTimestamp, bytes32 marketId, bytes32 predictedOutcome, bytes32 result)"
];

const GuidedOracleABI = [
  "function getOutcome(string memory marketId) external view returns (bool isSet, bytes memory resultData)",
  "function outcomes(string memory marketId) external view returns (bool isSet, bytes memory resultData, uint256 timestamp)"
];

function formatTimestamp(timestamp) {
  try {
    const num = Number(timestamp);
    if (num === 0) return 'Not set';
    if (num > 1e12) { // If it's in milliseconds
      return new Date(num).toISOString();
    } else { // If it's in seconds
      return new Date(num * 1000).toISOString();
    }
  } catch (error) {
    return `Invalid timestamp: ${timestamp}`;
  }
}

async function checkPoolState() {
  try {
    console.log('🔍 Checking Pool 0 state and contract validation...\n');
    
    // Initialize provider and contracts
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const poolCore = new ethers.Contract(POOL_CORE_ADDRESS, BasicABI, provider);
    const guidedOracle = new ethers.Contract(GUIDED_ORACLE_ADDRESS, GuidedOracleABI, provider);
    
    // Check total pool count
    const totalPools = await poolCore.poolCount();
    console.log(`📊 Total pools in contract: ${totalPools}`);
    
    if (totalPools == 0) {
      console.log('❌ No pools found in contract!');
      return;
    }
    
    // Get Pool 0 details
    console.log('\n🎯 Pool 0 Details:');
    const pool0 = await poolCore.pools(0);
    
    console.log(`  Creator: ${pool0.creator}`);
    console.log(`  Odds: ${pool0.odds}`);
    console.log(`  Flags: ${pool0.flags} (binary: ${pool0.flags.toString(2)})`);
    console.log(`  Oracle Type: ${pool0.oracleType} (0=GUIDED, 1=OPEN)`);
    console.log(`  Market Type: ${pool0.marketType}`);
    console.log(`  Creator Stake: ${ethers.formatEther(pool0.creatorStake)} BITR`);
    console.log(`  Total Creator Side Stake: ${ethers.formatEther(pool0.totalCreatorSideStake)} BITR`);
    console.log(`  Total Bettor Stake: ${ethers.formatEther(pool0.totalBettorStake)} BITR`);
    console.log(`  Event Start Time: ${pool0.eventStartTime} (${formatTimestamp(pool0.eventStartTime)})`);
    console.log(`  Event End Time: ${pool0.eventEndTime} (${formatTimestamp(pool0.eventEndTime)})`);
    console.log(`  Betting End Time: ${pool0.bettingEndTime} (${formatTimestamp(pool0.bettingEndTime)})`);
    console.log(`  Result Timestamp: ${pool0.resultTimestamp} (${formatTimestamp(pool0.resultTimestamp)})`);
    console.log(`  Market ID: ${pool0.marketId}`);
    console.log(`  Predicted Outcome: ${pool0.predictedOutcome}`);
    console.log(`  Result: ${pool0.result}`);
    
    // Check if pool is settled (flags & 1)
    const isSettled = (pool0.flags & 1) !== 0;
    console.log(`  Is Settled: ${isSettled}`);
    
    // Check current time vs event times
    const currentTime = Math.floor(Date.now() / 1000);
    const eventStartTime = Number(pool0.eventStartTime);
    const eventEndTime = Number(pool0.eventEndTime);
    const bettingEndTime = Number(pool0.bettingEndTime);
    
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
    if (pool0.oracleType == 0) { // GUIDED oracle
      console.log('\n🔮 GuidedOracle Outcome Check:');
      
      // Convert marketId to string
      let marketIdStr;
      try {
        marketIdStr = ethers.toUtf8String(pool0.marketId);
      } catch (error) {
        // If it's not valid UTF-8, try to convert from hex
        marketIdStr = pool0.marketId;
        console.log(`  Market ID (hex): ${marketIdStr}`);
      }
      
      console.log(`  Market ID: ${marketIdStr}`);
      
      try {
        const [isSet, resultData] = await guidedOracle.getOutcome(marketIdStr);
        console.log(`  Outcome Set: ${isSet ? '✅ YES' : '❌ NO'}`);
        if (isSet) {
          try {
            console.log(`  Result Data: ${ethers.toUtf8String(resultData)}`);
          } catch (error) {
            console.log(`  Result Data (hex): ${resultData}`);
          }
        }
        
        // Also check the outcomes mapping directly
        const outcomeStruct = await guidedOracle.outcomes(marketIdStr);
        console.log(`  Direct Check - Is Set: ${outcomeStruct.isSet}`);
        if (outcomeStruct.isSet) {
          try {
            console.log(`  Direct Check - Result: ${ethers.toUtf8String(outcomeStruct.resultData)}`);
          } catch (error) {
            console.log(`  Direct Check - Result (hex): ${outcomeStruct.resultData}`);
          }
          console.log(`  Direct Check - Timestamp: ${formatTimestamp(outcomeStruct.timestamp)}`);
        }
        
      } catch (error) {
        console.log(`  ❌ Error checking outcome: ${error.message}`);
      }
    }
    
    // Test settlement attempt (simulation)
    console.log('\n🧪 Settlement Test (Simulation):');
    if (!isSettled && currentTime >= eventEndTime) {
      console.log('  ✅ Pool meets basic settlement criteria');
      if (pool0.oracleType == 0) { // GUIDED
        try {
          const [isSet, resultData] = await guidedOracle.getOutcome(marketIdStr);
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
    
    // Check for multiple outcome submissions
    console.log('\n🔍 Multiple Outcome Submission Analysis:');
    console.log('  Based on the contract code:');
    console.log('  - GuidedOracle.submitOutcome() has require(!outcomes[marketId].isSet)');
    console.log('  - This means each marketId can only have ONE outcome submitted');
    console.log('  - If 4 submissions happened, they must be for different marketIds');
    console.log('  - OR the contract was upgraded/redeployed between submissions');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the check
checkPoolState().then(() => {
  console.log('\n✅ Pool state check completed');
  process.exit(0);
}).catch(error => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});
