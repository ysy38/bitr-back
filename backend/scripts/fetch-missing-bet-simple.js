const { ethers } = require('ethers');
const { Pool } = require('pg');

// Database connection
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function fetchMissingBet() {
  console.log('🔍 Fetching missing bet from blockchain...\n');
  
  try {
    // Initialize provider
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://dream-rpc.somnia.network/');
    console.log('✅ Provider initialized');
    
    // The missing bet transaction hash
    const txHash = '0x4f53113a87825a35bc15f7001c552f1d6e20642cd9dff62ba64f134345085fa2';
    const poolId = '4';
    
    console.log(`🔍 Looking for transaction: ${txHash}`);
    console.log(`🎯 Pool ID: ${poolId}`);
    
    // Get transaction details
    const tx = await provider.getTransaction(txHash);
    if (!tx) {
      console.log('❌ Transaction not found');
      return;
    }
    
    console.log('✅ Transaction found:');
    console.log(`   Block: ${tx.blockNumber}`);
    console.log(`   From: ${tx.from}`);
    console.log(`   To: ${tx.to}`);
    console.log(`   Value: ${tx.value}`);
    
    // Get transaction receipt
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) {
      console.log('❌ Transaction receipt not found');
      return;
    }
    
    console.log('✅ Transaction receipt found:');
    console.log(`   Status: ${receipt.status}`);
    console.log(`   Gas Used: ${receipt.gasUsed}`);
    console.log(`   Logs: ${receipt.logs.length}`);
    
    // Parse logs for BetPlaced event
    const contractAddress = '0x59210719f4218c87ceA8661FEe29167639D124bA';
    
    console.log('\n🔍 Parsing logs for BetPlaced events...');
    
    for (let i = 0; i < receipt.logs.length; i++) {
      const log = receipt.logs[i];
      
      // Check if this log is from our contract
      if (log.address.toLowerCase() === contractAddress.toLowerCase()) {
        console.log(`\n📋 Log ${i}:`);
        console.log(`   Address: ${log.address}`);
        console.log(`   Topics: ${log.topics.length}`);
        console.log(`   Data: ${log.data}`);
        
        // Check if this is a BetPlaced event (topic[0] is the event signature)
        const betPlacedSignature = '0xb1bd10cf5ea9540f12b9b182707734fd82deacc56830e2bd316133deb372bff4';
        
        if (log.topics[0] === betPlacedSignature) {
          console.log('🎯 FOUND BETPLACED EVENT!');
          
          // Decode the event data
          // BetPlaced(uint256 indexed poolId, address indexed bettor, uint256 amount, bool isForOutcome)
          const poolIdFromLog = BigInt(log.topics[1]).toString();
          const bettorFromLog = '0x' + log.topics[2].slice(26); // Remove padding
          
          // Decode the data field (amount and isForOutcome)
          const data = log.data.slice(2); // Remove 0x
          const amountHex = '0x' + data.slice(0, 64);
          const isForOutcomeHex = '0x' + data.slice(64, 66);
          
          const amount = BigInt(amountHex).toString();
          const isForOutcome = isForOutcomeHex === '0x01';
          
          console.log(`   Pool ID: ${poolIdFromLog}`);
          console.log(`   Bettor: ${bettorFromLog}`);
          console.log(`   Amount: ${amount}`);
          console.log(`   Is For Outcome: ${isForOutcome}`);
          
          // Check if this matches our pool
          if (poolIdFromLog === poolId) {
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
                poolIdFromLog,
                bettorFromLog,
                amount,
                isForOutcome,
                txHash,
                tx.blockNumber
              ]);
              
              console.log('✅ Missing bet inserted into database!');
            }
          }
        }
      }
    }
    
    console.log('\n✅ Missing bet fetch completed');
    
  } catch (error) {
    console.error('❌ Error fetching missing bet:', error);
  }
}

fetchMissingBet();
