#!/usr/bin/env node

/**
 * MANUAL FIXTURE FETCH
 * Manually fetch 7 days of fixtures with extended timeout
 */

const SportMonksService = require('../services/sportmonks');

async function manualFixtureFetch() {
  console.log('🚀 Starting manual 7-day fixture fetch...');
  
  try {
    const sportmonksService = new SportMonksService();
    
    // Set extended timeout for this manual run
    const originalTimeout = sportmonksService.axios.defaults.timeout;
    sportmonksService.axios.defaults.timeout = 120000; // 2 minutes per API call
    
    console.log(`⏱️ Extended timeout to ${sportmonksService.axios.defaults.timeout}ms for manual fetch`);
    
    const result = await sportmonksService.fetchAndSave7DayFixtures();
    
    console.log('🎉 Manual fixture fetch completed!');
    console.log(`📊 Results: ${result.totalFixtures} fixtures, ${result.totalOdds} odds, ${result.oddysseyFixtures} Oddyssey-ready`);
    
    // Restore original timeout
    sportmonksService.axios.defaults.timeout = originalTimeout;
    
  } catch (error) {
    console.error('❌ Manual fixture fetch failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  manualFixtureFetch()
    .then(() => {
      console.log('✅ Manual fixture fetch completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Manual fixture fetch failed:', error.message);
      process.exit(1);
    });
}

module.exports = { manualFixtureFetch };
