const { ethers } = require('ethers');
const Web3Service = require('./services/web3-service');

/**
 * Check Cycle 1 Contract State
 */

async function checkCycle1ContractState() {
  try {
    console.log('🚀 Checking Cycle 1 contract state...');
    
    // Initialize Web3Service
    const web3Service = new Web3Service();
    await web3Service.initialize();
    
    const contract = await web3Service.getOddysseyContract();
    
    // Get current cycle info
    const currentCycleInfo = await contract.getCurrentCycleInfo();
    console.log('📊 Current cycle info:', {
      cycleId: currentCycleInfo.cycleId.toString(),
      state: currentCycleInfo.state.toString(),
      endTime: new Date(Number(currentCycleInfo.endTime) * 1000).toISOString(),
      prizePool: ethers.formatEther(currentCycleInfo.prizePool),
      cycleSlipCount: currentCycleInfo.cycleSlipCount.toString()
    });
    
    // Check Cycle 1 state specifically
    try {
      const cycle1State = await contract.getCycleState(1);
      console.log('📊 Cycle 1 state:', cycle1State.toString());
    } catch (error) {
      console.log('❌ Error getting Cycle 1 state:', error.message);
    }
    
    // Check if Cycle 1 is resolved
    try {
      const isResolved = await contract.isCycleResolved(1);
      console.log('📊 Cycle 1 resolved:', isResolved);
    } catch (error) {
      console.log('❌ Error checking Cycle 1 resolution:', error.message);
    }
    
    // Get slip count
    const slipCount = await contract.slipCount();
    console.log('📊 Total slips:', slipCount.toString());
    
  } catch (error) {
    console.error('❌ Check failed:', error);
  } finally {
    process.exit(0);
  }
}

// Run the check
checkCycle1ContractState();
