const db = require('../db/db');
const { ethers } = require('ethers');
const config = require('../config');

async function investigatePools() {
  console.log('\n========== INVESTIGATING POOLS 11 & 12 ==========\n');
  
  try {
    // Get pool data
    const result = await db.query(`
      SELECT 
        pool_id,
        title,
        predicted_outcome,
        result,
        creator_side_won,
        is_settled,
        category,
        market_id,
        settlement_tx_hash,
        settled_at,
        event_end_time
      FROM oracle.pools 
      WHERE pool_id IN (11, 12)
      ORDER BY pool_id
    `);
    
    if (result.rows.length === 0) {
      console.log('❌ Pools 11 and 12 not found!');
      return;
    }
    
    // Check contract state
    const provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    const poolCoreABI = require('../solidity/BitredictPoolCore.json').abi;
    const poolCoreAddress = config.blockchain.contractAddresses.poolCore;
    const poolCoreContract = new ethers.Contract(poolCoreAddress, poolCoreABI, provider);
    
    for (const pool of result.rows) {
      console.log(`\n📊 Pool ${pool.pool_id}:`);
      console.log(`   Title: ${pool.title}`);
      console.log(`   Category: ${pool.category}`);
      console.log(`   Market ID: ${pool.market_id}`);
      console.log(`   Predicted Outcome: "${pool.predicted_outcome}"`);
      console.log(`   Database Result: "${pool.result}"`);
      console.log(`   Database creator_side_won: ${pool.creator_side_won}`);
      console.log(`   Database is_settled: ${pool.is_settled}`);
      console.log(`   Settlement TX: ${pool.settlement_tx_hash || 'N/A'}`);
      console.log(`   Settled At: ${pool.settled_at || 'N/A'}`);
      
      // Check contract state
      try {
        const contractPool = await poolCoreContract.pools(pool.pool_id);
        const contractPredictedOutcome = contractPool.predictedOutcome;
        const contractResult = contractPool.result;
        const contractIsSettled = contractPool.isSettled;
        const contractFlags = contractPool.flags;
        
        // creatorSideWon is stored in flags bit 1 (second bit)
        const contractCreatorSideWon = (Number(contractFlags) & 2) !== 0;
        
        console.log(`\n   🔗 Contract State:`);
        console.log(`      Is Settled: ${contractIsSettled}`);
        console.log(`      Predicted Outcome (bytes32): ${contractPredictedOutcome}`);
        console.log(`      Result (bytes32): ${contractResult}`);
        console.log(`      Creator Side Won (from flags): ${contractCreatorSideWon}`);
        
        // Decode bytes32 to string
        const predictedOutcomeStr = ethers.toUtf8String(contractPredictedOutcome).replace(/\0/g, '').trim();
        const resultStr = ethers.toUtf8String(contractResult).replace(/\0/g, '').trim();
        
        console.log(`      Predicted Outcome (decoded): "${predictedOutcomeStr}"`);
        console.log(`      Result (decoded): "${resultStr}"`);
        
        // Check if they match
        const outcomesMatch = contractPredictedOutcome.toLowerCase() === contractResult.toLowerCase();
        console.log(`      Outcomes Match: ${outcomesMatch}`);
        console.log(`      Expected Creator Won: ${!outcomesMatch} (contrarian: outcome != predicted)`);
        
        // Check oracle outcome
        const GuidedOracleABI = require('../solidity/GuidedOracle.json').abi;
        const guidedOracleAddress = config.blockchain.contractAddresses.guidedOracle;
        const guidedOracleContract = new ethers.Contract(guidedOracleAddress, GuidedOracleABI, provider);
        
        const [isSet, oracleOutcome] = await guidedOracleContract.getOutcome(pool.market_id);
        if (isSet) {
          const oracleOutcomeStr = ethers.toUtf8String(oracleOutcome).replace(/\0/g, '').trim();
          console.log(`\n   🔮 Oracle State:`);
          console.log(`      Outcome Set: ${isSet}`);
          console.log(`      Oracle Outcome (bytes32): ${oracleOutcome}`);
          console.log(`      Oracle Outcome (decoded): "${oracleOutcomeStr}"`);
          
          // Check if oracle outcome matches predicted
          const oracleMatchesPredicted = contractPredictedOutcome.toLowerCase() === oracleOutcome.toLowerCase();
          console.log(`      Oracle Matches Predicted: ${oracleMatchesPredicted}`);
        } else {
          console.log(`\n   🔮 Oracle State: No outcome set`);
        }
        
        // Analyze the issue
        console.log(`\n   🔍 Analysis:`);
        if (contractIsSettled) {
          if (contractCreatorSideWon !== pool.creator_side_won) {
            console.log(`      ❌ MISMATCH: Contract says creator_side_won=${contractCreatorSideWon}, but DB says ${pool.creator_side_won}`);
            console.log(`      ⚠️  Database is out of sync with contract!`);
          } else {
            console.log(`      ✅ Contract and DB match: creator_side_won=${contractCreatorSideWon}`);
          }
          
          if (outcomesMatch) {
            console.log(`      ❌ PROBLEM: Outcome matches predicted outcome, so bettor should win`);
            console.log(`      ❌ But user says BTC didn't reach target, so creator should win!`);
            console.log(`      ❌ This means the WRONG outcome was submitted to the oracle!`);
          } else {
            console.log(`      ✅ Outcome doesn't match predicted, so creator should win`);
            if (!contractCreatorSideWon) {
              console.log(`      ❌ BUT contract flags show creator_side_won=false!`);
              console.log(`      ❌ This is a contract bug or the settlement was wrong!`);
            }
          }
        } else {
          console.log(`      ⚠️  Pool is not settled on contract yet`);
        }
        
      } catch (error) {
        console.error(`   ❌ Error checking contract: ${error.message}`);
      }
    }
    
    // Check what the actual BTC price was at event end time
    console.log(`\n\n📈 Checking BTC Price History:`);
    for (const pool of result.rows) {
      if (pool.event_end_time) {
        const eventEndDate = new Date(pool.event_end_time * 1000);
        console.log(`\n   Pool ${pool.pool_id} event ended at: ${eventEndDate.toISOString()}`);
        console.log(`   Need to check BTC price at that time`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  }
}

// Run investigation
investigatePools()
  .then(() => {
    console.log('\n✅ Investigation complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Investigation failed:', error);
    process.exit(1);
  });

