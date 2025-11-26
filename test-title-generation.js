#!/usr/bin/env node

const axios = require('axios');

async function testTitleGeneration() {
  console.log('🎯 Testing Pool Title Generation Fix...\n');
  
  try {
    // Test Pool 0 specifically
    console.log('📊 Testing Pool 0 title generation:');
    
    const response = await axios.get('http://localhost:3000/api/optimized-pools/pool/0');
    
    if (response.data.success && response.data.data.pool) {
      const pool = response.data.data.pool;
      
      console.log('  ✅ Pool 0 data:');
      console.log('    Title:', pool.title);
      console.log('    Predicted Outcome:', pool.predictedOutcome);
      console.log('    Market Type:', pool.marketType);
      console.log('    Home Team:', pool.homeTeam);
      console.log('    Away Team:', pool.awayTeam);
      
      // Check if title contains "2.5" instead of "0.5"
      if (pool.title && pool.title.includes('2.5')) {
        console.log('  🎉 SUCCESS: Title correctly shows "2.5"!');
      } else if (pool.title && pool.title.includes('0.5')) {
        console.log('  ❌ ISSUE: Title still shows "0.5" instead of "2.5"');
      } else {
        console.log('  ⚠️ UNKNOWN: Title format not recognized');
      }
      
      // Expected title should be something like:
      // "Cruz Azul vs América will score over 2.5 goals!"
      const expectedPattern = /Cruz Azul.*América.*over 2\.5/i;
      if (expectedPattern.test(pool.title)) {
        console.log('  ✅ Title matches expected pattern');
      } else {
        console.log('  ❌ Title does not match expected pattern');
        console.log('    Expected pattern: "Cruz Azul vs América will score over 2.5 goals!"');
      }
      
    } else {
      console.log('  ❌ Failed to fetch Pool 0 data');
    }
    
    console.log('\n🎯 Title generation test completed!');
    
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.log('❌ Cannot connect to API server. Make sure the backend is running on localhost:3000');
    } else {
      console.error('❌ Test error:', error.message);
    }
  }
}

testTitleGeneration().catch(console.error);
