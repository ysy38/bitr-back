#!/usr/bin/env node

/**
 * Fix Data Population Script
 * Manually triggers fixture fetching and crypto coin population
 */

const SportMonksService = require('../services/sportmonks');
const CoinpaprikaService = require('../services/coinpaprika');
const db = require('../db/db');

async function fixDataPopulation() {
  console.log('🚀 Starting data population fixes...');
  
  try {
    // 1. Fix fixture fetching
    console.log('\n📊 Step 1: Fetching football fixtures...');
    const sportmonksService = new SportMonksService();
    const fixtureResults = await sportmonksService.fetchAndSave7DayFixtures();
    
    console.log(`✅ Fixtures fetched: ${fixtureResults.totalFixtures} fixtures, ${fixtureResults.totalOdds} odds`);
    
    // 2. Fix crypto coin population
    console.log('\n💰 Step 2: Populating top 500 crypto coins...');
    const coinpaprikaService = new CoinpaprikaService();
    
    // Get top 500 coins from Coinpaprika
    const coinsResponse = await coinpaprikaService.getAllTickers(500);
    
    if (!coinsResponse.success) {
      throw new Error(`Failed to fetch top 500 coins: ${coinsResponse.error}`);
    }

    const coins = coinsResponse.data;
    console.log(`📈 Fetched ${coins.length} coins from Coinpaprika`);

    let insertedCount = 0;
    let updatedCount = 0;
    
    for (const coin of coins) {
      try {
        // Insert or update coin data
        const result = await db.query(`
          INSERT INTO oracle.crypto_coins (
            symbol, name, rank, price_usd, market_cap_usd, 
            volume_24h_usd, percent_change_24h, percent_change_7d,
            is_active, is_popular, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
          ON CONFLICT (symbol) DO UPDATE SET
            name = EXCLUDED.name,
            rank = EXCLUDED.rank,
            price_usd = EXCLUDED.price_usd,
            market_cap_usd = EXCLUDED.market_cap_usd,
            volume_24h_usd = EXCLUDED.volume_24h_usd,
            percent_change_24h = EXCLUDED.percent_change_24h,
            percent_change_7d = EXCLUDED.percent_change_7d,
            is_active = EXCLUDED.is_active,
            is_popular = EXCLUDED.is_popular,
            updated_at = NOW()
          RETURNING (xmax = 0) AS inserted
        `, [
          coin.symbol,
          coin.name,
          coin.rank || 999,
          coin.quotes?.USD?.price || 0,
          coin.quotes?.USD?.market_cap || 0,
          coin.quotes?.USD?.volume_24h || 0,
          coin.quotes?.USD?.percent_change_24h || 0,
          coin.quotes?.USD?.percent_change_7d || 0,
          coin.is_active !== false,
          coin.rank <= 50 // Top 50 are popular
        ]);
        
        if (result.rows[0].inserted) {
          insertedCount++;
        } else {
          updatedCount++;
        }
      } catch (error) {
        console.error(`❌ Failed to process coin ${coin.symbol}:`, error.message);
      }
    }

    console.log(`✅ Crypto coins population completed:`);
    console.log(`  - Inserted: ${insertedCount} coins`);
    console.log(`  - Updated: ${updatedCount} coins`);
    console.log(`  - Total processed: ${insertedCount + updatedCount} coins`);
    
    // 3. Verify data
    console.log('\n🔍 Step 3: Verifying data...');
    
    const fixtureCount = await db.query('SELECT COUNT(*) FROM oracle.fixtures');
    const oddsCount = await db.query('SELECT COUNT(*) FROM oracle.fixture_odds');
    const cryptoCount = await db.query('SELECT COUNT(*) FROM oracle.crypto_coins');
    
    console.log(`📊 Database Summary:`);
    console.log(`  - Fixtures: ${fixtureCount.rows[0].count}`);
    console.log(`  - Odds: ${oddsCount.rows[0].count}`);
    console.log(`  - Crypto coins: ${cryptoCount.rows[0].count}`);
    
    console.log('\n✅ Data population fixes completed successfully!');
    
  } catch (error) {
    console.error('❌ Error in data population fixes:', error);
    process.exit(1);
  } finally {
    await db.end();
  }
}

// Run the script
fixDataPopulation();
