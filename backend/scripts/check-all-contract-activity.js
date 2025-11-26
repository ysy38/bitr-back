const { ethers } = require('ethers');
const config = require('../config');

async function checkAllContractActivity() {
  try {
    console.log('🔍 Checking all contract activity in recent blocks...');
    
    // Connect to blockchain
    const provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    
    const currentBlock = await provider.getBlockNumber();
    console.log(`📊 Current Block: ${currentBlock}`);
    
    // Check last 500 blocks for ANY activity
    const fromBlock = Math.max(currentBlock - 500, 0);
    
    console.log(`🔍 Scanning blocks ${fromBlock} to ${currentBlock} for ALL activity...`);
    
    // Get all logs (no address filter)
    const allLogs = await provider.getLogs({
      fromBlock: fromBlock,
      toBlock: currentBlock
    });
    
    console.log(`📈 Found ${allLogs.length} total logs from ALL contracts`);
    
    // Group by contract address
    const contractActivity = {};
    
    for (const log of allLogs) {
      const address = log.address.toLowerCase();
      if (!contractActivity[address]) {
        contractActivity[address] = 0;
      }
      contractActivity[address]++;
    }
    
    console.log('\n📊 Contract Activity Summary:');
    for (const [address, count] of Object.entries(contractActivity)) {
      console.log(`  ${address}: ${count} events`);
      
      // Check if this matches any of our configured contracts
      const ourContracts = {
        'poolCore': config.blockchain.contractAddresses.poolCore?.toLowerCase(),
        'guidedOracle': config.blockchain.contractAddresses.guidedOracle?.toLowerCase(),
        'oddyssey': config.blockchain.contractAddresses.oddyssey?.toLowerCase(),
        'bitrToken': config.blockchain.contractAddresses.bitrToken?.toLowerCase(),
        'reputationSystem': config.blockchain.contractAddresses.reputationSystem?.toLowerCase()
      };
      
      for (const [name, configAddress] of Object.entries(ourContracts)) {
        if (configAddress && address === configAddress) {
          console.log(`    ↳ This is our ${name} contract! ✅`);
        }
      }
    }
    
    // Specifically check our PoolCore contract
    const poolCoreAddress = config.blockchain.contractAddresses.poolCore?.toLowerCase();
    const poolCoreLogs = allLogs.filter(log => log.address.toLowerCase() === poolCoreAddress);
    
    console.log(`\n🎯 Our PoolCore contract (${config.blockchain.contractAddresses.poolCore}):`);
    console.log(`   Events in last 500 blocks: ${poolCoreLogs.length}`);
    
    if (poolCoreLogs.length > 0) {
      console.log('   Recent events:');
      for (const log of poolCoreLogs.slice(-5)) {
        console.log(`     Block ${log.blockNumber}: TX ${log.transactionHash}`);
      }
    }
    
    // Check if there are any transactions TO our contract
    console.log(`\n🔍 Checking recent transactions TO our PoolCore contract...`);
    
    let transactionsToContract = 0;
    for (let i = 0; i < 100; i++) {
      const blockNumber = currentBlock - i;
      try {
        const block = await provider.getBlock(blockNumber, true);
        if (block && block.transactions) {
          for (const tx of block.transactions) {
            if (tx.to && tx.to.toLowerCase() === poolCoreAddress) {
              console.log(`   Found TX to contract: Block ${blockNumber}, TX ${tx.hash}, From ${tx.from}`);
              transactionsToContract++;
            }
          }
        }
      } catch (error) {
        // Skip blocks that can't be fetched
      }
    }
    
    console.log(`   Total transactions to contract in last 100 blocks: ${transactionsToContract}`);
    
  } catch (error) {
    console.error('❌ Error checking contract activity:', error);
  }
}

// Run the check
checkAllContractActivity()
  .then(() => {
    console.log('✅ Contract activity check completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Contract activity check failed:', error);
    process.exit(1);
  });
