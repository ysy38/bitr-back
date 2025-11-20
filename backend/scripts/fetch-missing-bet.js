const Web3Service = require('../services/web3-service');
const { Pool } = require('pg');

// Database connection
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function fetchMissingBet() {
  console.log('🔍 Fetching missing bet from blockchain...\n');
  
  try {
    // Initialize Web3 service (read-only mode)
    const web3Service = new Web3Service();
    await web3Service.initialize();
    
    console.log('✅ Web3 service initialized');
    
    // Get the contract instance (read-only)
    const contract = await web3Service.getPoolCoreContractForEvents();
    console.log('✅ Contract instance created');
    
    // The missing bet transaction hash
    const txHash = '0x4f53113a87825a35bc15f7001c552f1d6e20642cd9dff62ba64f134345085fa2';
    const poolId = '4';
    
    console.log(`🔍 Looking for transaction: ${txHash}`);
    console.log(`🎯 Pool ID: ${poolId}`);
    
    // Get transaction details
    const tx = await web3Service.provider.getTransaction(txHash);
    if (!tx) {
      console.log('❌ Transaction not found');
      return;
    }
    
    console.log('✅ Transaction found:');
    console.log(`   Block: ${tx.blockNumber}`);
    console.log(`   From: ${tx.from}`);
    console.log(`   To: ${tx.to}`);
    console.log(`   Value: ${tx.value}`);
    console.log(`   Gas: ${tx.gasLimit}`);
    
    // Get transaction receipt
    const receipt = await web3Service.provider.getTransactionReceipt(txHash);
    if (!receipt) {
      console.log('❌ Transaction receipt not found');
      return;
    }
    
    console.log('✅ Transaction receipt found:');
    console.log(`   Status: ${receipt.status}`);
    console.log(`   Gas Used: ${receipt.gasUsed}`);
    console.log(`   Logs: ${receipt.logs.length}`);
    
    // Parse logs for BetPlaced event
    const iface = contract.interface;
    const betPlacedEvent = iface.getEvent('BetPlaced');
    
    console.log('\n🔍 Parsing logs for BetPlaced events...');
    
    for (let i = 0; i < receipt.logs.length; i++) {
      const log = receipt.logs[i];
      
      try {
        // Check if this log is from our contract
        if (log.address.toLowerCase() === contract.target.toLowerCase()) {
          console.log(`\n📋 Log ${i}:`);
          console.log(`   Address: ${log.address}`);
          console.log(`   Topics: ${log.topics.length}`);
          console.log(`   Data: ${log.data}`);
          
          // Try to decode the log
          try {
            const decoded = iface.parseLog({
              topics: log.topics,
              data: log.data
            });
            
            if (decoded && decoded.name === 'BetPlaced') {
              console.log('🎯 FOUND BETPLACED EVENT!');
              console.log(`   Pool ID: ${decoded.args.poolId.toString()}`);
              console.log(`   Bettor: ${decoded.args.bettor}`);
              console.log(`   Amount: ${decoded.args.amount.toString()}`);
              console.log(`   Is For Outcome: ${decoded.args.isForOutcome}`);
              
              // Check if this matches our pool
              if (decoded.args.poolId.toString() === poolId) {
                console.log('\n✅ MATCH FOUND! This is the missing bet for Pool 4');
                
                // Check if it's already in database
                const existingBet = await db.query(`
                  SELECT * FROM oracle.bets 
                  WHERE transaction_hash = $1
                `, [txHash]);
                
                if (existingBet.rows.length > 0) {
                  console.log('⚠️  Bet already exists in database');
                } else {
                  console.log('❌ Bet is missing from database - this is the one!');
                  
                  // Insert the missing bet
                  const insertResult = await db.query(`
                    INSERT INTO oracle.bets (
                      pool_id, 
                      bettor_address, 
                      amount, 
                      is_for_outcome, 
                      transaction_hash, 
                      block_number,
                      created_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
                  `, [
                    decoded.args.poolId.toString(),
                    decoded.args.bettor,
                    decoded.args.amount.toString(),
                    decoded.args.isForOutcome,
                    txHash,
                    tx.blockNumber
                  ]);
                  
                  console.log('✅ Missing bet inserted into database!');
                }
              }
            }
          } catch (decodeError) {
            console.log(`   ⚠️  Could not decode log ${i}: ${decodeError.message}`);
          }
        }
      } catch (logError) {
        console.log(`   ❌ Error processing log ${i}: ${logError.message}`);
      }
    }
    
    console.log('\n✅ Missing bet fetch completed');
    
  } catch (error) {
    console.error('❌ Error fetching missing bet:', error);
  }
}

fetchMissingBet();
