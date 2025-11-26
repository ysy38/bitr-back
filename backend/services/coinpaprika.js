const fetch = require('node-fetch');

class CoinpaprikaService {
  constructor() {
    this.baseUrl = 'https://api.coinpaprika.com/v1';
    this.rateLimitDelay = 1000; // 1 second between requests
    this.timeout = 30000; // 30 seconds
    this.retryAttempts = 3;
    this.lastRequestTime = 0;
    this.lastTickerCache = null;
    this.lastTickerTimestamp = null;
    
    // Popular coins for prediction markets
    this.popularCoins = [
      { id: 'btc-bitcoin', symbol: 'BTC', name: 'Bitcoin' },
      { id: 'eth-ethereum', symbol: 'ETH', name: 'Ethereum' },
      { id: 'sol-solana', symbol: 'SOL', name: 'Solana' },
      { id: 'ada-cardano', symbol: 'ADA', name: 'Cardano' },
      { id: 'matic-polygon', symbol: 'MATIC', name: 'Polygon' },
      { id: 'avax-avalanche', symbol: 'AVAX', name: 'Avalanche' },
      { id: 'dot-polkadot', symbol: 'DOT', name: 'Polkadot' },
      { id: 'link-chainlink', symbol: 'LINK', name: 'Chainlink' },
      { id: 'uni-uniswap', symbol: 'UNI', name: 'Uniswap' },
      { id: 'ltc-litecoin', symbol: 'LTC', name: 'Litecoin' }
    ];
  }

  /**
   * Make rate-limited request to Coinpaprika API
   */
  async makeRequest(endpoint, params = {}) {
    try {
      // Rate limiting
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      if (timeSinceLastRequest < this.rateLimitDelay) {
        await new Promise(resolve => 
          setTimeout(resolve, this.rateLimitDelay - timeSinceLastRequest)
        );
      }

      const url = new URL(`${this.baseUrl}${endpoint}`);
      Object.keys(params).forEach(key => {
        if (params[key] !== undefined && params[key] !== null) {
          url.searchParams.append(key, params[key].toString());
        }
      });

      console.log(`🔗 Coinpaprika API: ${url.toString()}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url.toString(), {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Bitredict/1.0'
        }
      });

      clearTimeout(timeoutId);
      this.lastRequestTime = Date.now();

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data;

    } catch (error) {
      console.error(`Coinpaprika API error for ${endpoint}:`, error.message);
      throw new Error(`Coinpaprika API request failed: ${error.message}`);
    }
  }

  /**
   * Get all coins with prices (tickers endpoint)
   */
  async getAllTickers(limit = 500) {
    try {
      const params = {};
      if (limit) params.limit = limit;

      const data = await this.makeRequest('/tickers', params);
      
      const mappedData = data.map(coin => ({
          id: coin.id,
          name: coin.name,
          symbol: coin.symbol,
          rank: coin.rank,
          price_usd: coin.quotes?.USD?.price || 0,
          market_cap: coin.quotes?.USD?.market_cap || 0,
          volume_24h: coin.quotes?.USD?.volume_24h || 0,
          percent_change_1h: coin.quotes?.USD?.percent_change_1h || 0,
          percent_change_24h: coin.quotes?.USD?.percent_change_24h || 0,
          percent_change_7d: coin.quotes?.USD?.percent_change_7d || 0,
          circulating_supply: coin.circulating_supply || 0,
          total_supply: coin.total_supply || 0,
          max_supply: coin.max_supply || 0,
          logo_url: `https://static.coinpaprika.com/coin/${coin.id}/logo.png`,
          volatility: this.calculateVolatility(coin.quotes?.USD),
          prediction_difficulty: this.calculatePredictionDifficulty(coin),
          last_updated: coin.last_updated
        }));

      this.lastTickerCache = mappedData;
      this.lastTickerTimestamp = new Date().toISOString();
      
      return {
        success: true,
        data: mappedData,
        count: mappedData.length,
        timestamp: this.lastTickerTimestamp,
        isCached: false
      };
    } catch (error) {
      console.error('Failed to fetch all tickers:', error);
      
      if (this.lastTickerCache && this.lastTickerCache.length) {
        console.warn('⚠️ Using cached Coinpaprika tickers due to API failure');
        return {
          success: true,
          data: this.lastTickerCache,
          count: this.lastTickerCache.length,
          timestamp: this.lastTickerTimestamp,
          isCached: true,
          error: error.message
        };
      }

      return {
        success: false,
        error: error.message,
        data: [],
        count: 0
      };
    }
  }

  /**
   * Get popular coins for prediction markets
   */
  async getPopularCoins() {
    try {
      // Get top 500 coins (should include all popular ones)
      const data = await this.makeRequest('/tickers', { limit: 500, quotes: 'USD' });
      
      // Filter to only popular coins and ensure we have the essential ones
      const popularData = data.filter(coin => 
        this.popularCoins.some(popular => popular.id === coin.id)
      );

      // If we didn't get enough popular coins, fetch the top 50 by rank
      if (popularData.length < 4) {
        // Fallback: use the first 50 coins from the top 500
        return data.slice(0, 50).map(coin => ({
          id: coin.id,
          name: coin.name,
          symbol: coin.symbol,
          rank: coin.rank,
          price_usd: coin.quotes?.USD?.price || 0,
          market_cap: coin.quotes?.USD?.market_cap || 0,
          volume_24h: coin.quotes?.USD?.volume_24h || 0,
          percent_change_1h: coin.quotes?.USD?.percent_change_1h || 0,
          percent_change_24h: coin.quotes?.USD?.percent_change_24h || 0,
          percent_change_7d: coin.quotes?.USD?.percent_change_7d || 0,
          logo_url: `https://static.coinpaprika.com/coin/${coin.id}/logo.png`,
          volatility: this.calculateVolatility(coin.quotes?.USD),
          prediction_difficulty: this.calculatePredictionDifficulty(coin),
          last_updated: coin.last_updated
        }));
      }

      // Sort by rank
      popularData.sort((a, b) => (a.rank || 999) - (b.rank || 999));

      return popularData.map(coin => ({
        id: coin.id,
        name: coin.name,
        symbol: coin.symbol,
        rank: coin.rank,
        price_usd: coin.quotes?.USD?.price || 0,
        market_cap: coin.quotes?.USD?.market_cap || 0,
        volume_24h: coin.quotes?.USD?.volume_24h || 0,
        percent_change_1h: coin.quotes?.USD?.percent_change_1h || 0,
        percent_change_24h: coin.quotes?.USD?.percent_change_24h || 0,
        percent_change_7d: coin.quotes?.USD?.percent_change_7d || 0,
        logo_url: `https://static.coinpaprika.com/coin/${coin.id}/logo.png`,
        volatility: this.calculateVolatility(coin.quotes?.USD),
        prediction_difficulty: this.calculatePredictionDifficulty(coin),
        last_updated: coin.last_updated
      }));
    } catch (error) {
      console.error('Failed to fetch popular coins:', error);
      return [];
    }
  }

  /**
   * Get specific coin ticker by ID
   */
  async getCoinTicker(coinId) {
    try {
      const data = await this.makeRequest(`/tickers/${coinId}`, { quotes: 'USD' });
      
      return {
        success: true,
        data: {
          id: data.id,
          name: data.name,
          symbol: data.symbol,
          rank: data.rank,
          price_usd: data.quotes?.USD?.price || 0,
          market_cap: data.quotes?.USD?.market_cap || 0,
          volume_24h: data.quotes?.USD?.volume_24h || 0,
          percent_change_1h: data.quotes?.USD?.percent_change_1h || 0,
          percent_change_24h: data.quotes?.USD?.percent_change_24h || 0,
          percent_change_7d: data.quotes?.USD?.percent_change_7d || 0,
          ath_price: data.quotes?.USD?.ath_price || 0,
          ath_date: data.quotes?.USD?.ath_date,
          circulating_supply: data.circulating_supply || 0,
          total_supply: data.total_supply || 0,
          max_supply: data.max_supply || 0,
          beta_value: data.beta_value || 0,
          volatility: this.calculateVolatility(data.quotes?.USD),
          prediction_difficulty: this.calculatePredictionDifficulty(data),
          last_updated: data.last_updated
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error(`Failed to fetch ticker for ${coinId}:`, error);
      return {
        success: false,
        error: error.message,
        data: null
      };
    }
  }

  /**
   * Get coin information (metadata)
   */
  async getCoinInfo(coinId) {
    try {
      const data = await this.makeRequest(`/coins/${coinId}`);
      
      return {
        success: true,
        data: {
          id: data.id,
          name: data.name,
          symbol: data.symbol,
          rank: data.rank,
          type: data.type,
          description: data.description,
          message: data.message,
          open_source: data.open_source,
          started_at: data.started_at,
          development_status: data.development_status,
          hardware_wallet: data.hardware_wallet,
          proof_type: data.proof_type,
          org_structure: data.org_structure,
          hash_algorithm: data.hash_algorithm,
          links: data.links,
          links_extended: data.links_extended,
          whitepaper: data.whitepaper,
          first_data_at: data.first_data_at,
          last_data_at: data.last_data_at
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error(`Failed to fetch coin info for ${coinId}:`, error);
      return {
        success: false,
        error: error.message,
        data: null
      };
    }
  }

  /**
   * Get historical price data for a coin
   */
  async getCoinHistoricalData(coinId, start, end, limit = 1000) {
    try {
      const params = {};
      if (start) params.start = start;
      if (end) params.end = end;
      if (limit) params.limit = limit;

      const data = await this.makeRequest(`/tickers/${coinId}/historical`, params);
      
      return {
        success: true,
        data: data.map(point => ({
          timestamp: point.timestamp,
          price: point.price,
          volume_24h: point.volume_24h,
          market_cap: point.market_cap
        })),
        count: data.length,
        coin_id: coinId
      };
    } catch (error) {
      console.error(`Failed to fetch historical data for ${coinId}:`, error);
      return {
        success: false,
        error: error.message,
        data: [],
        count: 0
      };
    }
  }

  /**
   * Search coins by name or symbol
   */
  async searchCoins(query, limit = 20) {
    try {
      const allCoins = await this.makeRequest('/coins');
      
      const searchResults = allCoins
        .filter(coin => 
          coin.name.toLowerCase().includes(query.toLowerCase()) ||
          coin.symbol.toLowerCase().includes(query.toLowerCase()) ||
          coin.id.toLowerCase().includes(query.toLowerCase())
        )
        .slice(0, limit);

      return {
        success: true,
        data: searchResults.map(coin => ({
          id: coin.id,
          name: coin.name,
          symbol: coin.symbol,
          rank: coin.rank,
          type: coin.type,
          is_active: coin.is_active,
          is_new: coin.is_new
        })),
        count: searchResults.length,
        query: query
      };
    } catch (error) {
      console.error(`Failed to search coins for "${query}":`, error);
      return {
        success: false,
        error: error.message,
        data: [],
        count: 0
      };
    }
  }

  /**
   * Calculate volatility based on price changes
   */
  calculateVolatility(quotes) {
    if (!quotes) return 0;
    
    const changes = [
      Math.abs(quotes.percent_change_1h || 0),
      Math.abs(quotes.percent_change_24h || 0),
      Math.abs(quotes.percent_change_7d || 0)
    ];
    
    // Weighted average (more weight on recent changes)
    return (changes[0] * 0.5 + changes[1] * 0.3 + changes[2] * 0.2);
  }

  /**
   * Calculate prediction difficulty based on volatility and market cap
   */
  calculatePredictionDifficulty(coin) {
    const quotes = coin.quotes?.USD;
    if (!quotes) return 'unknown';
    
    const volatility = this.calculateVolatility(quotes);
    const marketCap = quotes.market_cap || 0;
    
    // High market cap, low volatility = Easy
    // Low market cap, high volatility = Hard
    if (marketCap > 10000000000 && volatility < 5) return 'easy';      // >10B cap, <5% volatility
    if (marketCap > 1000000000 && volatility < 10) return 'medium';    // >1B cap, <10% volatility
    if (marketCap > 100000000 && volatility < 15) return 'medium';     // >100M cap, <15% volatility
    return 'hard';
  }

  /**
   * Generate market ID for crypto prediction
   * Format: crypto-{coinId}-{targetPrice}-{direction}-{timeframe}
   * Example: crypto-btc-bitcoin-50000-above-24h
   */
  generateMarketId(coinId, targetPrice, direction, timeframe) {
    return `crypto-${coinId}-${targetPrice}-${direction}-${timeframe}`;
  }

  /**
   * Parse market ID to extract prediction parameters
   */
  parseMarketId(marketId) {
    const parts = marketId.split('-');
    if (parts.length < 5 || parts[0] !== 'crypto') {
      throw new Error('Invalid crypto market ID format');
    }
    
    return {
      type: 'crypto',
      coinId: `${parts[1]}-${parts[2]}`, // Reconstruct full coin ID
      targetPrice: parseFloat(parts[3]),
      direction: parts[4], // 'above' or 'below'
      timeframe: parts[5]  // '1h', '24h', '7d'
    };
  }

  /**
   * Validate if a prediction market should resolve
   */
  async validatePredictionResolution(marketId, currentPrice) {
    try {
      const params = this.parseMarketId(marketId);
      const { targetPrice, direction } = params;
      
      let result;
      if (direction === 'above') {
        result = currentPrice >= targetPrice ? 'YES' : 'NO';
      } else if (direction === 'below') {
        result = currentPrice <= targetPrice ? 'YES' : 'NO';
      } else {
        throw new Error(`Invalid direction: ${direction}`);
      }

      return {
        success: true,
        marketId,
        currentPrice,
        targetPrice,
        direction,
        result,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error(`Failed to validate prediction for ${marketId}:`, error);
      return {
        success: false,
        error: error.message,
        marketId
      };
    }
  }

  /**
   * Get price targets for a coin based on current price and volatility
   */
  async generatePriceTargets(coinId) {
    try {
      const tickerResponse = await this.getCoinTicker(coinId);
      if (!tickerResponse.success) {
        throw new Error('Failed to fetch coin ticker');
      }

      const coin = tickerResponse.data;
      const currentPrice = coin.price_usd;
      const volatility = coin.volatility;

      // Generate reasonable targets based on volatility
      const targets = [];
      const percentages = [5, 10, 15, 25, 50]; // Percentage changes

      for (const percentage of percentages) {
        const adjustedPercentage = Math.max(percentage, volatility * 2); // At least 2x volatility
        
        targets.push({
          direction: 'above',
          targetPrice: currentPrice * (1 + adjustedPercentage / 100),
          percentage: adjustedPercentage,
          difficulty: adjustedPercentage <= 10 ? 'easy' : adjustedPercentage <= 25 ? 'medium' : 'hard'
        });

        targets.push({
          direction: 'below',
          targetPrice: currentPrice * (1 - adjustedPercentage / 100),
          percentage: adjustedPercentage,
          difficulty: adjustedPercentage <= 10 ? 'easy' : adjustedPercentage <= 25 ? 'medium' : 'hard'
        });
      }

      return {
        success: true,
        coinId,
        currentPrice,
        volatility,
        targets: targets.sort((a, b) => a.percentage - b.percentage)
      };
    } catch (error) {
      console.error(`Failed to generate price targets for ${coinId}:`, error);
      return {
        success: false,
        error: error.message,
        targets: []
      };
    }
  }

  /**
   * Find coin ID by symbol
   */
  async findCoinIdBySymbol(symbol) {
    try {
      const upperSymbol = symbol.toUpperCase();
      
      // Check popular coins first
      const popularCoin = this.popularCoins.find(coin => 
        coin.symbol.toUpperCase() === upperSymbol
      );
      if (popularCoin) {
        return popularCoin.id;
      }

      // Search all coins
      const searchResults = await this.searchCoins(symbol);
      // searchCoins returns { success: true, data: [...] }
      if (!searchResults.success || !searchResults.data || !Array.isArray(searchResults.data)) {
        console.warn(`⚠️ searchCoins returned invalid data for symbol ${symbol}:`, searchResults);
        return null;
      }
      const exactMatch = searchResults.data.find(coin => 
        coin.symbol.toUpperCase() === upperSymbol
      );
      
      return exactMatch ? exactMatch.id : null;
    } catch (error) {
      console.error(`Failed to find coin ID for symbol ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Get active crypto prediction markets
   */
  async getActiveCryptoMarkets() {
    try {
      // This would typically query a database table
      // For now, return empty array as placeholder
      return [];
    } catch (error) {
      console.error('Failed to get active crypto markets:', error);
      return [];
    }
  }

  /**
   * Get pending crypto resolutions
   */
  async getPendingCryptoResolutions() {
    try {
      // This would typically query a database table
      // For now, return empty array as placeholder
      return [];
    } catch (error) {
      console.error('Failed to get pending crypto resolutions:', error);
      return [];
    }
  }

  /**
   * Create a prediction market
   */
  async createPredictionMarket(marketData) {
    try {
      const { coinId, targetPrice, direction, timeframe, poolId } = marketData;
      
      // Generate market ID
      const marketId = `crypto-${coinId}-${targetPrice}-${direction}-${timeframe}`;
      
      // This would typically save to database
      const market = {
        id: marketId,
        coinId,
        targetPrice,
        direction,
        timeframe,
        poolId,
        createdAt: new Date().toISOString()
      };

      console.log('Created crypto prediction market:', market);
      return market;
    } catch (error) {
      console.error('Failed to create prediction market:', error);
      throw error;
    }
  }

  /**
   * Get health status of the service
   */
  async getHealthStatus() {
    try {
      // Test API connectivity
      const testEndpoint = '/tickers/btc-bitcoin';
      await this.makeRequest(testEndpoint);
      
      return {
        status: 'healthy',
        apiConnectivity: 'ok',
        lastUpdate: new Date().toISOString(),
        popularCoinsCount: this.popularCoins.length
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        apiConnectivity: 'failed',
        error: error.message,
        lastUpdate: new Date().toISOString()
      };
    }
  }
}

module.exports = CoinpaprikaService; 