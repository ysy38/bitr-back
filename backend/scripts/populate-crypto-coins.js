const CryptoScheduler = require('../cron/crypto-scheduler');
const db = require('../db/db');

async function populateCryptoCoins() {
  try {
    console.log('🚀 Starting crypto coins population...');
    
    const scheduler = new CryptoScheduler();
    
    // Update coin metadata (this will populate the crypto_coins table with logo URLs)
    console.log('📊 Updating coin metadata...');
    const metadataResult = await scheduler.updateCoinMetadata();
    
    if (metadataResult.success) {
      console.log(`✅ Successfully updated metadata for ${metadataResult.updated} coins`);
    } else {
      console.error('❌ Failed to update coin metadata:', metadataResult.error);
    }
    
    // Verify the data was inserted
    const result = await db.query(`
      SELECT coinpaprika_id, symbol, name, logo_url, is_popular 
      FROM oracle.crypto_coins 
      WHERE is_popular = true 
      ORDER BY rank ASC 
      LIMIT 10
    `);
    
    console.log('📋 Sample crypto coins in database:');
    result.rows.forEach(coin => {
      console.log(`  ${coin.symbol} (${coin.name}): ${coin.logo_url ? '✅ Has logo' : '❌ No logo'}`);
    });
    
    console.log(`📊 Total popular coins: ${result.rows.length}`);
    
  } catch (error) {
    console.error('❌ Error populating crypto coins:', error);
  } finally {
    // Close the database pool properly
    if (db.pool) {
      await db.pool.end();
    }
  }
}

// Run the script
populateCryptoCoins();
