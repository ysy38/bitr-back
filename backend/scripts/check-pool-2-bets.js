const { ethers } = require('ethers');
const config = require('../config');
const db = require('../db/db');

async function checkPool2Bets() {
  try {
    console.log('🔍 Checking Pool 2 for bets...');
    
    // Connect to contract
    const provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    const poolCoreABI = require('../solidity/BitredictPoolCore.json');
    const poolCoreContract = new ethers.Contract(
      config.blockchain.contractAddresses.poolCore,
      poolCoreABI,
      provider
    );
    
    // Get pool details from contract
    const poolDetails = await poolCoreContract.getPool(2);
    console.log('📊 Contract Pool 2 Details:');
    console.log(`  - Total Bettor Stake: ${poolDetails.totalBettorStake.toString()}`);
    console.log(`  - Creator Stake: ${poolDetails.creatorStake.toString()}`);
    console.log(`  - Total Stake: ${poolDetails.totalStake?.toString() || 'N/A'}`);
    console.log(`  - Bettor Count: ${poolDetails.bettorCount?.toString() || 'N/A'}`);
    
    // Check database
    const dbResult = await db.query('SELECT * FROM oracle.pools WHERE pool_id = 2');
    if (dbResult.rows.length > 0) {
      const pool = dbResult.rows[0];
      console.log('📊 Database Pool 2 Details:');
      console.log(`  - Total Bettor Stake: ${pool.total_bettor_stake}`);
      console.log(`  - Created At: ${pool.created_at}`);
    }
    
    // Check for bet events
    console.log('🔍 Scanning for BetPlaced events for Pool 2...');
    const currentBlock = await provider.getBlockNumber();
    const fromBlock = currentBlock - 1000; // Last 1000 blocks
    
    const betEvents = await poolCoreContract.queryFilter(
      poolCoreContract.filters.BetPlaced(2),
      fromBlock,
      currentBlock
    );
    
    console.log(`📈 Found ${betEvents.length} BetPlaced events for Pool 2`);
    
    for (const event of betEvents) {
      console.log(`  - Block ${event.blockNumber}: ${event.args.bettor} bet ${event.args.amount.toString()} BITR`);
      console.log(`  - Transaction: ${event.transactionHash}`);
    }
    
    // Check if we have bet records in database
    const betCount = await db.query("SELECT COUNT(*) as count FROM oracle.bets WHERE pool_id = '2'");
    console.log(`📊 Database has ${betCount.rows[0].count} bet records for Pool 2`);
    
  } catch (error) {
    console.error('❌ Error checking Pool 2 bets:', error);
  }
}

// Run the check
checkPool2Bets()
  .then(() => {
    console.log('✅ Pool 2 bet check completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Pool 2 bet check failed:', error);
    process.exit(1);
  });
