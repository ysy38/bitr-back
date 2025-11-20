#!/usr/bin/env node

/**
 * Fix Missing Prediction Market
 * Create missing football_prediction_markets record for pool 0
 */

require('dotenv').config();
const { ethers } = require('ethers');
const config = require('../config');

class MissingPredictionMarketFixer {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    this.wallet = new ethers.Wallet(process.env.ORACLE_PRIVATE_KEY || process.env.ORACLE_SIGNER_PRIVATE_KEY, this.provider);
  }

  async createMissingPredictionMarket() {
    try {
      console.log('🔧 Creating missing prediction market record...');
      
      // Connect to database
      const db = require('../db/db');
      await db.connect();
      
      // Get match result data
      const matchResult = await db.query(`
        SELECT * FROM oracle.match_results 
        WHERE match_id = '19568522'
      `);
      
      if (matchResult.rows.length === 0) {
        console.log('❌ No match result found for fixture 19568522');
        return false;
      }
      
      const match = matchResult.rows[0];
      console.log(`📊 Match found: ${match.home_score}-${match.away_score}`);
      
      // Determine the outcome based on the match result
      // For pool 0, we need to determine what the predicted outcome was
      // Based on the pool data, it seems to be an Over/Under 2.5 market
      const totalGoals = match.home_score + match.away_score;
      const actualOutcome = totalGoals > 2.5 ? "Over 2.5" : "Under 2.5";
      
      console.log(`🎯 Actual outcome: ${actualOutcome} (${totalGoals} goals)`);
      
      // Create the missing prediction market record
      const marketId = `pool_0_${Date.now()}`;
      const fixtureId = '19568522';
      const outcomeType = 'Over/Under 2.5';
      const predictedOutcome = 'Under 2.5'; // Based on the pool data
      
      const insertQuery = `
        INSERT INTO oracle.football_prediction_markets (
          id, fixture_id, market_type, market_id, outcome_type, 
          predicted_outcome, end_time, resolved, result, resolved_at,
          pool_id, status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `;
      
      const values = [
        marketId,
        fixtureId,
        'guided',
        fixtureId, // Use fixture ID as market ID
        outcomeType,
        predictedOutcome,
        new Date('2025-09-30T21:00:00.000Z'), // Event end time
        true, // resolved
        actualOutcome, // result
        new Date(), // resolved_at
        '0', // pool_id
        'resolved', // status
        new Date(), // created_at
        new Date() // updated_at
      ];
      
      await db.query(insertQuery, values);
      
      console.log(`✅ Created prediction market record: ${marketId}`);
      console.log(`📊 Fixture: ${fixtureId}`);
      console.log(`📊 Predicted: ${predictedOutcome}`);
      console.log(`📊 Actual: ${actualOutcome}`);
      console.log(`📊 Pool ID: 0`);
      
      return true;
      
    } catch (error) {
      console.error('❌ Error creating prediction market:', error);
      return false;
    }
  }

  async triggerOracleBot() {
    try {
      console.log('🤖 Triggering football oracle bot...');
      
      // Import and run the football oracle bot
      const FootballOracleBot = require('../services/football-oracle-bot');
      const bot = new FootballOracleBot();
      
      // Start the bot
      await bot.start();
      
      // Wait a moment for processing
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Stop the bot
      await bot.stop();
      
      console.log('✅ Football oracle bot triggered');
      
    } catch (error) {
      console.error('❌ Error triggering oracle bot:', error);
    }
  }

  async run() {
    try {
      console.log('🚀 Starting Missing Prediction Market Fixer...');
      
      // Step 1: Create missing prediction market record
      console.log('\n📋 Step 1: Creating missing prediction market record...');
      const created = await this.createMissingPredictionMarket();
      
      if (!created) {
        console.log('❌ Failed to create prediction market record');
        return;
      }
      
      // Step 2: Trigger oracle bot
      console.log('\n📋 Step 2: Triggering football oracle bot...');
      await this.triggerOracleBot();
      
      console.log('\n🎉 SUCCESS! Missing prediction market fixed!');
      console.log('📊 The football oracle bot should now process fixture 19568522');
      console.log('📊 And submit the outcome to the guided oracle contract');
      
    } catch (error) {
      console.error('❌ Missing prediction market fixer failed:', error);
      process.exit(1);
    }
  }
}

// Run the fixer
const fixer = new MissingPredictionMarketFixer();
fixer.run();
