#!/usr/bin/env node

const { ethers } = require('ethers');
const config = require('../config');
const db = require('../db/db');

/**
 * Record oracle submissions in database for Pool Settlement Service to detect
 */
class OracleSubmissionRecorder {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    this.wallet = new ethers.Wallet('0x92961421b053ae691cde04f131bd6ebf8745c5a501be3cab8ddedb341c52afc4', this.provider);
  }

  async recordOracleSubmissions() {
    try {
      console.log('📝 Recording oracle submissions in database...');
      
      // Connect to database
      await db.connect();
      
      const botAddress = await this.wallet.getAddress();
      
      // Record oracle submissions for both pools
      const submissions = [
        {
          match_id: '19391153',
          oracle_address: botAddress,
          outcome_data: {
            result: 'Home wins',
            outcome_type: '1X2',
            pool_id: '0',
            home_team: 'Coritiba',
            away_team: 'Botafogo SP'
          }
        },
        {
          match_id: '19433520',
          oracle_address: botAddress,
          outcome_data: {
            result: 'Home wins',
            outcome_type: '1X2',
            pool_id: '1',
            home_team: 'Bayer 04 Leverkusen',
            away_team: 'FC Union Berlin'
          }
        }
      ];
      
      for (const submission of submissions) {
        try {
          await db.query(`
            INSERT INTO public.oracle_submissions (match_id, oracle_address, outcome_data, submitted_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (match_id) DO NOTHING
          `, [
            submission.match_id,
            submission.oracle_address,
            JSON.stringify(submission.outcome_data)
          ]);
          
          console.log(`✅ Recorded oracle submission for market ${submission.match_id}`);
        } catch (error) {
          console.error(`❌ Failed to record submission for ${submission.match_id}:`, error.message);
        }
      }
      
      // Verify submissions were recorded
      const recorded = await db.query(`
        SELECT match_id, oracle_address, submitted_at
        FROM public.oracle_submissions 
        WHERE match_id IN ('19391153', '19433520')
        ORDER BY submitted_at
      `);
      
      console.log(`\n📊 Recorded ${recorded.rows.length} oracle submissions:`);
      recorded.rows.forEach(sub => {
        console.log(`  Market ${sub.match_id}: Submitted by ${sub.oracle_address} at ${sub.submitted_at}`);
      });
      
      console.log('\n🎉 Oracle submissions recorded successfully!');
      console.log('📋 Next steps:');
      console.log('1. Pool Settlement Service should detect these submissions');
      console.log('2. Pools will be automatically settled');
      console.log('3. Check the deployed backend logs for settlement activity');
      
    } catch (error) {
      console.error('❌ Error recording oracle submissions:', error);
      throw error;
    }
  }
}

// Run the recorder
async function main() {
  const recorder = new OracleSubmissionRecorder();
  await recorder.recordOracleSubmissions();
  process.exit(0);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = OracleSubmissionRecorder;
