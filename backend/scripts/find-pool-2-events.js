const { ethers } = require('ethers');
const config = require('../config');

async function findPool2Events() {
  try {
    console.log('🔍 Searching for Pool 2 events in historical blocks...');
    
    // Connect to blockchain
    const provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    const poolCoreABI = require('../solidity/BitredictPoolCore.json');
    const poolCoreContract = new ethers.Contract(
      config.blockchain.contractAddresses.poolCore,
      poolCoreABI,
      provider
    );
    
    const currentBlock = await provider.getBlockNumber();
    console.log(`📊 Current Block: ${currentBlock}`);
    
    // Pool 2 was created at 2025-10-05T22:50:54.480Z
    // That's about 30+ minutes ago, roughly 1800+ blocks
    // Let's scan in chunks of 1000 blocks going backwards
    
    const maxBlocksToScan = 5000; // Scan up to 5000 blocks back
    const chunkSize = 900; // Use 900 to stay under 1000 limit
    
    let pool2CreatedFound = false;
    let pool2BetsFound = 0;
    let pool2CreationBlock = null;
    
    for (let offset = 0; offset < maxBlocksToScan; offset += chunkSize) {
      const fromBlock = Math.max(currentBlock - offset - chunkSize, 0);
      const toBlock = currentBlock - offset;
      
      if (fromBlock >= toBlock) break;
      
      console.log(`🔍 Scanning blocks ${fromBlock} to ${toBlock}...`);
      
      try {
        const logs = await provider.getLogs({
          address: config.blockchain.contractAddresses.poolCore,
          fromBlock: fromBlock,
          toBlock: toBlock
        });
        
        console.log(`📈 Found ${logs.length} logs in this chunk`);
        
        for (const log of logs) {
          try {
            const parsedLog = poolCoreContract.interface.parseLog({
              topics: log.topics,
              data: log.data
            });
            
            if (parsedLog.name === 'PoolCreated' && parsedLog.args.poolId.toString() === '2') {
              console.log(`✅ Found Pool 2 creation!`);
              console.log(`   Block: ${log.blockNumber}`);
              console.log(`   TX: ${log.transactionHash}`);
              console.log(`   Args:`, parsedLog.args);
              pool2CreatedFound = true;
              pool2CreationBlock = log.blockNumber;
            }
            
            if (parsedLog.name === 'BetPlaced' && parsedLog.args.poolId.toString() === '2') {
              console.log(`✅ Found Pool 2 bet!`);
              console.log(`   Block: ${log.blockNumber}`);
              console.log(`   TX: ${log.transactionHash}`);
              console.log(`   Bettor: ${parsedLog.args.bettor}`);
              console.log(`   Amount: ${parsedLog.args.amount.toString()}`);
              pool2BetsFound++;
            }
          } catch (error) {
            // Skip unparseable logs
          }
        }
        
        // If we found Pool 2 creation, we can stop scanning further back
        if (pool2CreatedFound && pool2BetsFound > 0) {
          console.log(`✅ Found all Pool 2 events, stopping scan`);
          break;
        }
        
      } catch (error) {
        console.error(`❌ Error scanning blocks ${fromBlock}-${toBlock}:`, error.message);
        continue;
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`\n📊 Final Results:`);
    console.log(`  - Pool 2 Created: ${pool2CreatedFound ? '✅ YES' : '❌ NO'}`);
    console.log(`  - Pool 2 Creation Block: ${pool2CreationBlock || 'N/A'}`);
    console.log(`  - Pool 2 Bets Found: ${pool2BetsFound}`);
    
    if (pool2CreatedFound) {
      console.log(`\n🔍 Analyzing why events weren't detected by indexer...`);
      
      // Check if the indexer would have caught this block
      const blocksDifference = currentBlock - pool2CreationBlock;
      console.log(`📊 Blocks since Pool 2 creation: ${blocksDifference}`);
      
      if (blocksDifference > 1000) {
        console.log(`❌ ISSUE: Pool 2 was created ${blocksDifference} blocks ago, but indexer can only scan last 1000 blocks!`);
        console.log(`💡 SOLUTION: Need to improve historical event sync or increase block scan range`);
      } else {
        console.log(`✅ Pool 2 creation should have been detected by indexer`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error searching for Pool 2 events:', error);
  }
}

// Run the search
findPool2Events()
  .then(() => {
    console.log('✅ Pool 2 event search completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Pool 2 event search failed:', error);
    process.exit(1);
  });
