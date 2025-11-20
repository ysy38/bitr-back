const { ethers } = require('ethers');
const config = require('../config');
const db = require('../db/db');

async function fixPool2Sync() {
  try {
    console.log('🔧 Fixing Pool 2 sync issues...');
    
    // Connect to contract
    const provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    const poolCoreABI = require('../solidity/BitredictPoolCore.json');
    const poolCoreContract = new ethers.Contract(
      config.blockchain.contractAddresses.poolCore,
      poolCoreABI,
      provider
    );
    
    // Get current contract state
    const poolDetails = await poolCoreContract.getPool(2);
    const contractTotalStake = poolDetails.totalBettorStake.toString();
    const contractCreatorStake = poolDetails.creatorStake.toString();
    
    console.log(`📊 Contract State:`);
    console.log(`  - Total Bettor Stake: ${contractTotalStake}`);
    console.log(`  - Creator Stake: ${contractCreatorStake}`);
    
    // Update database with correct values
    console.log('🔄 Updating database with contract values...');
    await db.query(`
      UPDATE oracle.pools 
      SET 
        total_bettor_stake = $1,
        creator_stake = $2,
        updated_at = NOW()
      WHERE pool_id = '2'
    `, [contractTotalStake, contractCreatorStake]);
    
    console.log('✅ Database updated with contract values');
    
    // Scan for BetPlaced events in smaller chunks
    console.log('🔍 Scanning for BetPlaced events...');
    const currentBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(currentBlock - 1000, 0); // Scan last 1000 blocks max
    
    const betEvents = await poolCoreContract.queryFilter(
      poolCoreContract.filters.BetPlaced(2),
      fromBlock,
      currentBlock
    );
    
    console.log(`📈 Found ${betEvents.length} BetPlaced events for Pool 2`);
    
    // Process each bet event
    for (const event of betEvents) {
      const { bettor, amount, isForOutcome } = event.args;
      const block = await provider.getBlock(event.blockNumber);
      
      console.log(`  - Processing bet from ${bettor}: ${amount.toString()} BITR`);
      
      // Insert bet record
      await db.query(`
        INSERT INTO oracle.bets (
          pool_id, bettor_address, amount, is_for_outcome, 
          block_number, transaction_hash, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, NOW()
        )
        ON CONFLICT (pool_id, bettor_address, transaction_hash) DO NOTHING
      `, [
        '2',
        bettor,
        amount.toString(),
        isForOutcome,
        event.blockNumber,
        event.transactionHash
      ]);
      
      console.log(`    ✅ Bet recorded in database`);
    }
    
    // Verify final state
    const finalPool = await db.query('SELECT * FROM oracle.pools WHERE pool_id = 2');
    const finalBets = await db.query("SELECT COUNT(*) as count FROM oracle.bets WHERE pool_id = '2'");
    
    console.log('📊 Final State:');
    console.log(`  - Database Total Stake: ${finalPool.rows[0].total_bettor_stake}`);
    console.log(`  - Database Bet Count: ${finalBets.rows[0].count}`);
    
    console.log('✅ Pool 2 sync fix completed');
    
  } catch (error) {
    console.error('❌ Error fixing Pool 2 sync:', error);
  }
}

// Run the fix
fixPool2Sync()
  .then(() => {
    console.log('✅ Pool 2 sync fix completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Pool 2 sync fix failed:', error);
    process.exit(1);
  });
