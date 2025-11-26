const cron = require('node-cron');
const CryptoOracleBot = require('../services/crypto-oracle-bot');
const CoinpaprikaService = require('../services/coinpaprika');
const db = require('../db/db');

class CryptoScheduler {
  constructor() {
    this.cryptoOracleBot = new CryptoOracleBot();
    this.coinpaprikaService = new CoinpaprikaService();
    this.isRunning = false;
    this.jobs = {};
  }

  /**
   * Start all crypto-related cron jobs
   */
  async start() {
    if (this.isRunning) {
      console.log('Crypto scheduler is already running');
      return;
    }

    this.isRunning = true;
    console.log('🚀 Starting Crypto Scheduler...');

    try {
      // Start the crypto oracle bot
      await this.cryptoOracleBot.start();

      // Initialize database connection
      await db.connect();

      // Schedule all cron jobs
      this.scheduleJobs();

      console.log('✅ Crypto Scheduler started successfully');
    } catch (error) {
      console.error('❌ Failed to start Crypto Scheduler:', error);
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Stop all cron jobs
   */
  async stop() {
    this.isRunning = false;

    // Stop all cron jobs
    Object.values(this.jobs).forEach(job => {
      if (job && typeof job.destroy === 'function') {
        job.destroy();
      } else if (job && typeof job.stop === 'function') {
        job.stop();
      } else {
        console.warn('⚠️ Cron job does not have destroy or stop method:', job);
      }
    });
    this.jobs = {};

    // Stop crypto oracle bot
    await this.cryptoOracleBot.stop();

    console.log('🛑 Crypto Scheduler stopped');
  }

  /**
   * Schedule all crypto-related cron jobs
   */
  scheduleJobs() {
    // 1. Update crypto prices every 20 minutes (rate limiting)
    this.jobs.priceUpdates = cron.schedule('*/20 * * * *', async () => {
      if (!this.isRunning) return;
      
      try {
        console.log('⏰ Running crypto price updates...');
        await this.updateCryptoPrices();
      } catch (error) {
        console.error('❌ Error in crypto price updates:', error);
      }
    });

    // 2. Check for market resolutions every 2 minutes
    this.jobs.marketResolution = cron.schedule('*/2 * * * *', async () => {
      if (!this.isRunning) return;
      
      try {
        console.log('⏰ Checking for crypto market resolutions...');
        await this.checkMarketResolutions();
      } catch (error) {
        console.error('❌ Error in market resolution check:', error);
      }
    });

    // 3. Update coin metadata daily at 02:00 UTC
    this.jobs.coinMetadata = cron.schedule('0 2 * * *', async () => {
      if (!this.isRunning) return;
      
      try {
        console.log('⏰ Running daily coin metadata update...');
        await this.updateCoinMetadata();
      } catch (error) {
        console.error('❌ Error in coin metadata update:', error);
      }
    });

    // 3.5. Populate top 500 coins weekly on Mondays at 01:00 UTC
    this.jobs.populateTopCoins = cron.schedule('0 1 * * 1', async () => {
      if (!this.isRunning) return;
      
      try {
        console.log('⏰ Running weekly top 500 coins population...');
        await this.populateTop500Coins();
      } catch (error) {
        console.error('❌ Error in top 500 coins population:', error);
      }
    });

    // 4. Cleanup old data weekly on Sundays at 03:00 UTC
    this.jobs.dataCleanup = cron.schedule('0 3 * * 0', async () => {
      if (!this.isRunning) return;
      
      try {
        console.log('⏰ Running weekly data cleanup...');
        await this.cleanupOldData();
      } catch (error) {
        console.error('❌ Error in data cleanup:', error);
      }
    });

    // 5. Generate market statistics daily at 01:00 UTC
    this.jobs.marketStats = cron.schedule('0 1 * * *', async () => {
      if (!this.isRunning) return;
      
      try {
        console.log('⏰ Generating daily market statistics...');
        await this.generateMarketStatistics();
      } catch (error) {
        console.error('❌ Error in market statistics generation:', error);
      }
    });

    // 6. Health check every 15 minutes
    this.jobs.healthCheck = cron.schedule('*/15 * * * *', async () => {
      if (!this.isRunning) return;
      
      try {
        await this.performHealthCheck();
      } catch (error) {
        console.error('❌ Error in health check:', error);
      }
    });

    console.log('📅 Scheduled crypto cron jobs:');
    console.log('  - Price updates: Every 20 minutes');
    console.log('  - Market resolution: Every 2 minutes');
    console.log('  - Coin metadata: Daily at 02:00 UTC');
    console.log('  - Top 500 coins: Weekly on Mondays at 01:00 UTC');
    console.log('  - Data cleanup: Weekly on Sundays at 03:00 UTC');
    console.log('  - Market statistics: Daily at 01:00 UTC');
    console.log('  - Health check: Every 15 minutes');
  }

  /**
   * Update cryptocurrency prices and market data
   */
  async updateCryptoPrices() {
    try {
      const startTime = Date.now();
      
      // Get all active coins from database
      const result = await db.query(`
        SELECT coinpaprika_id, symbol, name, is_popular
        FROM oracle.crypto_coins 
        WHERE is_active = true
        ORDER BY is_popular DESC, rank ASC NULLS LAST
      `);

      if (result.rows.length === 0) {
        console.log('No active coins to update');
        return { success: true, updated: 0 };
      }

      console.log(`Updating prices for ${result.rows.length} coins...`);

      // Use Coinpaprika service to get latest prices
      const tickersResponse = await this.coinpaprikaService.getAllTickers(500);
      
      if (!tickersResponse.success) {
        throw new Error(`Failed to fetch tickers: ${tickersResponse.error}`);
      }

      let updatedCount = 0;
      const batchSize = 10;
      
      // Process in batches
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
                last_updated
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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

      return { success: true, updated: updatedCount, total: result.rows.length };

    } catch (error) {
      console.error('❌ Failed to update crypto prices:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check for markets that need resolution
   */
  async checkMarketResolutions() {
    try {
      // Get markets past their end time that haven't been resolved
      const result = await db.query(`
        SELECT 
          cpm.id,
          cpm.market_id,
          cpm.coinpaprika_id,
          cpm.target_price,
          cpm.direction,
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
        LIMIT 10
      `);

      if (result.rows.length === 0) {
        return { success: true, resolved: 0 };
      }

      console.log(`📋 Found ${result.rows.length} markets needing resolution`);

      let resolvedCount = 0;
      
      for (const market of result.rows) {
        try {
          await this.resolveMarket(market);
          resolvedCount++;
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

      console.log(`✅ Resolved ${resolvedCount}/${result.rows.length} markets`);
      return { success: true, resolved: resolvedCount, total: result.rows.length };

    } catch (error) {
      console.error('❌ Failed to check market resolutions:', error);
      return { success: false, error: error.message };
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

    // Update database
    await db.query(`
      UPDATE oracle.crypto_prediction_markets 
      SET resolved = true, 
          final_price = $1, 
          result = $2, 
          resolved_at = NOW(),
          updated_at = NOW()
      WHERE id = $3
    `, [market.current_price, result, market.id]);

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
  }

  /**
   * Populate top 500 crypto coins from Coinpaprika
   */
  async populateTop500Coins() {
    try {
      console.log('📊 Populating top 500 crypto coins...');
      
      // Get top 500 coins from Coinpaprika
      const coinsResponse = await this.coinpaprikaService.getAllTickers(500);
      
      if (!coinsResponse.success) {
        throw new Error(`Failed to fetch top 500 coins: ${coinsResponse.error}`);
      }

      const coins = coinsResponse.data;
      console.log(`📈 Fetched ${coins.length} coins from Coinpaprika`);

      let insertedCount = 0;
      let updatedCount = 0;
      
      for (const coin of coins) {
        try {
          // Insert or update coin metadata (no price data)
          const result = await db.query(`
            INSERT INTO oracle.crypto_coins (
              coinpaprika_id, symbol, name, rank, is_popular, is_active
            ) VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (coinpaprika_id) DO UPDATE SET
              symbol = EXCLUDED.symbol,
              name = EXCLUDED.name,
              rank = EXCLUDED.rank,
              is_popular = CASE 
                WHEN EXCLUDED.rank <= 50 THEN true 
                ELSE oracle.crypto_coins.is_popular 
              END,
              is_active = true,
              updated_at = NOW()
            RETURNING (xmax = 0) AS inserted
          `, [
            coin.id,
            coin.symbol,
            coin.name,
            coin.rank,
            coin.rank <= 50, // Mark top 50 as popular
            true // All coins are active
          ]);

          // Insert price snapshot into crypto_price_snapshots
          if (coin.price_usd || coin.market_cap || coin.volume_24h) {
            await db.query(`
              INSERT INTO oracle.crypto_price_snapshots (
                coinpaprika_id, price_usd, market_cap, volume_24h,
                percent_change_1h, percent_change_24h, last_updated
              ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
            `, [
              coin.id,
              coin.price_usd || 0,
              coin.market_cap || 0,
              coin.volume_24h || 0,
              coin.percent_change_1h || 0,
              coin.percent_change_24h || 0
            ]);
          }

          if (result.rows[0].inserted) {
            insertedCount++;
          } else {
            updatedCount++;
          }

        } catch (error) {
          console.error(`❌ Failed to process coin ${coin.symbol}:`, error.message);
        }
      }

      console.log(`✅ Top 500 coins population completed:`);
      console.log(`  - Inserted: ${insertedCount} coins`);
      console.log(`  - Updated: ${updatedCount} coins`);
      console.log(`  - Total processed: ${insertedCount + updatedCount} coins`);

      return {
        success: true,
        inserted: insertedCount,
        updated: updatedCount,
        total: insertedCount + updatedCount
      };

    } catch (error) {
      console.error('❌ Failed to populate top 500 coins:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Update coin metadata from Coinpaprika
   */
  async updateCoinMetadata() {
    try {
      console.log('📊 Updating coin metadata...');
      
      // Get popular coins data
      const coins = await this.coinpaprikaService.getPopularCoins();
      
      if (!coins || coins.length === 0) {
        throw new Error('No popular coins returned from Coinpaprika API');
      }

      let updatedCount = 0;
      
      for (const coin of coins) {
        try {
          // Update or insert coin metadata
          await db.query(`
            INSERT INTO oracle.crypto_coins (
              coinpaprika_id, symbol, name, rank, logo_url, is_popular, is_active
            ) VALUES ($1, $2, $3, $4, $5, true, true)
            ON CONFLICT (coinpaprika_id) DO UPDATE SET
              symbol = EXCLUDED.symbol,
              name = EXCLUDED.name,
              rank = EXCLUDED.rank,
              logo_url = EXCLUDED.logo_url,
              is_popular = EXCLUDED.is_popular,
              updated_at = NOW()
          `, [
            coin.id,
            coin.symbol,
            coin.name,
            coin.rank,
            coin.logo_url || `https://static.coinpaprika.com/coin/${coin.id}/logo.png`
          ]);

          updatedCount++;
        } catch (error) {
          console.error(`Failed to update metadata for ${coin.id}:`, error);
        }
      }

      console.log(`✅ Updated metadata for ${updatedCount} coins`);
      return { success: true, updated: updatedCount };

    } catch (error) {
      console.error('❌ Failed to update coin metadata:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Clean up old data to maintain database performance
   */
  async cleanupOldData() {
    try {
      console.log('🧹 Cleaning up old crypto data...');
      
      const results = {};

      // Remove price snapshots older than 90 days
      const priceCleanup = await db.query(`
        DELETE FROM oracle.crypto_price_snapshots 
        WHERE created_at < NOW() - INTERVAL '90 days'
      `);
      results.priceSnapshots = priceCleanup.rowCount;

      // Remove resolved markets older than 6 months
      const marketCleanup = await db.query(`
        DELETE FROM oracle.crypto_prediction_markets 
        WHERE resolved = true 
          AND resolved_at < NOW() - INTERVAL '6 months'
      `);
      results.markets = marketCleanup.rowCount;

      // Remove resolution logs older than 30 days
      const logCleanup = await db.query(`
        DELETE FROM oracle.crypto_resolution_logs 
        WHERE created_at < NOW() - INTERVAL '30 days'
      `);
      results.logs = logCleanup.rowCount;

      // Remove old market stats (keep last 1 year)
      const statsCleanup = await db.query(`
        DELETE FROM oracle.crypto_market_stats 
        WHERE date < NOW() - INTERVAL '1 year'
      `);
      results.stats = statsCleanup.rowCount;

      console.log('✅ Data cleanup completed:', results);
      return { success: true, results };

    } catch (error) {
      console.error('❌ Failed to cleanup old data:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate daily market statistics
   */
  async generateMarketStatistics() {
    try {
      console.log('📈 Generating market statistics...');
      
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      // Get daily stats for each tracked coin
      const result = await db.query(`
        SELECT 
          coinpaprika_id,
          MIN(price_usd) as min_price,
          MAX(price_usd) as max_price,
          AVG(price_usd) as avg_price,
          STDDEV(price_usd) as price_stddev,
          COUNT(*) as price_points,
          LAST_VALUE(volume_24h) OVER (
            PARTITION BY coinpaprika_id 
            ORDER BY created_at 
            ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
          ) as volume_24h,
          LAST_VALUE(market_cap) OVER (
            PARTITION BY coinpaprika_id 
            ORDER BY created_at 
            ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
          ) as market_cap
        FROM oracle.crypto_price_snapshots
        WHERE DATE(created_at) = $1
        GROUP BY coinpaprika_id
      `, [yesterday]);

      let statsCount = 0;

      for (const stats of result.rows) {
        try {
          // Calculate volatility
          const volatility = stats.avg_price > 0 ? 
            (stats.price_stddev / stats.avg_price) * 100 : 0;

          // Get prediction counts
          const predictionStats = await db.query(`
            SELECT 
              COUNT(*) FILTER (WHERE DATE(created_at) = $1) as created_yesterday,
              COUNT(*) FILTER (WHERE DATE(resolved_at) = $1) as resolved_yesterday,
              COUNT(*) FILTER (WHERE DATE(resolved_at) = $1 AND result = 'YES') as won_yesterday
            FROM oracle.crypto_prediction_markets
            WHERE coinpaprika_id = $2
          `, [yesterday, stats.coinpaprika_id]);

          const predCount = predictionStats.rows[0];

          // Insert daily stats
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
            yesterday,
            stats.avg_price,
            stats.min_price,
            stats.max_price,
            volatility,
            stats.volume_24h,
            stats.market_cap,
            predCount.created_yesterday,
            predCount.resolved_yesterday,
            predCount.won_yesterday
          ]);

          statsCount++;
        } catch (error) {
          console.error(`Failed to generate stats for ${stats.coinpaprika_id}:`, error);
        }
      }

      console.log(`✅ Generated statistics for ${statsCount} coins`);
      return { success: true, generated: statsCount };

    } catch (error) {
      console.error('❌ Failed to generate market statistics:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Perform health checks on the crypto system
   */
  async performHealthCheck() {
    try {
      const health = {
        timestamp: new Date().toISOString(),
        services: {},
        metrics: {}
      };

      // Check Coinpaprika API
      try {
        const apiTest = await this.coinpaprikaService.getPopularCoins();
        health.services.coinpaprika = apiTest.success ? 'healthy' : 'error';
        if (!apiTest.success) health.services.coinpaprikaError = apiTest.error;
      } catch (error) {
        health.services.coinpaprika = 'error';
        health.services.coinpaprikaError = error.message;
      }

      // Check database connectivity
      try {
        await db.query('SELECT 1');
        health.services.database = 'healthy';
      } catch (error) {
        health.services.database = 'error';
        health.services.databaseError = error.message;
      }

      // Check oracle bot status
      try {
        const botStatus = await this.cryptoOracleBot.getStatus();
        health.services.oracleBot = botStatus.isRunning ? 'healthy' : 'stopped';
        health.metrics.pendingResolutions = botStatus.pendingResolutions;
        health.metrics.recentResolutions24h = botStatus.recentResolutions24h;
      } catch (error) {
        health.services.oracleBot = 'error';
        health.services.oracleBotError = error.message;
      }

      // Get system metrics
      try {
        const metricsResult = await db.query(`
          SELECT 
            (SELECT COUNT(*) FROM oracle.crypto_coins WHERE is_active = true) as active_coins,
            (SELECT COUNT(*) FROM oracle.crypto_prediction_markets WHERE resolved = false) as active_markets,
            (SELECT COUNT(*) FROM oracle.crypto_prediction_markets WHERE resolved = false AND end_time <= NOW()) as overdue_markets,
            (SELECT COUNT(*) FROM oracle.crypto_price_snapshots WHERE created_at > NOW() - INTERVAL '1 hour') as recent_price_updates
        `);
        
        health.metrics = { ...health.metrics, ...metricsResult.rows[0] };
      } catch (error) {
        health.metrics.error = error.message;
      }

      // Log health status every hour
      const currentHour = new Date().getHours();
      if (currentHour === 0 || currentHour % 6 === 0) {
        console.log('🏥 Crypto System Health Check:', JSON.stringify(health, null, 2));
      }

      return health;

    } catch (error) {
      console.error('❌ Health check failed:', error);
      return {
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      jobs: Object.keys(this.jobs).map(name => ({
        name,
        running: this.jobs[name] ? true : false
      })),
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = CryptoScheduler; 