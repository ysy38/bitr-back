#!/usr/bin/env node

const GuidedMarketService = require('../backend/services/guided-market-service');

async function createAnderlechtGentMarket() {
  console.log('🎯 Creating guided market for Anderlecht vs Gent match...');
  
  const guidedMarketService = new GuidedMarketService();
  
  try {
    // Market data for Anderlecht vs Gent
    const marketData = {
      fixtureId: 12345, // Mock fixture ID
      homeTeam: 'Anderlecht',
      awayTeam: 'Gent',
      league: 'Belgian Pro League',
      matchDate: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours from now
      outcome: 'home', // Predicting Anderlecht wins
      predictedOutcome: '1', // Home team wins
      odds: 180, // 1.80x odds (180 in contract format)
      creatorStake: 1000, // 1000 BITR tokens
      useBitr: true, // Using BITR token
      description: 'Anderlecht to win against Gent in Belgian Pro League',
      isPrivate: false,
      maxBetPerUser: 0 // No limit
    };

    console.log('📊 Market Data:', {
      match: `${marketData.homeTeam} vs ${marketData.awayTeam}`,
      league: marketData.league,
      prediction: 'Anderlecht wins',
      odds: marketData.odds / 100 + 'x',
      stake: `${marketData.creatorStake} BITR`,
      matchTime: marketData.matchDate
    });

    // Create the market
    const result = await guidedMarketService.createFootballMarket(marketData);
    
    console.log('✅ Market created successfully!');
    console.log('📋 Transaction Details:', {
      transactionHash: result.transactionHash,
      marketId: result.marketId,
      fixtureId: result.fixtureId,
      details: result.details
    });

    console.log('\n🎉 Market Summary:');
    console.log(`- Match: ${result.details.homeTeam} vs ${result.details.awayTeam}`);
    console.log(`- League: ${result.details.league}`);
    console.log(`- Prediction: ${result.details.predictedOutcome}`);
    console.log(`- Odds: ${result.details.odds}x`);
    console.log(`- Creator Stake: ${result.details.creatorStake} ${result.details.useBitr ? 'BITR' : 'STT'}`);
    console.log(`- Transaction: ${result.transactionHash}`);
    console.log(`- Market ID: ${result.marketId}`);

  } catch (error) {
    console.error('❌ Error creating market:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  createAnderlechtGentMarket()
    .then(() => {
      console.log('\n🏁 Script completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Script failed:', error);
      process.exit(1);
    });
}

module.exports = { createAnderlechtGentMarket };
