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

async function analyzePoolIssue() {
  try {
    console.log('🔍 Analyzing Pool 0 and Contract Validation...\n');
    
    // Initialize provider and contracts
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const poolCore = new ethers.Contract(POOL_CORE_ADDRESS, BasicABI, provider);
    const guidedOracle = new ethers.Contract(GUIDED_ORACLE_ADDRESS, GuidedOracleABI, provider);
    
    // Check total pool count
    const totalPools = await poolCore.poolCount();
    console.log(`📊 Total pools in contract: ${totalPools}`);
    
    // Get Pool 0 details
    console.log('\n🎯 Pool 0 Analysis:');
    const pool0 = await poolCore.pools(0);
    
    console.log(`  Creator: ${pool0.creator}`);
    console.log(`  Odds: ${pool0.odds}`);
    console.log(`  Flags: ${pool0.flags} (binary: ${pool0.flags.toString(2)})`);
    console.log(`  Oracle Type: ${pool0.oracleType} (0=GUIDED, 1=OPEN)`);
    console.log(`  Market Type: ${pool0.marketType}`);
    console.log(`  Creator Stake: ${ethers.formatEther(pool0.creatorStake)} BITR`);
    console.log(`  Total Creator Side Stake: ${ethers.formatEther(pool0.totalCreatorSideStake)} BITR`);
    console.log(`  Total Bettor Stake: ${ethers.formatEther(pool0.totalBettorStake)} BITR`);
    
    // Analyze timestamps
    console.log('\n⏰ Timestamp Analysis:');
    console.log(`  Event Start Time: ${pool0.eventStartTime}`);
    console.log(`  Event End Time: ${pool0.eventEndTime}`);
    console.log(`  Betting End Time: ${pool0.bettingEndTime}`);
    console.log(`  Result Timestamp: ${pool0.resultTimestamp}`);
    
    // Check if timestamps are reasonable
    const currentTime = Math.floor(Date.now() / 1000);
    console.log(`  Current Time: ${currentTime}`);
    
    const eventStartTime = Number(pool0.eventStartTime);
    const eventEndTime = Number(pool0.eventEndTime);
    const bettingEndTime = Number(pool0.bettingEndTime);
    
    console.log('\n📊 Timestamp Validity:');
    console.log(`  Event Start Time valid: ${eventStartTime > 1000000000 && eventStartTime < 2000000000 ? '✅ YES' : '❌ NO'} (${eventStartTime})`);
    console.log(`  Event End Time valid: ${eventEndTime > 1000000000 && eventEndTime < 2000000000 ? '✅ YES' : '❌ NO'} (${eventEndTime})`);
    console.log(`  Betting End Time valid: ${bettingEndTime > 1000000000 && bettingEndTime < 2000000000 ? '✅ YES' : '❌ NO'} (${bettingEndTime})`);
    
    // Check if pool is settled
    const isSettled = (pool0.flags & 1) !== 0;
    console.log(`\n🔒 Settlement Status:`);
    console.log(`  Is Settled: ${isSettled ? '✅ YES' : '❌ NO'}`);
    console.log(`  Flags bit 0 (settled): ${(pool0.flags & 1) !== 0 ? 'SET' : 'NOT SET'}`);
    console.log(`  Flags bit 1 (creator won): ${(pool0.flags & 2) !== 0 ? 'SET' : 'NOT SET'}`);
    console.log(`  Flags bit 2 (private): ${(pool0.flags & 4) !== 0 ? 'SET' : 'NOT SET'}`);
    console.log(`  Flags bit 3 (uses BITR): ${(pool0.flags & 8) !== 0 ? 'SET' : 'NOT SET'}`);
    
    // Check market data
    console.log(`\n📋 Market Data:`);
    console.log(`  Market ID: ${pool0.marketId}`);
    console.log(`  Predicted Outcome: ${pool0.predictedOutcome}`);
    console.log(`  Result: ${pool0.result}`);
    
    // Check GuidedOracle outcome
    if (pool0.oracleType == 0) { // GUIDED oracle
      console.log('\n🔮 GuidedOracle Analysis:');
      
      // Convert marketId to string
      const marketIdHex = pool0.marketId;
      console.log(`  Market ID (hex): ${marketIdHex}`);
      
      try {
        const [isSet, resultData] = await guidedOracle.getOutcome(marketIdHex);
        console.log(`  Outcome Set: ${isSet ? '✅ YES' : '❌ NO'}`);
        if (isSet) {
          console.log(`  Result Data (hex): ${resultData}`);
          try {
            console.log(`  Result Data (string): ${ethers.toUtf8String(resultData)}`);
          } catch (error) {
            console.log(`  Result Data (string): Cannot decode as UTF-8`);
          }
        }
        
        // Check outcomes mapping directly
        const outcomeStruct = await guidedOracle.outcomes(marketIdHex);
        console.log(`  Direct Check - Is Set: ${outcomeStruct.isSet}`);
        if (outcomeStruct.isSet) {
          console.log(`  Direct Check - Result (hex): ${outcomeStruct.resultData}`);
          try {
            console.log(`  Direct Check - Result (string): ${ethers.toUtf8String(outcomeStruct.resultData)}`);
          } catch (error) {
            console.log(`  Direct Check - Result (string): Cannot decode as UTF-8`);
          }
          console.log(`  Direct Check - Timestamp: ${outcomeStruct.timestamp}`);
        }
        
      } catch (error) {
        console.log(`  ❌ Error checking outcome: ${error.message}`);
      }
    }
    
    // Contract validation analysis
    console.log('\n🔍 Contract Validation Analysis:');
    console.log('  GuidedOracle.submitOutcome() validation:');
    console.log('    - require(!outcomes[marketId].isSet) - prevents duplicate submissions');
    console.log('    - onlyBot modifier - only oracle bot can submit');
    console.log('    - No timing validation - can submit before/after match');
    
    console.log('\n  BitredictPoolCore.settlePool() validation:');
    console.log('    - require(!_isPoolSettled(poolId)) - prevents double settlement');
    console.log('    - require(block.timestamp >= pool.eventEndTime) - only after event ends');
    console.log('    - require(msg.sender == guidedOracle) - only oracle can settle');
    
    console.log('\n  BitredictPoolCore.settlePoolAutomatically() validation:');
    console.log('    - require(!_isPoolSettled(poolId)) - prevents double settlement');
    console.log('    - require(block.timestamp >= pool.eventEndTime) - only after event ends');
    console.log('    - require(isSet) - requires outcome to exist in oracle');
    
    // Analysis of the 4 submissions
    console.log('\n🚨 Multiple Submission Analysis:');
    console.log('  The 4 submitOutcome transactions suggest:');
    console.log('  1. Either 4 different marketIds were submitted');
    console.log('  2. OR the contract was redeployed between submissions');
    console.log('  3. OR there was a bug in the validation logic');
    console.log('  4. OR the backend retried failed transactions');
    
    console.log('\n📋 Recommendations:');
    console.log('  1. Check if pool data is corrupted (timestamps are invalid)');
    console.log('  2. Verify if the pool was created correctly');
    console.log('  3. Check if the backend is retrying failed submissions');
    console.log('  4. Consider redeploying the pool with correct data');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the analysis
analyzePoolIssue().then(() => {
  console.log('\n✅ Analysis completed');
  process.exit(0);
}).catch(error => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});
