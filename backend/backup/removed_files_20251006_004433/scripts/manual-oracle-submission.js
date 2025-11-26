const { ethers } = require('ethers');
const config = require('../config');
const db = require('../db/db');

/**
 * Manual Oracle Submission Script
 * Manually trigger oracle bot to submit results for Pool 0 and Pool 1
 */

class ManualOracleSubmission {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    this.wallet = new ethers.Wallet(process.env.ORACLE_PRIVATE_KEY || process.env.ORACLE_SIGNER_PRIVATE_KEY, this.provider);
    
    // Load contract ABIs
    this.GuidedOracleABI = require('../solidity/GuidedOracle.json').abi;
    this.guidedOracleAddress = config.blockchain.contractAddresses.guidedOracle;
    this.guidedOracleContract = new ethers.Contract(
      this.guidedOracleAddress,
      this.GuidedOracleABI,
      this.wallet
    );
  }

  async submitAllResults() {
    console.log('🤖 Manual Oracle Submission Starting...');
    console.log(`🔑 Oracle Bot Wallet: ${this.wallet.address}`);
    console.log(`📍 GuidedOracle: ${this.guidedOracleAddress}`);
    
    try {
      // Submit Pool 0 result
      await this.submitPoolResult('19391153', 'Home wins', 'Pool 0 (Coritiba vs Botafogo)');
      
      // Submit Pool 1 result  
      await this.submitPoolResult('19433520', 'Home wins', 'Pool 1 (Bayer vs Union)');
      
      console.log('\n✅ All results submitted successfully!');
      
    } catch (error) {
      console.error('❌ Manual submission failed:', error);
      throw error;
    }
  }

  async submitPoolResult(marketId, result, description) {
    console.log(`\n🎯 Submitting result for ${description}:`);
    console.log(`   Market ID: ${marketId}`);
    console.log(`   Result: ${result}`);
    
    try {
      // Check current status
      const currentOutcome = await this.guidedOracleContract.getOutcome(marketId);
      console.log(`   Current status: Is Set = ${currentOutcome[0]}`);
      
      if (currentOutcome[0]) {
        console.log(`   ⚠️ Outcome already set, skipping...`);
        return;
      }
      
      // Prepare result data
      const resultData = ethers.toUtf8Bytes(result);
      console.log(`   Result data: ${resultData}`);
      
      // Submit outcome
      console.log(`   📤 Submitting to contract...`);
      const tx = await this.guidedOracleContract.submitOutcome(marketId, resultData);
      
      console.log(`   📤 Transaction submitted: ${tx.hash}`);
      console.log(`   ⏳ Waiting for confirmation...`);
      
      const receipt = await tx.wait();
      console.log(`   ✅ Transaction confirmed in block ${receipt.blockNumber}`);
      
      // Verify submission
      const newOutcome = await this.guidedOracleContract.getOutcome(marketId);
      console.log(`   ✅ Verification: Is Set = ${newOutcome[0]}, Result = ${ethers.toUtf8String(newOutcome[1])}`);
      
    } catch (error) {
      console.error(`   ❌ Failed to submit ${description}:`, error.message);
      throw error;
    }
  }

  async checkCurrentStatus() {
    console.log('🔍 Checking current oracle status...\n');
    
    const markets = [
      { id: '19391153', name: 'Pool 0 (Coritiba vs Botafogo)' },
      { id: '19433520', name: 'Pool 1 (Bayer vs Union)' }
    ];
    
    for (const market of markets) {
      try {
        const outcome = await this.guidedOracleContract.getOutcome(market.id);
        console.log(`📊 ${market.name}:`);
        console.log(`   Is Set: ${outcome[0]}`);
        console.log(`   Result: ${outcome[1] === '0x' ? 'None' : ethers.toUtf8String(outcome[1])}`);
      } catch (error) {
        console.log(`❌ ${market.name}: Error - ${error.message}`);
      }
    }
  }
}

// Run the submission if called directly
if (require.main === module) {
  const submission = new ManualOracleSubmission();
  
  const action = process.argv[2];
  if (action === 'check') {
    submission.checkCurrentStatus().catch(console.error);
  } else {
    submission.submitAllResults().catch(console.error);
  }
}

module.exports = ManualOracleSubmission;
