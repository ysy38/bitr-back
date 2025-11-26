const { ethers } = require('ethers');
const config = require('../config');
const db = require('../db/db');

/**
 * Trigger Pool Settlement Script
 * Manually trigger pool settlement for Pool 0 and Pool 1
 */

class PoolSettlementTrigger {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    this.wallet = new ethers.Wallet(process.env.ORACLE_PRIVATE_KEY || process.env.ORACLE_SIGNER_PRIVATE_KEY, this.provider);
    
    // Load contract ABIs
    this.PoolCoreABI = require('../solidity/BitredictPoolCore.json').abi;
    this.GuidedOracleABI = require('../solidity/GuidedOracle.json').abi;
    
    this.poolCoreAddress = config.blockchain.contractAddresses.poolCore;
    this.guidedOracleAddress = config.blockchain.contractAddresses.guidedOracle;
    
    this.poolCoreContract = new ethers.Contract(this.poolCoreAddress, this.PoolCoreABI, this.wallet);
    this.guidedOracleContract = new ethers.Contract(this.guidedOracleAddress, this.GuidedOracleABI, this.wallet);
  }

  async settleAllPools() {
    console.log('🏁 Triggering Pool Settlement...');
    console.log(`🔑 Settlement Wallet: ${this.wallet.address}`);
    console.log(`📍 PoolCore: ${this.poolCoreAddress}`);
    console.log(`📍 GuidedOracle: ${this.guidedOracleAddress}`);
    
    try {
      // Settle Pool 0
      await this.settlePool(0, '19391153', 'Pool 0 (Coritiba vs Botafogo)');
      
      // Settle Pool 1
      await this.settlePool(1, '19433520', 'Pool 1 (Bayer vs Union)');
      
      console.log('\n✅ All pools settled successfully!');
      
    } catch (error) {
      console.error('❌ Pool settlement failed:', error);
      throw error;
    }
  }

  async settlePool(poolId, marketId, description) {
    console.log(`\n🎯 Settling ${description}:`);
    console.log(`   Pool ID: ${poolId}`);
    console.log(`   Market ID: ${marketId}`);
    
    try {
      // Check if pool is already settled
      const poolData = await this.poolCoreContract.getPool(poolId);
      console.log(`   Current status: Is Settled = ${poolData.isSettled}`);
      
      if (poolData.isSettled) {
        console.log(`   ✅ Pool ${poolId} already settled, skipping...`);
        return;
      }
      
      // Check oracle outcome
      const oracleOutcome = await this.guidedOracleContract.getOutcome(marketId);
      console.log(`   Oracle outcome: Is Set = ${oracleOutcome[0]}`);
      console.log(`   Oracle result: ${oracleOutcome[1] === '0x' ? 'None' : ethers.toUtf8String(oracleOutcome[1])}`);
      
      if (!oracleOutcome[0]) {
        console.log(`   ❌ No oracle outcome available, cannot settle`);
        return;
      }
      const outcomeBytes32 = ethers.id(oracleOutcome[1]); // Convert string to bytes32
      
      // Settle the pool
      console.log(`   📤 Calling settlePool(${poolId}, ${outcomeBytes32})...`);
      const tx = await this.poolCoreContract.settlePool(poolId, outcomeBytes32);
      
      console.log(`   📤 Transaction submitted: ${tx.hash}`);
      console.log(`   ⏳ Waiting for confirmation...`);
      
      const receipt = await tx.wait();
      console.log(`   ✅ Transaction confirmed in block ${receipt.blockNumber}`);
      
      // Verify settlement
      const settledPoolData = await this.poolCoreContract.getPool(poolId);
      console.log(`   ✅ Verification: Is Settled = ${settledPoolData.isSettled}`);
      
      // Update database
      await this.updateDatabaseStatus(poolId, marketId, ethers.toUtf8String(oracleOutcome[1]));
      
    } catch (error) {
      console.error(`   ❌ Failed to settle ${description}:`, error.message);
      throw error;
    }
  }

  async updateDatabaseStatus(poolId, marketId, result) {
    console.log(`   📊 Updating database status...`);
    
    try {
      // Update pool status
      await db.query(`
        UPDATE oracle.pools 
        SET status = 'settled', result = $1, updated_at = NOW()
        WHERE pool_id = $2
      `, [result, poolId]);
      
      // Update football prediction market
      await db.query(`
        UPDATE oracle.football_prediction_markets 
        SET status = 'settled', result = $1, resolved = true, resolved_at = NOW()
        WHERE market_id = $2
      `, [result, marketId]);
      
      console.log(`   ✅ Database updated for Pool ${poolId}`);
      
    } catch (error) {
      console.error(`   ⚠️ Database update failed: ${error.message}`);
    }
  }

  async checkSettlementStatus() {
    console.log('🔍 Checking settlement status...\n');
    
    for (let poolId = 0; poolId <= 1; poolId++) {
      try {
        const poolData = await this.poolCoreContract.getPool(poolId);
        console.log(`📊 Pool ${poolId}:`);
        console.log(`   Is Settled: ${poolData.isSettled}`);
        console.log(`   Result: ${poolData.result}`);
        console.log(`   Total Stake: ${ethers.formatEther(poolData.totalBettorStake)} BITR`);
      } catch (error) {
        console.log(`❌ Pool ${poolId}: Error - ${error.message}`);
      }
    }
  }
}

// Run the settlement if called directly
if (require.main === module) {
  const settlement = new PoolSettlementTrigger();
  
  const action = process.argv[2];
  if (action === 'check') {
    settlement.checkSettlementStatus().catch(console.error);
  } else {
    settlement.settleAllPools().catch(console.error);
  }
}

module.exports = PoolSettlementTrigger;
