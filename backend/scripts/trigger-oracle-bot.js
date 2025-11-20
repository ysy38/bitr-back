#!/usr/bin/env node

const FootballOracleBot = require('../services/football-oracle-bot');
const db = require('../db/db');

/**
 * Manually trigger the Football Oracle Bot to submit outcomes for existing pools
 */
class OracleBotTrigger {
  constructor() {
    this.footballOracleBot = new FootballOracleBot();
  }

  async triggerOracleBot() {
    try {
      console.log('🚀 Triggering Football Oracle Bot for existing pools...');
      
      // Connect to database
      await db.connect();
      
      // Start the football oracle bot
      await this.footballOracleBot.start();
      
      // Wait a moment for the bot to initialize
      console.log('⏳ Waiting for Football Oracle Bot to initialize...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Manually trigger market resolution check
      console.log('🔍 Manually triggering market resolution check...');
      await this.footballOracleBot.checkAndResolveMarkets();
      
      // Wait for any pending operations
      console.log('⏳ Waiting for oracle submissions to complete...');
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      // Check if oracle submissions were created
      const submissions = await db.query(`
        SELECT match_id, oracle_address, submitted_at
        FROM public.oracle_submissions 
        WHERE match_id IN ('19391153', '19433520')
        ORDER BY submitted_at
      `);
      
      if (submissions.rows.length > 0) {
        console.log('✅ Oracle submissions created:');
        submissions.rows.forEach(sub => {
          console.log(`  Market ${sub.match_id}: Submitted by ${sub.oracle_address} at ${sub.submitted_at}`);
        });
      } else {
        console.log('❌ No oracle submissions were created');
      }
      
      // Stop the football oracle bot
      await this.footballOracleBot.stop();
      
      console.log('🎉 Football Oracle Bot trigger completed!');
      
    } catch (error) {
      console.error('❌ Error triggering Football Oracle Bot:', error);
      throw error;
    }
  }
}

// Run the trigger
async function main() {
  const trigger = new OracleBotTrigger();
  await trigger.triggerOracleBot();
  process.exit(0);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = OracleBotTrigger;
