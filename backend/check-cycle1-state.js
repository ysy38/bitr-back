const Web3Service = require('./services/web3-service');

/**
 * Check Cycle 1 Contract State Details
 */

async function checkCycle1State() {
  try {
    console.log('🚀 Checking Cycle 1 contract state details...');
    
    // Initialize Web3Service
    const web3Service = new Web3Service();
    await web3Service.initialize();
    
    const contract = await web3Service.getOddysseyContract();
    
    // Check Cycle 1 state
    try {
      const cycle1Status = await contract.getCycleStatus(1);
      console.log('📊 Cycle 1 status:', {
        state: cycle1Status.state.toString(),
        stateName: getStateName(Number(cycle1Status.state)),
        endTime: new Date(Number(cycle1Status.endTime) * 1000).toISOString(),
        prizePool: cycle1Status.prizePool.toString()
      });
    } catch (error) {
      console.log('❌ Error getting Cycle 1 status:', error.message);
    }
    
    // Check if Cycle 1 is resolved
    try {
      const isResolved = await contract.isCycleResolved(1);
      console.log('📊 Cycle 1 resolved:', isResolved);
    } catch (error) {
      console.log('❌ Error checking Cycle 1 resolution:', error.message);
    }
    
    // Get slip details
    try {
      const slip0 = await contract.getSlip(0);
      console.log('📊 Slip 0 details:', {
        slipId: slip0.slipId.toString(),
        cycleId: slip0.cycleId.toString(),
        player: slip0.player,
        isEvaluated: slip0.isEvaluated,
        finalScore: slip0.finalScore.toString()
      });
      
      // Check the cycle status for this slip
      const slipCycleStatus = await contract.getCycleStatus(slip0.cycleId);
      console.log('📊 Slip 0 cycle status:', {
        state: slipCycleStatus.state.toString(),
        stateName: getStateName(Number(slipCycleStatus.state))
      });
      
    } catch (error) {
      console.log('❌ Error getting slip details:', error.message);
    }
    
  } catch (error) {
    console.error('❌ Check failed:', error);
  } finally {
    process.exit(0);
  }
}

function getStateName(state) {
  const states = {
    0: 'NotStarted',
    1: 'Active', 
    2: 'Ended',
    3: 'Resolved'
  };
  return states[state] || 'Unknown';
}

// Run the check
checkCycle1State();
