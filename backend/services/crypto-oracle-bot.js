const { ethers } = require('ethers');
const CoinpaprikaService = require('./coinpaprika');
const db = require('../db/db');
const config = require('../config');

class CryptoOracleBot {
  constructor() {
    this.coinpaprikaService = new CoinpaprikaService();
    this.isRunning = false;
    this.updateInterval = 5 * 60 * 1000; // 5 minutes
    this.resolutionInterval = 2 * 60 * 1000; // 2 minutes
    this.priceUpdateInterval = null;
    this.resolutionCheckInterval = null;
    
    // Initialize web3 connection for oracle submission
    this.provider = new ethers.JsonRpcProvider(process.env.BLOCKCHAIN_RPC_URL || process.env.RPC_URL);
    this.wallet = new ethers.Wallet(process.env.ORACLE_PRIVATE_KEY || process.env.ORACLE_SIGNER_PRIVATE_KEY, this.provider);
    
    // Contract addresses and ABIs
    this.guidedOracleAddress = process.env.GUIDED_ORACLE_ADDRESS;
    this.guidedOracleABI = [
      "function submitOutcome(bytes32 marketId, bytes calldata resultData) external",
      "function getOutcome(bytes32 marketId) external view returns (bool isSet, bytes memory resultData)",
      "function oracleBot() external view returns (address)"
    ];
    this.guidedOracleContract = new ethers.Contract(
      this.guidedOracleAddress,
      this.guidedOracleABI,
      this.wallet
    );
  }

  /**
   * Start the crypto oracle bot
   */
  async start() {
    if (this.isRunning) {
      console.log('Crypto Oracle Bot is already running');
      return;
    }

    this.isRunning = true;
    console.log('🚀 Starting Crypto Oracle Bot...');

    try {
      // Verify oracle bot wallet
      const botAddress = await this.wallet.getAddress();
      console.log(`Oracle bot wallet: ${botAddress}`);

      // Check if this wallet is authorized in the contract
      const authorizedBot = await this.guidedOracleContract.oracleBot();
      if (botAddress.toLowerCase() !== authorizedBot.toLowerCase()) {
        console.warn(`⚠️ Warning: Wallet ${botAddress} is not the authorized oracle bot (${authorizedBot})`);
      }

      // Start periodic operations
      await this.startPeriodicOperations();
      
      console.log('✅ Crypto Oracle Bot started successfully');
    } catch (error) {
      console.error('❌ Failed to start Crypto Oracle Bot:', error);
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Stop the crypto oracle bot
   */
  async stop() {
    this.isRunning = false;
    
    if (this.priceUpdateInterval) {
      clearInterval(this.priceUpdateInterval);
      this.priceUpdateInterval = null;
    }
    
    if (this.resolutionCheckInterval) {
      clearInterval(this.resolutionCheckInterval);
      this.resolutionCheckInterval = null;
    }
    
    console.log('🛑 Crypto Oracle Bot stopped');
  }

  /**
   * Start periodic price updates and market resolution checks
   */
  async startPeriodicOperations() {
    // Update crypto prices every 5 minutes
    this.priceUpdateInterval = setInterval(async () => {
      if (!this.isRunning) return;
      
      try {
        await this.updateCryptoPrices();
      } catch (error) {
        console.error('Error in price update cycle:', error);
      }
    }, this.updateInterval);

    // Check for market resolutions every 2 minutes
    this.resolutionCheckInterval = setInterval(async () => {
      if (!this.isRunning) return;
      
      try {
        await this.checkAndResolveMarkets();
      } catch (error) {
        console.error('Error in resolution cycle:', error);
      }
    }, this.resolutionInterval);

    // Run initial updates
    setTimeout(async () => {
      await this.updateCryptoPrices();
      await this.checkAndResolveMarkets();
    }, 5000);
  }

  /**
   * Update crypto prices from Coinpaprika API
   */
  async updateCryptoPrices() {
    console.log('📊 Updating crypto prices...');
    
    try {
      const startTime = Date.now();
      
      // Get all active coins from database
      const result = await db.query(`
        SELECT coinpaprika_id, symbol, name 
        FROM oracle.crypto_coins 
        WHERE is_active = true
        ORDER BY is_popular DESC, rank ASC NULLS LAST
      `);

      if (result.rows.length === 0) {
        console.log('No active coins to update');
        return;
      }

      console.log(`Updating prices for ${result.rows.length} coins...`);

      // Get popular coins data (includes all our tracked coins)
      const tickersResponse = await this.coinpaprikaService.getAllTickers(500);
      
      if (!tickersResponse.success) {
        console.warn(`⚠️ Skipping crypto price update - tickers unavailable: ${tickersResponse.error}`);
        return;
      }

      if (!tickersResponse.data || tickersResponse.data.length === 0) {
        console.warn('⚠️ Coinpaprika returned no ticker data. Skipping snapshot insert.');
        return;
      }

      if (tickersResponse.isCached) {
        console.warn('⚠️ Coinpaprika API down. Using cached tickers for read endpoints but skipping new DB snapshots.');
        return;
      }

      let updatedCount = 0;
      const batchSize = 10;
      
      // Process in batches to avoid overwhelming the database
      for (let i = 0; i < result.rows.length; i += batchSize) {
        const batch = result.rows.slice(i, i + batchSize);
        
        for (const coin of batch) {
          try {
            // Find ticker data for this coin
            const tickerData = tickersResponse.data.find(
              ticker => ticker.id === coin.coinpaprika_id
            );

            if (!tickerData) {
              console.warn(`No ticker data found for ${coin.coinpaprika_id}`);
              continue;
            }

            // Insert price snapshot
            await db.query(`
              INSERT INTO oracle.crypto_price_snapshots (
                coinpaprika_id, price_usd, market_cap, volume_24h,
                circulating_supply, total_supply, max_supply,
                percent_change_1h, percent_change_24h, percent_change_7d,
                ath_price, beta_value, last_updated
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            `, [
              coin.coinpaprika_id,
              tickerData.price_usd,
              tickerData.market_cap,
              tickerData.volume_24h,
              tickerData.circulating_supply,
              tickerData.total_supply,
              tickerData.max_supply,
              tickerData.percent_change_1h,
              tickerData.percent_change_24h,
              tickerData.percent_change_7d,
              null, // ath_price - would need separate API call
              null, // beta_value - would need separate API call
              tickerData.last_updated
            ]);

            updatedCount++;
            
          } catch (error) {
            console.error(`Failed to update price for ${coin.coinpaprika_id}:`, error);
          }
        }

        // Small delay between batches
        if (i + batchSize < result.rows.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      const endTime = Date.now();
      console.log(`✅ Updated ${updatedCount}/${result.rows.length} crypto prices in ${endTime - startTime}ms`);

      // Update market statistics
      await this.updateMarketStatistics();

    } catch (error) {
      console.error('❌ Failed to update crypto prices:', error);
    }
  }

  /**
   * Check main pools table for GUIDED oracle crypto pools that need resolution
   */
  async checkMainPoolsForResolution() {
    console.log('🔍 Checking main pools table for GUIDED oracle crypto pools...');
    
    try {
      // Get GUIDED oracle crypto pools that need resolution
      const result = await db.query(`
        SELECT 
          p.pool_id,
          p.title,
          p.market_id,
          p.predicted_outcome,
          p.event_end_time,
          p.league,
          p.home_team,
          p.away_team,
          p.oracle_type,
          p.status
        FROM oracle.pools p
        WHERE p.oracle_type = 0  -- GUIDED oracle
          AND p.category = 'crypto'
          AND TO_TIMESTAMP(p.event_end_time) <= NOW()
          AND p.status = 'active'
          -- Check if outcome already submitted to contract
          AND NOT EXISTS (
            SELECT 1 FROM public.oracle_submissions os
            WHERE os.match_id = p.market_id
          )
        ORDER BY p.event_end_time ASC
        LIMIT 10
      `);

      if (result.rows.length === 0) {
        console.log('No main crypto pools need resolution');
        return;
      }

      console.log(`📋 Found ${result.rows.length} main crypto pools needing oracle submission to contract`);

      for (const pool of result.rows) {
        try {
          await this.resolveMainCryptoPool(pool);
        } catch (error) {
          console.error(`Failed to resolve main crypto pool ${pool.pool_id}:`, error);
        }
      }

    } catch (error) {
      console.error('❌ Failed to check main crypto pools for resolution:', error);
    }
  }

  /**
   * Resolve a main crypto pool
   */
  async resolveMainCryptoPool(pool) {
    console.log(`🎯 Resolving main crypto pool: ${pool.pool_id} (${pool.title})`);

    try {
      // ✅ FIX: Parse prediction and fetch real price
      let symbol, targetPrice, isAbove;
      
      // Try to extract from predicted_outcome like "SOL above $195"
      const outcomeMatch = pool.predicted_outcome.match(/(\w+)\s+(above|below)\s+\$?(\d+(?:\.\d+)?)/i);
      if (outcomeMatch) {
        const [, sym, direction, price] = outcomeMatch;
        symbol = sym.toUpperCase();
        targetPrice = parseFloat(price);
        isAbove = direction.toLowerCase() === 'above';
      } else if (pool.home_team) {
        // Fallback: use home_team as symbol
        symbol = pool.home_team.toUpperCase();
        const priceMatch = pool.predicted_outcome.match(/\$?(\d+(?:\.\d+)?)/);
        if (priceMatch) {
          targetPrice = parseFloat(priceMatch[1]);
          isAbove = pool.predicted_outcome.toLowerCase().includes('above');
        }
      }
      
      if (!symbol || !targetPrice) {
        console.log(`  ⚠️ Cannot parse crypto prediction: ${pool.predicted_outcome}`);
        throw new Error(`Cannot parse crypto prediction: ${pool.predicted_outcome}`);
      }
      
      // Fetch real price from Coinpaprika
      const coinId = await this.coinpaprikaService.findCoinIdBySymbol(symbol);
      if (!coinId) {
        throw new Error(`Cannot find coin ID for symbol: ${symbol}`);
      }
      
      console.log(`  🔍 Fetching ${symbol} price (${coinId}) from Coinpaprika...`);
      
      const tickerResponse = await this.coinpaprikaService.getCoinTicker(coinId);
      if (!tickerResponse.success || !tickerResponse.data) {
        throw new Error(`Failed to fetch ${symbol} price from Coinpaprika`);
      }
      
      const currentPrice = parseFloat(tickerResponse.data.price_usd);
      console.log(`  📊 ${symbol} Current Price: $${currentPrice}, Target: $${targetPrice}, Direction: ${isAbove ? 'above' : 'below'}`);
      
      // Determine outcome matching the prediction format
      let outcome;
      if (isAbove) {
        if (currentPrice >= targetPrice) {
          outcome = `${symbol} above $${targetPrice}`;
        } else {
          outcome = `${symbol} below $${targetPrice}`;
        }
      } else {
        if (currentPrice <= targetPrice) {
          outcome = `${symbol} below $${targetPrice}`;
        } else {
          outcome = `${symbol} above $${targetPrice}`;
        }
      }
      
      console.log(`  ✅ Crypto pool outcome: ${outcome} (Current: $${currentPrice})`);

      // Submit to guided oracle contract
      const marketIdBytes32 = ethers.id(pool.market_id);
      const resultData = ethers.toUtf8Bytes(outcome);

      console.log(`📡 Submitting crypto pool to guided oracle: ${marketIdBytes32} -> ${outcome}`);

      // Check if outcome already exists
      const [isSet] = await this.guidedOracleContract.getOutcome(marketIdBytes32);
      
      if (isSet) {
        console.log(`⚠️ Outcome already set for crypto pool ${pool.pool_id}`);
      } else {
        // Estimate gas and submit
        const gasEstimate = await this.guidedOracleContract.submitOutcome.estimateGas(
          marketIdBytes32,
          resultData
        );

        const tx = await this.guidedOracleContract.submitOutcome(
          marketIdBytes32,
          resultData,
          {
            gasLimit: gasEstimate * 110n / 100n, // Add 10% buffer
            gasPrice: ethers.parseUnits('20', 'gwei')
          }
        );

        console.log(`📤 Crypto pool transaction submitted: ${tx.hash}`);
        const receipt = await tx.wait();
        console.log(`✅ Crypto pool transaction confirmed in block ${receipt.blockNumber}`);
      }

      // Record the submission
      await db.query(`
        INSERT INTO public.oracle_submissions (
          match_id, outcome, submitted_at, oracle_type
        ) VALUES ($1, $2, NOW(), 'crypto')
        ON CONFLICT (match_id) DO UPDATE SET
          outcome = EXCLUDED.outcome,
          submitted_at = EXCLUDED.submitted_at
      `, [pool.market_id, outcome]);

      console.log(`✅ Successfully resolved main crypto pool ${pool.pool_id} with outcome: ${outcome}`);

    } catch (error) {
      console.error(`❌ Failed to resolve main crypto pool ${pool.pool_id}:`, error);
      throw error;
    }
  }

  /**
   * Check for markets that need resolution
   */
  async checkAndResolveMarkets() {
    console.log('🔍 Checking for markets needing resolution...');
    
    try {
      // First check main pools table for GUIDED oracle crypto pools
      await this.checkMainPoolsForResolution();
      
      // Then check crypto_prediction_markets table
      const result = await db.query(`
        SELECT 
          cpm.id,
          cpm.market_id,
          cpm.coinpaprika_id,
          cpm.target_price,
          cpm.direction,
          cpm.start_price,
          cpm.end_time,
          cc.symbol,
          cc.name,
          cps.price_usd as current_price
        FROM oracle.crypto_prediction_markets cpm
        JOIN oracle.crypto_coins cc ON cpm.coinpaprika_id = cc.coinpaprika_id
        LEFT JOIN LATERAL (
          SELECT price_usd FROM oracle.crypto_price_snapshots 
          WHERE coinpaprika_id = cpm.coinpaprika_id 
          ORDER BY created_at DESC 
          LIMIT 1
        ) cps ON true
        WHERE cpm.resolved = false 
          AND cpm.end_time <= NOW()
        ORDER BY cpm.end_time ASC
        LIMIT 20
      `);

      if (result.rows.length === 0) {
        console.log('No markets need resolution');
        return;
      }

      console.log(`📋 Found ${result.rows.length} markets needing resolution`);

      for (const market of result.rows) {
        try {
          await this.resolveMarket(market);
        } catch (error) {
          console.error(`Failed to resolve market ${market.market_id}:`, error);
          
          // Log the failure
          await db.query(`
            INSERT INTO oracle.crypto_resolution_logs (
              market_id, coinpaprika_id, target_price, current_price,
              direction, success, error_message
            ) VALUES ($1, $2, $3, $4, $5, false, $6)
          `, [
            market.market_id,
            market.coinpaprika_id,
            market.target_price,
            market.current_price,
            market.direction,
            error.message
          ]);
        }
      }

    } catch (error) {
      console.error('❌ Failed to check markets for resolution:', error);
    }
  }

  /**
   * Resolve a specific market
   */
  async resolveMarket(market) {
    const startTime = Date.now();
    console.log(`🎯 Resolving market: ${market.market_id} (${market.symbol} ${market.direction} $${market.target_price})`);

    if (!market.current_price) {
      throw new Error('No current price data available');
    }

    // Determine outcome
    let result;
    if (market.direction === 'above') {
      result = market.current_price >= market.target_price ? 'YES' : 'NO';
    } else if (market.direction === 'below') {
      result = market.current_price <= market.target_price ? 'YES' : 'NO';
    } else {
      throw new Error(`Invalid direction: ${market.direction}`);
    }

    console.log(`💡 Market outcome: ${result} (current: $${market.current_price}, target: $${market.target_price})`);

    try {
      // Update database first
      await db.query(`
        UPDATE oracle.crypto_prediction_markets 
        SET resolved = true, 
            final_price = $1, 
            result = $2, 
            resolved_at = NOW(),
            updated_at = NOW()
        WHERE id = $3
      `, [market.current_price, result, market.id]);

      // Submit to guided oracle contract
      const marketIdBytes32 = ethers.id(market.market_id);
      const resultData = ethers.toUtf8Bytes(result);

      console.log(`📡 Submitting to guided oracle: ${marketIdBytes32} -> ${result}`);

      // Check if outcome already exists
      const [isSet] = await this.guidedOracleContract.getOutcome(marketIdBytes32);
      
      if (isSet) {
        console.log(`⚠️ Outcome already set for market ${market.market_id}`);
      } else {
        // Estimate gas and submit
        const gasEstimate = await this.guidedOracleContract.submitOutcome.estimateGas(
          marketIdBytes32,
          resultData
        );

        const tx = await this.guidedOracleContract.submitOutcome(
          marketIdBytes32,
          resultData,
          {
            gasLimit: gasEstimate * 110n / 100n, // Add 10% buffer
            gasPrice: ethers.parseUnits('20', 'gwei')
          }
        );

        console.log(`📤 Transaction submitted: ${tx.hash}`);
        const receipt = await tx.wait();
        console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);
      }

      const endTime = Date.now();

      // Log successful resolution
      await db.query(`
        INSERT INTO oracle.crypto_resolution_logs (
          market_id, coinpaprika_id, target_price, current_price,
          direction, result, success, processing_time_ms
        ) VALUES ($1, $2, $3, $4, $5, $6, true, $7)
      `, [
        market.market_id,
        market.coinpaprika_id,
        market.target_price,
        market.current_price,
        market.direction,
        result,
        endTime - startTime
      ]);

      console.log(`✅ Successfully resolved market ${market.market_id} with result: ${result}`);

    } catch (error) {
      // Rollback database changes on contract failure
      await db.query(`
        UPDATE oracle.crypto_prediction_markets 
        SET resolved = false, 
            final_price = NULL, 
            result = NULL, 
            resolved_at = NULL,
            updated_at = NOW()
        WHERE id = $1
      `, [market.id]);

      throw error;
    }
  }

  /**
   * Update daily market statistics
   */
  async updateMarketStatistics() {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Get daily stats for each tracked coin
      const result = await db.query(`
        WITH latest_data AS (
          SELECT DISTINCT ON (coinpaprika_id)
            coinpaprika_id,
            volume_24h,
            market_cap
          FROM oracle.crypto_price_snapshots
          WHERE DATE(created_at) = $1
          ORDER BY coinpaprika_id, created_at DESC
        ),
        daily_stats AS (
          SELECT 
            coinpaprika_id,
            MIN(price_usd) as min_price,
            MAX(price_usd) as max_price,
            AVG(price_usd) as avg_price,
            STDDEV(price_usd) as price_stddev,
            COUNT(*) as price_points
          FROM oracle.crypto_price_snapshots
          WHERE DATE(created_at) = $1
          GROUP BY coinpaprika_id
        )
        SELECT 
          ds.*,
          ld.volume_24h,
          ld.market_cap
        FROM daily_stats ds
        LEFT JOIN latest_data ld ON ds.coinpaprika_id = ld.coinpaprika_id
      `, [today]);

      for (const stats of result.rows) {
        // Calculate volatility as coefficient of variation
        const volatility = stats.avg_price > 0 ? 
          (stats.price_stddev / stats.avg_price) * 100 : 0;

        // Get prediction counts for today
        const predictionStats = await db.query(`
          SELECT 
            COUNT(*) FILTER (WHERE created_at >= $1) as created_today,
            COUNT(*) FILTER (WHERE resolved_at >= $1) as resolved_today,
            COUNT(*) FILTER (WHERE resolved_at >= $1 AND result = 'YES') as won_today
          FROM oracle.crypto_prediction_markets
          WHERE coinpaprika_id = $2
        `, [today, stats.coinpaprika_id]);

        const predCount = predictionStats.rows[0];

        // Upsert daily stats
        await db.query(`
          INSERT INTO oracle.crypto_market_stats (
            coinpaprika_id, date, avg_price, min_price, max_price,
            volatility, volume_24h, market_cap,
            predictions_created, predictions_resolved, predictions_won
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (coinpaprika_id, date) DO UPDATE SET
            avg_price = EXCLUDED.avg_price,
            min_price = EXCLUDED.min_price,
            max_price = EXCLUDED.max_price,
            volatility = EXCLUDED.volatility,
            volume_24h = EXCLUDED.volume_24h,
            market_cap = EXCLUDED.market_cap,
            predictions_created = EXCLUDED.predictions_created,
            predictions_resolved = EXCLUDED.predictions_resolved,
            predictions_won = EXCLUDED.predictions_won
        `, [
          stats.coinpaprika_id,
          today,
          stats.avg_price,
          stats.min_price,
          stats.max_price,
          volatility,
          stats.volume_24h,
          stats.market_cap,
          predCount.created_today,
          predCount.resolved_today,
          predCount.won_today
        ]);
      }

      console.log(`📈 Updated market statistics for ${result.rows.length} coins`);

    } catch (error) {
      console.error('Failed to update market statistics:', error);
    }
  }

  /**
   * Create a new crypto prediction market
   */
  async createPredictionMarket(coinId, targetPrice, direction, timeframe, startTime = null) {
    try {
      const start = startTime ? new Date(startTime) : new Date();
      const timeframes = {
        '1h': 1 * 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000
      };

      if (!timeframes[timeframe]) {
        throw new Error(`Invalid timeframe: ${timeframe}`);
      }

      const endTime = new Date(start.getTime() + timeframes[timeframe]);
      const marketId = this.coinpaprikaService.generateMarketId(
        coinId, targetPrice, direction, timeframe
      );

      // Get current price
      const tickerResponse = await this.coinpaprikaService.getCoinTicker(coinId);
      if (!tickerResponse.success) {
        throw new Error('Failed to get current price');
      }

      const currentPrice = tickerResponse.data.price_usd;

      // Insert market
      const result = await db.query(`
        INSERT INTO oracle.crypto_prediction_markets (
          market_id, coinpaprika_id, target_price, direction, timeframe,
          start_price, start_time, end_time
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `, [
        marketId,
        coinId,
        targetPrice,
        direction,
        timeframe,
        currentPrice,
        start,
        endTime
      ]);

      console.log(`✅ Created prediction market: ${marketId}`);
      return {
        success: true,
        marketId,
        id: result.rows[0].id,
        startPrice: currentPrice,
        endTime
      };

    } catch (error) {
      console.error('Failed to create prediction market:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get oracle bot status
   */
  async getStatus() {
    try {
      const walletAddress = await this.wallet.getAddress();
      const balance = await this.provider.getBalance(walletAddress);
      
      // Get recent activity
      const recentResolutions = await db.query(`
        SELECT COUNT(*) as count
        FROM oracle.crypto_resolution_logs
        WHERE created_at > NOW() - INTERVAL '24 hours'
      `);

      const pendingMarkets = await db.query(`
        SELECT COUNT(*) as count
        FROM oracle.crypto_prediction_markets
        WHERE resolved = false AND end_time <= NOW()
      `);

      return {
        isRunning: this.isRunning,
        walletAddress,
        walletBalance: ethers.formatEther(balance),
        recentResolutions24h: parseInt(recentResolutions.rows[0].count),
        pendingResolutions: parseInt(pendingMarkets.rows[0].count),
        lastPriceUpdate: new Date().toISOString(),
        updateInterval: this.updateInterval,
        resolutionInterval: this.resolutionInterval
      };

    } catch (error) {
      console.error('Failed to get oracle status:', error);
      return {
        isRunning: this.isRunning,
        error: error.message
      };
    }
  }
}

module.exports = CryptoOracleBot; 