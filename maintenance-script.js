#!/usr/bin/env node

// Load environment variables
require('dotenv').config({ path: '.env' });
require('dotenv').config({ path: './backend/.env' });

const db = require('./backend/db/db');
const CoinpaprikaService = require('./backend/services/coinpaprika');

async function maintenanceTask() {
  try {
    await db.connect();
    console.log('✅ Database connected for maintenance');
    
    const startTime = new Date();
    console.log(`🕐 Maintenance started at: ${startTime.toISOString()}`);
    
    // 1. Clean expired fixtures and odds (keep for 7 days after match starts)
    // IMPORTANT: We keep matches for 7 days to preserve:
    // - User bets and market resolution data
    // - Historical data for analysis
    // - Market settlement requirements
    console.log('\n🧹 Cleaning expired data (keeping matches for 7 days after start)...');
    const cleanExpiredOddsQuery = `
      DELETE FROM oracle.fixture_odds 
      WHERE fixture_id IN (
        SELECT id FROM oracle.fixtures 
        WHERE match_date < NOW() - INTERVAL '7 days'
      )
    `;
    const cleanOddsResult = await db.query(cleanExpiredOddsQuery);
    console.log(`✅ Cleaned ${cleanOddsResult.rowCount} expired odds (matches older than 7 days)`);
    
    // Check how many matches we're keeping vs cleaning
    const statsQuery = `
      SELECT 
        COUNT(*) as total_matches,
        COUNT(CASE WHEN match_date >= NOW() - INTERVAL '7 days' THEN 1 END) as keeping_matches,
        COUNT(CASE WHEN match_date < NOW() - INTERVAL '7 days' THEN 1 END) as cleaning_matches
      FROM oracle.fixtures
    `;
    const statsResult = await db.query(statsQuery);
    const stats = statsResult.rows[0];
    console.log(`📊 Match retention stats: ${stats.keeping_matches} keeping, ${stats.cleaning_matches} cleaning`);
    
    const cleanExpiredFixturesQuery = `
      DELETE FROM oracle.fixtures 
      WHERE match_date < NOW() - INTERVAL '7 days'
    `;
    const cleanFixturesResult = await db.query(cleanExpiredFixturesQuery);
    console.log(`✅ Cleaned ${cleanFixturesResult.rowCount} expired fixtures (matches older than 7 days)`);
    
    // 2. Update coin prices
    console.log('\n💰 Updating coin prices...');
    await updateCoinPrices();
    
    // 3. Show final stats
    console.log('\n📊 Maintenance completed. Final stats:');
    await showMaintenanceStats();
    
    const endTime = new Date();
    const duration = (endTime - startTime) / 1000;
    console.log(`\n⏱️ Maintenance completed in ${duration.toFixed(2)} seconds`);
    
    await db.disconnect();
    
  } catch (error) {
    console.error('❌ Maintenance failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

async function updateCoinPrices() {
  try {
    console.log('💰 Updating coin prices from Coinpaprika...');
    
    // Create Coinpaprika service instance
    const coinpaprikaService = new CoinpaprikaService();
    
    // Get top 500 coins from Coinpaprika
    const response = await coinpaprikaService.getAllTickers(500);
    
    if (!response.success) {
      throw new Error(`Failed to fetch coins: ${response.error}`);
    }
    
    const coins = response.data;
    console.log(`📊 Fetched ${coins.length} coins from Coinpaprika`);
    
    // Update existing coins with new prices
    let updatedCount = 0;
    for (const coin of coins) {
      try {
        const updateQuery = `
          UPDATE oracle.coins
          SET price_usd = $1
          WHERE coin_id = $2
        `;
        const result = await db.query(updateQuery, [coin.price_usd || 0, coin.id]);
        if (result.rowCount > 0) {
          updatedCount++;
        }
      } catch (error) {
        console.error(`❌ Failed to update ${coin.symbol}:`, error.message);
      }
    }

    console.log(`✅ Updated prices for ${updatedCount} coins`);

    // Show price range
    const priceStatsQuery = `
      SELECT
        MIN(price_usd) as min_price,
        MAX(price_usd) as max_price,
        COUNT(CASE WHEN price_usd < 0.0001 THEN 1 END) as very_low_price_count
      FROM oracle.coins
      WHERE price_usd > 0
    `;
    const priceStats = await db.query(priceStatsQuery);
    const stats = priceStats.rows[0];
    console.log(`📊 Price range: $${stats.min_price} - $${stats.max_price}`);
    console.log(`📊 Very low price coins (< $0.0001): ${stats.very_low_price_count}`);

  } catch (error) {
    console.error('❌ Failed to update coin prices:', error.message);
    console.log('🔄 Skipping coin price update due to API error');
  }
}

async function showMaintenanceStats() {
  // Database size
  const sizeQuery = `
    SELECT pg_size_pretty(pg_database_size(current_database())) as db_size
    FROM pg_database 
    WHERE datname = current_database()
  `;
  const sizeResult = await db.query(sizeQuery);
  console.log(`📊 Database size: ${sizeResult.rows[0].db_size}`);
  
  // Fixtures stats
  const fixturesQuery = `SELECT COUNT(*) as count FROM oracle.fixtures`;
  const fixturesResult = await db.query(fixturesQuery);
  console.log(`📊 Total fixtures: ${fixturesResult.rows[0].count}`);
  
  const futureFixturesQuery = `
    SELECT COUNT(*) as count
    FROM oracle.fixtures
    WHERE match_date >= NOW()
  `;
  const futureFixturesResult = await db.query(futureFixturesQuery);
  console.log(`📅 Future fixtures: ${futureFixturesResult.rows[0].count}`);
  
  // Coins stats
  const coinsQuery = `SELECT COUNT(*) as count FROM oracle.coins`;
  const coinsResult = await db.query(coinsQuery);
  console.log(`🪙 Total coins: ${coinsResult.rows[0].count}`);
  
  const coinsWithPricesQuery = `
    SELECT COUNT(*) as count
    FROM oracle.coins
    WHERE price_usd > 0
  `;
  const coinsWithPricesResult = await db.query(coinsWithPricesQuery);
  console.log(`💰 Coins with prices: ${coinsWithPricesResult.rows[0].count}`);
  
  // Oddyssey ready matches
  const today = new Date().toISOString().split('T')[0];
  
  const oddysseyQuery = `
    SELECT COUNT(*) as count
    FROM oracle.fixtures f
    INNER JOIN oracle.fixture_odds o ON f.id = o.fixture_id
    WHERE DATE(f.match_date) = $1::date
      AND f.status IN ('NS', 'Fixture')
      AND o.ft_home_odds IS NOT NULL
      AND o.ft_draw_odds IS NOT NULL
      AND o.ft_away_odds IS NOT NULL
      AND o.over_25_odds IS NOT NULL
      AND o.under_25_odds IS NOT NULL
  `;
  const oddysseyResult = await db.query(oddysseyQuery, [today]);
  console.log(`🎯 Oddyssey ready matches: ${oddysseyResult.rows[0].count}`);
}

// Run maintenance if called directly
if (require.main === module) {
  maintenanceTask();
}

module.exports = { maintenanceTask }; 