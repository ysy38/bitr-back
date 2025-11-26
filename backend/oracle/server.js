const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const db = require('../db/db');
const guidedFetcher = require('./guidedFetcher');
const config = require('../config');
const CoinpaprikaService = require('../services/coinpaprika');

class OracleServer {
  constructor() {
    this.app = express();
    this.port = process.env.ORACLE_PORT || 3001;
    this.isRunning = false;
    
    // Initialize Coinpaprika service
    this.coinpaprikaService = new CoinpaprikaService();
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
    
    // Request logging
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
      next();
    });
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        services: {
          database: 'connected',
          coinpaprika: 'active'
        }
      });
    });

    // Oracle data endpoints
    this.app.get('/api/oracle/market/:marketId', this.getMarketData.bind(this));
    this.app.post('/api/oracle/submit', this.submitOutcome.bind(this));
    
    // Sports data endpoints
    this.app.get('/api/sports/upcoming', this.getUpcomingMatches.bind(this));
    this.app.get('/api/sports/results/:gameId', this.getGameResult.bind(this));
    this.app.get('/api/sports/game/:gameId', this.getSportsGame.bind(this));
    
    // Enhanced crypto data endpoints
    this.app.get('/api/crypto/prices', this.getCryptoPrices.bind(this));
    this.app.get('/api/crypto/prices/:symbol', this.getCryptoPrice.bind(this));
    this.app.get('/api/crypto/popular', this.getPopularCryptos.bind(this));
    this.app.get('/api/crypto/search', this.searchCryptos.bind(this));
    this.app.get('/api/crypto/targets/:coinId', this.getCryptoPriceTargets.bind(this));
    this.app.get('/api/crypto/markets/active', this.getActiveCryptoMarkets.bind(this));
    this.app.get('/api/crypto/markets/pending', this.getPendingCryptoResolutions.bind(this));
    
    // Weather data endpoints
    this.app.get('/api/weather/:location', this.getWeatherData.bind(this));

    // Administrative endpoints
    this.app.get('/api/admin/status', this.getServerStatus.bind(this));
  }

  async start() {
    if (this.isRunning) {
      console.log('Oracle server is already running');
      return;
    }

    try {
      // Connect to database
      await db.connect();
      
      // Start guided fetcher
      await guidedFetcher.start();
      
      // Start HTTP server
      this.server = this.app.listen(this.port, () => {
        console.log(`🌐 Oracle server running on port ${this.port}`);
        this.isRunning = true;
      });

      // Test Coinpaprika connection
      try {
        const testResponse = await this.coinpaprikaService.getPopularCoins();
        if (testResponse.success) {
          console.log(`✅ Coinpaprika API connected - ${testResponse.count} popular coins loaded`);
        } else {
          console.warn(`⚠️ Coinpaprika API test failed: ${testResponse.error}`);
        }
      } catch (error) {
        console.warn(`⚠️ Coinpaprika API test error: ${error.message}`);
      }

    } catch (error) {
      console.error('Failed to start oracle server:', error);
      throw error;
    }
  }

  async stop() {
    this.isRunning = false;
    
    if (this.server) {
      this.server.close();
    }
    
    await guidedFetcher.stop();
    await db.disconnect();
    
    console.log('Oracle server stopped');
  }

  // Market data endpoint
  async getMarketData(req, res) {
    try {
      const { marketId } = req.params;
      
      const data = await this.fetchMarketData(marketId);
      
      res.json({
        success: true,
        marketId,
        data
      });
    } catch (error) {
      console.error('Error fetching market data:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch market data' 
      });
    }
  }

  // Submit outcome endpoint
  async submitOutcome(req, res) {
    try {
      const { marketId, outcome, signature } = req.body;
      
      // Validate signature and submit to blockchain
      // Implementation depends on your oracle architecture

      res.json({
        success: true,
          marketId,
          outcome,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error submitting outcome:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to submit outcome' 
      });
    }
  }

  // Sports endpoints
  async getUpcomingMatches(req, res) {
    try {
      const { limit = 20, date } = req.query;
      
      const targetDate = date || new Date().toISOString().split('T')[0];
      const matches = await guidedFetcher.getMatchesForOddyssey(targetDate);

      res.json({
        success: true,
        data: matches.slice(0, parseInt(limit))
      });
    } catch (error) {
      console.error('Error fetching upcoming matches:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch upcoming matches' 
      });
    }
  }

  async getGameResult(req, res) {
    try {
      const { gameId } = req.params;
      
      const results = await guidedFetcher.getCompletedMatches([gameId]);
      
      if (results.length === 0) {
        return res.status(404).json({ 
        success: false, 
          error: 'Game result not found' 
      });
    }
      
      res.json({
        success: true,
        data: results[0]
      });
    } catch (error) {
      console.error('Error fetching game result:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch game result' 
      });
    }
  }

  async getSportsGame(req, res) {
    try {
      const { gameId } = req.params;
      
      const game = await this.fetchSportsGameData(gameId);
      
      res.json({
        success: true,
        data: game
      });
    } catch (error) {
      console.error('Error fetching sports game:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch sports game' 
      });
    }
  }

  // Enhanced crypto endpoints with real Coinpaprika integration
  async getCryptoPrices(req, res) {
    try {
      const { symbols = 'ALL', limit = 20 } = req.query;
      
      let prices;
      if (symbols === 'ALL') {
        // Get popular coins
        const response = await this.coinpaprikaService.getPopularCoins();
        if (!response.success) {
          throw new Error(response.error);
        }
        prices = response.data.slice(0, parseInt(limit));
      } else {
        prices = await this.fetchCryptoPrices(symbols);
      }
      
      res.json({
        success: true,
        data: prices,
        count: prices.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error fetching crypto prices:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch crypto prices' 
      });
    }
  }

  async getCryptoPrice(req, res) {
    try {
      const { symbol } = req.params;
      
      const price = await this.fetchCryptoPrice(symbol);
      
      if (!price) {
        return res.status(404).json({
          success: false,
          error: `Cryptocurrency ${symbol} not found`
        });
      }
      
      res.json({
        success: true,
        data: price,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error fetching crypto price:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch crypto price' 
      });
    }
  }

  async getPopularCryptos(req, res) {
    try {
      const { limit = 10 } = req.query;
      
      const response = await this.coinpaprikaService.getPopularCoins();
      
      if (!response.success) {
        throw new Error(response.error);
      }
      
      res.json({
        success: true,
        data: response.data.slice(0, parseInt(limit)),
        count: Math.min(response.count, parseInt(limit)),
        timestamp: response.timestamp
      });
    } catch (error) {
      console.error('Error fetching popular cryptos:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch popular cryptocurrencies' 
      });
    }
  }

  async searchCryptos(req, res) {
    try {
      const { q: query, limit = 20 } = req.query;
      
      if (!query) {
        return res.status(400).json({
          success: false,
          error: 'Query parameter "q" is required'
        });
      }
      
      const response = await this.coinpaprikaService.searchCoins(query, parseInt(limit));
      
      res.json({
        success: response.success,
        data: response.data,
        count: response.count,
        query: query,
        error: response.error
      });
    } catch (error) {
      console.error('Error searching cryptos:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to search cryptocurrencies' 
      });
    }
  }

  async getCryptoPriceTargets(req, res) {
    try {
      const { coinId } = req.params;
      const { timeframe = '24h' } = req.query;
      
      const response = await this.coinpaprikaService.generatePriceTargets(coinId);
      
      if (!response.success) {
        return res.status(404).json({
          success: false,
          error: response.error
        });
      }
      
      // Filter targets by timeframe if needed
      let filteredTargets = response.targets;
      if (timeframe !== 'all') {
        // Add timeframe filtering logic if needed
      }
      
      res.json({
        success: true,
        coinId: response.coinId,
        currentPrice: response.currentPrice,
        volatility: response.volatility,
        targets: filteredTargets,
        timeframe: timeframe
      });
    } catch (error) {
      console.error('Error fetching crypto price targets:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch price targets' 
      });
    }
  }

  async getActiveCryptoMarkets(req, res) {
    try {
      const { limit = 50 } = req.query;
      
      const result = await db.query(`
        SELECT * FROM oracle.active_crypto_markets
        ORDER BY end_time ASC
        LIMIT $1
      `, [parseInt(limit)]);
      
      res.json({
        success: true,
        data: result.rows,
        count: result.rows.length
      });
    } catch (error) {
      console.error('Error fetching active crypto markets:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch active crypto markets' 
      });
    }
  }

  async getPendingCryptoResolutions(req, res) {
    try {
      const { limit = 20 } = req.query;
      
      const result = await db.query(`
        SELECT * FROM oracle.pending_crypto_resolutions
        ORDER BY hours_overdue DESC
        LIMIT $1
      `, [parseInt(limit)]);
      
      res.json({
        success: true,
        data: result.rows,
        count: result.rows.length
      });
    } catch (error) {
      console.error('Error fetching pending crypto resolutions:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch pending resolutions' 
      });
    }
  }

  // Weather API integration
  async getWeatherData(req, res) {
    try {
      const { location } = req.params;
      const { date = new Date().toISOString().split('T')[0] } = req.query;
      
      const weather = await this.fetchWeatherData(location, date);
      
      res.json({
        success: true,
        data: weather
      });
    } catch (error) {
      console.error('Error fetching weather data:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch weather data' 
      });
    }
  }

  // Server status endpoint
  async getServerStatus(req, res) {
    try {
      const status = {
        server: {
          isRunning: this.isRunning,
          uptime: process.uptime(),
          port: this.port,
          timestamp: new Date().toISOString()
        },
        database: {
          connected: true // Assume connected if we reach here
        },
        services: {
          guidedFetcher: guidedFetcher.isRunning,
          coinpaprika: 'active'
        }
      };

      // Test Coinpaprika connection
      try {
        const testResponse = await this.coinpaprikaService.getPopularCoins();
        status.services.coinpaprika = testResponse.success ? 'connected' : 'error';
        status.services.coinpaprikaError = testResponse.error;
      } catch (error) {
        status.services.coinpaprika = 'error';
        status.services.coinpaprikaError = error.message;
      }

      res.json({
        success: true,
        data: status
      });
    } catch (error) {
      console.error('Error fetching server status:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch server status' 
      });
    }
  }

  // Data fetching methods
  async fetchMarketData(marketId) {
    // Parse market ID to determine data source
    const marketType = this.parseMarketType(marketId);
    
    switch (marketType) {
      case 'sports':
        return await this.fetchSportsMarketData(marketId);
      case 'crypto':
        return await this.fetchCryptoMarketData(marketId);
      case 'weather':
        return await this.fetchWeatherMarketData(marketId);
      default:
        throw new Error(`Unknown market type: ${marketType}`);
    }
  }

  parseMarketType(marketId) {
    const marketIdStr = marketId.toString();
    if (marketIdStr.includes('sports') || marketIdStr.includes('match')) return 'sports';
    if (marketIdStr.includes('crypto') || marketIdStr.includes('btc') || marketIdStr.includes('eth')) return 'crypto';
    if (marketIdStr.includes('weather')) return 'weather';
    return 'unknown';
  }

  async fetchSportsGameData(gameId) {
    // Mock implementation for sports game data
    return {
      id: gameId,
      homeTeam: 'Team A',
      awayTeam: 'Team B',
      status: 'completed',
      homeScore: 2,
      awayScore: 1,
      winner: 'home'
    };
  }

  async fetchCryptoPrices(symbols) {
    try {
      const symbolList = symbols.split(',').map(s => s.trim().toUpperCase());
      
      // Get popular coins with current prices
      const response = await this.coinpaprikaService.getPopularCoins();
      
      if (!response.success) {
        throw new Error(response.error);
      }
      
      // Filter for requested symbols or return all if no specific symbols
      const filteredCoins = response.data.filter(coin => 
        symbolList.includes('ALL') || symbolList.includes(coin.symbol.toUpperCase())
      );
      
      return filteredCoins.map(coin => ({
        symbol: coin.symbol,
        name: coin.name,
        price: coin.price_usd,
        change24h: coin.percent_change_24h,
        change7d: coin.percent_change_7d,
        marketCap: coin.market_cap,
        volume24h: coin.volume_24h,
        rank: coin.rank,
        volatility: coin.volatility,
        difficulty: coin.prediction_difficulty,
        timestamp: coin.last_updated
      }));
    } catch (error) {
      console.error('Failed to fetch crypto prices:', error);
      // Fallback to empty array
      return [];
    }
  }

  async fetchCryptoPrice(symbol) {
    try {
      const symbolUpper = symbol.toUpperCase();
      
      // Find coin by symbol in popular coins first
      const popularResponse = await this.coinpaprikaService.getPopularCoins();
      
      if (popularResponse.success) {
        const coin = popularResponse.data.find(c => c.symbol.toUpperCase() === symbolUpper);
        
        if (coin) {
          return {
            symbol: coin.symbol,
            name: coin.name,
            price: coin.price_usd,
            change24h: coin.percent_change_24h,
            change7d: coin.percent_change_7d,
            marketCap: coin.market_cap,
            volume24h: coin.volume_24h,
            rank: coin.rank,
            volatility: coin.volatility,
            difficulty: coin.prediction_difficulty,
            timestamp: coin.last_updated
          };
        }
      }
      
      // If not found in popular coins, search all coins
      const searchResponse = await this.coinpaprikaService.searchCoins(symbol, 5);
      
      if (searchResponse.success && searchResponse.data.length > 0) {
        const coinInfo = searchResponse.data[0];
        const tickerResponse = await this.coinpaprikaService.getCoinTicker(coinInfo.id);
        
        if (tickerResponse.success) {
          const coin = tickerResponse.data;
    return {
            symbol: coin.symbol,
            name: coin.name,
            price: coin.price_usd,
            change24h: coin.percent_change_24h,
            change7d: coin.percent_change_7d,
            marketCap: coin.market_cap,
            volume24h: coin.volume_24h,
            rank: coin.rank,
            volatility: coin.volatility,
            difficulty: coin.prediction_difficulty,
            timestamp: coin.last_updated
          };
        }
      }
      
      throw new Error(`Coin ${symbol} not found`);
      
    } catch (error) {
      console.error(`Failed to fetch crypto price for ${symbol}:`, error);
      // Return null to indicate not found
      return null;
    }
  }

  async fetchWeatherData(location, date) {
    // Mock implementation - replace with actual weather API
    return {
      location,
      date,
      temperature: Math.round(Math.random() * 40 - 10), // -10 to 30 degrees
      condition: 'sunny',
      humidity: Math.round(Math.random() * 100),
      windSpeed: Math.round(Math.random() * 30)
    };
  }

  async fetchSportsMarketData(marketId) {
    // Extract game ID from market ID and fetch game data
    return { marketId, type: 'sports', data: null };
  }

  async fetchCryptoMarketData(marketId) {
    try {
      // Parse crypto market ID
      const params = this.coinpaprikaService.parseMarketId(marketId);
      
      // Get current price
      const tickerResponse = await this.coinpaprikaService.getCoinTicker(params.coinId);
      
      if (tickerResponse.success) {
        const currentPrice = tickerResponse.data.price_usd;
        
        // Validate prediction
        const validation = await this.coinpaprikaService.validatePredictionResolution(
          marketId, currentPrice
        );
        
        return {
          marketId,
          type: 'crypto',
          params,
          currentPrice,
          validation
        };
      }
      
      return { marketId, type: 'crypto', error: 'Failed to fetch price data' };
    } catch (error) {
      console.error('Failed to fetch crypto market data:', error);
      return { marketId, type: 'crypto', error: error.message };
    }
  }

  async fetchWeatherMarketData(marketId) {
    // Extract location and condition from market ID
    return { marketId, type: 'weather', data: null };
  }

  startPeriodicUpdates() {
    console.log('Starting periodic oracle updates...');
    
    // Start periodic data updates every 5 minutes
    setInterval(async () => {
      try {
        console.log('Running periodic oracle update...');
        // Add periodic update logic here
      } catch (error) {
        console.error('Error in periodic update:', error);
      }
    }, 5 * 60 * 1000); // 5 minutes
  }
}

// Initialize and export
const oracleServer = new OracleServer();
    
// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down gracefully...');
  await oracleServer.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  await oracleServer.stop();
  process.exit(0);
});

module.exports = oracleServer; 