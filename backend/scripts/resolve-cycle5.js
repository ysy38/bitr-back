/**
 * Manually resolve cycle 5 on-chain
 */

const db = require('../db/db');
const Web3Service = require('../services/web3-service');

async function resolveCycle5OnChain() {
  const web3Service = new Web3Service();
  
  try {
    console.log('🚀 Manually resolving Cycle 5 on-chain...\n');
    
    await web3Service.initialize();
    
    // Step 1: Get cycle 5 match results from database
    console.log('📊 Fetching cycle 5 match results from database...');
    const cycleData = await db.query(`
      SELECT cycle_id, matches_data 
      FROM oracle.oddyssey_cycles 
      WHERE cycle_id = 5
    `);
    
    if (cycleData.rows.length === 0) {
      throw new Error('Cycle 5 not found in database');
    }
    
    const matches = cycleData.rows[0].matches_data;
    console.log('Cycle 5 has', matches.length, 'matches');
    
    // Step 2: Get results for each match
    console.log('\n📊 Fetching match results...');
    const results = [];
    
    for (const match of matches) {
      const fixtureResult = await db.query(`
        SELECT fixture_id, home_score, away_score, outcome_1x2, outcome_ou25
        FROM oracle.fixture_results
        WHERE fixture_id = $1
      `, [match.id]);
      
      if (fixtureResult.rows.length === 0) {
        console.log(`⚠️  Match ${match.id}: No results found`);
        results.push({ result1x2: null, resultOU25: null }); // NotSet
      } else {
        const result = fixtureResult.rows[0];
        
        // Calculate from scores (using our fixed logic!)
        const homeScore = parseInt(result.home_score);
        const awayScore = parseInt(result.away_score);
        const totalGoals = homeScore + awayScore;
        
        // Calculate 1X2
        let result1x2;
        if (homeScore > awayScore) {
          result1x2 = '1'; // Home Win
        } else if (homeScore < awayScore) {
          result1x2 = '2'; // Away Win
        } else {
          result1x2 = 'X'; // Draw
        }
        
        // Calculate O/U 2.5
        const resultOU25 = totalGoals > 2.5 ? 'Over' : 'Under';
        
        results.push({ result1x2, resultOU25 });
        
        console.log(`  Match ${match.id}: ${homeScore}-${awayScore} → 1X2=${result1x2}, O/U=${resultOU25}`);
      }
    }
    
    console.log('\n✅ All results collected:', results);
    
    // Check if any results are NotSet
    const hasNotSet = results.some(r => !r.result1x2 || !r.resultOU25);
    if (hasNotSet) {
      throw new Error('Some matches have no results - cannot resolve cycle');
    }
    
    // Step 3: Format results for contract
    console.log('\n🔧 Formatting results for smart contract...');
    const formattedResults = web3Service.formatResultsForContract(results);
    console.log('Formatted results:', formattedResults);
    
    // Step 4: Submit to blockchain
    console.log('\n🚀 Submitting resolution to blockchain...');
    console.log('   Cycle ID:', 5);
    console.log('   Results:', formattedResults.map(r => `(${r.moneyline},${r.overUnder})`).join(', '));
    
    const tx = await web3Service.resolveDailyCycle(5, formattedResults);
    
    console.log('\n⏳ Waiting for transaction confirmation...');
    const receipt = await tx.wait();
    
    if (receipt.status === 1) {
      console.log('\n✅ Cycle 5 resolved on-chain successfully!');
      console.log('   Transaction hash:', tx.hash);
      console.log('   Gas used:', receipt.gasUsed.toString());
      
      // Update database
      console.log('\n📝 Updating database with transaction hash...');
      await db.query(`
        UPDATE oracle.oddyssey_cycles 
        SET resolution_tx_hash = $1, resolved_at = NOW()
        WHERE cycle_id = 5
      `, [tx.hash]);
      
      console.log('✅ Database updated!');
      
      // Verify on-chain
      console.log('\n🔍 Verifying resolution on-chain...');
      const contract = await web3Service.getOddysseyContract();
      const cycleInfo = await contract.cycleInfo(5);
      const firstMatch = await contract.getDailyMatches(5);
      
      console.log('   Cycle state:', cycleInfo.state.toString());
      console.log('   First match result:', `Moneyline=${firstMatch[0].result.moneyline}, O/U=${firstMatch[0].result.overUnder}`);
      
    } else {
      throw new Error('Transaction failed with status 0');
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ Cycle 5 resolution complete!\n');
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Error resolving cycle 5:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run
resolveCycle5OnChain();

