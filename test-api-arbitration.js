#!/usr/bin/env node

const axios = require('axios');

async function testAPIArbitration() {
  console.log('🌐 Testing API Endpoints with Arbitration Info...\n');
  
  const baseURL = 'http://localhost:3000'; // Adjust if different
  
  try {
    // Test 1: Get all pools with arbitration info
    console.log('📊 Testing /api/optimized-pools/pools:');
    
    try {
      const poolsResponse = await axios.get(`${baseURL}/api/optimized-pools/pools?limit=5`);
      
      if (poolsResponse.data.success && poolsResponse.data.data.pools.length > 0) {
        const firstPool = poolsResponse.data.data.pools[0];
        
        console.log('  ✅ Pools endpoint working');
        console.log('  📋 First pool arbitration info:');
        
        if (firstPool.arbitration) {
          console.log('    Status:', firstPool.arbitration.status);
          console.log('    Message:', firstPool.arbitration.message);
          console.log('    Time Remaining:', firstPool.arbitration.timeRemainingFormatted);
        } else {
          console.log('    ❌ No arbitration info found');
        }
        
        if (firstPool.settlement) {
          console.log('    Settlement Eligible:', firstPool.settlement.eligible);
          console.log('    Settlement Message:', firstPool.settlement.message);
        } else {
          console.log('    ❌ No settlement info found');
        }
      } else {
        console.log('  ❌ No pools returned or API error');
      }
    } catch (error) {
      console.log('  ❌ Pools endpoint error:', error.message);
    }
    
    // Test 2: Get specific pool (Pool 0) with arbitration info
    console.log('\n🎯 Testing /api/optimized-pools/pool/0:');
    
    try {
      const poolResponse = await axios.get(`${baseURL}/api/optimized-pools/pool/0`);
      
      if (poolResponse.data.success && poolResponse.data.data.pool) {
        const pool = poolResponse.data.data.pool;
        
        console.log('  ✅ Pool 0 endpoint working');
        console.log('  📋 Pool 0 arbitration info:');
        
        if (pool.arbitration) {
          console.log('    Status:', pool.arbitration.status);
          console.log('    Message:', pool.arbitration.message);
          console.log('    Time Remaining:', pool.arbitration.timeRemainingFormatted);
          console.log('    Can Refund:', pool.arbitration.canRefund);
          console.log('    Can Settle:', pool.arbitration.canSettle);
        } else {
          console.log('    ❌ No arbitration info found');
        }
        
        if (pool.settlement) {
          console.log('    Settlement Eligible:', pool.settlement.eligible);
          console.log('    Settlement Action:', pool.settlement.action);
          console.log('    Settlement Reason:', pool.settlement.reason);
          console.log('    Settlement Message:', pool.settlement.message);
        } else {
          console.log('    ❌ No settlement info found');
        }
      } else {
        console.log('  ❌ Pool 0 not found or API error');
      }
    } catch (error) {
      console.log('  ❌ Pool 0 endpoint error:', error.message);
    }
    
    console.log('\n🎉 API arbitration tests completed!');
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
  }
}

// Check if we're running locally or need to use production URL
const isLocal = process.argv.includes('--local');
if (isLocal) {
  testAPIArbitration().catch(console.error);
} else {
  console.log('ℹ️ This test requires a running API server.');
  console.log('Run with --local flag if API is running on localhost:3000');
  console.log('Or modify the baseURL in the script for production testing.');
}
