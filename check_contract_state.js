#!/usr/bin/env node

/**
 * Script to check current contract state for debugging
 */

const Web3Service = require('./backend/services/web3-service');

class ContractStateChecker {
  constructor() {
    this.web3Service = new Web3Service();
    this.oddysseyContract = null;
  }

  async initialize() {
    try {
      this.oddysseyContract = await this.web3Service.getOddysseyContract();
      console.log('✅ Initialized Web3 and contract connection');
    } catch (error) {
      console.error('❌ Failed to initialize:', error);
      throw error;
    }
  }

  async checkContractState() {
    try {
      console.log('🔍 Checking contract state...');
      
      // Get current cycle ID
      const currentCycleId = await this.oddysseyContract.dailyCycleId();
      console.log(`📊 Current cycle ID: ${currentCycleId}`);
      
      // Check if cycles 9 and 10 are resolved
      for (const cycleId of [9, 10]) {
        try {
          const isResolved = await this.oddysseyContract.isCycleResolved(cycleId);
          console.log(`🔍 Cycle ${cycleId} resolved: ${isResolved}`);
          
          // Get cycle end time
          const endTime = await this.oddysseyContract.dailyCycleEndTimes(cycleId);
          const endDate = new Date(Number(endTime) * 1000);
          console.log(`⏰ Cycle ${cycleId} end time: ${endDate.toISOString()}`);
          
          // Check if betting period has ended
          const now = Math.floor(Date.now() / 1000);
          const bettingEnded = now > Number(endTime);
          console.log(`🕐 Cycle ${cycleId} betting ended: ${bettingEnded} (now: ${now}, end: ${endTime})`);
          
        } catch (error) {
          console.log(`❌ Error checking cycle ${cycleId}:`, error.message);
        }
      }
      
      // Check oracle address
      const oracleAddress = await this.oddysseyContract.oracle();
      const walletAddress = this.web3Service.getWalletAddress();
      console.log(`🔑 Oracle address: ${oracleAddress}`);
      console.log(`🔑 Wallet address: ${walletAddress}`);
      console.log(`🔑 Is oracle: ${oracleAddress.toLowerCase() === walletAddress.toLowerCase()}`);
      
    } catch (error) {
      console.error('❌ Failed to check contract state:', error);
      throw error;
    }
  }

  async run() {
    try {
      await this.initialize();
      await this.checkContractState();
      console.log('✅ Contract state check completed');
    } catch (error) {
      console.error('❌ Contract state check failed:', error);
      throw error;
    }
  }
}

// Run the checker
if (require.main === module) {
  const checker = new ContractStateChecker();
  checker.run()
    .then(() => {
      console.log('✅ Check completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Check failed:', error);
      process.exit(1);
    });
}

module.exports = ContractStateChecker;
