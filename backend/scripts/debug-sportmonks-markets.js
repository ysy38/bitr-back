#!/usr/bin/env node

/**
 * Debug SportMonks Market IDs
 * Fetches odds for a fixture and shows all available market IDs
 */

const SportMonksService = require('../services/sportmonks');
const db = require('../db/db');

async function debugSportMonksMarkets() {
  console.log('🔍 Debugging SportMonks Market IDs...');
  
  try {
    // Get a fixture from database
    const fixtureResult = await db.query('SELECT id, name FROM oracle.fixtures LIMIT 1');
    if (fixtureResult.rows.length === 0) {
      console.log('❌ No fixtures found in database');
      return;
    }
    
    const fixture = fixtureResult.rows[0];
    console.log(`📊 Testing fixture: ${fixture.name} (ID: ${fixture.id})`);
    
    // Initialize SportMonks service
    const sportmonksService = new SportMonksService();
    
    // Fetch odds directly from SportMonks API
    const response = await sportmonksService.axios.get(`/fixtures/${fixture.id}`, {
      params: {
        api_token: sportmonksService.apiToken,
        include: 'odds.bookmaker'
      }
    });
    
    const fixtureData = response.data.data;
    const odds = fixtureData.odds || [];
    
    console.log(`📊 Found ${odds.length} odds for fixture ${fixture.id}`);
    
    // Group odds by market ID
    const markets = {};
    odds.forEach(odd => {
      const marketId = odd.market_id;
      if (!markets[marketId]) {
        markets[marketId] = [];
      }
      markets[marketId].push({
        label: odd.label,
        value: odd.value,
        bookmaker: odd.bookmaker?.name || 'Unknown'
      });
    });
    
    // Display all market IDs
    console.log('\n🔍 Available Market IDs:');
    Object.keys(markets).sort((a, b) => parseInt(a) - parseInt(b)).forEach(marketId => {
      const marketOdds = markets[marketId];
      console.log(`\n📊 Market ID ${marketId}:`);
      marketOdds.forEach(odd => {
        console.log(`   ${odd.label}: ${odd.value} (${odd.bookmaker})`);
      });
    });
    
    // Check for specific market types we need
    console.log('\n🎯 Checking for specific market types:');
    const targetMarkets = {
      5: 'Correct Score',
      7: 'Asian Handicap', 
      9: 'Total Goals Exact',
      16: 'Team to Score First',
      18: 'Double Chance'
    };
    
    Object.entries(targetMarkets).forEach(([marketId, name]) => {
      if (markets[marketId]) {
        console.log(`✅ Market ${marketId} (${name}): ${markets[marketId].length} odds available`);
        markets[marketId].forEach(odd => {
          console.log(`   - ${odd.label}: ${odd.value}`);
        });
      } else {
        console.log(`❌ Market ${marketId} (${name}): Not available`);
      }
    });
    
  } catch (error) {
    console.error('❌ Error debugging SportMonks markets:', error.message);
  }
}

// Run if called directly
if (require.main === module) {
  debugSportMonksMarkets().then(() => {
    console.log('✅ Debug completed');
    process.exit(0);
  }).catch(error => {
    console.error('❌ Debug failed:', error);
    process.exit(1);
  });
}

module.exports = debugSportMonksMarkets;
