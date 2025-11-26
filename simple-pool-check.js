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

async function checkContractState() {
  try {
    console.log('🔍 Checking contract state...\n');
    
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
    
    // Try to access pool 0 directly
    console.log('\n🎯 Pool 0 Direct Access:');
    try {
      const pool0 = await poolCore.pools(0);
      console.log(`  Creator: ${pool0.creator}`);
      console.log(`  Creator is zero address: ${pool0.creator === '0x0000000000000000000000000000000000000000'}`);
      console.log(`  Odds: ${pool0.odds}`);
      console.log(`  Flags: ${pool0.flags}`);
      console.log(`  Oracle Type: ${pool0.oracleType}`);
      console.log(`  Market Type: ${pool0.marketType}`);
      console.log(`  Event Start Time: ${pool0.eventStartTime} (${new Date(Number(pool0.eventStartTime) * 1000).toISOString()})`);
      console.log(`  Event End Time: ${pool0.eventEndTime} (${new Date(Number(pool0.eventEndTime) * 1000).toISOString()})`);
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
      
      console.log('\n⏰ Time Analysis:');
      console.log(`  Current Time: ${new Date(currentTime * 1000).toISOString()}`);
      console.log(`  Event Started: ${currentTime >= eventStartTime ? '✅ YES' : '❌ NO'}`);
      console.log(`  Event Ended: ${currentTime >= eventEndTime ? '✅ YES' : '❌ NO'}`);
      
      // Check GuidedOracle outcome
      if (pool0.oracleType == 0) { // GUIDED oracle
        console.log('\n🔮 GuidedOracle Outcome Check:');
        const marketId = ethers.toUtf8String(pool0.marketId);
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
      
    } catch (error) {
      console.log(`  ❌ Error accessing pool 0: ${error.message}`);
    }
    
    // Check if there are any pools with non-zero creators
    console.log('\n🔍 Checking all pools for valid creators:');
    for (let i = 0; i < totalPools; i++) {
      try {
        const pool = await poolCore.pools(i);
        const isZeroCreator = pool.creator === '0x0000000000000000000000000000000000000000';
        console.log(`  Pool ${i}: Creator = ${pool.creator}, Zero = ${isZeroCreator}`);
        if (!isZeroCreator) {
        console.log(`    Market ID: ${pool.marketId}`);
        console.log(`    Predicted: ${pool.predictedOutcome}`);
        }
      } catch (error) {
        console.log(`  Pool ${i}: Error - ${error.message}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the check
checkContractState().then(() => {
  console.log('\n✅ Contract state check completed');
  process.exit(0);
}).catch(error => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});
