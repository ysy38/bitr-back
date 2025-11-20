const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const ODDYSSEY_ADDRESS = '0x70D7D101641c72b8254Ab45Ff2a5CED9b0ad0E75';
const RPC_URL = process.env.ARBITRUM_RPC_URL;

// Read ABI from contract
const abiPath = path.join(__dirname, 'backend', 'solidity', 'Oddyssey.json');
const OddysseyABI = JSON.parse(fs.readFileSync(abiPath, 'utf8')).abi;

async function checkCycle2() {
  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const contract = new ethers.Contract(ODDYSSEY_ADDRESS, OddysseyABI, provider);

    console.log('🔍 Checking Cycle 2 on-chain state...\n');

    const cycleStatus = await contract.getCycleStatus(2);
    const isResolved = await contract.isCycleResolved(2);
    
    const stateMap = {
      0: 'NotStarted',
      1: 'Active',
      2: 'Ended',
      3: 'Resolved'
    };

    const state = stateMap[cycleStatus.state] || `Unknown (${cycleStatus.state})`;

    console.log(`✅ Cycle 2 Contract State:`);
    console.log(`   State: ${state} (value: ${cycleStatus.state})`);
    console.log(`   Is Resolved: ${isResolved}`);
    console.log(`   Start Time: ${new Date(Number(cycleStatus.startTime) * 1000).toISOString()}`);
    console.log(`   End Time: ${new Date(Number(cycleStatus.endTime) * 1000).toISOString()}`);
    
    if (Number(cycleStatus.state) === 3) {
      console.log('\n✅ CONFIRMED: Cycle 2 is RESOLVED on-chain');
    } else {
      console.log('\n❌ WARNING: Cycle 2 is NOT in Resolved state on-chain!');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  process.exit(0);
}

checkCycle2();
