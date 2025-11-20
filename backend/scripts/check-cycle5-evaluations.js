/**
 * Check Cycle 5 Slip Evaluations
 * 
 * This script checks:
 * 1. How many slips exist for cycle 5
 * 2. How many are evaluated in database
 * 3. How many are evaluated on-chain
 * 4. Identifies any discrepancies
 */

const db = require('../db/db');
const Web3Service = require('../services/web3-service');

async function checkCycle5Evaluations() {
  const web3Service = new Web3Service();
  
  try {
    console.log('🔍 CYCLE 5 EVALUATION STATUS CHECK\n');
    console.log('=' .repeat(60));
    
    // Step 1: Check database slips
    console.log('\n📊 STEP 1: Database Slip Status');
    console.log('-'.repeat(60));
    
    const dbSlips = await db.query(`
      SELECT 
        slip_id,
        player_address,
        cycle_id,
        is_evaluated,
        correct_count,
        final_score,
        tx_hash,
        placed_at
      FROM oracle.oddyssey_slips
      WHERE cycle_id = 5
      ORDER BY slip_id ASC
    `);
    
    console.log(`Total slips in database: ${dbSlips.rows.length}`);
    
    const evaluatedInDb = dbSlips.rows.filter(s => s.is_evaluated);
    const unevaluatedInDb = dbSlips.rows.filter(s => !s.is_evaluated);
    
    console.log(`Evaluated in database: ${evaluatedInDb.length}`);
    console.log(`Unevaluated in database: ${unevaluatedInDb.length}`);
    
    if (unevaluatedInDb.length > 0) {
      console.log('\n⚠️  Unevaluated slips:');
      unevaluatedInDb.forEach(slip => {
        console.log(`   • Slip ${slip.slip_id} (${slip.player_address})`);
      });
    }
    
    // Step 2: Check on-chain status
    console.log('\n\n📊 STEP 2: On-Chain Slip Status');
    console.log('-'.repeat(60));
    
    await web3Service.initialize();
    const contract = await web3Service.getOddysseyContract();
    
    let evaluatedOnChain = 0;
    let unevaluatedOnChain = 0;
    const discrepancies = [];
    
    console.log('\nChecking each slip on-chain...\n');
    
    for (const slip of dbSlips.rows) {
      try {
        const slipData = await contract.getSlip(slip.slip_id);
        const isEvaluatedOnChain = slipData.isEvaluated;
        const correctCountOnChain = Number(slipData.correctCount);
        const finalScoreOnChain = Number(slipData.finalScore);
        
        if (isEvaluatedOnChain) {
          evaluatedOnChain++;
        } else {
          unevaluatedOnChain++;
        }
        
        // Check for discrepancies
        if (slip.is_evaluated !== isEvaluatedOnChain) {
          discrepancies.push({
            slip_id: slip.slip_id,
            type: 'evaluation_status',
            database: slip.is_evaluated,
            onchain: isEvaluatedOnChain
          });
        }
        
        if (slip.is_evaluated && isEvaluatedOnChain) {
          if (slip.correct_count !== correctCountOnChain) {
            discrepancies.push({
              slip_id: slip.slip_id,
              type: 'correct_count',
              database: slip.correct_count,
              onchain: correctCountOnChain
            });
          }
        }
        
        const statusEmoji = isEvaluatedOnChain ? '✅' : '❌';
        console.log(`${statusEmoji} Slip ${slip.slip_id}: On-Chain=${isEvaluatedOnChain}, DB=${slip.is_evaluated}, Correct=${correctCountOnChain}/10, Score=${finalScoreOnChain}`);
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`❌ Error checking slip ${slip.slip_id}:`, error.message);
      }
    }
    
    // Step 3: Summary
    console.log('\n\n📊 STEP 3: Summary');
    console.log('-'.repeat(60));
    console.log(`Total slips: ${dbSlips.rows.length}`);
    console.log(`\nDatabase Status:`);
    console.log(`  ✅ Evaluated: ${evaluatedInDb.length}`);
    console.log(`  ❌ Unevaluated: ${unevaluatedInDb.length}`);
    console.log(`\nOn-Chain Status:`);
    console.log(`  ✅ Evaluated: ${evaluatedOnChain}`);
    console.log(`  ❌ Unevaluated: ${unevaluatedOnChain}`);
    
    // Step 4: Discrepancies
    if (discrepancies.length > 0) {
      console.log(`\n\n⚠️  STEP 4: Discrepancies Found (${discrepancies.length})`);
      console.log('-'.repeat(60));
      
      discrepancies.forEach(disc => {
        console.log(`\nSlip ${disc.slip_id}:`);
        console.log(`  Type: ${disc.type}`);
        console.log(`  Database: ${disc.database}`);
        console.log(`  On-Chain: ${disc.onchain}`);
      });
      
      console.log('\n🔧 Recommendation: Run auto-evaluation service to fix discrepancies');
    } else {
      console.log('\n\n✅ No discrepancies found - database and on-chain are in sync!');
    }
    
    // Step 5: Check cycle resolution status
    console.log('\n\n📊 STEP 5: Cycle Resolution Status');
    console.log('-'.repeat(60));
    
    const cycleInfo = await db.query(`
      SELECT cycle_id, is_resolved, resolution_tx_hash, resolved_at, cycle_end_time
      FROM oracle.oddyssey_cycles
      WHERE cycle_id = 5
    `);
    
    if (cycleInfo.rows.length > 0) {
      const cycle = cycleInfo.rows[0];
      console.log(`Cycle 5 Status:`);
      console.log(`  • Resolved: ${cycle.is_resolved}`);
      console.log(`  • Resolution TX: ${cycle.resolution_tx_hash || 'None'}`);
      console.log(`  • Resolved At: ${cycle.resolved_at || 'Not resolved'}`);
      console.log(`  • End Time: ${cycle.cycle_end_time}`);
      
      // Check on-chain
      const cycleIdOnChain = 5;
      const cycleDataOnChain = await contract.cycles(cycleIdOnChain);
      const isResolvedOnChain = cycleDataOnChain.isResolved;
      
      console.log(`\nOn-Chain Status:`);
      console.log(`  • Resolved: ${isResolvedOnChain}`);
      
      if (cycle.is_resolved && !isResolvedOnChain) {
        console.log(`\n⚠️  WARNING: Cycle marked as resolved in database but NOT on-chain!`);
      }
      
      if (!cycle.is_resolved && isResolvedOnChain) {
        console.log(`\n⚠️  WARNING: Cycle resolved on-chain but NOT marked in database!`);
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ Check complete!\n');
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Error during check:', error);
    process.exit(1);
  }
}

// Run the check
checkCycle5Evaluations();

