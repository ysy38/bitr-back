const db = require('../db/db');
const { ethers } = require('ethers');
const config = require('../config');

async function fixPools() {
  console.log('\n========== FIXING POOLS 11 & 12 SETTLEMENT ==========\n');
  
  try {
    const provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    const poolCoreABI = require('../solidity/BitredictPoolCore.json').abi;
    const poolCoreAddress = config.blockchain.contractAddresses.poolCore;
    const poolCoreContract = new ethers.Contract(poolCoreAddress, poolCoreABI, provider);
    
    const GuidedOracleABI = require('../solidity/GuidedOracle.json').abi;
    const guidedOracleAddress = config.blockchain.contractAddresses.guidedOracle;
    const guidedOracleContract = new ethers.Contract(guidedOracleAddress, GuidedOracleABI, provider);
    
    const poolIds = [11, 12];
    
    for (const poolId of poolIds) {
      console.log(`\n🔧 Fixing Pool ${poolId}:`);
      
      // Get pool data
      const poolResult = await db.query(`
        SELECT 
          pool_id,
          predicted_outcome,
          market_id,
          result,
          creator_side_won,
          is_settled
        FROM oracle.pools 
        WHERE pool_id = $1
      `, [poolId]);
      
      if (poolResult.rows.length === 0) {
        console.log(`   ❌ Pool ${poolId} not found`);
        continue;
      }
      
      const pool = poolResult.rows[0];
      console.log(`   Predicted Outcome: "${pool.predicted_outcome}"`);
      console.log(`   Current DB Result: "${pool.result}"`);
      console.log(`   Current DB creator_side_won: ${pool.creator_side_won}`);
      
      // Get contract state
      const contractPool = await poolCoreContract.pools(poolId);
      const contractPredictedOutcome = contractPool.predictedOutcome;
      const contractResult = contractPool.result;
      const contractFlags = contractPool.flags;
      const contractCreatorSideWon = (Number(contractFlags) & 2) !== 0;
      
      const predictedOutcomeStr = ethers.toUtf8String(contractPredictedOutcome).replace(/\0/g, '').trim();
      const resultStr = ethers.toUtf8String(contractResult).replace(/\0/g, '').trim();
      
      console.log(`   Contract Predicted: "${predictedOutcomeStr}"`);
      console.log(`   Contract Result: "${resultStr}"`);
      console.log(`   Contract creator_side_won: ${contractCreatorSideWon}`);
      
      // Get oracle outcome
      const [isSet, oracleOutcome] = await guidedOracleContract.getOutcome(pool.market_id);
      if (!isSet) {
        console.log(`   ❌ No oracle outcome set`);
        continue;
      }
      
      const oracleOutcomeStr = ethers.toUtf8String(oracleOutcome).replace(/\0/g, '').trim();
      console.log(`   Oracle Outcome: "${oracleOutcomeStr}"`);
      
      // Determine correct creator_side_won
      // Contrarian strategy: creator wins if outcome != predictedOutcome
      const oracleOutcomeBytes32 = ethers.zeroPadBytes(ethers.toUtf8Bytes(oracleOutcomeStr), 32);
      const outcomesMatch = contractPredictedOutcome.toLowerCase() === oracleOutcomeBytes32.toLowerCase();
      const correctCreatorSideWon = !outcomesMatch;
      
      console.log(`\n   📊 Analysis:`);
      console.log(`      Oracle matches predicted: ${outcomesMatch}`);
      console.log(`      Correct creator_side_won: ${correctCreatorSideWon}`);
      
      // Check if database needs fixing
      if (pool.creator_side_won !== correctCreatorSideWon || pool.result !== oracleOutcomeBytes32) {
        console.log(`\n   ✅ Updating database to reflect correct state...`);
        
        await db.query(`
          UPDATE oracle.pools SET
            creator_side_won = $2,
            result = $3,
            updated_at = NOW()
          WHERE pool_id = $1
        `, [poolId, correctCreatorSideWon, oracleOutcomeBytes32]);
        
        console.log(`   ✅ Database updated:`);
        console.log(`      creator_side_won: ${pool.creator_side_won} → ${correctCreatorSideWon}`);
        console.log(`      result: ${pool.result} → ${oracleOutcomeBytes32}`);
        
        // Note: Contract state cannot be changed, but database now reflects correct state
        if (contractCreatorSideWon !== correctCreatorSideWon) {
          console.log(`\n   ⚠️  WARNING: Contract state shows creator_side_won=${contractCreatorSideWon}`);
          console.log(`      But correct value should be ${correctCreatorSideWon}`);
          console.log(`      Contract cannot be changed, but database is now correct`);
          console.log(`      UI should read from database, not contract, for settlement display`);
        }
      } else {
        console.log(`   ✅ Database already has correct state`);
      }
    }
    
    console.log(`\n✅ Fix complete!`);
    
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  }
}

fixPools()
  .then(() => {
    console.log('\n✅ Script complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

