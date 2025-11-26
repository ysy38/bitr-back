const redis = require('redis');

async function checkRedisCache() {
  console.log('\n========== CHECKING REDIS CACHE ==========\n');
  
  try {
    const client = redis.createClient({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
    });
    
    client.on('error', (err) => console.log('Redis Client Error:', err));
    
    await client.connect();
    
    // Check all keys related to pool 2
    const keys = await client.keys('*pool*2*');
    console.log(`Found ${keys.length} keys containing 'pool' and '2':`);
    keys.forEach(key => console.log(`  - ${key}`));
    
    if (keys.length > 0) {
      console.log('\nCache values:');
      for (const key of keys) {
        try {
          const value = await client.get(key);
          console.log(`\n  Key: ${key}`);
          console.log(`  Value: ${value ? value.substring(0, 200) + '...' : 'null'}`);
        } catch (err) {
          console.log(`  Error reading key: ${err.message}`);
        }
      }
    }
    
    await client.disconnect();
  } catch (err) {
    console.error('❌ Redis error:', err.message);
  }
  
  process.exit(0);
}

checkRedisCache().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
