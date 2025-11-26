const { ethers } = require('ethers');
const config = require('../config');

async function testOracleSubmission() {
  console.log('🧪 Testing Oracle Submission...');
  
  try {
    // Initialize provider and wallet
    const provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    const wallet = new ethers.Wallet(config.blockchain.oraclePrivateKey, provider);
    
    console.log(`🔑 Wallet: ${wallet.address}`);
    
    // Load GuidedOracle ABI
    const GuidedOracleABI = require('../solidity/GuidedOracle.json').abi;
    const guidedOracleAddress = config.blockchain.contractAddresses.guidedOracle;
    
    console.log(`📍 GuidedOracle: ${guidedOracleAddress}`);
    
    // Initialize contract
    const guidedOracleContract = new ethers.Contract(guidedOracleAddress, GuidedOracleABI, wallet);
    
    // Test Pool 0 market
    const marketId = '19391153';
    const result = 'Home wins';
    const resultData = ethers.toUtf8Bytes(result);
    
    console.log(`🎯 Testing market: ${marketId}`);
    console.log(`📊 Result: ${result}`);
    console.log(`📦 Result data: ${resultData}`);
    
    // Check current outcome
    try {
      const outcome = await guidedOracleContract.getOutcome(marketId);
      console.log(`📋 Current outcome:`, outcome);
    } catch (error) {
      console.log(`⚠️ getOutcome failed: ${error.message}`);
    }
    
    // Try to submit outcome
    try {
      console.log(`📤 Attempting to submit outcome...`);
      const tx = await guidedOracleContract.submitOutcome(marketId, resultData);
      console.log(`✅ Transaction submitted: ${tx.hash}`);
      
      const receipt = await tx.wait();
      console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);
      
    } catch (submitError) {
      console.log(`❌ Submit failed: ${submitError.message}`);
      console.log(`🔍 Error details:`, submitError);
    }
    
  } catch (error) {
    console.error(`💥 Test failed:`, error);
  }
}

if (require.main === module) {
  testOracleSubmission().catch(console.error);
}

module.exports = { testOracleSubmission };
