#!/usr/bin/env node

/**
 * Fix Cycle 1 Oracle Submission
 * 
 * This script manually fixes the oracle submission for Cycle 1
 * by submitting the match results to the blockchain contract.
 */

require('dotenv').config();
const db = require('../db/db');
const Web3Service = require('../services/web3-service');

async function fixCycle1OracleSubmission() {
  console.log('🔧 Fixing Cycle 1 Oracle Submission...');
  
  try {
    const web3Service = new Web3Service();
    
    // Get Cycle 1 data
    const cycleResult = await db.query(`
      SELECT cycle_id, matches_data, resolution_tx_hash, cycle_end_time
      FROM oracle.oddyssey_cycles 
      WHERE cycle_id = 1
    `);
    
    if (cycleResult.rows.length === 0) {
      throw new Error('Cycle 1 not found in database');
    }
    
    const cycle = cycleResult.rows[0];
    console.log(`📊 Cycle 1 data:`, {
      cycle_id: cycle.cycle_id,
      has_matches_data: !!cycle.matches_data,
      resolution_tx_hash: cycle.resolution_tx_hash,
      cycle_end_time: cycle.cycle_end_time
    });
    
    // Check if cycle is resolved on blockchain
    const contract = await web3Service.getOddysseyContract();
    const isResolvedOnChain = await contract.isCycleResolved(1);
    console.log(`🔗 Cycle 1 resolved on blockchain: ${isResolvedOnChain}`);
    
    if (isResolvedOnChain) {
      console.log('✅ Cycle 1 is already resolved on blockchain');
      
      // Check slip evaluation status
      const slipData = await contract.slips(0);
      console.log(`📋 Slip #0 status:`, {
        slipId: slipData[0].toString(),
        cycleId: slipData[1].toString(),
        player: slipData[2],
        isEvaluated: slipData[3],
        correctCount: slipData[4].toString(),
        finalScore: slipData[5].toString()
      });
      
      if (!slipData[3]) {
        console.log('⚡ Evaluating Slip...');
        
        // Use the actual slip ID from the contract
        const actualSlipId = slipData[0].toString();
        console.log(`Using actual slip ID: ${actualSlipId}`);
        
        const evaluationResult = await web3Service.evaluateSlip(actualSlipId, {
          gasLimit: 500000,
          gasPrice: '7000000000'
        });
        
        if (evaluationResult.success) {
          console.log(`✅ Slip #0 evaluated successfully: ${evaluationResult.transactionHash}`);
          
          // Update database
          await db.query(`
            UPDATE oracle.oddyssey_slips 
            SET is_evaluated = true, 
                correct_count = $1, 
                final_score = $2,
                evaluation_tx_hash = $3
            WHERE cycle_id = 1 AND player_address = '0x150e7665A6F3e66933BDFD51a60A43f1BCC7971B'
          `, [evaluationResult.correctCount, evaluationResult.finalScore, evaluationResult.transactionHash]);
          
          console.log(`📊 Slip #0: ${evaluationResult.correctCount}/10 correct, score: ${evaluationResult.finalScore}`);
          
        } else {
          console.error(`❌ Failed to evaluate Slip #0: ${evaluationResult.error}`);
        }
      } else {
        console.log('✅ Slip #0 is already evaluated');
      }
      
      return;
    }
    
    // Get match results for Cycle 1
    const matchResults = [];
    if (cycle.matches_data && Array.isArray(cycle.matches_data)) {
      for (const match of cycle.matches_data) {
        if (match.result && match.result.outcome_1x2 && match.result.outcome_ou25) {
          matchResults.push({
            fixture_id: match.id,
            outcome_1x2: match.result.outcome_1x2,
            outcome_ou25: match.result.outcome_ou25,
            home_score: match.result.home_score,
            away_score: match.result.away_score
          });
        }
      }
    }
    
    console.log(`📋 Found ${matchResults.length} match results for Cycle 1`);
    
    if (matchResults.length !== 10) {
      throw new Error(`Expected 10 match results, found ${matchResults.length}`);
    }
    
    // Format results for contract
    const formattedResults = [];
    for (const result of matchResults) {
      // Convert outcome_1x2 to moneyline format
      let moneyline;
      if (result.outcome_1x2 === '1') moneyline = 1; // Home win
      else if (result.outcome_1x2 === 'X') moneyline = 2; // Draw
      else if (result.outcome_1x2 === '2') moneyline = 3; // Away win
      else moneyline = 0; // Unknown
      
      // Convert outcome_ou25 to overUnder format
      let overUnder;
      if (result.outcome_ou25 === 'Over') overUnder = 1; // Over
      else if (result.outcome_ou25 === 'Under') overUnder = 2; // Under
      else overUnder = 0; // Unknown
      
      formattedResults.push({
        moneyline: moneyline,
        overUnder: overUnder
      });
    }
    
    console.log('📤 Submitting results to blockchain...');
    console.log('Formatted results:', formattedResults);
    
    // Submit to blockchain
    const result = await web3Service.resolveDailyCycle(1, formattedResults, {
      gasLimit: 800000,
      gasPrice: '7000000000'
    });
    
    if (result.success) {
      console.log(`✅ Cycle 1 oracle submission successful: ${result.transactionHash}`);
      
      // Update database
      await db.query(`
        UPDATE oracle.oddyssey_cycles 
        SET resolution_tx_hash = $1, resolved_at = NOW()
        WHERE cycle_id = 1
      `, [result.transactionHash]);
      
      console.log('📊 Database updated with new transaction hash');
      
      // Now evaluate Slip #0
      console.log('⚡ Evaluating Slip #0...');
      
      const evaluationResult = await web3Service.evaluateSlip(0, {
        gasLimit: 500000,
        gasPrice: '7000000000'
      });
      
      if (evaluationResult.success) {
        console.log(`✅ Slip #0 evaluated successfully: ${evaluationResult.transactionHash}`);
        
        // Update database
        await db.query(`
          UPDATE oracle.oddyssey_slips 
          SET is_evaluated = true, 
              correct_count = $1, 
              final_score = $2,
              evaluation_tx_hash = $3
          WHERE slip_id = 0
        `, [evaluationResult.correctCount, evaluationResult.finalScore, evaluationResult.transactionHash]);
        
        console.log(`📊 Slip #0: ${evaluationResult.correctCount}/10 correct, score: ${evaluationResult.finalScore}`);
        
      } else {
        console.error(`❌ Failed to evaluate Slip #0: ${evaluationResult.error}`);
      }
      
    } else {
      console.error(`❌ Failed to submit oracle results: ${result.error}`);
      throw new Error(`Oracle submission failed: ${result.error}`);
    }
    
  } catch (error) {
    console.error('❌ Error fixing Cycle 1 oracle submission:', error);
    process.exit(1);
  }
}

// Run the fix
fixCycle1OracleSubmission()
  .then(() => {
    console.log('🎉 Cycle 1 oracle submission fix completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Fix failed:', error);
    process.exit(1);
  });
