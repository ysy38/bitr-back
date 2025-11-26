const express = require('express');
const CoinpaprikaService = require('../services/coinpaprika');
const db = require('../db/db');

const router = express.Router();
const coinpaprikaService = new CoinpaprikaService();

/**
 * GET /api/crypto/all
 * Get all cryptocurrencies with current prices (top 300)
 */
router.get('/all', async (req, res) => {
  try {
    const { limit = 300, page = 1 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    const allCoins = await coinpaprikaService.getAllTickers(parseInt(limit) + offset);
    
    // Paginate results
    const paginatedData = allCoins.data.slice(offset, offset + parseInt(limit));
    
    res.json({
      success: true,
      data: paginatedData,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: allCoins.count,
        hasMore: offset + parseInt(limit) < allCoins.count
      },
      timestamp: allCoins.timestamp
    });
  } catch (error) {
    console.error('Error fetching all cryptos:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch all cryptocurrencies'
    });
  }
});

/**
 * GET /api/crypto/coins
 * Get all available cryptocurrencies (top 200+)
 */
router.get('/coins', async (req, res) => {
  try {
    const { limit = 200 } = req.query;
    const allCoins = await coinpaprikaService.getAllTickers(parseInt(limit));
    
    res.json({
      success: true,
      data: allCoins.data || [],
      count: allCoins.count || 0,
      timestamp: allCoins.timestamp
    });
  } catch (error) {
    console.error('Error fetching all cryptos:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch all cryptocurrencies'
    });
  }
});

/**
 * GET /api/crypto/popular
 * Get popular cryptocurrencies with current prices and logo URLs
 */
router.get('/popular', async (req, res) => {
  try {
    // Get popular coins from database with logo URLs
    const result = await db.query(`
      SELECT 
        cc.coinpaprika_id as id,
        cc.symbol,
        cc.name,
        cc.rank,
        cc.logo_url,
        cps.price_usd as price,
        cps.market_cap,
        cps.volume_24h,
        cps.percent_change_1h as change1h,
        cps.percent_change_24h as change24h,
        cps.percent_change_7d as change7d,
        cps.last_updated
      FROM oracle.crypto_coins cc
      LEFT JOIN LATERAL (
        SELECT * FROM oracle.crypto_price_snapshots 
        WHERE coinpaprika_id = cc.coinpaprika_id 
        ORDER BY created_at DESC 
        LIMIT 1
      ) cps ON true
      WHERE cc.is_popular = true AND cc.is_active = true
      ORDER BY cc.rank ASC
      LIMIT 50
    `);

    const popularCoins = result.rows.map(coin => ({
      id: coin.id,
      symbol: coin.symbol,
      name: coin.name,
      rank: coin.rank,
      logo: coin.logo_url,
      price: parseFloat(coin.price) || 0,
      marketCap: parseFloat(coin.market_cap) || 0,
      volume24h: parseFloat(coin.volume_24h) || 0,
      change1h: parseFloat(coin.change1h) || 0,
      change24h: parseFloat(coin.change24h) || 0,
      change7d: parseFloat(coin.change7d) || 0,
      lastUpdated: coin.last_updated
    }));

    res.json({
      success: true,
      data: popularCoins
    });
  } catch (error) {
    console.error('Error fetching popular cryptos:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch popular cryptocurrencies'
    });
  }
});

/**
 * GET /api/crypto/prices/:symbol
 * Get specific cryptocurrency price data
 */
router.get('/prices/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const coinId = await coinpaprikaService.findCoinIdBySymbol(symbol);
    
    if (!coinId) {
      return res.status(404).json({
        success: false,
        error: 'Cryptocurrency not found'
      });
    }

    const ticker = await coinpaprikaService.getCoinTicker(coinId);
    res.json({
      success: true,
      data: ticker
    });
  } catch (error) {
    console.error('Error fetching crypto price:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch cryptocurrency price'
    });
  }
});

/**
 * GET /api/crypto/search
 * Search cryptocurrencies by name or symbol with logo URLs
 */
router.get('/search', async (req, res) => {
  try {
    const { q: query } = req.query;
    
    if (!query || query.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Query must be at least 2 characters long'
      });
    }

    // Search in database first
    const result = await db.query(`
      SELECT 
        cc.coinpaprika_id as id,
        cc.symbol,
        cc.name,
        cc.rank,
        cc.logo_url,
        cps.price_usd as price,
        cps.market_cap,
        cps.volume_24h,
        cps.percent_change_24h as change24h,
        cps.last_updated
      FROM oracle.crypto_coins cc
      LEFT JOIN LATERAL (
        SELECT * FROM oracle.crypto_price_snapshots 
        WHERE coinpaprika_id = cc.coinpaprika_id 
        ORDER BY created_at DESC 
        LIMIT 1
      ) cps ON true
      WHERE cc.is_active = true 
        AND (cc.name ILIKE $1 OR cc.symbol ILIKE $1)
      ORDER BY cc.rank ASC
      LIMIT 20
    `, [`%${query}%`]);

    const searchResults = result.rows.map(coin => ({
      id: coin.id,
      symbol: coin.symbol,
      name: coin.name,
      rank: coin.rank,
      logo: coin.logo_url,
      price: parseFloat(coin.price) || 0,
      marketCap: parseFloat(coin.market_cap) || 0,
      volume24h: parseFloat(coin.volume_24h) || 0,
      change24h: parseFloat(coin.change24h) || 0,
      lastUpdated: coin.last_updated
    }));

    res.json({
      success: true,
      data: searchResults
    });
  } catch (error) {
    console.error('Error searching cryptos:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search cryptocurrencies'
    });
  }
});

/**
 * GET /api/crypto/targets/:coinId
 * Get price prediction targets for a specific cryptocurrency
 */
router.get('/targets/:coinId', async (req, res) => {
  try {
    const { coinId } = req.params;
    const { timeframe = '24h' } = req.query;

    const targets = await coinpaprikaService.generatePriceTargets(coinId, timeframe);
    res.json({
      success: true,
      data: targets
    });
  } catch (error) {
    console.error('Error generating price targets:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate price targets'
    });
  }
});

/**
 * GET /api/crypto/markets/active
 * Get active cryptocurrency prediction markets
 */
router.get('/markets/active', async (req, res) => {
  try {
    const markets = await coinpaprikaService.getActiveCryptoMarkets();
    res.json({
      success: true,
      data: markets
    });
  } catch (error) {
    console.error('Error fetching active crypto markets:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch active crypto markets'
    });
  }
});

/**
 * GET /api/crypto/markets/pending
 * Get crypto markets needing resolution
 */
router.get('/markets/pending', async (req, res) => {
  try {
    const markets = await coinpaprikaService.getPendingCryptoResolutions();
    res.json({
      success: true,
      data: markets
    });
  } catch (error) {
    console.error('Error fetching pending crypto resolutions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pending crypto resolutions'
    });
  }
});

/**
 * POST /api/crypto/markets
 * Create a new cryptocurrency prediction market
 */
router.post('/markets', async (req, res) => {
  try {
    const { coinId, targetPrice, direction, timeframe, poolId } = req.body;

    if (!coinId || !targetPrice || !direction || !timeframe || !poolId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: coinId, targetPrice, direction, timeframe, poolId'
      });
    }

    const market = await coinpaprikaService.createPredictionMarket({
      coinId,
      targetPrice: parseFloat(targetPrice),
      direction,
      timeframe,
      poolId
    });

    res.json({
      success: true,
      data: market
    });
  } catch (error) {
    console.error('Error creating crypto market:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create crypto market'
    });
  }
});

/**
 * GET /api/crypto/health
 * Health check for crypto service
 */
router.get('/health', async (req, res) => {
  try {
    const health = await coinpaprikaService.getHealthStatus();
    res.json({
      success: true,
      data: health
    });
  } catch (error) {
    console.error('Error checking crypto service health:', error);
    res.status(500).json({
      success: false,
      error: 'Crypto service health check failed'
    });
  }
});

module.exports = router; 