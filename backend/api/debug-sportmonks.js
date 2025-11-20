const express = require('express');
const router = express.Router();
const SportMonksService = require('../services/sportmonks');
const db = require('../db/db');

/**
 * GET /api/debug/sportmonks-markets
 * Debug SportMonks Market IDs for a fixture
 */
router.get('/sportmonks-markets', async (req, res) => {
  try {
    console.log('🔍 Debugging SportMonks Market IDs...');
    
    // Get a fixture from database
    const fixtureResult = await db.query('SELECT id, name FROM oracle.fixtures LIMIT 1');
    if (fixtureResult.rows.length === 0) {
      return res.json({
        success: false,
        error: 'No fixtures found in database'
      });
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
    
    // Check for specific market types we need
  const targetMarkets = {
    1: 'Fulltime Result',
    2: 'Double Chance',
    5: 'Correct Score',
    9: 'Total Goals Exact',
    14: 'Both Teams To Score',
    28: 'Half Time Over/Under',
    31: 'Half Time Result',
    80: 'Goals Over/Under',
    247: 'First Team To Score'
  };
    
    const targetMarketResults = {};
    Object.entries(targetMarkets).forEach(([marketId, name]) => {
      if (markets[marketId]) {
        targetMarketResults[marketId] = {
          name,
          available: true,
          odds: markets[marketId]
        };
      } else {
        targetMarketResults[marketId] = {
          name,
          available: false,
          odds: []
        };
      }
    });
    
    res.json({
      success: true,
      fixture: {
        id: fixture.id,
        name: fixture.name
      },
      total_odds: odds.length,
      all_markets: markets,
      target_markets: targetMarketResults
    });
    
  } catch (error) {
    console.error('❌ Error debugging SportMonks markets:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
