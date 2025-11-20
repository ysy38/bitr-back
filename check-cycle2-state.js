const { ethers } = require('ethers');

const ODDYSSEY_ADDRESS = '0x70D7D101641c72b8254Ab45Ff2a5CED9b0ad0E75';
const RPC_URL = process.env.ARBITRUM_RPC_URL || 'https://arbitrum-mainnet.infura.io/v3/YOUR_KEY';

const OddysseyABI = [
  {
    "inputs": [{"internalType": "uint256", "name": "_cycleId", "type": "uint256"}],
    "name": "getCycleStatus",
    "outputs": [
      {"internalType": "uint8", "name": "state", "type": "uint8"},
      {"internalType": "uint256", "name": "startTime", "type": "uint256"},
      {"internalType": "uint256", "name": "endTime", "type": "uint256"},
      {"internalType": "uint256", "name": "createdAt", "type": "uint256"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256", "name": "_cycleId", "type": "uint256"}],
    "name": "isCycleResolved",
    "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
    "stateMutability": "view",
    "type": "function"
  }
];

async function checkCycleState() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const contract = new ethers.Contract(ODDYSSEY_ADDRESS, OddysseyABI, provider);

  try {
    console.log('🔍 Checking Cycle 1 and 2 states...\n');

    for (let cycleId of [1, 2]) {
      try {
        const cycleStatus = await contract.getCycleStatus(cycleId);
        const isResolved = await contract.isCycleResolved(cycleId);

        const stateMap = {
          0: 'NotStarted',
          1: 'Active',
          2: 'Ended',
          3: 'Resolved'
        };

        const state = stateMap[cycleStatus.state] || `Unknown (${cycleStatus.state})`;

        console.log(`Cycle ${cycleId}:`);
        console.log(`  State: ${state} (${cycleStatus.state})`);
        console.log(`  Is Resolved: ${isResolved}`);
        console.log(`  Start Time: ${new Date(Number(cycleStatus.startTime) * 1000).toISOString()}`);
        console.log(`  End Time: ${new Date(Number(cycleStatus.endTime) * 1000).toISOString()}`);
        console.log('');
      } catch (err) {
        console.error(`  Error checking cycle ${cycleId}:`, err.message);
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
  }

  process.exit(0);
}

checkCycleState();
